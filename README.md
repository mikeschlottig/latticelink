# LatticeLink
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mikeschlottig/latticelink)
## Overview
LatticeLink is a Cloudflare-native link ingestion, vectorization, and search application. It enables users to submit URLs for processing, where metadata is extracted, content is embedded using Workers AI, and data is stored in D1 and Vectorize for efficient semantic and full-text search. The application features a polished single-page UI for interactive searching and filtering, along with RESTful APIs designed for both direct use and AI agent integration.
Built entirely on Cloudflare's edge platform, LatticeLink leverages Workers for routing and logic, D1 for relational storage, Vectorize for vector search, and Workers AI for embeddings. It's deployable as a single Workers project with no external dependencies beyond Cloudflare services.
## Key Features
- **URL Ingestion**: POST `/api/links` to submit URLs. Performs HEAD requests for headers, fetches HTML to extract title, description, H1, and plaintext. Generates 384-dimensional embeddings using `@cf/baai/bge-small-en-v1.5` and upserts to Vectorize. Idempotent based on URL.
- **Advanced Search**: GET `/api/search` supports semantic search (cosine similarity > 0.75), full-text search (quoted queries), tag filtering, MIME type wildcards, pagination (limit/offset).
- **Tag Suggestions**: GET `/api/suggest` for autocompleting tags from stored data.
- **Agent API**: POST `/api/query` accepts natural language queries with filters, returning unified search results.
- **Polished UI**: Single-page React app at `/` with debounced search textarea, multi-select tag pills, MIME dropdown, and responsive result cards. Dark/light theme toggle persisted in localStorage. Cards open URLs in new tabs.
- **Observability**: Structured JSON logging for all handlers (`{level, msg, url, status, latencyMs}`). Health endpoint at `/api/health` reports version, Vectorize/D1 counts.
- **Validation & Standards**: All endpoints require `Accept: application/json`, return 400/404/500 as appropriate. OpenAPI spec at `/openapi.json`.
- **Storage**: D1 schema with `links` (URL metadata) and `tags` (many-to-many) tables. Vectorize stores embeddings keyed by link ID.
## Tech Stack
- **Frontend**: React 18, React Router, Tailwind CSS 3, shadcn/ui components, Framer Motion (animations), Lucide React (icons).
- **Backend**: Hono (routing), Cloudflare Workers (runtime), D1 (SQL database), Vectorize (vector DB), Workers AI (embeddings).
- **Tools**: Vite (build), TypeScript, Zod (validation), Bun (package manager).
- **Observability**: Console logging, OpenAPI auto-generation.
- **Testing**: Node.js test suite with Wrangler dev integration.
## Quick Start
### Prerequisites
- Node.js 18+ (or Bun)
- Cloudflare account with a D1 database and a Vectorize index provisioned.
- Wrangler CLI: `npm i -g wrangler`
### Installation & Configuration
1.  Clone the repository and navigate to the project directory.
2.  Install dependencies:
    ```bash
    bun install
    ```
3.  Configure your Cloudflare bindings in `wrangler.toml`. You will need to create a D1 database, a Vectorize index, and enable the Workers AI binding.
    ```toml
    # wrangler.toml
    [[d1_databases]]
    binding = "LINKS_D1"
    database_name = "latticelink-db"
    database_id = "YOUR_D1_DATABASE_ID"
    [[vectorize]]
    binding = "VECTORIZE"
    index_name = "latticelink-index"
    [ai]
    binding = "AI"
    ```
4.  Run the D1 database migrations:
    ```bash
    # For local development
    bun run migrate:local
    # For production
    bun run migrate
    ```
### Local Development
Start the development server with local bindings:
```bash
bun run dev
```
- The frontend is available at `http://localhost:3000`.
- The worker (API) runs locally, proxied by Vite.
### Testing
Run the end-to-end test suite. This will start a local `wrangler dev` instance, ingest data, run queries, and then shut down.
```bash
bun test
```
### Deployment
1.  Build the project assets:
    ```bash
    bun run build
    ```
2.  Deploy to your Cloudflare account:
    ```bash
    bun run deploy
    ```
## Usage Examples
#### Ingest a Link
```bash
curl -X POST http://localhost:8787/api/links \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com/learning/", "tags": ["web", "cloudflare", "docs"]}'
```
#### Idempotent Ingestion
Running the same command again will return the existing link with `existed: true`.
```bash
# Returns { "success": true, "data": { "id": "...", "existed": true, "link": { ... } } }
```
#### Semantic Search
```bash
curl "http://localhost:8787/api/search?q=serverless%20computing&tags=cloudflare"
```
#### Full-Text Search
```bash
curl "http://localhost:8787/api/search?q=%22Workers%20AI%22"
```
#### Tag Suggestions
```bash
curl "http://localhost:8787/api/suggest?partial=web"
```
#### Agent Query
```bash
curl -X POST http://localhost:8787/api/query \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"naturalLanguageQuery": "Find docs on Workers AI", "filters": {"tags": ["ai"], "mime": "text/html"}}'
```
#### Health Check
```bash
curl http://localhost:8787/api/health
```
The full API documentation is available via the OpenAPI spec at `/openapi.json`.
## Architecture
The project uses D1 for relational storage (links/tags tables), with a fallback to a Durable Object simulation if the D1 binding is absent in the local environment. Vectorize is used for vector search, and Workers AI for generating embeddings. The `wrangler.toml` file must be configured with the appropriate bindings for `LINKS_D1`, `VECTORIZE`, and `AI` for the deployed worker to function correctly.
## Troubleshooting
- **Binding Errors**: If you see errors like `AI binding missing` or `VECTORIZE binding missing`, ensure your `wrangler.toml` is correctly configured and that the bindings are enabled in your Cloudflare account for the deployed worker.
- **D1 Binding Missing**: Configure `wrangler.toml` and run `wrangler deploy`. For local development, ensure your local wrangler is up to date.
- **Ingestion Idempotency**: D1's `UNIQUE` constraint on the `url` column handles duplicates gracefully.
- **Local Dev Issues**: `wrangler dev` runs the worker locally. Ensure you have authenticated with `wrangler login`. For D1, local development uses a local SQLite file.
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mikeschlottig/latticelink)