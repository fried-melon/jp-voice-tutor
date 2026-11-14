import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{GrantDO}from'../worker/grant-do.mjs';
function store(){const sqlite=new DatabaseSync(':memory:');return{sqlite,sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
const KEY=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function env(over={}){return{SHEETS_AUTH_ENABLED:'yes',SHEETS_GRANT_KEY:KEY,GOOGLE_CLIENT_ID:'cid',GOOGLE_CLIENT_SECRET:'csec',OWNER_GOOGLE_SUB:'owner-sub',APP_ORIGIN:'https://jp-tutor-owner-token.leejeongjin7178.workers.dev',...over};}
function make(e){const s=store();return{do:new GrantDO({storage:s},e),store:s};}
test('disabled by default: every route 503',async()=>{
 const{do:d}=make(env({SHEETS_AUTH_ENABLED:'no'}));
 for(const p of ['/start','/callback?code=x&state=y','/test','/disconnect']){
  const r=await d.fetch(new Request('https://grant.internal'+p,{method:'POST'}));assert.equal(r.status,503);}
});
test('start returns consent URL with drive.file only, one-time state, PKCE S256',async()=>{
 const{do:d,store:s}=make(env());
 const r=await d.fetch(new Request('https://grant.internal/start',{method:'POST'}));assert.equal(r.status,200);
 const{url}=await r.json();const u=new URL(url);
 assert.equal(u.origin,'https://accounts.google.com');
 assert.equal(u.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
 assert.equal(u.searchParams.get('access_type'),'offline');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.ok(u.searchParams.get('code_challenge').length>20);
 assert.ok(!url.includes('code_verifier'),'verifier never leaves the DO');
 assert.equal(u.searchParams.get('redirect_uri'),'https://jp-tutor-owner-token.leejeongjin7178.workers.dev/api/sheets-auth/callback');
 const pending=s.sqlite.prepare('SELECT record FROM oauth_pending').all();assert.equal(pending.length,1);
 const rec=JSON.parse(pending[0].record);assert.equal(rec.ownerSub,'owner-sub');assert.ok(rec.verifier.length>20);
 s.sqlite.close();
});
test('callback rejects unsolicited/cross-owner state and never exchanges',async()=>{
 const{do:d}=make(env());let calls=0;const real=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('must not exchange')};
 try{
  const r=await d.fetch(new Request('https://grant.internal/callback?code=x&state= forged ',{method:'GET'}));assert.equal(r.status,403);
  // cross-owner: pending exists but record ownerSub differs from env
  const{do:d2,store:s2}=make(env());
  const r2=await d2.fetch(new Request('https://grant.internal/start',{method:'POST'}));const{url}=await r2.json();
  const state=new URL(url).searchParams.get('state');
  s2.sqlite.prepare('UPDATE oauth_pending SET record=? WHERE state=?').run(JSON.stringify({...JSON.parse(s2.sqlite.prepare('SELECT record FROM oauth_pending WHERE state=?').get(state).record),ownerSub:'someone-else'}),state);
  const r3=await d2.fetch(new Request('https://grant.internal/callback?code=x&state='+state,{method:'GET'}));assert.equal(r3.status,502);
  assert.equal(calls,0);s2.sqlite.close();
 }finally{globalThis.fetch=real;}
});
test('full callback: exchange with verifier, encrypted grant stored, state single-use',async()=>{
 const{do:d,store:s}=make(env());
 const r=await d.fetch(new Request('https://grant.internal/start',{method:'POST'}));const{url}=await r.json();
 const state=new URL(url).searchParams.get('state');
 const bodies=[];const real=globalThis.fetch;
 globalThis.fetch=async(u,init)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({refresh_token:'rt-secret-1',access_token:'at-1',expires_in:3600}),{status:200});};
 try{
  const cb=await d.fetch(new Request('https://grant.internal/callback?code=authcode&state='+state,{method:'GET'}));assert.equal(cb.status,200);
  assert.ok(bodies[0].includes('code_verifier=')&&bodies[0].includes('code=authcode')&&bodies[0].includes('client_secret=csec'));
  const g=s.sqlite.prepare('SELECT iv,ciphertext FROM sheets_grant WHERE id=1').get();
  assert.ok(g.ciphertext&&!g.ciphertext.includes('rt-secret-1'),'grant stored encrypted');
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) c FROM oauth_pending').get().c,0,'pending consumed');
  const again=await d.fetch(new Request('https://grant.internal/callback?code=authcode&state='+state,{method:'GET'}));assert.equal(again.status,403,'state single-use');
 }finally{globalThis.fetch=real;s.sqlite.close();}
});
async function seedGrant(d){
 const r=await d.fetch(new Request('https://grant.internal/start',{method:'POST'}));const{url}=await r.json();
 return new URL(url).searchParams.get('state');
}
function mockGoogle(calls,{failAppend=false,failRevoke=false,fileSurvives=false}={}){
 return async(u,init)=>{
  calls.push([String(u),String(init?.body||''),init?.method||'GET']);
  const U=String(u);
  if(U.includes('oauth2.googleapis.com/token')&&String(init?.body).includes('authorization_code'))return new Response(JSON.stringify({refresh_token:'rt-secret-1',access_token:'at-1',expires_in:3600}),{status:200});
  if(U.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'at-2',expires_in:3600}),{status:200});
  if(U==='https://sheets.googleapis.com/v4/spreadsheets')return new Response(JSON.stringify({spreadsheetId:'test-file-1'}),{status:200});
  if(U.includes(':append'))return failAppend?new Response('{}',{status:500}):new Response(JSON.stringify({updates:{updatedRows:1}}),{status:200});
  if(U.includes('/values/Sheet1'))return new Response(JSON.stringify({values:[['TEST','synthetic-connection-check','x']]}),{status:200});
  if(U.includes('drive/v3/files/')&&init?.method==='DELETE')return new Response(null,{status:204});
  if(U.includes('drive/v3/files/'))return new Response('{}',{status:fileSurvives?200:404});
  if(U.includes('oauth2.googleapis.com/revoke'))return new Response(null,{status:failRevoke?400:200});
  throw Error('unexpected '+U);};
}
test('test flow: verified cleanup — revoke+grant wipe automatic after success',async()=>{
 const{do:d,store:s}=make(env());const calls=[];const real=globalThis.fetch;globalThis.fetch=mockGoogle(calls);
 try{
  const state=await seedGrant(d);
  await d.fetch(new Request('https://grant.internal/callback?code=authcode&state='+state,{method:'GET'}));
  const t=await d.fetch(new Request('https://grant.internal/test',{method:'POST'}));
  const body=await t.json();assert.equal(t.status,200);
  assert.deepEqual(body,{ok:true,testError:null,rowsWritten:1,readBack:true,fileDeleted:true,cleanup:{googleRevoked:true,grantWiped:true},unresolved:[]});
  assert.ok(calls.some(([u,,m])=>u.includes('drive/v3/files/test-file-1')&&m==='DELETE'),'delete attempted');
  assert.ok(calls.some(([u,,m])=>u.includes('drive/v3/files/test-file-1')&&m==='GET'),'delete verified by readback');
  assert.ok(calls.some(([u])=>u.includes('oauth2.googleapis.com/revoke')),'google revoke called');
  assert.equal(s.sqlite.prepare("SELECT state FROM sheets_grant WHERE id=1").get().state,'disconnected','grant wiped automatically');
  const t2=await d.fetch(new Request('https://grant.internal/test',{method:'POST'}));assert.equal(t2.status,409,'no grant remains after TEST');
 }finally{globalThis.fetch=real;s.sqlite.close();}
});
test('test failure still cleans up; revoke failure is reported, never claimed',async()=>{
 const{do:d,store:s}=make(env());const calls=[];const real=globalThis.fetch;globalThis.fetch=mockGoogle(calls,{failAppend:true,failRevoke:true});
 try{
  const state=await seedGrant(d);
  await d.fetch(new Request('https://grant.internal/callback?code=authcode&state='+state,{method:'GET'}));
  const t=await d.fetch(new Request('https://grant.internal/test',{method:'POST'}));
  const body=await t.json();assert.equal(t.status,502);
  assert.equal(body.ok,false);assert.equal(body.testError,'append_failed');assert.equal(body.fileDeleted,true);
  assert.equal(body.cleanup.googleRevoked,false,'revoke failure not claimed as success');
  assert.equal(body.cleanup.grantWiped,true);
  assert.deepEqual(body.unresolved,['google_revoke_unconfirmed']);
  assert.equal(s.sqlite.prepare("SELECT state FROM sheets_grant WHERE id=1").get().state,'disconnected','local wipe happens even when revoke fails');
 }finally{globalThis.fetch=real;s.sqlite.close();}
});
test('unverified file deletion surfaces as unresolved cleanup',async()=>{
 const{do:d,store:s}=make(env());const calls=[];const real=globalThis.fetch;globalThis.fetch=mockGoogle(calls,{fileSurvives:true});
 try{
  const state=await seedGrant(d);
  await d.fetch(new Request('https://grant.internal/callback?code=authcode&state='+state,{method:'GET'}));
  const t=await d.fetch(new Request('https://grant.internal/test',{method:'POST'}));
  const body=await t.json();assert.equal(body.fileDeleted,false);
  assert.deepEqual(body.unresolved,['test_file_delete_unverified']);
 }finally{globalThis.fetch=real;s.sqlite.close();}
});
test('test without grant returns connected:false 409',async()=>{
 const{do:d,store:s}=make(env());
 const t=await d.fetch(new Request('https://grant.internal/test',{method:'POST'}));assert.equal(t.status,409);s.sqlite.close();
});
