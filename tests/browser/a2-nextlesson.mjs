// A2 next-lesson suggestion HARNESS evidence (real client, mocked transport, FAKE data only).
// NOT production evidence. Verifies: metadata-driven suggestion renders with the honest
// label, computed from stored completed-session metadata only, and is stable across reload.
import{chromium}from'playwright-core';import{spawn}from'node:child_process';import{readFileSync}from'node:fs';
import assert from'node:assert/strict';
const CHROME=process.env.CHROME_PATH||'/opt/google/chrome/chrome';
const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
const BASE='http://127.0.0.1:4339';
const server=spawn('python3',['-m','http.server','4339','--bind','127.0.0.1','--directory','dist-harness'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,900));
const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream']});
const ctx=await browser.newContext({acceptDownloads:true});
// Fake server-side session summaries: M1-S1 completed (duration_complete), one manual stop.
const SESSIONS=[
 {session_id:'fake-a2-1',started_at:'2026-01-07T00:00:00Z',duration_s:240,lesson_id:'M1-S1',voice_mode:'natural',end_state:'duration_complete'},
 {session_id:'fake-a2-2',started_at:'2026-01-08T00:00:00Z',duration_s:60,lesson_id:'M1-S2',voice_mode:'natural',end_state:'manual_stop'},
];
async function newPage(){
 const page=await ctx.newPage();
 await page.route('**/api/owner-check',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"ownerVerified":true,"voiceEnabled":true}'});});
 await page.route('**/api/live-token',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'auth_tokens/harness-fake',startBefore:new Date(Date.now()+1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()})});});
 await page.route('**/api/notes/session',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"recorded":true}'});});
 await page.route('**/api/notes/get',async r=>{await r.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});});
 await page.route('**/api/notes/list',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sessions:SESSIONS})});});
 await page.addInitScript(STUBS);
 await page.addInitScript(()=>{try{localStorage.setItem('jp-notes-owner-sub','harness-owner');}catch{}});
 return page;
}
const page=await newPage();
await page.goto(BASE+'/');
await page.waitForFunction(()=>{const sp=document.getElementById('next-lesson-suggestion');return sp&&!sp.hidden&&sp.textContent.length>10;},null,{timeout:20000});
const text=await page.evaluate(()=>document.getElementById('next-lesson-suggestion').textContent);
console.log('SUGGESTION TEXT:',text);
assert.ok(text.includes('봉투'),'suggests M1-S2 (봉투) after completed M1-S1');
assert.ok(text.includes('완료는 숙달이 아니에요'),'honest completion-not-mastery label');
assert.ok(text.includes('미리보기'),'labeled preview');
await page.screenshot({path:'/downloads/a2-nextlesson-harness.png'});
console.log('A2-a PASS: suggestion renders from completed-session metadata with honest label');
// Reload: suggestion is recomputed from the server list, stable across reload.
await page.reload();
await page.waitForFunction(()=>{const sp=document.getElementById('next-lesson-suggestion');return sp&&!sp.hidden&&sp.textContent.length>10;},null,{timeout:20000});
const text2=await page.evaluate(()=>document.getElementById('next-lesson-suggestion').textContent);
assert.equal(text2,text,'stable across reload');
console.log('A2-b PASS: suggestion stable across reload (server metadata re-read)');
// No completed sessions -> first lesson suggested with no_completed_sessions basis.
SESSIONS.length=0;SESSIONS.push({session_id:'fake-a2-3',started_at:'2026-01-08T01:00:00Z',duration_s:30,lesson_id:'M1-S3',voice_mode:'natural',end_state:'manual_stop'});
const page2=await newPage();
await page2.goto(BASE+'/');
await page2.waitForFunction(()=>{const sp=document.getElementById('next-lesson-suggestion');return sp&&!sp.hidden&&sp.textContent.length>10;},null,{timeout:20000});
const text3=await page2.evaluate(()=>document.getElementById('next-lesson-suggestion').textContent);
console.log('NO-COMPLETE TEXT:',text3);
assert.ok(text3.includes('포인트 카드'),'no completed sessions -> first lesson (M1-S1 포인트 카드)');
console.log('A2-c PASS: no completion metadata -> first lesson, no fabricated progress');
await browser.close();server.kill();
