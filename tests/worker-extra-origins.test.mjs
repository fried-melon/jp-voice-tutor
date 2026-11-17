import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
// Extra app origins (e.g. the GitHub Pages mirror) may reach the owner-verified
// APIs; identity verification itself is unchanged. Non-listed origins stay denied.
const source = readFileSync('worker/index.mjs', 'utf8')
 .replace(/^import lessons from'.*';$/m, "const lessons=JSON.parse(readFileSync('content/lessons.v1.json','utf8'));")
 .replace(/^import prompt from'.*';$/m, "const prompt='synthetic';");
const genPath = 'worker/.extra-origins-test.gen.mjs';
writeFileSync(genPath, "import {readFileSync} from 'node:fs';\n" + source);
const worker = (await import('../' + genPath)).default;
const baseEnv = {APP_ORIGIN: 'https://app.example', GOOGLE_CLIENT_ID: 'client.example', OWNER_GOOGLE_SUB: 'owner-sub', APP_EXTRA_ORIGINS: 'https://pages.example, https://preview.example'};
const noExtraEnv = {APP_ORIGIN: 'https://app.example', GOOGLE_CLIENT_ID: 'client.example', OWNER_GOOGLE_SUB: 'owner-sub'};
const req = (path, origin, method = 'POST', extraHeaders = {}) => new Request('https://app.example' + path, {method, headers: {Origin: origin, ...extraHeaders}});

test('extra origin reaches owner-check (401 unauthenticated, not 403) with echo CORS', async () => {
 const res = await worker.fetch(req('/api/owner-check', 'https://pages.example'), baseEnv);
 assert.equal(res.status, 401);
 assert.equal((await res.json()).error, 'sign_in_required');
 assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://pages.example');
});

test('second extra origin also allowed; primary origin unchanged', async () => {
 const res2 = await worker.fetch(req('/api/owner-check', 'https://preview.example'), baseEnv);
 assert.equal(res2.status, 401);
 assert.equal(res2.headers.get('Access-Control-Allow-Origin'), 'https://preview.example');
 const res1 = await worker.fetch(req('/api/owner-check', 'https://app.example'), baseEnv);
 assert.equal(res1.status, 401);
 assert.equal(res1.headers.get('Access-Control-Allow-Origin'), 'https://app.example');
});

test('non-listed origin still denied with no CORS echo', async () => {
 const res = await worker.fetch(req('/api/owner-check', 'https://evil.example'), baseEnv);
 assert.equal(res.status, 403);
 assert.equal((await res.json()).error, 'origin_denied');
 assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('without APP_EXTRA_ORIGINS the extra origin is denied (default unchanged)', async () => {
 const res = await worker.fetch(req('/api/owner-check', 'https://pages.example'), noExtraEnv);
 assert.equal(res.status, 403);
});

test('preflight from extra origin gets 204 with echo; from other origins 403', async () => {
 const ok = await worker.fetch(req('/api/owner-check', 'https://pages.example', 'OPTIONS', {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type'}), baseEnv);
 assert.equal(ok.status, 204);
 assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://pages.example');
 const bad = await worker.fetch(req('/api/owner-check', 'https://evil.example', 'OPTIONS', {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization'}), baseEnv);
 assert.equal(bad.status, 403);
});

test('malformed extra origin fails closed as invalid configuration', async () => {
 const badEnv = {...baseEnv, APP_EXTRA_ORIGINS: 'http://insecure.example'};
 const res = await worker.fetch(req('/api/owner-check', 'https://app.example'), badEnv);
 assert.equal(res.status, 503);
 assert.equal((await res.json()).error, 'invalid_origin_configuration');
});

test('extra origin with path or trailing slash never matches', async () => {
 const tricky = {...baseEnv, APP_EXTRA_ORIGINS: 'https://pages.example/'};
 const res = await worker.fetch(req('/api/owner-check', 'https://pages.example'), tricky);
 assert.equal(res.status, 503);
});
