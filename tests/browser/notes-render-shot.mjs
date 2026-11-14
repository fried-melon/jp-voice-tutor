// HARNESS render evidence for the session-notes panel (real client, mocked transport).
import{chromium}from'playwright-core';import{execSync,spawn}from'node:child_process';import{readFileSync}from'node:fs';
const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
execSync('npm run sync-content',{stdio:'inherit'});execSync('npx vite build --outDir dist-harness',{stdio:'inherit'});
const server=spawn('python3',['-m','http.server','8461','--directory','dist-harness'],{stdio:'ignore'});await new Promise(r=>setTimeout(r,900));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--autoplay-policy=no-user-gesture-required']});
const p=await browser.newPage({viewport:{width:390,height:844}});
await p.addInitScript(STUBS);await p.goto('http://127.0.0.1:8461/?auth=harness');
await p.waitForFunction(()=>document.getElementById('avatar-state').textContent.length>0,null,{timeout:15000});
await p.selectOption('#lesson','M2-S11');
await p.fill('#key','harness-test-key');await p.click('#start');
await p.waitForFunction(()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'),null,{timeout:15000});
// inject simulated transcript (post-connect, after transcript reset): learner used a target expression + もう一度; tutor said もう一度 once
await p.evaluate(()=>{const t=document.getElementById('transcript');t.replaceChildren();
 const mk=(role,txt)=>{const el=document.createElement('p');el.dataset.role=role;el.textContent=txt;t.append(el);};
 mk('model','いらっしゃいませ。こちらでおめしあがりですか。');
 mk('user','すみません、お会計お願いします');
 mk('model','もう一度お願いします。かしこまりました。');
 mk('user','もう一度お願いします');
 mk('user','お会計お願いします');});
await new Promise(r=>setTimeout(r,1700));
await p.click('#stop');
await p.waitForFunction(()=>!document.getElementById('session-notes').hidden,null,{timeout:15000});
await p.evaluate(()=>document.getElementById('session-notes').scrollIntoView({block:'start'}));
await new Promise(r=>setTimeout(r,400));
const body=await p.evaluate(()=>document.getElementById('notes-body').innerText);
console.log('NOTES BODY:\n'+body);
await p.screenshot({path:'/downloads/session-notes-panel-harness-'+Date.now()+'.png'});
// short-session case: <1s session must NOT produce notes
const p2=await browser.newPage({viewport:{width:390,height:844}});
await p2.addInitScript(STUBS);await p2.goto('http://127.0.0.1:8461/?auth=harness');
await p2.waitForFunction(()=>document.getElementById('avatar-state').textContent.length>0,null,{timeout:15000});
await p2.fill('#key','harness-test-key');await p2.click('#start');
await p2.waitForFunction(()=>document.getElementById('status').textContent.includes('연습 중')||document.getElementById('transcript').textContent.length>0,null,{timeout:15000});
await p2.click('#stop');
await p2.waitForFunction(()=>document.getElementById('status').textContent.includes('종료했어요'),null,{timeout:15000});
console.log('SHORT SESSION notes hidden:',await p2.evaluate(()=>document.getElementById('session-notes').hidden));
await browser.close();server.kill();
