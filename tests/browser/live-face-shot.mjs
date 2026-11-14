import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader']});
try{
 for(const [name,vp] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:800}]]){
  const p=await browser.newPage({viewport:vp});
  await p.goto('https://jp-tutor-owner-token.leejeongjin7178.workers.dev/',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요')&&document.querySelector('#avatar canvas'),{timeout:60000});
  await p.waitForTimeout(3000);
  const info=await p.evaluate(()=>({faceMode:document.body.dataset.faceMode,state:document.getElementById('avatar-state')?.textContent,notice:document.getElementById('notice')?.textContent||''}));
  console.log(name,JSON.stringify(info));
  const el=await p.$('#avatar');
  for(let i=0;i<2;i++){await el.screenshot({path:`/downloads/face-qa/live73-${name}-f${i}.png`});await p.waitForTimeout(1400);}
  await p.close();
 }
}finally{await browser.close();}
console.log('LIVE SHOTS DONE');
