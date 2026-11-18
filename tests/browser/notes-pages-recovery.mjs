// No voice, microphone, provider traffic or production mutations. Fake owner and records.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('python3',['-m','http.server','4339','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 for(const resumed of [false,true])for(const [name,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});let checked=0,saved=false;const calls=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){this.o=o},renderButton(el){const b=document.createElement('button');b.id='fake-google-login';b.textContent='Google로 로그인';el.append(b);},disableAutoSelect(){},prompt(){const o=this.o;o.callback({credential:'fake.'+btoa(JSON.stringify({sub:'fake-owner',aud:o.client_id,nonce:o.nonce,exp:Date.now()/1000+3600}))+'.sig'})}}}};`}));
  await page.route('**/api/**',async r=>{
   const u=new URL(r.request().url());calls.push(u.href);
   assert.equal(u.origin,'https://jp-tutor-owner-token.leejeongjin7178.workers.dev');
   assert.equal(u.pathname.includes('live-token'),false,'no live voice token call');
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
   if(r.request().method()==='OPTIONS'){await r.fulfill({status:204,headers});return;}
   let status=200,body={};
   if(u.pathname==='/api/owner-check'){checked++;status=checked===1&&!resumed?401:200;body={ownerVerified:true,voiceEnabled:false};}
   if(u.pathname==='/api/notes/session'){saved=true;assert.equal(JSON.parse(r.request().postData()).session_id,'fake-retained');body={recorded:true};}
   if(u.pathname==='/api/notes/list')body={sessions:saved?[{session_id:'fake-retained',started_at:'2026-11-17T12:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'manual_stop'}]:[]};
   await r.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.addInitScript(()=>{localStorage.setItem('jp-notes-owner-sub','fake-owner');localStorage.setItem('jp-notes-dead-v1:fake-owner',JSON.stringify([{session_id:'fake-retained',started_at:'2026-11-17T12:00:00Z',duration_s:60,lesson_id:'M1-S1',voice_mode:null,end_state:'manual_stop',transcript:[{role:'learner',text:'synthetic fixture',ts:'2026-11-17T12:00:01Z'}],evidence:[]}]))});
  await page.goto('http://127.0.0.1:4339/');
  await page.waitForSelector('#notes-retry-retained',{timeout:30000});
  assert.equal(saved,false,'dead list never auto-retried');
  assert.equal(await page.locator('#google-signin-ui').isVisible(),false);
  assert.equal(await page.locator('#owner-account-chip').isVisible(),true);
  await page.locator('#notes-recovery').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/downloads/notes-recovery-before-'+name+'.png'});
  await page.click('#notes-retry-retained');
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('서버 저장 1건 · 기기에 남은 기록 0건'));
  assert.equal(await page.locator('#notes-recovery').count(),0);
  assert.ok(calls.some(x=>x.endsWith('/api/notes/list')));
  assert.equal(errors.length,0,JSON.stringify(errors));
  await page.locator('#notice').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/downloads/notes-recovery-after-'+name+'.png'});
  await page.getByRole('button',{name:'이 브라우저에서 로그아웃',exact:true}).click();
  assert.equal(await page.locator('#google-signin-ui').isVisible(),true);
  assert.equal(await page.locator('#owner-account-chip').isVisible(),false);
  assert.equal(await page.locator('#fake-google-login').isVisible(),true,'sign-in button must exist after cookie-resumed logout too');
  console.log(name,resumed?'cookie-resumed':'fresh-login','PASS: real built app routes to Worker, explicit retry saves fake retained record, success UI, no voice; calls',calls.length);
  await page.close();
 }
}finally{await browser.close();server.kill();}
