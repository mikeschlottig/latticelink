import { Hono } from "hono";
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from './core-utils';
import { ok, bad, notFound } from './core-utils';
import { log } from './observability';
import openapiSpec from '../openapi.json';
// --- MOCK DATA FOR PHASE 1 ---
const MOCK_LINKS = [
  { id: '1', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', title: 'JavaScript | MDN', description: 'JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.', tags: ['javascript', 'webdev', 'docs'], score: 0.92, metadata: { mime: 'text/html', byteSize: 150000, lastModified: '2023-10-26T10:00:00Z' } },
  { id: '2', url: 'https://github.com', title: 'GitHub: Let\'s build from here', description: 'GitHub is where over 100 million developers shape the future of software, together.', tags: ['git', 'collaboration', 'code'], score: 0.88, metadata: { mime: 'text/html', byteSize: 200000, lastModified: '2023-10-26T11:00:00Z' } },
  { id: '3', url: 'https://stackoverflow.com', title: 'Stack Overflow - Where Developers Learn, Share, & Build Careers', description: 'A public platform building the definitive collection of coding questions & answers.', tags: ['q&a', 'community', 'code'], score: 0.81, metadata: { mime: 'text/html', byteSize: 250000, lastModified: '2023-10-26T12:00:00Z' } },
  { id: '4', url: 'https://www.cloudflare.com/learning/serverless/what-is-serverless/', title: 'What is Serverless Computing? | Cloudflare', description: 'Serverless computing is a method of providing backend services on an as-used basis.', tags: ['serverless', 'cloudflare', 'cloud'], score: 0.95, metadata: { mime: 'text/html', byteSize: 120000, lastModified: '2023-10-25T09:00:00Z' } },
  { id: '5', url: 'https://react.dev/', title: 'React', description: 'The library for web and native user interfaces.', tags: ['react', 'javascript', 'ui'], score: null, metadata: { mime: 'text/html', byteSize: 180000, lastModified: '2023-10-24T14:00:00Z' } },
  { id: '6', url: 'https://tailwindcss.com/', title: 'Tailwind CSS - Rapidly build modern websites without ever leaving your HTML.', description: 'A utility-first CSS framework packed with classes like flex, pt-4, text-center and rotate-90 that can be composed to build any design, directly in your markup.', tags: ['css', 'utility-first', 'design'], score: null, metadata: { mime: 'image/png', byteSize: 50000, lastModified: '2023-10-23T18:00:00Z' } },
];
const ALL_TAGS = [...new Set(MOCK_LINKS.flatMap(l => l.tags))];
// --- ZOD SCHEMAS for validation ---
const ingestSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
const searchSchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(),
  mime: z.string().optional(),
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
  if (c.req.header('Accept') !== 'application/json') {
    return bad(c, 'Accept header must be application/json');
  }
  await next();
};
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.use('/api/*', jsonRequired);
  // --- ROUTES ---
  app.get('/openapi.json', (c) => c.json(openapiSpec));
  app.post('/api/links', zValidator('json', ingestSchema), async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    log(c, { level: 'info', msg: 'Ingest request received' });
    // Phase 1: Acknowledge and return mock success
    const mockId = String(MOCK_LINKS.length + 1);
    const response = { id: mockId, ...body };
    log(c, { level: 'info', msg: 'Ingest successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, response);
  });
  app.get('/api/search', zValidator('query', searchSchema), async (c) => {
    const start = Date.now();
    const { q, tags, mime, limit, offset } = c.req.valid('query');
    log(c, { level: 'info', msg: 'Search request received', ...c.req.valid('query') });
    let results = [...MOCK_LINKS];
    // Mock filtering logic
    if (tags) {
      const searchTags = tags.split(',');
      results = results.filter(link => searchTags.every(tag => link.tags.includes(tag)));
    }
    if (mime) {
      const mimePattern = new RegExp('^' + mime.replace(/\*/g, '.*') + '$');
      results = results.filter(link => mimePattern.test(link.metadata.mime));
    }
    if (q) {
      const query = q.toLowerCase();
      if (query.startsWith('"') && query.endsWith('"')) {
        // Full-text search mock
        const term = query.substring(1, query.length - 1);
        results = results.filter(link =>
          link.title.toLowerCase().includes(term) ||
          link.description.toLowerCase().includes(term)
        );
      } else {
        // Semantic search mock - just re-order and filter slightly
        results = results.filter(link =>
          link.title.toLowerCase().includes(query) ||
          link.description.toLowerCase().includes(query) ||
          link.tags.some(t => t.includes(query))
        ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
    }
    const paginatedResults = results.slice(offset, offset + limit);
    log(c, { level: 'info', msg: 'Search successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, paginatedResults);
  });
  app.get('/api/suggest', async (c) => {
    const start = Date.now();
    const partial = c.req.query('partial')?.toLowerCase() ?? '';
    log(c, { level: 'info', msg: 'Suggest request received', partial });
    const suggestions = partial
      ? ALL_TAGS.filter(tag => tag.toLowerCase().startsWith(partial))
      : ALL_TAGS;
    log(c, { level: 'info', msg: 'Suggest successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, suggestions.slice(0, 10));
  });
  app.post('/api/query', zValidator('json', querySchema), async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    log(c, { level: 'info', msg: 'Agent query received', ...body });
    // Phase 1: For simplicity, return a fixed set of results for any agent query.
    const results = MOCK_LINKS.slice(0, 3);
    log(c, { level: 'info', msg: 'Agent query successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, results);
  });
  app.get('/api/health', (c) => {
    const start = Date.now();
    log(c, { level: 'info', msg: 'Health check' });
    const healthData = {
      version: '1.0.0',
      vectorizeCount: 1234, // Mock value
      d1Count: 5678, // Mock value
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
    log(c, { level: 'info', msg: 'Health check successful', status: 200, latencyMs: Date.now() - start });
    return ok(c, healthData);
  });
}