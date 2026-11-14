// Browser lifecycle e2e against a local harness build (token service disabled, stubbed mic + fake Live WS).
// Requires CHROME_PATH (defaults to /usr/bin/google-chrome). Run: npm run test:browser
import{chromium}from'playwright-core';import{execSync,spawn}from'node:child_process';import{readFileSync,cpSync}from'node:fs';
const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
const base=process.env.BASE||'http://127.0.0.1:8461';
let server;
async function setup(){execSync('npm run sync-content',{stdio:'inherit'});execSync('npx vite build --outDir dist-harness',{stdio:'inherit'});const{readdirSync}=await import('node:fs');const preview=readdirSync('dist-harness/assets').filter(f=>f.endsWith('.js')).map(f=>readFileSync('dist-harness/assets/'+f,'utf8')).join('\n');if(preview.includes('/api/live-token'))throw Error('harness build guard failed: token-service branch compiled in');server=spawn('python3',['-m','http.server','8461','--directory','dist-harness'],{stdio:'ignore'});await new Promise(r=>setTimeout(r,800));}
async function newPage(browser){const page=await browser.newPage();await page.addInitScript(STUBS);page.on('pageerror',e=>console.error('PAGEERROR:',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE:',m.text())});await page.goto(base+'/?auth=harness');return page;}
const click=async(page,sel)=>{console.log('STEP click:',sel);await page.waitForSelector(sel+':not([disabled])',{timeout:15000});await page.click(sel,{timeout:10000});};
let step='';
async function waitFn(page,fn,arg){step=fn.toString().slice(0,80);console.log('STEP wait:',step);await page.waitForFunction(fn,arg,{timeout:15000,polling:100});}
async function run(){
 await setup();
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--autoplay-policy=no-user-gesture-required']});
 try{
  // happy path: start -> guided opening -> model reply -> extend -> notice -> stop -> retained transcript -> clear
  {const p=await newPage(browser);await p.selectOption('#duration','120');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.includes('준비됐어요')&&document.querySelector('#avatar canvas')!==null&&!document.getElementById('notice').textContent.includes('간단한 2D'));
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await waitFn(p,()=>!document.getElementById('extend').hidden);
   await click(p,'#extend');
   await waitFn(p,()=>document.getElementById('extend').hidden&&!document.getElementById('notice').hidden&&document.getElementById('notice').textContent.includes('5분'));
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   const st=await p.evaluate(()=>({t:document.getElementById('transcript').textContent,h:document.getElementById('transcript').hidden,c:document.getElementById('clear-transcript').disabled}));
   if(!st.t.includes('いらっしゃいませ')||st.h||st.c)throw Error('happy: transcript not retained after stop '+JSON.stringify(st));
   await click(p,'#clear-transcript');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('연습을 시작하면'));
   console.log('PASS happy lifecycle + retention + clear');await p.close();}
  // duration auto-finish (fake clock)
  {const p=await browser.newPage();await p.addInitScript(()=>{let now=Date.now();const D=Date;class F extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}window.Date=F;window.__adv=s=>{now+=s*1000};});
   await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');await p.selectOption('#duration','120');
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await p.evaluate(()=>window.__adv(181));
   await waitFn(p,()=>document.getElementById('status').textContent.includes('연습을 마쳤어요'),undefined);
   const st=await p.evaluate(()=>({t:document.getElementById('transcript').textContent,h:document.getElementById('transcript').hidden,c:document.getElementById('clear-transcript').disabled}));
   if(!st.t.includes('いらっしゃいませ')||st.h||st.c)throw Error('duration: transcript not retained');
   console.log('PASS duration auto-finish + retention');await p.close();}
  // push-to-talk: start -> clerk opening -> PTT keypress -> user turn answered -> stop
  {const p=await newPage(browser);await p.selectOption('#voice-mode','push-to-talk');
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>!document.getElementById('ptt').hidden&&!document.getElementById('ptt').disabled);
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await p.focus('#ptt');await p.keyboard.down(' ');await new Promise(r=>setTimeout(r,300));await p.keyboard.up(' ');
   await waitFn(p,()=>document.getElementById('transcript').textContent.split('いらっしゃいませ').length>=3);
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   console.log('PASS push-to-talk turn');await p.close();}
  // recall: enabled after model turn, once-only, sends scaffold turn answered by tutor
  {const p=await newPage(browser);await p.selectOption('#duration','120');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.includes('준비됐어요')&&document.querySelector('#avatar canvas')!==null&&!document.getElementById('notice').textContent.includes('간단한 2D'));
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await waitFn(p,()=>!document.getElementById('recall').hidden&&!document.getElementById('recall-word').disabled);
   await click(p,'#recall-word');
   await waitFn(p,()=>document.getElementById('recall-word').disabled);
   await waitFn(p,()=>document.getElementById('transcript').textContent.split('いらっしゃいませ').length>=3);
   await click(p,'#stop');
   const hid=await p.evaluate(()=>document.getElementById('recall').hidden);
   if(!hid)throw Error('recall section not hidden after stop');
   console.log('PASS recall once-only turn');await p.close();}
  // first-audio timeout: fake WS never answers -> fail-closed finish after 15s
  {const p=await browser.newPage();await p.addInitScript(()=>{window.__harnessNoReply=true;});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await p.waitForFunction(()=>document.getElementById('status').textContent.includes('첫 응답 시간 초과'),undefined,{timeout:25000,polling:200});
   const n=await p.evaluate(()=>({n:document.getElementById('notice').textContent,retry:document.getElementById('start').disabled===false}));
   if(!n.n.includes('다시 시작'))throw Error('timeout notice not actionable: '+n.n);
   if(!n.retry)throw Error('start not re-enabled after timeout finish');
   console.log('PASS first-audio timeout fail-closed + recovery');await p.close();}
  // audio backlog: socket bufferedAmount over limit -> fail-closed finish, no auto-retry
  {const p=await browser.newPage();await p.addInitScript(()=>{window.__harnessBacklog=true;});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await p.waitForFunction(()=>document.getElementById('status').textContent.includes('음성 전송 지연'),undefined,{timeout:20000,polling:200});
   const n=await p.evaluate(()=>document.getElementById('notice').textContent);
   if(!n.includes('다시 연결하지 않아요'))throw Error('backlog notice missing no-auto-retry note: '+n);
   console.log('PASS audio backlog fail-closed, no auto-retry');await p.close();}
   // audio-only fallback: no WebGL -> session still runs with voice-only notice
  {const p=await browser.newPage();await p.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(String(t).includes('webgl'))return null;return orig.call(this,t,...a);};});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.includes('간단한 2D')&&!document.getElementById('status').textContent.includes('아바타 준비 중'));
   await p.screenshot({path:'/downloads/fallback-audio-'+Date.now()+'.png'});
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await waitFn(p,()=>document.getElementById('status').textContent.includes('내 차례'));
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   console.log('PASS audio-only fallback (no WebGL)');await p.close();}
   // mobile viewport: key controls fit without overlap/clipping
  {const p=await browser.newPage({viewport:{width:390,height:844}});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.includes('준비됐어요'));
   await p.fill('#key','harness-test-key');
   await p.screenshot({path:'/downloads/mobile-'+Date.now()+'.png',fullPage:false});
   const fit=await p.evaluate(()=>{const ids=['start','stop','key','lesson','voice-mode','duration','nickname','transcript'];const out={};for(const id of ids){const el=document.getElementById(id);if(!el)continue;const r=el.getBoundingClientRect();out[id]={left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),vis:r.width>0&&r.height>0};}
     const startR=document.getElementById('start').getBoundingClientRect();const stopR=document.getElementById('stop').getBoundingClientRect();
     out.overlapStartStop=!(startR.right<=stopR.left||stopR.right<=startR.left||startR.bottom<=stopR.top||stopR.bottom<=startR.top);return out;});
   for(const id of ['start','key','lesson']){if(!fit[id].vis||fit[id].left<0||fit[id].right>390)throw Error('mobile fit fail '+id+' '+JSON.stringify(fit[id]));}
   if(fit.overlapStartStop)throw Error('start/stop overlap on mobile');
   console.log('PASS mobile viewport fit',JSON.stringify(fit.start));await p.close();}
   // fallback playback interrupt + restart cleanup
  {const p=await browser.newPage();await p.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(String(t).includes('webgl'))return null;return orig.call(this,t,...a);};window.__harnessInterrupt=true;});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.includes('간단한 2D')&&!document.getElementById('status').textContent.includes('아바타 준비 중'));
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('재생하고 있어요'));
   await waitFn(p,()=>document.getElementById('status').textContent.includes('듣고 있어요'));
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   await p.evaluate(()=>{window.__harnessInterrupt=false;});
   await p.fill('#key','harness-test-key'); // local mode clears the key on finish by design
   await click(p,'#start');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('내 차례'));
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   console.log('PASS fallback playback + interrupt + restart cleanup');await p.close();}
   // M2 module: picker lists 11 lessons, M2 intro card renders, session starts (mobile)
  {const p=await browser.newPage({viewport:{width:390,height:844}});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.length>0);
   const count=await p.evaluate(()=>document.getElementById('lesson').options.length);
   if(count!==24)throw Error('expected 24 lessons, got '+count);
   await p.selectOption('#lesson','M2-S8');
   await waitFn(p,()=>document.getElementById('lesson-card').textContent.includes('こちらでおめしあがりですか')&&document.getElementById('lesson-card').textContent.includes('패스트푸드'));
   await p.screenshot({path:'/downloads/m2-mobile-picker-'+Date.now()+'.png'});
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'));
   await p.screenshot({path:'/downloads/m2-mobile-session-'+Date.now()+'.png'});
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   console.log('PASS M2 picker + intro card + mobile session');await p.close();}
   // scene-cue mode (studentStarts) + M3/M4 picker (mobile)
  {const p=await browser.newPage({viewport:{width:390,height:844}});await p.addInitScript(STUBS);await p.goto(base+'/?auth=harness');
   await waitFn(p,()=>document.getElementById('avatar-state').textContent.length>0);
   const count=await p.evaluate(()=>document.getElementById('lesson').options.length);
   if(count!==24)throw Error('expected 24 lessons, got '+count);
   await p.selectOption('#lesson','M2-S11');
   await waitFn(p,()=>document.getElementById('lesson-card').textContent.includes('장면 큐')&&document.getElementById('lesson-card').textContent.includes('직원을 불러 계산을 요청'));
   const clerkShown=await p.evaluate(()=>document.getElementById('lesson-card').textContent.includes('점원의 말'));
   if(clerkShown)throw Error('scene-cue lesson must show 장면 큐, not 점원의 말');
   await p.selectOption('#lesson','M3-S17');
   await waitFn(p,()=>document.getElementById('lesson-card').textContent.includes('미시마'));
   await p.selectOption('#lesson','M4-S19');
   await waitFn(p,()=>document.getElementById('lesson-card').textContent.includes('예약한 이름(오리버)으로 체크인'));
   await p.screenshot({path:'/downloads/m3m4-mobile-picker-'+Date.now()+'.png'});
   await p.selectOption('#lesson','M2-S11');
   await p.fill('#key','harness-test-key');await click(p,'#start');
   await waitFn(p,()=>document.getElementById('transcript').textContent.length>0||document.getElementById('status').textContent.includes('연습 중'));
   await new Promise(r=>setTimeout(r,1600)); // notes need elapsed>=1s
   await p.screenshot({path:'/downloads/m2-scenecue-session-'+Date.now()+'.png'});
   await click(p,'#stop');
   await waitFn(p,()=>document.getElementById('status').textContent.includes('종료했어요'));
   await waitFn(p,()=>!document.getElementById('session-notes').hidden&&document.getElementById('notes-body').textContent.includes('계산 요청'));
   await p.screenshot({path:'/downloads/session-notes-'+Date.now()+'.png'});
   console.log('PASS scene-cue hint card + M3/M4 picker + session + notes');await p.close();}
  }catch(e){console.error('FAILED AT STEP:',step);try{const pages=browser.contexts()[0]?.pages()||[];for(const p of pages){const d=await p.evaluate(()=>({status:document.getElementById('status')?.textContent,transcript:document.getElementById('transcript')?.innerText,start:document.getElementById('start')?.disabled,key:document.getElementById('key')?.disabled}));console.error('DEBUG page state:',JSON.stringify(d));}}catch{}throw e;}finally{await browser.close();server.kill();}
}
run().then(()=>{console.log('ALL BROWSER E2E PASS');process.exit(0);},e=>{console.error('E2E FAIL:',e.message);process.exit(1);});
