// HARNESS pixel evidence for flag-gated notes persistence UI (real client, mocked transport, FAKE data only).
// Mocks: /api/owner-check (verified OPEN - harness only; production gate stays CLOSED), /api/live-token,
// /api/notes/* (stateful per-scenario fake store), /api/session-logout. NOT production evidence.
import{chromium}from'playwright-core';import{spawn}from'node:child_process';import{readFileSync}from'node:fs';
import assert from'node:assert/strict';
const CHROME=process.env.CHROME_PATH||'/opt/google/chrome/chrome';
const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
const BASE='http://127.0.0.1:4336';
const server=spawn('python3',['-m','http.server','4336','--bind','127.0.0.1','--directory','dist-harness'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,900));
const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream']});
const ctx=await browser.newContext({acceptDownloads:true});
async function newPage(notesStatus,c=ctx){
 const page=await c.newPage();
 const saved=[];// fake server-side store for this page
 page.__capturedSessions=saved;
 await page.route('**/api/owner-check',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"ownerVerified":true,"voiceEnabled":true}'});});
 await page.route('**/api/live-token',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'auth_tokens/harness-fake',startBefore:new Date(Date.now()+1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()})});});
 await page.route('**/api/session-logout',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{}'});});
 await page.route('**/api/notes/session',async r=>{if(notesStatus===200){saved.push(JSON.parse(r.request().postData()));}await r.fulfill({status:notesStatus,contentType:'application/json',body:notesStatus===200?'{"recorded":true}':'{"error":"synthetic_failure"}'});});
 await page.route('**/api/notes/list',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sessions:saved.map(b=>({session_id:b.session_id,started_at:b.started_at,duration_s:b.duration_s,lesson_id:b.lesson_id,end_state:b.end_state}))})});});
 await page.route('**/api/notes/get',async r=>{const id=JSON.parse(r.request().postData()).session_id;const b=saved.find(x=>x.session_id===id);await r.fulfill({status:b?200:404,contentType:'application/json',body:JSON.stringify(b?{transcript:b.transcript,evidence:(b.evidence||[]).map(e=>({...e,heard_asr_phrases:JSON.stringify(e.heard_asr_phrases)})),notes_version:b.notes_version||null,content_version:b.content_version||null,snapshot:b.notes_snapshot||null,review_events:b.review_events||[]}:{error:'not_found'})});});
 await page.route('**/api/notes/delete',async r=>{const id=JSON.parse(r.request().postData()).session_id;const i=saved.findIndex(x=>x.session_id===id);if(i>=0)saved.splice(i,1);await r.fulfill({status:i>=0?200:404,contentType:'application/json',body:'{}'});});
 await page.addInitScript(STUBS);
 await page.addInitScript(()=>{try{localStorage.setItem('jp-notes-owner-sub','harness-owner');}catch{}});
 page.on('dialog',d=>d.accept());
 return page;
}
async function runSession(page){
 await page.goto(BASE+'/');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.click('#start');
 await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'),null,{timeout:20000});
 await new Promise(r=>setTimeout(r,1800));
 await page.click('#stop');
}
const lsKeys=page=>page.evaluate(()=>{const k=[];for(let i=0;i<localStorage.length;i++)k.push(localStorage.key(i));return k;});
// S7: recall-event real client capture. Click 단어 떠올리기 mid-session; the mocked
// recall turn scripts learner ASR per window.__harnessRecall; finish() must POST a
// classified review_event; reload + detail shows it; delete cascades it away.
{
 const c2=await browser.newContext({acceptDownloads:true});
 const page=await newPage(200,c2);
 await page.addInitScript(()=>{window.__harnessRecall='match';});
 await page.goto(BASE+'/');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.click('#start');
 await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'),null,{timeout:20000});
 await page.waitForFunction(()=>{const b=document.getElementById('recall-word');return b&&!b.disabled;},null,{timeout:20000});
 await page.click('#recall-word');
 await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('ポイントカード'),null,{timeout:15000});
 await page.waitForTimeout(600);
 await page.click('#stop');
 await page.waitForFunction(()=>document.getElementById('session-notes-summary').textContent.includes('서버에 저장됐어요'),null,{timeout:15000});
 const captured=page.__capturedSessions[page.__capturedSessions.length-1];
 assert.ok(Array.isArray(captured.review_events)&&captured.review_events.length===1,'finish() body carries exactly one review event');
 const ev=captured.review_events[0];
 assert.equal(ev.card_id,'M1-S1:word');assert.equal(ev.kind,'word');
 assert.equal(ev.outcome,'hinted','opening card visible -> hint-assisted, never independent'); // hintSeen is always true in main sessions
 assert.equal(ev.scheduler_rating,null);assert.equal(ev.counts_for_schedule,false);
 assert.ok(ev.event_id&&ev.at,'event identity + real time stamped');
 console.log('S7 PASS: recall event captured in real finish() body:',ev.card_id,ev.outcome);
 // reload -> detail rereads the event from the server
 await page.reload();
 await page.waitForFunction(()=>{const b=document.getElementById('notes-history-body');return b&&b.querySelector('.notes-history-row');},null,{timeout:20000});
 await page.evaluate(()=>{document.getElementById('notes-history').open=true;});
 await page.waitForTimeout(300);
 await page.click('#notes-history-body .notes-history-row button');
 await page.waitForFunction(()=>document.querySelector('.notes-history-detail').textContent.includes('복습 이벤트 (단어)'),null,{timeout:15000});
 const evLine=await page.evaluate(()=>[...document.querySelectorAll('.notes-history-detail p.privacy')].map(p=>p.textContent).find(t=>t.includes('복습 이벤트')));
 assert.ok(evLine.includes('힌트/예시를 본 연습'),'honest label: '+evLine);
 assert.ok(evLine.includes('일정·점수 반영 없음'),'no-schedule disclaimer: '+evLine);
 console.log('S7b PASS: review event survives reload and renders with honest label');
 // delete cascades the event server-side (store-level cascade covered by unit tests)
 await page.click('#notes-history-body .notes-history-row button:last-of-type');
 await page.waitForFunction(()=>!document.querySelector('#notes-history-body .notes-history-row'),null,{timeout:15000});
 console.log('S7c PASS: delete removes the session and its review events');
 await c2.close();
}

await browser.close();server.kill();process.exit(0);
