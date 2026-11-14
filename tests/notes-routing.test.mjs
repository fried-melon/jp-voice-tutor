// Synthetic routing-level notes denial tests: real worker/index.mjs with stubbed
// content imports, real RS256 JWT verified against a stubbed Google JWKS, and a
// node:sqlite D1 shim. FAKE data only. Covers the denials enforced UPSTREAM of
// handleNotes: flag-off 503, cookie-never-covers-learner-data 401, wrong-sub
// owner isolation 401, cross-origin denial, and the positive owner path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateSessionKey, parseSessionKey, mintSession} from '../shared/session-cookie.mjs';
const source = readFileSync('worker/index.mjs', 'utf8')
 .replace(/^import lessons from'.*';$/m, "const lessons=JSON.parse(readFileSync('content/lessons.v1.json','utf8'));")
 .replace(/^import prompt from'.*';$/m, "const prompt='synthetic';");
writeFileSync('worker/.notes-routing-test.gen.mjs', "import {readFileSync} from 'node:fs';\n" + source);
const worker = (await import('../worker/.notes-routing-test.gen.mjs')).default;
const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey); Object.assign(jwk, {kid:'test', alg:'RS256', use:'sig'});
const b64 = x => Buffer.from(x).toString('base64url');
const sign = async claims => {const d = b64(JSON.stringify({alg:'RS256',kid:'test'}))+'.'+b64(JSON.stringify(claims)); return d+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(d)));};
const OWNER = 'owner-sub';
const jwtBase = {sub:OWNER, aud:'client.example', iss:'https://accounts.google.com', exp:Math.floor(Date.now()/1000)+600, iat:Math.floor(Date.now()/1000)};
const ownerJwt = await sign(jwtBase);
const wrongSubJwt = await sign({...jwtBase, sub:'someone-else'});
globalThis.fetch = async url => String(url).includes('googleapis.com/oauth2/v3/certs') ? Response.json({keys:[jwk]}) : new Response(null, {status:404});
function d1Shim(db){function prepare(sql){function bind(...args){const stmt=db.prepare(sql);return{run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:r.changes}};},all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)};}return{bind};}return{prepare};}
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.exec(readFileSync('worker/notes-schema.sql','utf8'));db.exec(readFileSync('worker/notes-migration-002.sql','utf8'));
const key = generateSessionKey();
const cookie = await mintSession(parseSessionKey(key), OWNER, {version: 1});
const baseEnv = {APP_ORIGIN:'https://app.example', GOOGLE_CLIENT_ID:'client.example', OWNER_GOOGLE_SUB:OWNER, SESSION_KEY:key};
const notesEnv = {...baseEnv, NOTES_ENABLED:'yes', NOTES_DB:d1Shim(db)};
const SESSION = {session_id:'fake-r1', started_at:'2026-01-07T00:00:00Z', duration_s:240, lesson_id:'fake-lesson', voice_mode:null, end_state:'completed', transcript:[{role:'clerk', text:'fake', ts:'2026-01-07T00:00:01Z'}], evidence:[]};
const post = (env, headers, path='/api/notes/session') => worker.fetch(new Request('https://app.example'+path, {method:'POST', headers:{Origin:'https://app.example', 'Content-Type':'application/json', ...headers}, body:JSON.stringify(SESSION)}), env);
test('flag off: notes route is 503 notes_disabled even with a valid owner Bearer', async () => {
 const r = await post(baseEnv, {Authorization:'Bearer '+ownerJwt});
 assert.equal(r.status, 503); assert.equal((await r.json()).error, 'notes_disabled');
});
test('cookie-only is 401 sign_in_required: the owner session cookie never covers learner data', async () => {
 const r = await post(notesEnv, {Cookie:'owner_session='+cookie});
 assert.equal(r.status, 401); assert.equal((await r.json()).error, 'sign_in_required');
});
test('no credential at all is 401', async () => {
 assert.equal((await post(notesEnv, {})).status, 401);
});
test('owner isolation: valid Google JWT with a different sub is 401 owner_mismatch', async () => {
 const r = await post(notesEnv, {Authorization:'Bearer '+wrongSubJwt});
 assert.equal(r.status, 401); assert.equal((await r.json()).reason, 'owner_mismatch');
});
test('cross-origin POST denied and preflight from foreign origin is 403', async () => {
 const r = await worker.fetch(new Request('https://app.example/api/notes/session', {method:'POST', headers:{Origin:'https://evil.example', 'Content-Type':'application/json', Authorization:'Bearer '+ownerJwt}, body:JSON.stringify(SESSION)}), notesEnv);
 assert.notEqual(r.status, 200); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
 const pre = await worker.fetch(new Request('https://app.example/api/notes/session', {method:'OPTIONS', headers:{Origin:'https://evil.example', 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'authorization, content-type'}}), notesEnv);
 assert.equal(pre.status, 403);
});
test('positive: owner Bearer stores the session (routing reaches handleNotes)', async () => {
 const r = await post(notesEnv, {Authorization:'Bearer '+ownerJwt});
 assert.equal(r.status, 200);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM transcript_entries').get().c, 1);
});
