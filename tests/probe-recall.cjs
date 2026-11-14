const{chromium}=require('playwright-core');const{spawn}=require('node:child_process');const{readFileSync}=require('node:fs');
const CHROME=process.env.CHROME_PATH||'/opt/google/chrome/chrome';const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
(async()=>{
 const server=spawn('python3',['-m','http.server','4331','--bind','127.0.0.1','--directory','dist-harness'],{stdio:'ignore'});
 const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream']});
 const page=await(await browser.newContext()).newPage();
 page.on('console',m=>console.log('[con]',m.text().slice(0,120)));
 await page.route('**/api/owner-check',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"ownerVerified":true,"voiceEnabled":true}'});});
 await page.route('**/api/live-token',async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'auth_tokens/harness-fake',startBefore:new Date(Date.now()+1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()})});});
 await page.route('**/api/notes/*',async r=>{await r.fulfill({status:200,contentType:'application/json',body:'{"recorded":true,"sessions":[]}'});});
 await page.addInitScript(STUBS);
 await page.addInitScript(()=>{try{localStorage.setItem('jp-notes-owner-sub','harness-owner');}catch{}});
 await page.addInitScript(()=>{window.__harnessRecall='match';});
 await page.goto('http://127.0.0.1:4331/');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.click('#start');
 await page.waitForFunction(()=>document.getElementById('transcript').textContent.includes('いらっしゃいませ'),null,{timeout:20000});
 for(let i=0;i<6;i++){
  await page.waitForTimeout(1000);
  const st=await page.evaluate(()=>({recallHidden:document.getElementById('recall').hidden,wordDisabled:document.getElementById('recall-word').disabled,lesson:document.getElementById('lesson')?.value||document.querySelector('select')?.value,status:document.getElementById('status').textContent.slice(0,40)}));
  console.log(i,st);
  if(!st.wordDisabled)break;
 }
 await browser.close();server.kill();
})().catch(e=>{console.error('ERR',e.message.slice(0,200));process.exit(1)});
