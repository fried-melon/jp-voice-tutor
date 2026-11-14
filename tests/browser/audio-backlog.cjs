// No provider, owner account, human mic or audio file. Actual Web Audio worklets,
// PCM16 resampling and loopback WebSocket exercise two turns and interruption.
const {chromium}=require('/tmp/voice-tools/node_modules/playwright');
const {WebSocketServer}=require('/tmp/voice-tools/node_modules/ws');
const {spawn}=require('node:child_process');const assert=require('node:assert/strict');
(async()=>{let browser,http,server;const report={provider:false,humanMicrophone:false,storedAudio:false,packets:0,nonzero:0,turns:0,bytes:0};
try{
 http=spawn('python3',['-m','http.server','4338','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
 server=new WebSocketServer({port:4339,host:'127.0.0.1'});let peer;let begun=false,answer=false;
 function emit(m){peer.send(JSON.stringify(m));}
 function audioTurn(label){report.turns++;emit({serverContent:{outputTranscription:{text:label},modelTurn:{parts:[{inlineData:{data:tone(),mimeType:'audio/pcm;rate=24000'}}]}}});emit({serverContent:{turnComplete:true}});}
 function tone(){const pcm=Buffer.alloc(24000);for(let i=0;i<12000;i++)pcm.writeInt16LE(Math.round(Math.sin(i/24000*Math.PI*2*660)*4000),i*2);return pcm.toString('base64');}
 server.on('connection',ws=>{peer=ws;ws.on('message',raw=>{const m=JSON.parse(raw);if(m.setup){assert.equal(m.setup.realtimeInputConfig.automaticActivityDetection.disabled,false);emit({setupComplete:{}});}if(m.clientContent&&!begun){begun=true;audioTurn('最初の質問');}if(m.realtimeInput?.audio){assert.equal(m.realtimeInput.audio.mimeType,'audio/pcm;rate=16000');const pcm=Buffer.from(m.realtimeInput.audio.data,'base64');report.packets++;report.bytes+=pcm.length;assert.equal(pcm.length,1024);let loud=false;for(let i=0;i<pcm.length;i+=2)if(Math.abs(pcm.readInt16LE(i))>1000){loud=true;break;}if(loud){report.nonzero++;if(!answer){answer=true;audioTurn('返事を聞きました');}}}});});
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('console',m=>console.log('BROWSER',m.type(),m.text()));page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){window.__login=o},renderButton(el){el.innerHTML='<button id="test-login">TEST LOGIN</button>';el.firstChild.onclick=()=>{const o=window.__login;o.callback({credential:'head.'+btoa(JSON.stringify({nonce:o.nonce,aud:o.client_id,exp:Math.floor(Date.now()/1000)+600}))+'.test'});}},disableAutoSelect(){}}}};`}));
 await page.route('**/api/owner-check',r=>r.fulfill({json:{ownerVerified:true,voiceEnabled:true}}));await page.route('**/api/live-token',r=>r.fulfill({json:{token:'auth_tokens/loopback-test',startBefore:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+360000).toISOString()}}));
 await page.addInitScript(()=>{
  window.__events=[];window.__tracks=[];const RealWS=window.WebSocket;window.WebSocket=class extends RealWS{constructor(){super('ws://127.0.0.1:4339');window.__socket=this;}};
  const RealNode=window.AudioWorkletNode;window.AudioWorkletNode=class extends RealNode{constructor(...args){super(...args);if(args[1]==='playback-worklet')this.port.addEventListener('message',e=>{if(['playback-started','playback-ended'].includes(e.data.type))window.__events.push(e.data.type);});}};
  navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext();const osc=ctx.createOscillator();osc.frequency.value=440;const gain=ctx.createGain();gain.gain.value=0;osc.connect(gain);const dest=ctx.createMediaStreamDestination();gain.connect(dest);osc.start();await ctx.resume();window.__synthetic={ctx,gain};window.__tracks=dest.stream.getTracks();return dest.stream;};
 });
 await page.route('http://127.0.0.1:4338/',async r=>{const res=await r.fetch();let html=await res.text();html=html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/i,'');await r.fulfill({response:res,body:html});});await page.goto('http://127.0.0.1:4338');await page.waitForFunction(()=>document.querySelector('#avatar-state').textContent==='준비됐어요');await page.click('#test-login');await page.selectOption('#duration','120');await page.click('#start');
 await page.waitForFunction(()=>window.__events.filter(x=>x==='playback-ended').length===1);assert.equal(await page.locator('#status').textContent().catch(()=>''),'내 차례예요. 일본어로 답해 보세요.');
 await page.evaluate(()=>window.__synthetic.gain.gain.value=.2);await page.waitForFunction(()=>window.__events.filter(x=>x==='playback-ended').length===2);await page.evaluate(()=>window.__synthetic.gain.gain.value=0);
 assert.ok(report.nonzero>0);assert.equal(report.turns,2);assert.equal(await page.locator('#stop').isDisabled(),false);
 await page.mouse.wheel(0,600);await page.mouse.wheel(0,-600);assert.equal(await page.evaluate(()=>window.__socket.readyState),1);
 // Synthetic slow-uplink injected bufferedAmount, no real network saturation.
 await page.evaluate(()=>Object.defineProperty(window.__socket,'bufferedAmount',{get:()=>70000}));
 await page.waitForFunction(()=>document.querySelector('#session-end').textContent.includes('network_audio_backlog'));
 await page.waitForFunction(()=>window.__socket.readyState===3&&window.__tracks.every(t=>t.readyState==='ended'));
 await page.screenshot({path:'/downloads/audio-backlog-local.png',fullPage:true});
 report.events=await page.evaluate(()=>window.__events);console.log(JSON.stringify(report));
}finally{await browser?.close();server?.clients.forEach(p=>p.terminate());await new Promise(r=>server?.close(r));http?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
