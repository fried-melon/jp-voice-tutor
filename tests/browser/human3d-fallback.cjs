// human3d display-mode regression (synthetic harness: FakeWS + silent mic, not human/Japanese/phone acceptance):
// model failure -> 2D clerk fallback with working audio (mouth open, interrupt close, stop re-enables),
// WebGL unavailable -> existing sound-only FallbackAudio path, success -> bare canvas, no clerk.
const{chromium}=require('playwright-core');const{spawn}=require('node:child_process');const{readFileSync}=require('node:fs');const assert=require('node:assert/strict');
const CHROME=process.env.CHROME_PATH||'/opt/google/chrome/chrome';const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
async function boot({blockGlb,disableWebgl,interrupt}){
 const server=spawn('python3',['-m','http.server','4331','--bind','127.0.0.1','--directory','dist-harness'],{stdio:'ignore'});
 const args=['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream'];
 if(disableWebgl)args.push('--disable-webgl');
 const browser=await chromium.launch({executablePath:CHROME,args});
 const page=await(await browser.newContext({viewport:{width:1200,height:900}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(blockGlb)await page.route('**/*.glb',r=>r.abort());
 await page.route('**/api/owner-check',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"ownerVerified":true,"voiceEnabled":true}'});});
 await page.route('**/api/live-token',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'auth_tokens/harness-fake',startBefore:new Date(Date.now()+1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()})});});
 await page.route('**/api/session-logout',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{}'});});
 await page.route('**/api/notes/*',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"recorded":true,"sessions":[]}'});});
 await page.addInitScript(STUBS);
 if(interrupt)await page.addInitScript(()=>{window.__harnessInterrupt=true;});
 await page.addInitScript(()=>{const n=96000,buf=new Uint8Array(n*2),dv=new DataView(buf.buffer);for(let i=0;i<n;i++)dv.setInt16(i*2,Math.round(Math.sin(i*2*Math.PI*440/24000)*9000),true);let s='';for(const b of buf)s+=String.fromCharCode(b);window.__silence=btoa(s);});
 await page.goto('http://127.0.0.1:4331/?auth=harness');
 return{server,browser,page,errors};
}
(async()=>{
 // 1) human3d success: bare WebGL canvas visible, no 2D clerk
 {const{server,browser,page,errors}=await boot({});try{
  await page.waitForSelector('#avatar canvas',{timeout:30000});
  assert.equal(await page.locator('.initial-face').count(),0,'no clerk on success');
  assert.deepEqual(errors,[]);console.log('PASS human3d success: bare canvas, no clerk, no pageerrors');
 }finally{await browser?.close();server.kill()}}
 // 2) model failure: FallbackAudio owns playback + 2D clerk, no canvas, full playback->interrupt->stop->restart
 {const{server,browser,page,errors}=await boot({blockGlb:true,interrupt:true});try{
  await page.waitForSelector('.initial-face',{timeout:30000});
  assert.equal(await page.locator('#avatar canvas').count(),0,'failed WebGL canvas removed');
  await page.waitForSelector('#start:not([disabled])',{timeout:30000});await page.click('#start');
  const open=()=>document.querySelector('.initial-face #open').style.display!=='none';
  await page.waitForFunction(()=>document.querySelector('.initial-face #open').style.display!=='none',null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('.initial-face #open').style.display==='none',null,{timeout:5000});
  await page.click('#stop');assert.equal(await page.isEnabled('#start'),true);
  await page.waitForSelector('#start:not([disabled])',{timeout:30000});
  await page.click('#start'); // restart after stop
  await page.waitForFunction(()=>document.querySelector('.initial-face #open').style.display!=='none',null,{timeout:10000});
  await page.click('#stop');assert.equal(await page.isEnabled('#start'),true);
  assert.equal(await page.locator('#avatar canvas').count(),0,'no canvas leaked after restart');
  assert.deepEqual(errors,[]);console.log('PASS model failure: FallbackAudio+clerk, playback>interrupt>stop>restart, no leaks, no pageerrors');
 }finally{await browser?.close();server.kill()}}
 // 3) WebGL unavailable: same FallbackAudio + 2D clerk path, app alive, session plays
 {const{server,browser,page,errors}=await boot({disableWebgl:true});try{
  await page.waitForSelector('.initial-face',{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#avatar-state').textContent.includes('2D'),null,{timeout:30000});
  await page.waitForSelector('#start:not([disabled])',{timeout:30000});await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('.initial-face #open').style.display!=='none',null,{timeout:10000});
  await page.click('#stop');assert.equal(await page.isEnabled('#start'),true);
  assert.deepEqual(errors,[]);console.log('PASS WebGL unavailable: FallbackAudio+2D clerk, playback works, no pageerrors');
 }finally{await browser?.close();server.kill()}}
})().catch(e=>{console.error('FAIL:',e.message.split('\n')[0].slice(0,300));console.error(e.stack.split('\n').slice(1,4).join(' | '));process.exitCode=1});
