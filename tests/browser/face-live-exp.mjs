import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
const server=spawn('python3',['-m','http.server','8463','--directory','dist-test'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.goto('http://127.0.0.1:8463/',{waitUntil:'networkidle',timeout:60000});
 await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요')&&(window).__head,{timeout:60000});
 await p.waitForTimeout(2500);
 const el=await p.$('#avatar');
 const report=await p.evaluate(()=>{const h=window.__head;const mats=[];h.scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms)mats.push({name:m.name,type:m.type,env:m.envMapIntensity,map:!!m.map,mapCS:m.map&&m.map.colorSpace,emis:m.emissiveIntensity});});
  return {env:!!h.scene.environment,exposure:h.renderer.toneMappingExposure,toneMapping:h.renderer.toneMapping,outputCS:h.renderer.outputColorSpace,mats};});
 console.log(JSON.stringify(report,null,1));
 const shot=async n=>{await p.waitForTimeout(700);await el.screenshot({path:'/downloads/face-qa/live-'+n+'.png'});};
 await shot('0-current');
 // 1: kill IBL entirely
 await p.evaluate(()=>{window.__head.scene.environment=null;});
 await shot('1-noenv');
 // 2: restore env but drop exposure
 await p.evaluate(()=>{const h=window.__head;/*env tex was replaced*/ h.scene.traverse(o=>{});});
 await p.evaluate(()=>{window.__head.renderer.toneMappingExposure=0.55;});
 await shot('2-exposure055');
 // 3: also dim lights hard
 await p.evaluate(()=>{const h=window.__head;h.lightAmbient.intensity=0.3;h.lightDirect.intensity=4;});
 await shot('3-dimlights');
}finally{await browser.close();server.kill();}
console.log('LIVE EXP DONE');
