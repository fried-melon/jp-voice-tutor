import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
const server=spawn('python3',['-m','http.server','8461','--directory','dist'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader']});
try{
 for(const [name,vp] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport:vp});
  p.on('pageerror',e=>console.error('PAGEERROR:',e.message));
  p.on('console',m=>{if(m.type()==='error')console.error('CONSOLE:',m.text().slice(0,200))});
  await p.goto('http://127.0.0.1:8461/',{waitUntil:'networkidle',timeout:60000});
  await p.waitForFunction(()=>document.querySelector('#avatar canvas')!==null,{timeout:60000}).catch(e=>console.error('no canvas:',e.message));
  // let GLB load and render settle
  await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요'),{timeout:60000}).catch(e=>console.error('state:',e.message));
  await p.waitForTimeout(4000);
  const info=await p.evaluate(()=>({state:document.getElementById('avatar-state')?.textContent,notice:document.getElementById('notice')?.textContent,faceMode:document.body.dataset.faceMode,canvas:document.querySelectorAll('#avatar canvas').length}));
  console.log(name,JSON.stringify(info));
  const el=await p.$('#avatar');
  await p.screenshot({path:'/downloads/face-qa/before-'+name+'-full.png'});
  if(el)await el.screenshot({path:'/downloads/face-qa/before-'+name+'-avatar.png'});
  await p.close();
 }
}finally{await browser.close();server.kill();}
console.log('DONE');
