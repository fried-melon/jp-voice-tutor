import test from'node:test';import assert from'node:assert/strict';
import{mintSession,verifySession,renewSession,parseSessionKey,sessionCookieHeader,clearSessionCookieHeader}from'../shared/session-cookie.mjs';
const key=parseSessionKey(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
const T=1_700_000_000_000;
test('mint+verify roundtrip, owner binding enforced',async()=>{
 const v=await mintSession(key,'owner-sub-123',{now:T,idleMs:60000,absMs:600000});
 assert.equal((await verifySession(key,v,{now:T+1000,ownerSub:'owner-sub-123'})).ok,true);
 assert.equal((await verifySession(key,v,{now:T+1000,ownerSub:'someone-else'})).reason,'wrong_owner');
});
test('absolute and idle expiry are independent hard stops',async()=>{
 const v=await mintSession(key,'s',{now:T,idleMs:60000,absMs:600000});
 assert.equal((await verifySession(key,v,{now:T+60001})).reason,'expired_idle');
 const v2=await mintSession(key,'s',{now:T,idleMs:600000,absMs:60000});
 assert.equal((await verifySession(key,v2,{now:T+60001})).reason,'expired_absolute');
});
test('renewal refreshes idle window but never the absolute cap',async()=>{
 const v=await mintSession(key,'s',{now:T,idleMs:60000,absMs:120000});
 assert.equal(await renewSession(key,v,{now:T+20000,idleMs:60000,absMs:120000}),null); // >half idle left
 const r=await renewSession(key,v,{now:T+40000,idleMs:60000,absMs:120000});
 const chk=await verifySession(key,r,{now:T+40001});
 assert.equal(chk.expIdle,T+40000+60000);assert.equal(chk.expAbs,T+120000);assert.equal(chk.iat,T);
});
test('version bump revokes; tamper/malformed/wrong key rejected',async()=>{
 const v=await mintSession(key,'s',{now:T});
 assert.equal((await verifySession(key,v,{now:T+1,version:2})).reason,'version');
 assert.equal((await verifySession(key,v.slice(0,-2)+'xx',{now:T+1})).ok,false);
 assert.equal((await verifySession(key,'garbage',{now:T+1})).reason,'malformed');
 const other=parseSessionKey(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
 assert.equal((await verifySession(other,v,{now:T+1})).ok,false);
});
test('key must be 32 bytes; cookie flags locked down; clear header expires',()=>{
 assert.throws(()=>parseSessionKey('c2hvcnQ'));
 const h=sessionCookieHeader('v',3600);
 for(const f of['HttpOnly','Secure','SameSite=Strict','Path=/api'])assert.ok(h.includes(f));
 assert.ok(clearSessionCookieHeader().includes('Max-Age=0'));
});
