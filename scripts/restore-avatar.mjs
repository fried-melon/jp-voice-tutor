// Restore the CC0 test fixture omitted from the small review archive.
import{writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';
const url='https://raw.githubusercontent.com/met4citizen/TalkingHead/46b32ee539c41eb7c6b41fcfc74ae030d1b800a7/avatars/mpfb.glb';
const r=await fetch(url);if(!r.ok)throw Error('Avatar download failed');const bytes=Buffer.from(await r.arrayBuffer());
if(createHash('sha256').update(bytes).digest('hex')!=='63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c')throw Error('Avatar hash mismatch');
mkdirSync('public',{recursive:true});writeFileSync('public/avatar.glb',bytes);
