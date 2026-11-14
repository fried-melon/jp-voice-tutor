// Status mapping for saved-history access helpers: auth vs network vs server must be
// distinguishable so the UI can offer the right recovery (Google re-verify vs retry).
import test from'node:test';import assert from'node:assert/strict';
import{listSessions,getSession,deleteSession}from'../src/notes-persist.ts';
const ENDPOINT='https://unit.test';
const TOKEN=()=>'tok-1';
function stubFetch(sequence){const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),auth:init?.headers?.Authorization||''});const next=sequence.shift();if(next instanceof Error)throw next;return new Response(next.body??'{}',{status:next.status,headers:{'Content-Type':'application/json'}});};return calls;}

test('listSessions ok returns sessions',async()=>{
 stubFetch([{status:200,body:'{"sessions":[{"session_id":"s1","started_at":"2026-11-03T00:00:00Z","duration_s":60,"lesson_id":"M1-S1","end_state":"manual_stop"}]}'}]);
 const r=await listSessions(ENDPOINT,TOKEN);
 assert.equal(r.status,'ok');assert.equal(r.sessions.length,1);assert.equal(r.sessions[0].session_id,'s1');
});
test('401 then refresh then ok retries with fresh token',async()=>{
 const calls=stubFetch([{status:401},{status:200,body:'{"sessions":[]}'}]);
 const r=await listSessions(ENDPOINT,TOKEN,{refresh:async()=>'tok-2'});
 assert.equal(r.status,'ok');assert.equal(calls.length,2);assert.equal(calls[1].auth,'Bearer tok-2');
});
test('401 persisting after refresh maps to auth',async()=>{
 stubFetch([{status:401},{status:401}]);
 const r=await listSessions(ENDPOINT,TOKEN,{refresh:async()=>'tok-2'});
 assert.equal(r.status,'auth');assert.equal(r.sessions.length,0);
});
test('401 with failed refresh maps to auth',async()=>{
 stubFetch([{status:401}]);
 const r=await listSessions(ENDPOINT,TOKEN,{refresh:async()=>null});
 assert.equal(r.status,'auth');
});
test('403 maps to auth',async()=>{
 stubFetch([{status:403}]);
 assert.equal((await deleteSession(ENDPOINT,TOKEN,'s1')),'auth');
});
test('network throw maps to network',async()=>{
 stubFetch([new Error('down')]);
 assert.equal((await listSessions(ENDPOINT,TOKEN)).status,'network');
});
test('500 maps to server',async()=>{
 stubFetch([{status:500}]);
 assert.equal((await getSession(ENDPOINT,TOKEN,'s1')).status,'server');
});
test('deleteSession ok',async()=>{
 stubFetch([{status:200}]);
 assert.equal(await deleteSession(ENDPOINT,TOKEN,'s1'),'ok');
});
