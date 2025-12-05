import { Hono } from "hono";
import { z } from 'zod';
import type { Env } from './core-utils';
import { ok, bad, notFound, serverError } from './core-utils';
import { log } from './observability';
import openapiSpec from '../openapi.json';
import { LinkEntity } from './entities';
import { embedText, searchVectors, upsertVector } from './vectorize-client';
import type { IngestRequest, Link, SearchResult } from "@shared/types";
// --- ZOD SCHEMAS for validation ---
const ingestSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional(),
});
const searchSchema = z.object({
  q: z.string().optional().default(''),
  tags: z.string().optional().default(''),
  mime: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const querySchema = z.object({
  naturalLanguageQuery: z.string(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    mime: z.string().optional(),
  }).optional(),
});
// --- MIDDLEWARE ---
const jsonRequired = async (c: any, next: any) => {
  if (!c.req.header('Accept')?.includes('application/json')) {
    return bad(c, 'Accept header must include application/json');
  }
  await next();
};
// --- HELPERS ---
// A very simple parser to extract metadata. A real app would use a robust library.
function parseHtml(html: string): { title: string; description: string; h1: string; plainText: string } {
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
  const description = html.match(/<meta\s+name="description"\s+content="(.*?)"/i)?.[1] || '';
  const h1 = html.match(/<h1.*?>(.*?)<\/h1>/i)?.[1] || '';
  const plainText = html.replace(/<style[^>]*>.*<\/style>/gs, ' ')
                         .replace(/<script[^>]*>.*<\/script>/gs, ' ')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ').trim();
  return { title, description, h1, plainText: `${title} ${h1} ${description} ${plainText.slice(0, 2000)}` };
}
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.use('/api/*', jsonRequired);
  // --- ROUTES ---
  app.get('/openapi.json', (c) => c.json(openapiSpec));
  app.post('/api/links', async (c) => {
    const start = Date.now();
    try {
      const body = await c.req.json<IngestRequest>();
      const { url, tags } = ingestSchema.parse(body);
      log(c, { level: 'info', msg: 'Ingest request received', url });
      // Check for existing link first
      const urlIndex = new LinkEntity(c.env, `link-url:${url}`);
      const existingId = (await urlIndex.getState()).id;
      if (existingId) {
        const existingLink = new LinkEntity(c.env, existingId);
        const linkData = await existingLink.getState();
        log(c, { level: 'info', msg: 'Link already exists', status: 200, latencyMs: Date.now() - start });
        return ok(c, { id: linkData.id, existed: true, link: linkData });
      }
      // HEAD request to get headers
      const headRes = await fetch(url, { method: 'HEAD' });
      const mime = headRes.headers.get('content-type') || 'application/octet-stream';
      const byteSize = parseInt(headRes.headers.get('content-length') || '0', 10);
      const lastModified = headRes.headers.get('last-modified');
      // Fetch full content
      const getRes = await fetch(url);
      if (!getRes.ok) return bad(c, `Failed to fetch URL: ${getRes.status}`);
      const html = await getRes.text();
      const { title, description, h1, plainText } = parseHtml(html);
      // Embed text
      const vector = await embedText(c.env.AI, plainText);
      // Create entity in DO (simulated D1)
      const { link, existed } = await LinkEntity.createOrGet(c.env, {
        url, title, description, h1, mime, byteSize, lastModified, tags
      });
      // Upsert vector
      await upsertVector(c.env.VECTORIZE, link, vector);
      log(c, { level: 'info', msg: 'Ingest successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, { id: link.id, existed, link });
    } catch (e: any) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid request body', e.issues);
      log(c, { level: 'error', msg: 'Ingest failed', error: e.message });
      return serverError(c, 'Ingestion failed');
    }
  });
  app.get('/api/search', async (c) => {
    const start = Date.now();
    try {
      const queryParams = c.req.query();
      const { q, tags, mime, limit, offset } = searchSchema.parse(queryParams);
      log(c, { level: 'info', msg: 'Search request', ...queryParams });
      let results: SearchResult[] = [];
      const searchTags = tags ? tags.split(',').filter(Boolean) : [];
      if (q.startsWith('"') && q.endsWith('"')) { // Full-text search
        const term = q.substring(1, q.length - 1).toLowerCase();
        const allLinks = await LinkEntity.list(c.env);
        results = allLinks.items
          .filter(link =>
            (link.title.toLowerCase().includes(term) ||
             link.description.toLowerCase().includes(term) ||
             link.h1.toLowerCase().includes(term)) &&
            (searchTags.length === 0 || searchTags.every(t => link.tags.includes(t))) &&
            (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(link.mime))
          )
          .map(link => ({ ...link, score: null }));
      } else { // Semantic search
        const queryVector = await embedText(c.env.AI, q);
        const vectorResults = await searchVectors(c.env.VECTORIZE, queryVector, limit * 2); // Fetch more to filter
        if (vectorResults.length > 0) {
          const linkIds = vectorResults.map(r => r.id);
          const links = (await Promise.all(linkIds.map(id => new LinkEntity(c.env, id).getState())))
            .filter((link): link is Link => !!link.id); // Filter out null/empty states
          const linksById = new Map(links.map(l => [l.id, l]));
          results = vectorResults
            .map(vr => {
              const link = linksById.get(vr.id);
              return link ? { ...link, score: vr.score } : null;
            })
            .filter((r): r is SearchResult => r !== null)
            .filter(r => 
              (searchTags.length === 0 || searchTags.every(t => r.tags.includes(t))) &&
              (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(r.mime))
            );
        }
      }
      const paginatedResults = results.slice(offset, offset + limit);
      log(c, { level: 'info', msg: 'Search successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, paginatedResults);
    } catch (e: any) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid query parameters', e.issues);
      log(c, { level: 'error', msg: 'Search failed', error: e.message });
      return serverError(c, 'Search failed');
    }
  });
  app.get('/api/suggest', async (c) => {
    const start = Date.now();
    const partial = c.req.query('partial')?.toLowerCase() ?? '';
    log(c, { level: 'info', msg: 'Suggest request', partial });
    const allLinks = await LinkEntity.list(c.env, null, 1000); // Limit for performance
    const allTags = [...new Set(allLinks.items.flatMap(l => l.tags))];
    const suggestions = partial
      ? allTags.filter(tag => tag.toLowerCase().startsWith(partial))
      : allTags;
    log(c, { level: 'info', msg: 'Suggest successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, suggestions.slice(0, 10));
  });
  app.post('/api/query', async (c) => {
    const start = Date.now();
    try {
      const body = await c.req.json();
      const { naturalLanguageQuery, filters } = querySchema.parse(body);
      log(c, { level: 'info', msg: 'Agent query', query: naturalLanguageQuery });
      // This logic mirrors /api/search, making it a single entry point for agents
      const queryVector = await embedText(c.env.AI, naturalLanguageQuery);
      const vectorResults = await searchVectors(c.env.VECTORIZE, queryVector, 20);
      if (vectorResults.length === 0) {
        return ok(c, []);
      }
      const linkIds = vectorResults.map(r => r.id);
      const links = (await Promise.all(linkIds.map(id => new LinkEntity(c.env, id).getState())))
        .filter((link): link is Link => !!link.id);
      const linksById = new Map(links.map(l => [l.id, l]));
      const searchTags = filters?.tags || [];
      const mime = filters?.mime || '';
      const results = vectorResults
        .map(vr => {
          const link = linksById.get(vr.id);
          return link ? { ...link, score: vr.score } : null;
        })
        .filter((r): r is SearchResult => r !== null)
        .filter(r => 
          (searchTags.length === 0 || searchTags.every(t => r.tags.includes(t))) &&
          (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(r.mime))
        );
      log(c, { level: 'info', msg: 'Agent query successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, results);
    } catch (e: any) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid request body', e.issues);
      log(c, { level: 'error', msg: 'Agent query failed', error: e.message });
      return serverError(c, 'Agent query failed');
    }
  });
  app.get('/api/health', async (c) => {
    const start = Date.now();
    try {
      const d1Count = (await LinkEntity.list(c.env)).items.length;
      // Vectorize count is not directly exposed, so we return a placeholder.
      // A real app might track this separately or use a different metric.
      const vectorizeCount = -1; // Placeholder
      const healthData = {
        version: '1.0.0',
        vectorizeCount,
        d1Count,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
      log(c, { level: 'info', msg: 'Health check successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, healthData);
    } catch (e: any) {
      log(c, { level: 'error', msg: 'Health check failed', error: e.message });
      return serverError(c, 'Health check failed');
    }
  });
}