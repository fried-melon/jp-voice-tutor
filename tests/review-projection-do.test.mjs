import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{ReviewProjectionDO}from'../worker/review-projection-do.mjs';
import{beginOwnerAuth}from'../shared/sheets-oauth-security.mjs';
import{savePendingAuth}from'../shared/sheets-grant-repository.mjs';
import{handleOwnerCallback}from'../shared/sheets-oauth-flow.mjs';
import{REVIEW_HEADERS}from'../shared/review-schema.mjs';
function store(){const sqlite=new DatabaseSync(':memory:');return{sqlite,sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
const row=['TEST-C1-do-001','M1-S1:word:ポイントカード','2026-10-27T00:00:00Z',3,'rule','normal','N','Y',8,'test-harness','[synthetic]','Y','Good'];
const key=crypto.getRandomValues(new Uint8Array(32));
const env={REVIEW_WRITES_ENABLED:'yes',OWNER_GOOGLE_SUB:'owner',APP_ORIGIN:'https://app.example',OAUTH_CLIENT_ID:'cid',OAUTH_CLIENT_SECRET:'csecret',GRANT_KEY_VERSION:'k1',GRANT_ENCRYPTION_KEY:Buffer.from(key).toString('base64'),REVIEW_TARGET_FILE_ID:'test-file-id-12345',REVIEW_ALLOWED_FILE_ID:'test-file-id-12345',REVIEW_ID_PREFIX:'TEST-C1-do-'};
// Fake Google: token endpoint + one in-memory Sheet. This is a mock of Google,
// not a real Google round trip.
function fakeGoogle(){const rows=[[...REVIEW_HEADERS]];let appends=0,refreshes=0;return{rows,get appends(){return appends},get refreshes(){return refreshes},fetch:async(url,init={})=>{
 if(url==='https://oauth2.googleapis.com/token'){refreshes++;return Response.json({access_token:'at-'+refreshes,expires_in:3600})}
 if(url.includes(':append')){assert.ok(url.includes('valueInputOption=RAW'));appends++;rows.push(JSON.parse(init.body).values[0].map(v=>typeof v==='number'?String(v):v));return Response.json({})}
 if(url.includes('/values/'))return Response.json({values:structuredClone(rows)});
 return Response.json({},{status:404})}}}
const post=row=>new Request('https://review.internal/project',{method:'POST',body:JSON.stringify({row})});
async function connect(storage){const pending=beginOwnerAuth({ownerSub:'owner',clientId:'cid',keyVersion:'k1',origin:'https://app.example'});savePendingAuth(storage,pending);await handleOwnerCallback(storage,{binding:{ownerSub:'owner',clientId:'cid',keyVersion:'k1',origin:'https://app.example'},keyBytes:key,code:'c',state:pending.state,exchange:async()=>({refresh_token:'rt',access_token:'at',expires_in:3600})})}
test('disabled flag, missing grant and bad payloads are refused before any Google call',async()=>{
 const s=store(),g=fakeGoogle();globalThis.fetch=g.fetch;try{
  assert.equal((await new ReviewProjectionDO({storage:s},{...env,REVIEW_WRITES_ENABLED:'no'}).fetch(post(row))).status,503);
  assert.equal((await new ReviewProjectionDO({storage:s},env).fetch(post(row))).status,503);
  await connect(s);
  assert.equal((await new ReviewProjectionDO({storage:s},env).fetch(new Request('https://review.internal/project',{method:'GET'}))).status,405);
  assert.equal((await new ReviewProjectionDO({storage:s},env).fetch(new Request('https://review.internal/project',{method:'POST',body:'not json'}))).status,400);
  assert.equal(g.appends,0);assert.equal(g.refreshes,0);
 }finally{s.sqlite.close()}});
test('end to end: POST commits ledger, projects to the fake sheet once, caches the access token',async()=>{
 const s=store(),g=fakeGoogle();globalThis.fetch=g.fetch;try{
  await connect(s);const dgo=new ReviewProjectionDO({storage:s},env);
  const res=await dgo.fetch(post(row));assert.equal(res.status,200);
  const body=await res.json();assert.equal(body.committed,true);assert.equal(body.projection.projected,true);
  assert.equal(g.appends,1);assert.equal(g.rows.length,2);assert.equal(g.refreshes,1);
  const again=await dgo.fetch(post(row));assert.equal(again.status,200);
  assert.equal(g.appends,1);assert.equal(g.refreshes,1);
  // A fresh instance with a durably projected row needs no Google call at all.
  const other=new ReviewProjectionDO({storage:s},env);const third=await other.fetch(post(row));
  assert.equal(third.status,200);assert.equal(g.appends,1);assert.equal(g.refreshes,1);
  const row2=row.map((v,i)=>i===0?'TEST-C1-do-002':v);
  assert.equal((await other.fetch(post(row2))).status,200);
  assert.equal(g.appends,2);assert.equal(g.refreshes,2);assert.equal(g.rows.length,3);
 }finally{s.sqlite.close()}});
test('conflicting same-UUID row gets 409 and the fake sheet stays untouched',async()=>{
 const s=store(),g=fakeGoogle();globalThis.fetch=g.fetch;try{
  await connect(s);const dgo=new ReviewProjectionDO({storage:s},env);
  assert.equal((await dgo.fetch(post(row))).status,200);
  const conflict=row.map((v,i)=>i===3?1:i===12?'Again':v);
  assert.equal((await dgo.fetch(post(conflict))).status,409);
  assert.equal(g.appends,1);assert.equal(g.rows.length,2);
 }finally{s.sqlite.close()}});
test('ambiguous append (timeout after write) never double-appends; readback reconciles',async()=>{
 const s=store();const g=fakeGoogle();let failOnce=true;const origFetch=g.fetch;
 globalThis.fetch=async(url,init)=>{if(failOnce&&url.includes(':append')){failOnce=false;const r=await origFetch(url,init);throw Error('socket timeout')}return origFetch(url,init)};
 try{
  await connect(s);const dgo=new ReviewProjectionDO({storage:s},env);
  const res=await dgo.fetch(post(row));assert.equal(res.status,200);
  assert.equal(g.appends,1);
  assert.equal((await dgo.fetch(post(row))).status,200);assert.equal(g.appends,1);
 }finally{s.sqlite.close()}});
