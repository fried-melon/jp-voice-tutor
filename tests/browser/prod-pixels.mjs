import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const p=await browser.newPage({viewport:{width:390,height:844}});
await p.goto('https://jp-tutor-owner-token.leejeongjin7178.workers.dev/',{waitUntil:'networkidle'});
await p.waitForFunction(()=>document.getElementById('lesson')?.options.length===24,{timeout:30000});
const checks=await p.evaluate(()=>({
  manualCredentialVisible:!document.getElementById('manual-credential')?.hidden,
  nicknameField:!!document.getElementById('nickname'),
  fixedNote:document.body.innerText.includes('Oliver로 고정'),
  heading:document.querySelector('summary')?.textContent?.trim(),
  loginShown:!document.getElementById('owner-login')?.hidden,
  avatarState:document.getElementById('avatar-state')?.textContent,
  status:document.getElementById('status')?.textContent}));
console.log(JSON.stringify(checks,null,1));
await p.selectOption('#lesson','M4-S19');
await p.waitForFunction(()=>document.getElementById('lesson-card').textContent.includes('장면 큐'));
await p.screenshot({path:'/downloads/prod-m4-picker-'+Date.now()+'.png'});
await p.selectOption('#lesson','M3-S17');
await p.waitForFunction(()=>document.getElementById('lesson-card').textContent.includes('미시마'));
await p.screenshot({path:'/downloads/prod-m3-picker-'+Date.now()+'.png'});
await browser.close();console.log('PROD PIXELS OK');
