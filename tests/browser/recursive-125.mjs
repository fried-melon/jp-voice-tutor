// Provider-free browser integration replay. Deliberately adversarial model markers.
import{chromium}from'playwright-core';import{spawn}from'node:child_process';import{writeFileSync,mkdirSync,readFileSync}from'node:fs';import assert from'node:assert/strict';import{QUESTION_CORPUS}from'../fixtures/recursive-125.mjs';import{presentTurn}from'../../shared/turn-presentation.mjs';
const lessons=JSON.parse(readFileSync('content/lessons.v1.json')).lessons;
const server=spawn('python3',['-m','http.server','8475','--bind','127.0.0.1','--directory','dist-sim'],{stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const result=[];mkdirSync('/downloads/face-qa',{recursive:true});
try{for(const scene of ['shop','food','directions','transit','hotel']){
 const p=await browser.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8475')||r.request().url().startsWith('data:')?r.continue():r.abort());
 await p.addInitScript(()=>{const now=Date.now.bind(Date);window.__offset=0;Date.now=()=>now()+window.__offset;class WS{constructor(){window.__ws=this;this.readyState=0;this.bufferedAmount=0;setTimeout(()=>{this.readyState=1;this.onopen?.({});},0);}send(s){if(JSON.parse(s).setup)setTimeout(()=>this.onmessage?.({data:JSON.stringify({setupComplete:{}})}),0);}close(){this.readyState=3;}}WS.OPEN=1;window.WebSocket=WS;window.__deliver=c=>window.__ws.onmessage({data:JSON.stringify({serverContent:c})});});
 await p.goto('http://127.0.0.1:8475');await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요'),{timeout:60000});
 const qs=QUESTION_CORPUS.filter(q=>q.scene===scene),lesson=lessons.find(l=>l.id===qs[0].lesson);await p.selectOption('#lesson',lesson.id);await p.fill('#key','synthetic-key');await p.click('#start');await p.waitForSelector('body[data-session=active]');
 // One bounded synthetic audio burst establishes the real audio graph only.
 await p.evaluate(()=>{const raw=String.fromCharCode(...new Uint8Array(new Int16Array(240).buffer));window.__deliver({modelTurn:{parts:[{inlineData:{data:btoa(raw),mimeType:'audio/pcm;rate=24000'}}]},turnComplete:true});});
 for(const q of qs){if(q.phase==='free-talk'){await p.evaluate(()=>window.__offset=125000);await p.waitForFunction(()=>document.getElementById('session-phase').textContent==='자유 주제 대화');}
 if(q.kind==='end'){await p.evaluate(input=>window.__deliver({inputTranscription:{text:input,finished:true}}),q.question);await p.waitForSelector('body[data-session=idle]');assert.ok((await p.locator('#status').textContent()).includes('요청하신'));result.push({id:q.id,scene,passed:true,stopIntent:true});continue;}
 const text=q.kind==='variant'?'【교정】 목표 예시로 바꾸세요.':'【통과】 잘하셨어요. 목표와 같아요.';
 const targetDone=result.some(r=>r.scene===scene&&r.goal);const expected=presentTurn({text,userText:q.question,lesson,phase:q.phase,targetDone});
 await p.evaluate(({input,text})=>{window.__deliver({inputTranscription:{text:input}});window.__deliver({outputTranscription:{text},turnComplete:true});},{input:q.question,text});
 const view=await p.evaluate(()=>{const last=document.querySelector('#transcript').lastElementChild;return{text:last?.textContent,marker:last?.dataset.feedback||null,caption:document.getElementById('caption-current').textContent,scroll:document.documentElement.scrollHeight,height:innerHeight};});
 assert.equal(view.marker,expected.marker,q.id);assert.ok(view.text.includes(expected.text),q.id+' text');assert.ok(view.scroll<=view.height+1,q.id+' scroll');
 result.push({id:q.id,scene,marker:view.marker,goal:expected.goal,passed:true});
 if(['quoted','free-grammar','end'].includes(q.kind))await p.screenshot({path:'/downloads/face-qa/recursive-'+q.id+'.png'});
 }
 if(await p.locator('body').getAttribute('data-session')==='active')await p.click('#stop');await p.waitForSelector('body[data-session=idle]');assert.equal(errors.length,0,errors.join('\n'));await p.close();
}writeFileSync('/downloads/face-qa/recursive-125-browser.json',JSON.stringify({providerCalls:0,actualASR:false,questions:result.length,results:result},null,2));console.log(JSON.stringify({questions:result.length,passed:result.filter(r=>r.passed).length,providerCalls:0}));}finally{await browser.close();server.kill();}
