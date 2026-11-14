import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
await p.goto('https://jp-tutor-owner-token.leejeongjin7178.workers.dev/',{waitUntil:'networkidle'});
await p.waitForFunction(()=>document.getElementById('lesson')?.options.length===24,{timeout:30000});
for(const id of ['M4-S19','M3-S14','M2-S8','M1-S1']){
  await p.selectOption('#lesson',id);
  await p.waitForTimeout(300);
  const s=await p.evaluate(()=>({pill:document.getElementById('scene-pill').textContent,title:document.getElementById('scene-title').textContent,place:document.getElementById('scene-place').textContent,ja:document.getElementById('scene-ja').textContent}));
  console.log(id,JSON.stringify(s));
}
await p.selectOption('#lesson','M4-S19');await p.waitForTimeout(300);
await p.screenshot({path:'/downloads/prod-m4-scene-'+Date.now()+'.png'});
await b.close();
