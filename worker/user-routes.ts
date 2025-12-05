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
  metadata: z.record(z.string(), z.unknown()).optional(),
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
      log(c, { level: 'info', msg: 'Ingest request received' });
      const { link, existed } = await LinkEntity.createOrGet(c.env, {
        url, tags, title: '', description: '', h1: '', mime: '', byteSize: 0, lastModified: null
      });
      if (existed) {
        log(c, { level: 'info', msg: 'Link already exists', status: 200, latencyMs: Date.now() - start });
        return ok(c, { id: link.id, existed: true, link });
      }
      const headRes = await fetch(url, { method: 'HEAD' });
      const mime = headRes.headers.get('content-type') || 'application/octet-stream';
      const byteSize = parseInt(headRes.headers.get('content-length') || '0', 10);
      const lastModified = headRes.headers.get('last-modified');
      const getRes = await fetch(url);
      if (!getRes.ok) return bad(c, `Failed to fetch URL: ${getRes.status}`);
      const html = await getRes.text();
      const { title, description, h1, plainText } = parseHtml(html);
      if (!c.env.AI) return serverError(c, 'AI binding is not configured.');
      const vector = await embedText(c.env.AI, plainText);
      const linkEntity = new LinkEntity(c.env, link.id);
      const updatedLink = await linkEntity.mutate(s => ({ ...s, title, description, h1, mime, byteSize, lastModified }));
      if (!c.env.VECTORIZE) return serverError(c, 'VECTORIZE binding is not configured.');
      await upsertVector(c.env.VECTORIZE, updatedLink, vector);
      log(c, { level: 'info', msg: 'Ingest successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, { id: updatedLink.id, existed: false, link: updatedLink });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid request body', e.issues);
      const message = e instanceof Error ? e.message : 'Unknown error';
      log(c, { level: 'error', msg: `Ingest failed: ${message}` });
      return serverError(c, 'Ingestion failed');
    }
  });
  app.get('/api/search', async (c) => {
    const start = Date.now();
    try {
      const queryParams = c.req.query();
      const { q, tags, mime, limit, offset } = searchSchema.parse(queryParams);
      log(c, { level: 'info', msg: 'Search request' });
      let results: SearchResult[] = [];
      const searchTags = tags ? tags.split(',').filter(Boolean) : [];
      if (q === '') {
        const allLinks = await LinkEntity.list(c.env);
        results = allLinks.items
          .filter(link =>
            (searchTags.length === 0 || searchTags.every(t => link.tags.includes(t))) &&
            (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(link.mime))
          )
          .map(link => ({ ...link, score: null }));
      } else if (q.startsWith('"') && q.endsWith('"')) {
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
      } else {
        if (!c.env.AI) return serverError(c, 'AI binding is not configured.');
        const queryVector = await embedText(c.env.AI, q);
        if (!c.env.VECTORIZE) return serverError(c, 'VECTORIZE binding is not configured.');
        const vectorResults = await searchVectors(c.env.VECTORIZE, queryVector, limit * 2);
        if (vectorResults.length > 0) {
          const linkIds = vectorResults.map(r => r.id);
          const links = (await Promise.all(linkIds.map(id => new LinkEntity(c.env, id).getState())))
            .filter((link): link is Link => !!link?.id);
          const linksById = new Map(links.map(l => [l.id, l]));
          const mapped = vectorResults
            .map(vr => {
              const link = linksById.get(vr.id);
              return link ? { ...link, score: vr.score } : null;
            });
          const filtered = mapped.filter(r => r !== null && typeof (r as any).score === 'number') as SearchResult[];
          results = filtered
            .filter(r =>
              (searchTags.length === 0 || searchTags.every(t => r.tags.includes(t))) &&
              (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(r.mime))
            );
        }
      }
      const paginatedResults = results.slice(offset, offset + limit);
      log(c, { level: 'info', msg: 'Search successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, paginatedResults);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid query parameters', e.issues);
      const message = e instanceof Error ? e.message : 'Unknown error';
      log(c, { level: 'error', msg: `Search failed: ${message}` });
      return serverError(c, 'Search failed');
    }
  });
  app.get('/api/suggest', async (c) => {
    const start = Date.now();
    const partial = c.req.query('partial')?.toLowerCase() ?? '';
    log(c, { level: 'info', msg: 'Suggest request' });
    const allLinks = await LinkEntity.list(c.env, null, 1000);
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
      log(c, { level: 'info', msg: 'Agent query' });
      if (!c.env.AI) return serverError(c, 'AI binding is not configured.');
      const queryVector = await embedText(c.env.AI, naturalLanguageQuery);
      if (!c.env.VECTORIZE) return serverError(c, 'VECTORIZE binding is not configured.');
      const vectorResults = await searchVectors(c.env.VECTORIZE, queryVector, 20);
      if (vectorResults.length === 0) return ok(c, []);
      const linkIds = vectorResults.map(r => r.id);
      const links = (await Promise.all(linkIds.map(id => new LinkEntity(c.env, id).getState())))
        .filter((link): link is Link => !!link?.id);
      const linksById = new Map(links.map(l => [l.id, l]));
      const searchTags = filters?.tags || [];
      const mime = filters?.mime || '';
      const mapped = vectorResults
        .map(vr => {
          const link = linksById.get(vr.id);
          return link ? { ...link, score: vr.score } : null;
        });
      const filtered = mapped.filter(r => r !== null && typeof (r as any).score === 'number') as SearchResult[];
      const results = filtered
        .filter(r =>
          (searchTags.length === 0 || searchTags.every(t => r.tags.includes(t))) &&
          (!mime || new RegExp('^' + mime.replace(/\*/g, '.*')).test(r.mime))
        );
      log(c, { level: 'info', msg: 'Agent query successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, results);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) return bad(c, 'Invalid request body', e.issues);
      const message = e instanceof Error ? e.message : 'Unknown error';
      log(c, { level: 'error', msg: `Agent query failed: ${message}` });
      return serverError(c, 'Agent query failed');
    }
  });
  app.get('/api/health', async (c) => {
    const start = Date.now();
    try {
      const d1Count = (await LinkEntity.list(c.env, null, 10000)).items.length;
      const vectorizeCount = c.env.VECTORIZE ? 'available' : 'unavailable';
      const healthData = {
        version: '1.0.0',
        vectorizeCount,
        d1Count,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
      log(c, { level: 'info', msg: 'Health check successful', status: 200, latencyMs: Date.now() - start });
      return ok(c, healthData);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      log(c, { level: 'error', msg: `Health check failed: ${message}` });
      return serverError(c, 'Health check failed');
    }
  });
}