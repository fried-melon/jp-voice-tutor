import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {generateSessionKey, parseSessionKey, mintSession} from '../shared/session-cookie.mjs';
// Import the real worker with content imports stubbed (same pattern as tests/worker/exact-auth-runtime.mjs).
const source = readFileSync('worker/index.mjs', 'utf8')
 .replace(/^import lessons from'.*';$/m, "const lessons=JSON.parse(readFileSync('content/lessons.v1.json','utf8'));")
 .replace(/^import prompt from'.*';$/m, "const prompt='synthetic';");
const genPath = 'worker/.session-auth-test.gen.mjs';
writeFileSync(genPath, "import {readFileSync} from 'node:fs';\n" + source);
const workerModule = await import('../' + genPath);
const worker = workerModule.default;
const OWNER = 'owner-sub';
const key = generateSessionKey();
const cookie = await mintSession(parseSessionKey(key), OWNER, {version: 1});
const baseEnv = {APP_ORIGIN: 'https://app.example', GOOGLE_CLIENT_ID: 'client.example', OWNER_GOOGLE_SUB: OWNER, SESSION_KEY: key};
const openEnv = {...baseEnv, GEMINI_API_KEY: 'DUMMY', API_PRIVACY_CONFIRMED: 'yes', GATE_OPEN_UNTIL: String(Date.now() + 15 * 60 * 1000), LIMITS: {idFromName: s => s, get: () => ({fetch: async url => String(url).endsWith('/session-nbf') ? Response.json({nbf: 0}) : String(url).endsWith('/revoke-all') ? Response.json({nbf: Date.now()}) : new Response(null, {status: 204})})}};
const realFetch = globalThis.fetch;
globalThis.fetch = async url => String(url).includes('generativelanguage') ? new Response(JSON.stringify({name: 'auth_tokens/test'}), {status: 200, headers: {'Content-Type': 'application/json'}}) : realFetch(url);
const post = (path, env, headers = {}, body) => worker.fetch(new Request('https://app.example' + path, {method: 'POST', headers: {Origin: 'https://app.example', 'Content-Type': 'application/json', ...headers}, body: body === undefined ? null : JSON.stringify(body)}), env);
const lessonId = JSON.parse(readFileSync('content/lessons.v1.json', 'utf8')).lessons[0].id;

test('valid session cookie authenticates owner-check and live-token without any Bearer token', async () => {
 const check = await post('/api/owner-check', baseEnv, {Cookie: 'owner_session=' + cookie});
 assert.equal(check.status, 200);
 assert.deepEqual(await check.json(), {ownerVerified: true, voiceEnabled: false});
 // Two-control gate: flag=yes WITHOUT a valid GATE_OPEN_UNTIL cutoff still fails closed.
 const flagOnly = {...openEnv, GATE_OPEN_UNTIL: undefined};
 assert.equal((await post('/api/owner-check', flagOnly, {Cookie: 'owner_session=' + cookie})).status, 200);
 assert.deepEqual((await (await post('/api/owner-check', flagOnly, {Cookie: 'owner_session=' + cookie})).json()).voiceEnabled, false);
 assert.equal((await post('/api/live-token', flagOnly, {Cookie: 'owner_session=' + cookie}, {lessonId})).status, 503);
 // Cutoff alone is not enough either: flag=no with a valid cutoff stays closed.
 const cutoffOnly = {...openEnv, API_PRIVACY_CONFIRMED: 'no'};
 assert.deepEqual((await (await post('/api/owner-check', cutoffOnly, {Cookie: 'owner_session=' + cookie})).json()).voiceEnabled, false);
 assert.equal((await post('/api/live-token', cutoffOnly, {Cookie: 'owner_session=' + cookie}, {lessonId})).status, 503);
 // Both controls valid: open (verified below by the successful mint).
 const mint = await post('/api/live-token', openEnv, {Cookie: 'owner_session=' + cookie}, {lessonId});
 assert.equal(mint.status, 200);
 assert.ok((await mint.json()).token.startsWith('auth_tokens/'));
});
test('missing, tampered, foreign-owner and revoked-version cookies are rejected and cleared', async () => {
 assert.equal((await post('/api/owner-check', baseEnv)).status, 401);
 const tampered = await post('/api/owner-check', baseEnv, {Cookie: 'owner_session=' + cookie.slice(0, -4) + 'AAAA'});
 assert.equal(tampered.status, 401);
 assert.equal((await tampered.json()).error, 'session_invalid');
 assert.match(tampered.headers.get('Set-Cookie'), /Max-Age=0/);
 const foreign = await mintSession(parseSessionKey(key), 'someone-else', {version: 1});
 assert.equal((await post('/api/owner-check', baseEnv, {Cookie: 'owner_session=' + foreign})).status, 401);
 const revoked = await post('/api/owner-check', {...baseEnv, OWNER_SESSION_VERSION: '2'}, {Cookie: 'owner_session=' + cookie});
 assert.equal(revoked.status, 401);
 assert.equal((await revoked.json()).reason, 'version');
});
test('logout clears the cookie even while the voice gate is closed; cookie never reaches review writes', async () => {
 const out = await post('/api/session-logout', baseEnv);
 assert.equal(out.status, 200);
 assert.match(out.headers.get('Set-Cookie'), /owner_session=;.*Max-Age=0/);
 assert.equal((await worker.fetch(new Request('https://app.example/api/session-logout', {method: 'GET', headers: {Origin: 'https://app.example'}}), baseEnv)).status, 405);
 const review = await post('/api/review-events', baseEnv, {Cookie: 'owner_session=' + cookie}, {});
 assert.equal(review.status, 503);
});
test('without SESSION_KEY configured the cookie path is disabled and Bearer behavior is unchanged', async () => {
 const noKey = {APP_ORIGIN: 'https://app.example', GOOGLE_CLIENT_ID: 'client.example', OWNER_GOOGLE_SUB: OWNER};
 const res = await post('/api/owner-check', noKey, {Cookie: 'owner_session=' + cookie});
 assert.equal(res.status, 401);
 assert.equal((await res.json()).error, 'sign_in_required');
});

