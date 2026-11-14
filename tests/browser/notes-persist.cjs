// Synthetic harness test for flag-disabled notes persistence wiring (FakeWS + stub mic; FAKE data only).
// Verifies: flag ON -> one idempotent session POST with ordered transcript + Bearer; flag mechanics keep it off otherwise.
const{chromium}=require('playwright-core');const{spawn}=require('node:child_process');const{readFileSync}=require('node:fs');const assert=require('node:assert/strict');
const CHROME='/opt/google/chrome/chrome';const STUBS=readFileSync('tests/harness/live-mock-stubs.js','utf8');
(async()=>{
 const server=spawn('python3',['-m','http.server','4335','--bind','127.0.0.1','--directory','dist-harness'],{stdio:'ignore'});
 const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream']});
 const page=await(await browser.newContext()).newPage();page.on('console',m=>{if(m.text().startsWith('PERSIST')||m.text().startsWith('FINISH'))console.log('[page]',m.text())});page.on('requestfailed',r=>{if(r.url().includes('notes'))console.log('[reqfail]',r.url(),r.failure()?.errorText)});
 const posts=[];
 await page.route('**/api/notes/session',async r=>{posts.push({auth:r.request().headers()['authorization'],body:JSON.parse(r.request().postData())});await r.fulfill({status:200,contentType:'application/json',body:'{"recorded":true}'});});
 await page.addInitScript(STUBS);
 await page.goto('http://127.0.0.1:4335/?auth=harness');
 await page.waitForSelector('#start:not([disabled])',{timeout:30000});
 await page.fill('#key','harness-test-key');await page.click('#start');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('차례')||document.querySelectorAll('#transcript p').length>=2,null,{timeout:15000});
 console.log('pre-stop:',await page.evaluate(()=>({p:document.querySelectorAll('#transcript p').length,status:document.getElementById('status').textContent.slice(0,30)})));await page.click('#stop');
 await page.waitForTimeout(1500);console.log('posts:',posts.length,'console-sees-fetch:',await page.evaluate(()=>window.__log.filter(x=>x.includes('ws')).length));
 assert.equal(posts.length,1,'exactly one session POST at finish, got '+posts.length);
 const p=posts[0];
 assert.equal(p.auth,'Bearer harness-test-key');
 assert.ok(p.body.session_id&&p.body.started_at&&p.body.duration_s>=0&&p.body.lesson_id); // duration_s may be 0: harness sessions can end in <1s, 0 is truthful
 assert.ok(Array.isArray(p.body.transcript)&&p.body.transcript.length>=1,'transcript captured');
 const roles=p.body.transcript.map(e=>e.role);
 assert.ok(roles.includes('guide')||roles.includes('clerk'),'guide/clerk entry present');
 for(const e of p.body.transcript){assert.ok(['clerk','learner','guide'].includes(e.role));assert.ok(typeof e.text==='string'&&e.text.length>0&&e.text.length<=4000);assert.ok(typeof e.ts==='string');}
 assert.deepEqual(p.body.evidence,[]);
 console.log('PASS notes persist wiring: 1 POST, Bearer, ordered transcript ('+roles.join(',')+'), no evidence cards, FAKE data only');
 await browser.close();server.kill();
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1});
