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
// S1: server accepts -> label '서버에 저장됐어요', no recovery bar, history list shows the session,
//     reload -> reread from server list, detail opens, delete removes it.
{
 const page=await newPage(200);
 await runSession(page);
 await page.waitForFunction(()=>!document.getElementById('session-notes').hidden,null,{timeout:15000});
 await page.waitForFunction(()=>document.getElementById('session-notes-summary').textContent.includes('서버에 저장됐어요'),null,{timeout:15000});
 assert.equal(await page.evaluate(()=>!!document.getElementById('notes-recovery')),false,'no recovery bar on success');
 await page.waitForFunction(()=>{const b=document.getElementById('notes-history-body');return b&&b.querySelector('.notes-history-row');},null,{timeout:15000});
 const rowText=await page.evaluate(()=>document.querySelector('#notes-history-body .notes-history-row').textContent);
 assert.ok(/\S/.test(rowText.split('·')[1]||''),'history row names the lesson: '+rowText);
 assert.ok(rowText.includes('직접 종료'),'history row shows end state');
 assert.ok((await page.evaluate(()=>document.getElementById('next-lesson-suggestion').textContent)).includes('완료 기록 기준 다음 추천'),'next-lesson suggestion renders from session metadata (preview-labeled)');
 await page.evaluate(()=>{const d=document.getElementById('notes-history');d.open=true;d.scrollIntoView({block:'center'});});
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-history-list.png'});
 console.log('S1 PASS: saved label + history list row:',JSON.stringify(rowText.slice(0,90)));
 // REAL-CLIENT-CAPTURE proof (harness): assert the exact body the client's finish() POSTed
 // to /api/notes/session carries the versioned fields + immutable snapshot. This is what
 // the client actually sends; mocked transport. NOT production evidence.
 const captured=page.__capturedSessions[page.__capturedSessions.length-1];
 assert.ok(captured,'finish() POST captured by harness route');
 assert.equal(typeof captured.notes_version,'string','finish() body carries notes_version');
 assert.equal(typeof captured.content_version,'string','finish() body carries content_version');
 assert.ok(captured.notes_snapshot&&captured.notes_snapshot.summary&&Array.isArray(captured.notes_snapshot.summary.comments),'finish() body carries notes_snapshot with the summary notes object');
 console.log('S1e PASS: real finish() POST body carries notes_version/content_version/notes_snapshot (client capture, mocked transport)');
 // reload -> reread from server (progress continuity across visits)
 await page.reload();
 await page.waitForFunction(()=>{const b=document.getElementById('notes-history-body');return b&&b.querySelector('.notes-history-row');},null,{timeout:20000});
 console.log('S1b PASS: history list re-read after reload');
 await page.evaluate(()=>{document.getElementById('notes-history').open=true;});
 await page.waitForTimeout(300);
 // open detail
 await page.click('#notes-history-body .notes-history-row button');
 await page.waitForFunction(()=>{const d=document.querySelector('.notes-history-detail');return d&&!d.hidden&&d.querySelectorAll('p').length>=1;},null,{timeout:15000});
 const roles=await page.evaluate(()=>[...document.querySelectorAll('.notes-history-detail p')].map(p=>p.dataset.role).join(','));
 assert.ok(roles.includes('clerk'),'detail shows clerk turns');
 await page.evaluate(()=>document.getElementById('notes-history').scrollIntoView({block:'center'}));
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-history-detail.png'});
 const detailText=await page.evaluate(()=>document.querySelector('.notes-history-detail').textContent);
 assert.ok(detailText.includes('저장된 원래 요약 (notes-v1'),'detail shows the immutable saved snapshot with its version');
 assert.ok(detailText.includes('다시 만든 요약 (notes-v1'),'detail shows reconstruction labeled separately');
 assert.ok(detailText.includes('원래 노트 로직·레슨 내용 그대로예요'),'stored versions compare equal in harness');
 assert.ok(/카드 근거: 인식된 표현 \d+개 · もう一度 \d+회/.test(detailText),'detail shows card evidence line');
 assert.ok(detailText.includes('이해·사용·발음의 증거는 아니에요'),'evidence line carries the not-comprehension disclaimer');
 console.log('S1c PASS: detail roles + reconstructed notes (notes-v1) + evidence line');
 // delete -> confirm -> list empties
 await page.click('#notes-history-body .notes-history-row button:nth-of-type(2)');
 await page.waitForFunction(()=>document.getElementById('notes-history-body').textContent.includes('없어요'),null,{timeout:15000});
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-history-deleted.png'});
 console.log('S1d PASS: delete removes the saved session from the list');
 await page.close();
}
// S2-S5: server 5xx -> queue retained; ordinary finish KEEPS the owner session (bar visible immediately,
//        still signed in); reload resurfaces bar; explicit logout hides bar+history but retains data; export; delete
{
 const page=await newPage(500);
 await runSession(page);
 // S2 (inverted): bar appears immediately after stop because ordinary finish now preserves the verified session
 await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('보관했어요'),null,{timeout:20000});
 const qMid=(await lsKeys(page)).filter(k=>k.includes('jp-notes-queue'));
 assert.equal(qMid.length,1,'queue key written');
 await page.waitForFunction(()=>!!document.getElementById('notes-recovery'),null,{timeout:10000});
 const reqText=await page.evaluate(()=>document.getElementById('start-requirement').textContent);
 assert.ok(reqText.includes('준비됐어요'),'still verified after ordinary finish: '+reqText);
 assert.ok(await page.evaluate(()=>!document.getElementById('owner-login').textContent.includes('Google로 로그인')),'still signed in after finish');
 await page.waitForFunction(()=>document.getElementById('session-notes-summary').textContent.includes('보관 중'),null,{timeout:10000});
 await page.evaluate(()=>document.getElementById('notes-recovery').scrollIntoView({block:'center'}));
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-postfinish-continuity.png'});
 console.log('S2 PASS (inverted): ordinary finish preserves session, bar visible immediately, label queued');
 // S3: reload -> silent resume re-verifies -> flush re-fails -> bar resurfaces
 await page.reload();
 await page.waitForFunction(()=>!!document.getElementById('notes-recovery'),null,{timeout:20000});
 const barText=await page.evaluate(()=>document.getElementById('notes-recovery').innerText);
 assert.ok(barText.includes('1건'),'bar counts 1 retained bundle');
 assert.ok(barText.includes('내보내기')&&barText.includes('삭제'),'bar has export + delete');
 await page.evaluate(()=>document.getElementById('notes-recovery').scrollIntoView({block:'center'}));
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-recovery-bar.png'});
 console.log('S3 PASS: recovery bar after reload+resume:',JSON.stringify(barText.slice(0,90)));
 // S3b: explicit logout hides bar AND history, retains queue
 await page.click('text=이 브라우저에서 로그아웃');
 await page.waitForFunction(()=>!document.getElementById('notes-recovery'),null,{timeout:10000});
 await page.waitForFunction(()=>document.getElementById('notes-history').hidden,null,{timeout:10000});
 const qAfter=(await lsKeys(page)).filter(k=>k.includes('jp-notes-queue'));
 assert.equal(qAfter.length,1,'queue data RETAINED after logout (hidden, not lost)');
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-logout-hidden.png'});
 console.log('S3b PASS: explicit logout hides bar + history, queue retained');
 // S3c: reload -> resume -> bar + history return
 await page.reload();
 await page.waitForFunction(()=>!!document.getElementById('notes-recovery'),null,{timeout:20000});
 await page.waitForFunction(()=>!document.getElementById('notes-history').hidden,null,{timeout:20000});
 console.log('S3c PASS: re-login (silent resume) restores bar + history section');
 // S4: export downloads queued + dead + current
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.click('#notes-recovery button')]);
 const exported=JSON.parse(readFileSync(await download.path(),'utf8'));
 assert.equal(exported.queued.length,1,'one queued bundle exported');
 assert.ok(exported.queued[0].transcript.length>=1,'exported bundle has transcript');
 console.log('S4 PASS: export contains queued bundle, entries:',exported.queued[0].transcript.length);
 // S5: explicit delete clears retention -> bar gone, keys removed
 await page.click('#notes-recovery button:nth-of-type(2)');
 await page.waitForFunction(()=>!document.getElementById('notes-recovery'),null,{timeout:10000});
 const qEnd=(await lsKeys(page)).filter(k=>k.includes('jp-notes-queue')||k.includes('jp-notes-dead'));
 assert.equal(qEnd.length,0,'queue+dead keys cleared after explicit delete');
 console.log('S5 PASS: explicit delete clears on-device retention');
 await page.close();
}
// S6: auth-expired list load (401, no silent refresh in harness) -> distinct auth guidance with
//     explicit Google re-verify action; clicking it (silent refresh unavailable) falls back to
//     the sign-in path and hides the section.
{
 const page=await newPage(200);
 await page.route('**/api/notes/list',async r=>{await r.fulfill({status:401,contentType:'application/json',body:'{"error":"session_invalid"}'});});
 await page.goto(BASE+'/');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.waitForFunction(()=>document.getElementById('notes-reverify'),null,{timeout:15000});
 const authText=await page.evaluate(()=>document.getElementById('notes-history-body').textContent);
 assert.ok(authText.includes('만료'),'auth expiry wording, not network wording');
 assert.ok(authText.includes('별개'),'distinguishes login state from notes access');
 assert.ok(!authText.includes('잠시 뒤'),'no wait-and-see wording on auth failure');
 // auth error must auto-open the details and the reverify button must be actually clickable (elementFromPoint regression for the closed-details prod bug)
 assert.ok(await page.evaluate(()=>document.getElementById('notes-history').open),'auth failure auto-opens the history details');
 await page.evaluate(()=>{document.getElementById('notes-history').scrollIntoView({block:'center'});});
 await page.waitForTimeout(300);
 assert.ok(await page.evaluate(()=>{const b=document.getElementById('notes-reverify');const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===b||b.contains(el);}),'reverify button wins the hit test at its own center');
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/HARNESS-notes-auth-expired.png'});
 console.log('S6 PASS: auth failure shows re-verify action, wording:',JSON.stringify(authText.slice(0,80)));
 await page.click('#notes-reverify');
 await page.waitForLoadState('load',{timeout:15000});
 await page.waitForFunction(()=>!!document.getElementById('notes-reverify'),null,{timeout:15000});
 console.log('S6b PASS: re-verify fallback awaits logout + reloads to a fresh sign-in surface (auth state re-shown by harness 401 mock)');

// S7: recall-event real client capture. Click 단어 떠올리기 mid-session; the mocked
// recall turn scripts learner ASR per window.__harnessRecall; finish() must POST a
// classified review_event; reload + detail shows it; delete cascades it away.
{
 for(const p of ctx.pages()){try{await p.close();}catch{}} // free stale WebGL pages so the recall turn's avatar/audio is not starved
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
// S7d: modeled echo -> 'modeled'; no learner attempt -> 'pending' (never failure)
for(const[mode,expect]of[['modeled','modeled'],['none','pending']]){
 const c3=await browser.newContext({acceptDownloads:true});
 for(const p of c3.pages()){try{await p.close();}catch{}}
 const page=await newPage(200,c3);
 await page.addInitScript("window.__harnessRecall='"+mode+"';");
 await page.goto(BASE+'/');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.click('#start');
 await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'),null,{timeout:20000});
 await page.waitForFunction(()=>{const b=document.getElementById('recall-word');return b&&!b.disabled;},null,{timeout:20000});
 const preCount=await page.evaluate(()=>document.getElementById('transcript').textContent.split('ポイントカード').length);
 await page.click('#recall-word');
 // Wait until the scripted recall turn actually lands: 'none' mode only adds the
 // clerk cue line; match/modeled add NEW ポイントカード occurrences (the guide
 // intro already contains one, so an includes() check would pass instantly).
 try{await page.waitForFunction(([m,b])=>{const t=document.getElementById('transcript').textContent;if(m==='none')return t.includes('복습을 시작할게요');return t.split('ポイントカード').length>b;},[mode,preCount],{timeout:10000});}catch{}
 await page.waitForTimeout(500);
 await page.click('#stop');
 await page.waitForFunction(()=>document.getElementById('session-notes-summary').textContent.includes('서버에 저장됐어요'),null,{timeout:15000});
 const captured=page.__capturedSessions[page.__capturedSessions.length-1];
 if(!captured||captured.review_events.length!==1||captured.review_events[0].outcome!==expect){
  console.log('S7d DIAG',mode,JSON.stringify(captured&&captured.review_events),JSON.stringify((captured&&captured.transcript||[]).slice(-5)));
 }
 assert.equal(captured.review_events.length,1);
 assert.equal(captured.review_events[0].outcome,expect,'mode '+mode+' -> '+expect);
 console.log('S7d PASS: '+mode+' recall classified '+expect);
 await c3.close();
}
 await page.close();
}
await browser.close();server.kill();
console.log('ALL HARNESS NOTES-UI SCENARIOS PASS');
