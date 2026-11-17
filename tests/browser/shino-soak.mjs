// Local visual/animation check. Never contacts Google or a voice provider.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=spawn('python3',['-m','http.server','8469','--directory','dist-avatar']);
await new Promise(r=>setTimeout(r,700));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const errors=[];
try{
 const p=await browser.newPage({viewport:{width:800,height:900}});
 p.on('pageerror',e=>errors.push(String(e)));
 await p.goto('http://127.0.0.1:8469/');
 const report=await p.evaluate(async()=>{
  const {TalkingHead}=await import('./vendor/talkinghead/talkinghead.mjs');
  const {configureShino,prepareShino,finalizeShino}=await import('./shino-adapter.mjs');
  const ref=await (await fetch('./shino-reference.json')).json();
  const head=new TalkingHead(document.getElementById('head'),{cameraView:'full',cameraDistance:.5,lipsyncModules:[],avatarMood:'neutral',modelFPS:30});
  configureShino(head);let report;
  await head.showAvatar({url:'./shino.glb',body:'F',avatarMood:'neutral',lipsyncLang:'en'},null,g=>{report=prepareShino(g,ref);});
  finalizeShino(head);window.head=head;
  return report;
 });
 await p.waitForTimeout(8000);
 await p.screenshot({path:'/downloads/face-qa/shino-module-full.png'});
 const clock0=await p.evaluate(()=>head.animClock);
 await p.evaluate(()=>head.setFixedValue('jawOpen',.55,0));
 await p.waitForTimeout(800);
 await p.screenshot({path:'/downloads/face-qa/shino-mouth-open.png'});
 await p.evaluate(()=>{head.setFixedValue('jawOpen',0,0);head.setFixedValue('eyeBlinkLeft',1,0);head.setFixedValue('eyeBlinkRight',1,0);});
 await p.waitForTimeout(800);
 await p.screenshot({path:'/downloads/face-qa/shino-blink.png'});
 await p.evaluate(()=>{head.setFixedValue('eyeBlinkLeft',null,0);head.setFixedValue('eyeBlinkRight',null,0);});
 await p.waitForTimeout(75000);
 const clock1=await p.evaluate(()=>head.animClock);
 assert.ok(clock1>clock0+60000,'animation loop must keep advancing');
 assert.equal(errors.length,0,errors.join('\n'));
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>head.setView('head'));
 await p.waitForTimeout(2500);
 await p.screenshot({path:'/downloads/face-qa/shino-mobile-head.png'});
 const result={report,clock0,clock1,errors};
 writeFileSync('/downloads/face-qa/shino-soak-result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();server.kill();}
