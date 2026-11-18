// All provider sockets are fake. Real local renderer, mic and audio graph only.
import {chromium}from'playwright-core';import{spawn}from'node:child_process';import assert from'node:assert/strict';import{writeFileSync,mkdirSync}from'node:fs';
const server=spawn('python3',['-m','http.server','8474','--bind','127.0.0.1','--directory','dist-sim'],{stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const results=[];mkdirSync('/downloads/face-qa',{recursive:true});
try{
 for(const [name,viewport]of[['mobile',{width:390,height:844}],['small',{width:320,height:568}],['desktop',{width:1280,height:800}]]){
 const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:8474')&&!r.request().url().startsWith('data:'))return r.abort();return r.continue();});
 await p.addInitScript(()=>{const now=Date.now.bind(Date);window.__offset=0;Date.now=()=>now()+window.__offset;window.__sent=[];class WS{constructor(){window.__ws=this;this.readyState=0;this.bufferedAmount=0;setTimeout(()=>{this.readyState=1;this.onopen?.({});},0);}send(s){const m=JSON.parse(s);window.__sent.push(m);if(m.setup)setTimeout(()=>this.onmessage?.({data:JSON.stringify({setupComplete:{}})}),0);}close(){this.readyState=3;}}WS.OPEN=1;window.WebSocket=WS;window.__deliver=c=>window.__ws.onmessage({data:JSON.stringify({serverContent:c})});});
 await p.goto('http://127.0.0.1:8474');await p.waitForFunction(()=>document.getElementById('avatar-state')?.textContent.includes('준비됐어요'),{timeout:60000});
 assert.equal(await p.locator('#scene-path button').count(),5);await p.fill('#key','synthetic-key');await p.click('#start');await p.waitForSelector('body[data-session=active]');
 await p.evaluate(()=>{const pcm=new Int16Array(2400);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i/24000*440*Math.PI*2)*3000;let raw='';for(const b of new Uint8Array(pcm.buffer))raw+=String.fromCharCode(b);window.__deliver({modelTurn:{parts:[{inlineData:{data:btoa(raw),mimeType:'audio/pcm;rate=24000'}}]},outputTranscription:{text:'오늘은 편의점 계산대예요. 持っていません。 카드가 없다고 답해 보세요.'},turnComplete:true});});
 await p.waitForTimeout(1200);
 const bounds=await p.evaluate(()=>{const r=document.querySelector('#stop').getBoundingClientRect(),c=document.querySelector('#session-caption').getBoundingClientRect();return{scroll:document.documentElement.scrollHeight,height:innerHeight,stop:[r.top,r.bottom],caption:[c.top,c.bottom],canvas:getComputedStyle(document.querySelector('#avatar canvas')).pointerEvents};});
 assert.ok(bounds.scroll<=bounds.height+1,JSON.stringify(bounds));assert.ok(bounds.stop[0]>=0&&bounds.stop[1]<=viewport.height);assert.ok(bounds.caption[0]>=0&&bounds.caption[1]<=viewport.height);assert.equal(bounds.canvas,'none');
 await p.screenshot({path:'/downloads/face-qa/integrated-'+name+'-active.png'});
 await p.click('#caption-toggle');assert.equal(await p.locator('#caption-current').isVisible(),false);await p.click('#caption-toggle');
 // First meaningful correction is visible, including when target answer differs.
 await p.evaluate(()=>{window.__deliver({inputTranscription:{text:'持っています。'}});window.__deliver({outputTranscription:{text:'【교정】 있다고 하셨어요. 없다는 뜻이면 持っていません이라고 말해요.'},turnComplete:true});});
 assert.ok((await p.locator('#caption-current').textContent()).includes('없다는 뜻이면'));
 // Let timer move to free talk. No response injection from a pass handler.
 await p.evaluate(()=>{window.__offset=125000;});await p.waitForFunction(()=>document.getElementById('session-phase').textContent==='자유 주제 대화');
 await p.evaluate(()=>{window.__deliver({inputTranscription:{text:'趣味は料理です。'}});window.__deliver({outputTranscription:{text:'요리를 좋아하시는군요. 何を作りますか。'},turnComplete:true});});
 assert.equal(await p.locator('#compare').isVisible(),false);assert.ok((await p.locator('#caption-current').textContent()).includes('何を作りますか'));
 await p.screenshot({path:'/downloads/face-qa/integrated-'+name+'-freetalk.png'});
 await p.click('#stop');await p.waitForSelector('body[data-session=idle]');assert.equal(await p.locator('#session-result').isVisible(),true);assert.ok((await p.locator('#audio-diagnostic-data').textContent()).includes('audioChunks'));
 assert.equal(errors.length,0,errors.join('\n'));results.push({name,bounds,errors,providerCalls:0});await p.close();
 }
 writeFileSync('/downloads/face-qa/integrated-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.kill();}
