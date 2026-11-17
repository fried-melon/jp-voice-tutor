import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
const server=spawn('python3',['-m','http.server','8462','--directory','dist-shino']);
await new Promise(r=>setTimeout(r,700));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 for(const [name,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.goto('http://127.0.0.1:8462/',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>document.querySelector('#avatar canvas')&&document.getElementById('avatar-state')?.textContent.includes('준비됐어요'));
  await p.waitForTimeout(3000);
  await p.screenshot({path:'/downloads/face-qa/shino-app-'+name+'-viewport.png'});
  console.log(name,JSON.stringify(errors));await p.close();
 }
}finally{await browser.close();server.kill();}
