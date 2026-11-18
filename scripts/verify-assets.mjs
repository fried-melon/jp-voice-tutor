import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(hash('public/avatar.glb')!=='63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c')throw Error('Missing or modified avatar fixture');
if(hash('public/avatar-hosting-preview.glb')!=='33783df46cd4752590253bdecf45d857946fb5d9092badfd7ae11cb1eb28840c')throw Error('Missing or modified production avatar (avatar-hosting-preview.glb)');
if(process.env.VITE_AVATAR_SHINO==='true'&&hash('public/avatar-shino.glb')!=='337cd1f97e4035ff09e0a322f4fe5ee8b049f7712879f82182dd30b69af20ec3')throw Error('Missing or modified Shino avatar');
for(const line of readFileSync('public/vendor/talkinghead/SHA256SUMS','utf8').trim().split('\n')){if(line.startsWith('#'))continue;const [expected,path]=line.split(/\s+/);if(hash(path)!==expected)throw Error('Vendored asset mismatch: '+path);}
console.log('Avatar and pinned TalkingHead asset hashes verified');
