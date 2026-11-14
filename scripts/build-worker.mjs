// Refresh the deployed worker bundle + assets from the current source.
// Guards the 2026-11-02 regression where content/prompt changes shipped
// with a stale worker bundle (old prompt contract + old lessons).
import {build} from 'esbuild';
import {readFileSync,writeFileSync,rmSync,cpSync,readdirSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('..',import.meta.url).pathname; // source/
const deploy=root+'../deployment/';
const out=deploy+'worker/index.js';
await build({entryPoints:[root+'worker/index.mjs'],bundle:true,format:'esm',platform:'neutral',outfile:out,loader:{'.md':'text'},logLevel:'silent'});
const prompt=readFileSync(root+'prompts/tutor-ja.md','utf8');
const hash=createHash('sha1').update(prompt).digest('hex');
for(const f of readdirSync(deploy+'worker'))if(f.endsWith('-tutor-ja.md')&&f!==hash+'-tutor-ja.md')unlinkSync(deploy+'worker/'+f);
writeFileSync(deploy+'worker/'+hash+'-tutor-ja.md',prompt);
rmSync(deploy+'dist',{recursive:true,force:true});
cpSync(root+'dist',deploy+'dist',{recursive:true});
const bundle=readFileSync(out,'utf8');
const {version,lessons}=JSON.parse(readFileSync(root+'content/lessons.v1.json','utf8'));
const failures=[];
if(!bundle.includes(version))failures.push('worker bundle missing content version '+version);
if(lessons.some(l=>l.studentStarts)&&!bundle.includes('studentStarts'))failures.push('worker bundle missing scene-cue contract');
if(lessons.some(l=>l.id==='M4-S19')&&!bundle.includes('M4-S19'))failures.push('worker bundle missing M4 lessons');
if(failures.length){console.error('[worker-build] STALE BUNDLE:',failures.join('; '));process.exit(1);}
console.log('[worker-build] deployment/worker refreshed: version '+version+', prompt sha1 '+hash.slice(0,8)+', lessons '+lessons.length);
