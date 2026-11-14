import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'});
const p=await (await b.newContext()).newPage();
await p.goto('https://jp-tutor-owner-token.leejeongjin7178.workers.dev/',{waitUntil:'networkidle'});
const r=await p.evaluate(()=>{
 const n=document.getElementById('session-notes');
 return {notesPresent:!!n,notesHidden:n?.hidden,notesSummary:n?.querySelector('summary')?.textContent,
  pill:document.getElementById('scene-pill')?.textContent,title:document.getElementById('scene-title')?.textContent,
  lessons:document.getElementById('lesson')?.options.length};
});
console.log(JSON.stringify(r));
await b.close();
