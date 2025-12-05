# LatticeLink

[cloudflarebutton]

## Overview

LatticeLink is a Cloudflare-native link ingestion, vectorization, and search application. It enables users to submit URLs for processing, where metadata is extracted, content is embedded using Workers AI, and data is stored in D1 and Vectorize for efficient semantic and full-text search. The application features a polished single-page UI for interactive searching and filtering, along with RESTful APIs designed for both direct use and AI agent integration.

Built entirely on Cloudflare's edge platform, LatticeLink leverages Workers for routing and logic, D1 for relational storage, Vectorize for vector search, and Workers AI for embeddings. It's deployable as a single Workers project with no external dependencies beyond Cloudflare services.

## Key Features

- **URL Ingestion**: POST `/api/links` to submit URLs. Performs HEAD requests for headers, fetches HTML to extract title, description, H1, and plaintext. Generates 384-dimensional embeddings using `@cf/baai/bge-small-en-v1.5` and upserts to Vectorize. Idempotent based on URL.
- **Advanced Search**: GET `/api/search` supports semantic search (cosine similarity > 0.75), full-text search (quoted queries), tag filtering, MIME type wildcards, pagination (limit/offset).
- **Tag Suggestions**: GET `/api/suggest` for autocompleting tags from stored data.
- **Agent API**: POST `/api/query` accepts natural language queries with filters, returning unified search results.
- **Polished UI**: Single-page React app at `/` with debounced search textarea, multi-select tag pills, MIME dropdown, and responsive result cards. Dark/light theme toggle persisted in localStorage. Cards open URLs in new tabs.
- **Observability**: Structured JSON logging for all handlers (`{level, msg, url, status, latencyMs}`). Health endpoint at `/health` reports version, Vectorize/D1 counts.
- **Validation & Standards**: All endpoints require `Accept: application/json`, return 400/404/500 as appropriate. OpenAPI spec at `/openapi.json`.
- **Storage**: D1 schema with `links` (URL metadata) and `tags` (many-to-many) tables. Vectorize stores embeddings keyed by link ID.

## Tech Stack

- **Frontend**: React 18, React Router, Tailwind CSS 3, shadcn/ui components, Framer Motion (animations), Lucide React (icons), Zustand (state), Sonner (toasts).
- **Backend**: Hono (routing), Cloudflare Workers (runtime), D1 (SQL database), Vectorize (vector DB), Workers AI (embeddings).
- **Tools**: Vite (build), TypeScript, Zod (validation), Bun (package manager).
- **Observability**: Console logging, OpenAPI auto-generation.
- **Testing**: Node.js test suite with Wrangler dev integration.

## Quick Start

### Prerequisites

- Node.js 18+ (or Bun)
- Cloudflare account with D1 database and Vectorize index provisioned (bindings configured in `wrangler.toml`).
- Wrangler CLI: `npm i -g wrangler`

### Installation

1. Clone the repository and navigate to the project directory.
2. Install dependencies using Bun:
   ```
   bun install
   ```
3. Configure bindings in `wrangler.toml` (D1: `LINKS_D1`, Vectorize: `VECTORIZE`, Workers AI model).
4. Run migrations:
   ```
   bun run migrate
   ```
   This executes `schema.sql` against your local or remote D1.

### Local Development

1. Start the development server:
   ```
   bun run dev
   ```
   - Frontend serves at `http://localhost:3000`.
   - Worker APIs at the same origin (proxied).

2. Access the UI at `/` for search demo. Test APIs via curl or browser.

3. For hot-reloading: Edit frontend files and save; worker changes require restart.

### Usage Examples

#### Ingest a Link
```
curl -X POST /api/links \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "tags": ["web", "demo"], "metadata": {}}'
```
Response: `{ "id": "123", ... }` (or existing ID if idempotent).

#### Semantic Search
```
curl "https://your-worker.dev/api/search?q=Cloudflare Workers&tags=docs&limit=5"
```
Returns: `[{ "id": "123", "url": "...", "title": "...", "tags": [...], "score": 0.85, "metadata": {...} }]`.

#### Tag Suggestions
```
curl "https://your-worker.dev/api/suggest?partial=web"
```
Response: `["web", "website", "webdev"]`.

#### Agent Query
```
curl -X POST /api/query \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"naturalLanguageQuery": "Find docs on Workers AI", "filters": {"tags": ["ai"], "mime": "text/html"}}'
```

#### Health Check
```
curl https://your-worker.dev/health
```
Response: `{ "version": "1.0", "vectorizeCount": 100, "d1Count": 100 }`.

OpenAPI docs: `https://your-worker.dev/openapi.json`.

## Development

### Project Structure

- `src/`: React frontend (pages, components, hooks, lib).
- `worker/`: Hono backend routes (`user-routes.ts`), entities (`entities.ts`), utils.
- `shared/`: TypeScript types shared between FE/BE.
- `schema.sql`: D1 migration for links/tags tables.

### Adding Routes
Extend `worker/user-routes.ts` using Hono patterns and entity helpers from `core-utils.ts`. Ensure logging and validation.

### Frontend Customization
- Use shadcn/ui components from `@/components/ui/*`.
- Theme: Managed via `useTheme` hook; persists in localStorage.
- State: Zustand stores (follow primitive selector rules to avoid re-renders).
- API Calls: Use `src/lib/api-client.ts` for typed fetches.

### Backend Patterns
- Storage: Use IndexedEntity for D1-like ops (no direct DO access).
- Embeddings: Invoke Workers AI in handlers.
- Search: Combine Vectorize cosine search with D1 joins/filters.

### Testing

Run the test suite:
```
bun test
```
- Starts `wrangler dev`.
- Ingests sample URLs (MDN, GitHub, Stack Overflow) with tags.
- Validates semantic/full-text queries return non-empty results.
- Cleans up.

Add tests in `tests/` using Node.js child_process for Wrangler integration.

## Deployment

1. Build the project:
   ```
   bun run build
   ```

2. Deploy to Cloudflare Workers:
   ```
   bun run deploy
   ```
   This runs `wrangler deploy`, binding D1/Vectorize via `wrangler.toml`.

3. For production:
   - Provision D1 (`wrangler d1 create links`) and Vectorize index.
   - Update bindings in dashboard or TOML.
   - Run migrations remotely: `wrangler d1 execute links --remote --file=schema.sql`.
   - Custom domain: Configure in Workers dashboard.

[cloudflarebutton]

### Environment Variables
No runtime env vars needed; all via bindings.

## API Documentation

Auto-generated OpenAPI spec served at `/openapi.json`. Includes schemas for all endpoints, request/response examples.

## Contributing

1. Fork the repo and create a feature branch.
2. Install dependencies: `bun install`.
3. Make changes and test locally: `bun run dev` and `bun test`.
4. Commit with conventional commits (e.g., `feat: add search filter`).
5. Push and open a PR.

Report issues for bugs or feature requests.

## License

MIT License. See [LICENSE](LICENSE) for details.