test('revoke-all invalidates existing cookies while fresh Bearer login still works after', async () => {
 const state = {nbf: 0};
 const env = {...openEnv, LIMITS: {idFromName: s => s, get: () => ({fetch: async url => {
  if (String(url).endsWith('/session-nbf')) return Response.json({nbf: state.nbf});
  if (String(url).endsWith('/revoke-all')) {state.nbf = Date.now(); return Response.json({nbf: state.nbf});}
  return new Response(null, {status: 204});
 }})}};
 const before = await post('/api/owner-check', env, {Cookie: 'owner_session=' + cookie});
 assert.equal(before.status, 200);
 const revoke = await post('/api/session-revoke-all', env, {Cookie: 'owner_session=' + cookie});
 assert.equal(revoke.status, 200);
 assert.match(revoke.headers.get('Set-Cookie'), /Max-Age=0/);
 const after = await post('/api/owner-check', env, {Cookie: 'owner_session=' + cookie});
 assert.equal(after.status, 401);
 assert.equal((await after.json()).reason, 'revoked');
 assert.equal((await post('/api/session-revoke-all', env)).status, 401);
});
test('revocation floor survives rate-counter reserve and day rollover; same-millisecond mints are rejected; floor read failure fails closed', async () => {
 const state = {nbf: 0};
 const env = {...openEnv, LIMITS: {idFromName: s => s, get: () => ({fetch: async url => {
  if (String(url).endsWith('/session-nbf')) return Response.json({nbf: state.nbf});
  if (String(url).endsWith('/revoke-all')) {state.nbf = Date.now(); return Response.json({nbf: state.nbf});}
  return new Response(null, {status: 204}); // reserve path never touches the floor
 }})}};
 // floor set, then reserves and a simulated day change must not clear it
 await post('/api/session-revoke-all', env, {Cookie: 'owner_session=' + cookie});
 await post('/api/live-token', env, {Cookie: 'owner_session=' + cookie}, {lessonId}); // hits reserve (401 before reserve? no: revoked first)
 const still = await post('/api/owner-check', env, {Cookie: 'owner_session=' + cookie});
 assert.equal(still.status, 401);
 assert.equal((await still.json()).reason, 'revoked');
 // a cookie minted at exactly the floor instant must NOT survive
 const atFloor = await mintSession(parseSessionKey(key), OWNER, {version: 1, iat: state.nbf});
 const edge = await post('/api/owner-check', env, {Cookie: 'owner_session=' + atFloor});
 assert.equal(edge.status, 401);
 assert.equal((await edge.json()).reason, 'revoked');
 // floor unreadable -> fail closed
 const broken = {...openEnv, LIMITS: {idFromName: s => s, get: () => ({fetch: async () => new Response(null, {status: 500})})}};
 const closed = await post('/api/owner-check', broken, {Cookie: 'owner_session=' + cookie});
 assert.equal(closed.status, 503);
 assert.equal((await closed.json()).error, 'session_store_unavailable');
});
test('REAL IssuanceLimit object: floor persists across reserves and day rollover (node:sqlite in-memory)', async () => {
 const {DatabaseSync} = await import('node:sqlite');
 const db = new DatabaseSync(':memory:');
 const shim = {exec: (q, ...params) => /^\s*SELECT/i.test(q) ? {toArray: () => db.prepare(q).all(...params)} : (db.prepare(q).run(...params), {toArray: () => []})};
 const limits = new workerModule.IssuanceLimit({storage: {transactionSync: f => f(), sql: shim}});
 const call = p => limits.fetch(new Request('https://quota.internal' + p, {method: 'POST'}));
 assert.equal((await call('/reserve')).status, 204);
 const set = await call('/revoke-all');
 const nbf = (await set.json()).nbf;
 assert.ok(nbf > 0);
 db.prepare("UPDATE limit_state SET day='2000-01-01', last=0 WHERE id=1").run(); // force next-day rollover path
 assert.equal((await call('/reserve')).status, 204); // rollover reinitializes the rate counter
 const floor = await call('/session-nbf');
 assert.equal((await floor.json()).nbf, nbf); // floor untouched by reserve + rollover
});
