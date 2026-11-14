// Regenerate public/vendor/talkinghead/SHA256SUMS against the pinned upstream revision.
// Fails if any file drifts from upstream EXCEPT the documented one-line Draco patch
// in talkinghead.mjs (CDN decoder path -> vendored path, required by the app CSP).
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const REV='46b32ee539c41eb7c6b41fcfc74ae030d1b800a7';
const FILES=['talkinghead.mjs','dynamicbones.mjs','retargeter.mjs','playback-worklet.js'];
const DRACO_UPSTREAM="dracoDecoderPath: 'https://www.gstatic.com/draco/v1/decoders/'";
const DRACO_LOCAL="dracoDecoderPath: './vendor/three/jsm/libs/draco/'";
const sha=b=>createHash('sha256').update(b).digest('hex');
const lines=['# TalkingHead pinned at '+REV+' (MIT). talkinghead.mjs carries the documented one-line Draco decoder path patch; its hash pins the PATCHED file.'];
for(const f of FILES){
 const local=readFileSync('public/vendor/talkinghead/'+f);
 const r=await fetch(`https://raw.githubusercontent.com/met4citizen/TalkingHead/${REV}/modules/${f}`);
 if(!r.ok)throw Error('Upstream fetch failed for '+f);
 const upstream=Buffer.from(await r.arrayBuffer());
 if(f==='talkinghead.mjs'){
  const patched=Buffer.from(upstream.toString('utf8').replace(DRACO_UPSTREAM,DRACO_LOCAL),'utf8');
  if(!patched.equals(local))throw Error('talkinghead.mjs drifted beyond the documented Draco patch - inspect before blessing');
 }else if(!upstream.equals(local))throw Error(f+' differs from pinned upstream - inspect before blessing');
 lines.push(sha(local)+'  public/vendor/talkinghead/'+f);
 console.log(f,sha(local).slice(0,12),f==='talkinghead.mjs'?'(patched, pinned local)':'(upstream match)');
}
writeFileSync('public/vendor/talkinghead/SHA256SUMS',lines.join('\n')+'\n');
console.log('SHA256SUMS regenerated');
