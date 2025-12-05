const { spawn } = require('child_process');
const fetch = require('node-fetch');
const assert = require('assert');
const WRANGLER_PORT = 8787;
const BASE_URL = `http://localhost:${WRANGLER_PORT}`;
const TEST_TIMEOUT = 60000; // 60 seconds
let wranglerProcess;
async function waitForServerReady() {
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log('✅ Server is ready.');
        return;
      }
    } catch (e) {
      // Ignore connection errors
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Server did not become ready in time.');
}
async function runTests() {
  console.log('--- Running API E2E Tests ---');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  // Test 1: Ingest URLs
  console.log('\n[Test 1] Ingesting URLs...');
  const urlsToIngest = [
    { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', tags: ['javascript', 'webdev', 'docs'] },
    { url: 'https://github.com/facebook/react', tags: ['react', 'javascript', 'ui'] },
    { url: 'https://stackoverflow.com/questions/tagged/javascript', tags: ['q&a', 'javascript', 'community'] },
  ];
  const ingestedIds = [];
  for (const item of urlsToIngest) {
    const res = await fetch(`${BASE_URL}/api/links`, {
      method: 'POST',
      headers,
      body: JSON.stringify(item),
    });
    const json = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200 OK for ${item.url}, got ${res.status}`);
    assert(json.success, `Ingestion failed for ${item.url}`);
    assert(json.data.id, `Ingestion response for ${item.url} missing ID`);
    ingestedIds.push(json.data.id);
    console.log(`  - Ingested ${item.url} -> ID: ${json.data.id}`);
  }
  assert.strictEqual(ingestedIds.length, 3, 'Expected 3 ingested IDs');
  // Test 2: Semantic Search
  console.log('\n[Test 2] Running Semantic Search...');
  const searchQuery = 'javascript documentation';
  const searchUrl = new URL(`${BASE_URL}/api/search`);
  searchUrl.searchParams.set('q', searchQuery);
  searchUrl.searchParams.set('tags', 'docs');
  const searchRes = await fetch(searchUrl.toString(), { headers });
  const searchJson = await searchRes.json();
  assert.strictEqual(searchRes.status, 200, 'Search request failed');
  assert(searchJson.success, 'Search API returned success: false');
  assert(Array.isArray(searchJson.data), 'Search data is not an array');
  assert(searchJson.data.length > 0, 'Semantic search returned no results');
  console.log(`  - Found ${searchJson.data.length} results for "${searchQuery}" with tag "docs"`);
  assert(searchJson.data[0].score > 0.75, 'Top result score is not > 0.75');
  // Test 3: Full-text Search
  console.log('\n[Test 3] Running Full-text Search...');
  const fullTextQuery = '"React"';
  const fullTextUrl = new URL(`${BASE_URL}/api/search`);
  fullTextUrl.searchParams.set('q', fullTextQuery);
  const ftRes = await fetch(fullTextUrl.toString(), { headers });
  const ftJson = await ftRes.json();
  assert.strictEqual(ftRes.status, 200, 'Full-text search request failed');
  assert(ftJson.success, 'Full-text search API returned success: false');
  assert(ftJson.data.length > 0, 'Full-text search returned no results');
  console.log(`  - Found ${ftJson.data.length} results for ${fullTextQuery}`);
  // Test 4: Tag Suggestions
  console.log('\n[Test 4] Fetching Tag Suggestions...');
  const suggestUrl = new URL(`${BASE_URL}/api/suggest`);
  suggestUrl.searchParams.set('partial', 'java');
  const suggestRes = await fetch(suggestUrl.toString(), { headers });
  const suggestJson = await suggestRes.json();
  assert.strictEqual(suggestRes.status, 200, 'Suggest request failed');
  assert(suggestJson.success, 'Suggest API returned success: false');
  assert(suggestJson.data.includes('javascript'), 'Suggest did not return "javascript" for "java"');
  console.log(`  - Suggestions for "java": ${suggestJson.data.join(', ')}`);
  // Test 5: Agent Query
  console.log('\n[Test 5] Running Agent Query...');
  const agentQuery = {
    naturalLanguageQuery: 'information about react library',
    filters: { tags: ['ui'] },
  };
  const agentRes = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(agentQuery),
  });
  const agentJson = await agentRes.json();
  assert.strictEqual(agentRes.status, 200, 'Agent query failed');
  assert(agentJson.success, 'Agent query API returned success: false');
  assert(agentJson.data.length > 0, 'Agent query returned no results');
  console.log(`  - Agent query found ${agentJson.data.length} results.`);
  // Test 6: Health Check
  console.log('\n[Test 6] Checking Health Endpoint...');
  const healthRes = await fetch(`${BASE_URL}/api/health`, { headers });
  const healthJson = await healthRes.json();
  assert.strictEqual(healthRes.status, 200, 'Health check failed');
  assert(healthJson.success, 'Health check returned success: false');
  assert.strictEqual(healthJson.data.d1Count, 3, `Expected d1Count to be 3, got ${healthJson.data.d1Count}`);
  console.log(`  - Health OK: d1Count=${healthJson.data.d1Count}`);
  console.log('\n--- All tests passed! ---');
}
(async () => {
  try {
    console.log('🚀 Starting wrangler dev for tests...');
    wranglerProcess = spawn('wrangler', ['dev', '--port', WRANGLER_PORT, '--test-scheduled'], {
      stdio: 'pipe', // use 'inherit' for debugging wrangler
      shell: true,
    });
    wranglerProcess.stderr.on('data', (data) => {
      console.error(`[wrangler stderr]: ${data.toString().trim()}`);
    });
    await waitForServerReady();
    await runTests();
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    if (wranglerProcess) {
      console.log('🔌 Shutting down wrangler dev...');
      wranglerProcess.kill();
    }
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});