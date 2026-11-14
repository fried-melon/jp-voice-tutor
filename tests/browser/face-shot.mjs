// Usage: node tests/browser/face-shot.mjs <suffix>  — serves dist/, captures avatar frames (desktop+mobile)
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
const suffix=process.argv[2]||'x';
const server=spawn('python3',['-m','http.server','8462','--directory',process.env.DISTDIR||'dist'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader']});
try{
 for(const [name,vp] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport:vp});
  await p.goto('http://127.0.0.1:8462/',{waitUntil:'networkidle',timeout:60000});
  await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요')&&document.querySelector('#avatar canvas'),{timeout:60000});
  await p.waitForTimeout(2500);
  const el=await p.$('#avatar');
  for(let i=0;i<3;i++){await el.screenshot({path:`/downloads/face-qa/${suffix}-${name}-f${i}.png`});await p.waitForTimeout(1300);}
  await p.close();
 }
}finally{await browser.close();server.kill();}
console.log('SHOTS DONE',suffix);
