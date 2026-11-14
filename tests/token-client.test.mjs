import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/token-client.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {fetchLiveToken,SESSION_PROOF}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
globalThis.location={href:'https://app.example/'};
const proof={idToken:'dummy.signed.identity'};
const valid=()=>({token:'auth_tokens/test-only',startBefore:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+360000).toISOString()});
test('owner client rejects non-TLS, userinfo, queries and fragments before fetch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;};
 for(const url of ['http://remote.example/token','https://user:pass@api.example/token','https://api.example/token?secret=x','https://api.example/token#fragment'])await assert.rejects(fetchLiveToken(url,proof,'lesson',undefined,fetcher));
 assert.equal(calls,0);
});
test('owner proof is header-only with same-origin credentials, no redirects or cache',async()=>{
 let seen;const controller=new AbortController();
 const value=await fetchLiveToken('https://api.example/api/live-token',proof,'lesson',controller.signal,async(url,options)=>{seen={url,...options};return {ok:true,json:async()=>valid()};});
 assert.equal(value,'auth_tokens/test-only');assert.equal(seen.credentials,'same-origin');assert.equal(seen.cache,'no-store');assert.equal(seen.redirect,'error');assert.equal(seen.signal,controller.signal);assert.equal(seen.headers.Authorization,'Bearer '+proof.idToken);assert.deepEqual(JSON.parse(seen.body),{lessonId:'lesson'});assert.ok(!seen.url.includes(proof.idToken));
});
test('owner client rejects raw keys, expiry inversion and stale responses',async()=>{
 for(const change of [{token:'not-an-ephemeral-token'},{expiresAt:new Date(0).toISOString()},{startBefore:'invalid'},{startBefore:new Date(Date.now()+420000).toISOString()}])await assert.rejects(fetchLiveToken('https://api.example/token',proof,'lesson',undefined,async()=>({ok:true,json:async()=>({...valid(),...change})})));
});
test('flag path authenticates before requesting microphone',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(main.indexOf('await fetchLiveToken(')<main.indexOf('await thisMic.start('));
});
test('server failures preserve exact allowlisted status/code without leaking arbitrary provider text',async()=>{for(const[status,error]of[[503,'not_configured'],[429,'session_limit'],[502,'provider_failed'],[401,'invalid_identity']])await assert.rejects(fetchLiveToken('https://api.example/token',proof,'lesson',undefined,async()=>({ok:false,status,json:async()=>({error})})),e=>e.status===status&&e.code===error);await assert.rejects(fetchLiveToken('https://api.example/token',proof,'lesson',undefined,async()=>({ok:false,status:502,json:async()=>({error:'SENSITIVE-UNEXPECTED'})})),e=>e.code==='request_failed'&&!e.message.includes('SENSITIVE'))});
test('manual mode is explicit in owner request and unknown mode fails before fetch',async()=>{let seen,calls=0;const fetcher=async(_,options)=>{calls++;seen=JSON.parse(options.body);return{ok:true,json:async()=>valid()};};await fetchLiveToken('https://api.example/token',proof,'lesson',undefined,fetcher,'','push-to-talk');assert.deepEqual(seen,{lessonId:'lesson',voiceMode:'push-to-talk'});await assert.rejects(fetchLiveToken('https://api.example/token',proof,'lesson',undefined,fetcher,'','override'));assert.equal(calls,1);});

test('empty or sentinel proof attempts the HttpOnly session cookie and never sends an Authorization header',async()=>{
 for(const idToken of ['',SESSION_PROOF]){
  let seen;const value=await fetchLiveToken('https://api.example/api/live-token',{idToken},'lesson',undefined,async(url,options)=>{seen={url,...options};return {ok:true,json:async()=>valid()};});
  assert.equal(value,'auth_tokens/test-only');assert.equal(seen.headers.Authorization,undefined);assert.equal(seen.credentials,'same-origin');
 }
});
test('expired or invalid session cookie surfaces its exact code for re-login handling',async()=>{
 await assert.rejects(fetchLiveToken('https://api.example/api/live-token',{idToken:SESSION_PROOF},'lesson',undefined,async()=>({ok:false,status:401,json:async()=>({error:'session_invalid',reason:'expired_absolute'})})),e=>e.status===401&&e.code==='session_invalid'&&e.reason==='expired_absolute');
});

test('owner-login and owner-check sentinel copies match the token-client export',()=>{
 for(const f of ['../src/owner-login.ts','../src/owner-check.ts'])assert.ok(readFileSync(new URL(f,import.meta.url),'utf8').includes("'"+SESSION_PROOF+"'"),f);
});
