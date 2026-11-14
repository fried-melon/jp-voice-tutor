import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
const server=spawn('python3',['-m','http.server','8464','--directory','dist-test'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--enable-unsafe-swiftshader']});
try{
 for(const [name,vp] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:800}]]){
  const p=await browser.newPage({viewport:vp});
  await p.goto('http://127.0.0.1:8464/',{waitUntil:'networkidle',timeout:60000});
  await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요')&&(window).__head,{timeout:60000});
  await p.waitForTimeout(2500);
  const el=await p.$('#avatar');
  const shot=async n=>{await p.waitForTimeout(600);await el.screenshot({path:`/downloads/face-qa/lab-${n}-${name}.png`});};
  const setLights=(cfg)=>p.evaluate(c=>{const h=window.__head;
    h.lightAmbient.intensity=c.amb; h.lightDirect.intensity=c.dir; h.lightDirect.color.setHex(c.dirc);
    if(c.spot!==undefined){h.lightSpot.intensity=c.spot;} },cfg);
  const setEyes=(cfg)=>p.evaluate(c=>{window.__head.scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms)if(m.name==='Human.high-poly'){if(c.rough!==undefined)m.roughness=c.rough;if(c.metal!==undefined)m.metalness=c.metal;}});},cfg);
  // L0 current fix baseline
  await setLights({amb:1.1,dir:16,dirc:0x8888aa,spot:0}); await shot('L0');
  // L1 softer warm key, more fill
  await setLights({amb:2.2,dir:7,dirc:0xffe8d6,spot:0}); await shot('L1');
  // L2 mid fill + gentle warm key
  await setLights({amb:1.6,dir:9,dirc:0xffe8d6,spot:0}); await shot('L2');
  // L3 L2 + eye catchlight (lower roughness)
  await setEyes({rough:0.15}); await shot('L3');
  // L4 L2 + even softer key + brighter fill
  await setLights({amb:2.6,dir:5,dirc:0xffe8d6,spot:0}); await shot('L4');
  // reset eyes off for isolation record
  await p.close();
 }
}finally{await browser.close();server.kill();}
console.log('LAB DONE');
