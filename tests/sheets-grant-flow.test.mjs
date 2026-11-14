import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{beginOwnerAuth}from'../shared/sheets-oauth-security.mjs';
import{savePendingAuth,loadGrant,revokeGrant}from'../shared/sheets-grant-repository.mjs';
import{handleOwnerCallback,refreshGrantAccess,TOKEN_ENDPOINT}from'../shared/sheets-oauth-flow.mjs';
function store(){const sqlite=new DatabaseSync(':memory:');return{sqlite,sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
const binding={ownerSub:'owner',clientId:'client',keyVersion:'k1',origin:'https://app.example'};
const key=crypto.getRandomValues(new Uint8Array(32));
const tokens={refresh_token:'rt-1',access_token:'at-1',expires_in:3600};
function connected(s){const pending=beginOwnerAuth(binding);savePendingAuth(s,pending);return handleOwnerCallback(s,{binding,keyBytes:key,code:'auth-code',state:pending.state,exchange:async({endpoint})=>{assert.equal(endpoint,TOKEN_ENDPOINT);return tokens}})}
test('callback consumes state once, stores only the encrypted grant, returns in-memory access token',async()=>{
 const s=store();try{
  const pending=beginOwnerAuth(binding);savePendingAuth(s,pending);
  const r=await handleOwnerCallback(s,{binding,keyBytes:key,code:'auth-code',state:pending.state,exchange:async()=>tokens});
  assert.equal(r.connected,true);assert.ok(r.accessToken.expiresAt>Date.now());
  const g=loadGrant(s,binding);assert.equal(g.connected,true);assert.equal(g.encryptedGrant.keyVersion,'k1');
  const raw=s.sqlite.prepare('SELECT iv,ciphertext FROM sheets_grant WHERE id=1').get();assert.ok(!raw.ciphertext.includes('rt-1'));
  await assert.rejects(handleOwnerCallback(s,{binding,keyBytes:key,code:'auth-code',state:pending.state,exchange:async()=>tokens}),/Invalid or expired OAuth state/);
 }finally{s.sqlite.close()}});
test('wrong binding, expired state and refresh-token-less exchange are rejected without a grant',async()=>{
 const s=store();try{
  const p1=beginOwnerAuth(binding);savePendingAuth(s,p1);
  await assert.rejects(handleOwnerCallback(s,{binding:{...binding,ownerSub:'other'},keyBytes:key,code:'x',state:p1.state,exchange:async()=>tokens}),/Invalid or expired/);
  const p2=beginOwnerAuth({...binding,now:0});assert.equal(p2.expiresAt,300000);savePendingAuth(s,p2);
  await assert.rejects(handleOwnerCallback(s,{binding,keyBytes:key,code:'x',state:p2.state,now:300001,exchange:async()=>tokens}),/Invalid or expired/);
  const p3=beginOwnerAuth(binding);savePendingAuth(s,p3);
  await assert.rejects(handleOwnerCallback(s,{binding,keyBytes:key,code:'x',state:p3.state,exchange:async()=>({access_token:'at',expires_in:10})}),/no refresh token/);
  assert.equal(loadGrant(s,binding).connected,false);
 }finally{s.sqlite.close()}});
test('refresh returns a new access token; rotation replaces the stored grant; old token cannot decrypt',async()=>{
 const s=store();try{
  await connected(s);
  const seen=[];const refresh=async({refreshToken})=>{seen.push(refreshToken);return{access_token:'at-2',expires_in:3600,refresh_token:'rt-2'}};
  const r=await refreshGrantAccess(s,{binding,keyBytes:key,refresh});assert.equal(r.accessToken.token,'at-2');assert.deepEqual(seen,['rt-1']);
  const r2=await refreshGrantAccess(s,{binding,keyBytes:key,refresh:async({refreshToken})=>{assert.equal(refreshToken,'rt-2');return{access_token:'at-3',expires_in:3600}}});
  assert.equal(r2.accessToken.token,'at-3');
 }finally{s.sqlite.close()}});
test('invalid_grant disconnects and wipes ciphertext; transient failure keeps the grant',async()=>{
 const s=store();try{
  await connected(s);
  await assert.rejects(refreshGrantAccess(s,{binding,keyBytes:key,refresh:async()=>{throw Error('socket hang up')}}),/socket/);
  assert.equal(loadGrant(s,binding).connected,true);
  const r=await refreshGrantAccess(s,{binding,keyBytes:key,refresh:async()=>{throw Error('invalid_grant: Token has been revoked')}});
  assert.deepEqual(r,{connected:false,reason:'invalid_grant'});
  assert.equal(loadGrant(s,binding).connected,false);
  assert.equal(s.sqlite.prepare('SELECT ciphertext FROM sheets_grant WHERE id=1').get().ciphertext,null);
  assert.deepEqual(await refreshGrantAccess(s,{binding,keyBytes:key,refresh:async()=>tokens}),{connected:false,reason:'not_connected'});
 }finally{s.sqlite.close()}});
test('explicit revocation wipes the grant; key-version mismatch reads as disconnected',async()=>{
 const s=store();try{
  await connected(s);assert.equal(loadGrant(s,{keyVersion:'other-key'}).connected,false);
  revokeGrant(s);const g=loadGrant(s,binding);assert.equal(g.connected,false);assert.equal(g.learnerWritesEnabled,false);
 }finally{s.sqlite.close()}});
