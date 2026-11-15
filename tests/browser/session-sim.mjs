// Scenario harness: E2E simulation with virtual learner turns against the real app
// bundle (local key mode) and a fake Live WebSocket. NOT production proof — this
// gates internal quality before any owner test slot. Scenarios: correct answer,
// wrong answer x2 (compare view), unclear, and the reported incident (Korean failure
// declaration + model pass marker must NOT count as a pass).
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';

const server=spawn('python3',['-m','http.server','8470','--directory','dist-sim'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const p=await browser.newPage({viewport:{width:1280,height:800}});
const failures=[];
p.on('pageerror',e=>failures.push('pageerror: '+String(e).slice(0,200)));

await p.addInitScript(()=>{
 window.__sent=[];
 class FakeWS{
  constructor(url){window.__fakews=this;this.readyState=0;this.bufferedAmount=0;
   setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen({});},0);}
  send(d){const m=JSON.parse(d);window.__sent.push(m);
   if(m.setup)setTimeout(()=>{this.onmessage&&this.onmessage({data:JSON.stringify({setupComplete:{}})});},0);}
  close(){this.readyState=3;this.onclose&&this.onclose({code:1000});}
 }
 FakeWS.OPEN=1;FakeWS.CLOSED=3;FakeWS.CONNECTING=0;FakeWS.CLOSING=2;
 window.WebSocket=FakeWS;
 window.__deliver=o=>window.__fakews.onmessage({data:JSON.stringify(o)});
});
await p.goto('http://127.0.0.1:8470/',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요'),{timeout:60000});
await p.fill('#key','sim-key');
await p.click('#start');
await p.waitForFunction(()=>document.getElementById('status')?.textContent.includes('시작 안내를 기다리고 있어요'),{timeout:30000});

const modelTurn=(text)=>({serverContent:{outputTranscription:{text}}});
const userTurn=(text)=>({serverContent:{inputTranscription:{text}}});
const done={serverContent:{turnComplete:true}};
const state=()=>p.evaluate(()=>{
 const paras=[...document.querySelectorAll('#transcript p')];
 const lastModel=[...document.querySelectorAll('#transcript p[data-role=model]')].pop();
 const cmp=document.getElementById('compare');
 return{badge:lastModel?.dataset.feedback||null,
  cmpHidden:cmp.hidden,cmpPass:!!cmp.querySelector('.cmp-pass'),
  cmpText:cmp.hidden?null:cmp.textContent.slice(0,120),
  sent:window.__sent.map(m=>m.clientContent?.turns?.[0]?.parts?.[0]?.text||'(other)')};
});
const clearSent=()=>p.evaluate(()=>{window.__sent.length=0;});
async function turn(userText,modelText){
 await p.evaluate(([u,m,d])=>{window.__deliver(u);window.__deliver(m);window.__deliver(d);},[userTurn(userText),modelTurn(modelText),done]);
 await p.waitForTimeout(150);
}
const results={};

// 1) Correct answer + pass marker -> pass UI, application stage injected
await clearSent();
await turn('持っていません。','【통과】 목표 표현과 같아요.');
results.correct=await state();

// 2) Korean failure declaration + model wrongly marks pass -> downgraded, no pass UI, no application injection
await clearSent();
await turn('못 했습니다.','【통과】 잘 하셨어요.');
results.koreanFail=await state();

// 3) Wrong answer + correction, twice -> compare view with diff after 2nd
await turn('持っています。','【교정】 持っていません으로 해 보세요.');
results.correct1=await state();
await turn('持っています。','【교정】 한 번 더요.');
results.correct2=await state();

// 4) Unclear -> badge 못 들음, compare hidden
await turn('(소리 없음)','【못들음】 잘 들리지 않았어요.');
results.unclear=await state();

console.log(JSON.stringify(results,null,1));
console.log('PAGEERRORS:',JSON.stringify(failures));
await browser.close();server.kill();
