// Real browser ordering regression with dummy identity and a rejecting token API.
// No microphone/device, Google request, or personal data is used.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn('python3',['-m','http.server','4319','--bind','127.0.0.1','--directory','/tmp/tutor-token-order-dist'],{stdio:'ignore'});
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.addInitScript(()=>{window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('MIC_SHOULD_NOT_BE_REQUESTED');};});
  let rejected=0,provider=0;
  await page.route('**/api/live-token',route=>{rejected++;return route.fulfill({status:401,contentType:'application/json',body:'{"error":"invalid_identity"}'});});
  await page.route('**/generativelanguage.googleapis.com/**',route=>{provider++;return route.abort();});
  await page.goto('http://127.0.0.1:4319/');
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  await page.fill('#key','DUMMY.SIGNED.IDENTITY.NOT.REAL');
  await page.click('#start');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('준비되지'));
  assert.equal(rejected,1);assert.equal(provider,0);assert.equal(await page.evaluate(()=>window.__micRequests),0);
  assert.equal(await page.inputValue('#key'),'');
  console.log('PASS: actualChrome rejected token -> 0 microphone requests, 0 provider calls, proof cleared. No speech/playback exercised; not live speech/Google login proof.');
 }finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));}
})().catch(e=>{console.error(e);process.exitCode=1});
