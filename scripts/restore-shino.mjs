// Recovered from transcript 2026-11-15 20:25: fetch + convert Sendagaya Shino (CC0) deterministically.
import{writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';import{inflateRawSync}from'node:zlib';
const ZIP_URL='https://opengameart.org/sites/default/files/sendagaya_shino.zip';
const ZIP_SHA256='ff85ff42c1d041fd66dabdb36761a98557d7b55199f635769f3698a41c0a3696';
const AVATAR_SHA256='337cd1f97e4035ff09e0a322f4fe5ee8b049f7712879f82182dd30b69af20ec3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const r=await fetch(ZIP_URL);if(!r.ok)throw Error('Avatar zip download failed: '+r.status);
const zip=Buffer.from(await r.arrayBuffer());
if(sha(zip)!==ZIP_SHA256)throw Error('Avatar zip hash mismatch');
function unzipEntry(buf,want){
 const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 const n=buf.readUInt16LE(eocd+10);let off=buf.readUInt32LE(eocd+16);
 for(let i=0;i<n;i++){
  if(buf.readUInt32LE(off)!==0x02014b50)break;
  const method=buf.readUInt16LE(off+10),csize=buf.readUInt32LE(off+20),usize=buf.readUInt32LE(off+24);
  const nl=buf.readUInt16LE(off+28),el=buf.readUInt16LE(off+30),cl=buf.readUInt16LE(off+32);
  const name=buf.slice(off+46,off+46+nl).toString();const lh=buf.readUInt32LE(off+42);
  off+=46+nl+el+cl;
  if(name!==want)continue;
  const lnl=buf.readUInt16LE(lh+26),lel=buf.readUInt16LE(lh+28);
  const data=buf.slice(lh+30+lnl+lel,lh+30+lnl+lel+csize);
  const out=method===8?inflateRawSync(data):method===0?Buffer.from(data):null;
  if(!out||out.length!==usize)throw Error('Zip entry failed: '+name);
  return out;
 }
 throw Error('Zip entry not found: '+want);
}
const vrm=unzipEntry(zip,'Sendagaya Shino.vrm');
if(vrm.readUInt32LE(0)!==0x46546C67)throw Error('Not a GLB');
const jsonLen=vrm.readUInt32LE(12);
const gltf=JSON.parse(vrm.slice(20,20+jsonLen).toString());
const BONES={'J_Bip_C_Hips':'Hips','J_Bip_C_Spine':'Spine','J_Bip_C_Chest':'Spine1','J_Bip_C_UpperChest':'Spine2','J_Bip_C_Neck':'Neck','J_Bip_C_Head':'Head','J_Bip_L_Shoulder':'LeftShoulder','J_Bip_L_UpperArm':'LeftArm','J_Bip_L_LowerArm':'LeftForeArm','J_Bip_L_Hand':'LeftHand','J_Bip_R_Shoulder':'RightShoulder','J_Bip_R_UpperArm':'RightArm','J_Bip_R_LowerArm':'RightForeArm','J_Bip_R_Hand':'RightHand','J_Bip_L_UpperLeg':'LeftUpLeg','J_Bip_L_LowerLeg':'LeftLeg','J_Bip_L_Foot':'LeftFoot','J_Bip_L_ToeBase':'LeftToeBase','J_Bip_R_UpperLeg':'RightUpLeg','J_Bip_R_LowerLeg':'RightLeg','J_Bip_R_Foot':'RightFoot','J_Bip_R_ToeBase':'RightToeBase','J_Adj_L_FaceEye':'LeftEye','J_Adj_R_FaceEye':'RightEye'};
const MORPHS={'Face.M_F00_000_00_Fcl_MTH_A':'jawOpen','Face.M_F00_000_00_Fcl_EYE_Close_L':'eyeBlinkLeft','Face.M_F00_000_00_Fcl_EYE_Close_R':'eyeBlinkRight','Face.M_F00_000_00_Fcl_MTH_I':'viseme_ih','Face.M_F00_000_00_Fcl_MTH_U':'viseme_u','Face.M_F00_000_00_Fcl_MTH_E':'viseme_e','Face.M_F00_000_00_Fcl_MTH_O':'viseme_oh','Face.M_F00_000_00_Fcl_ALL_Joy':'mouthSmile'};
for(const side of ['L','R'])for(const [from,to] of Object.entries({Thumb:'Thumb',Index:'Index',Middle:'Middle',Ring:'Ring',Little:'Pinky'}))for(let i=1;i<=3;i++)BONES['J_Bip_'+side+'_'+from+i]=(side==='L'?'Left':'Right')+'Hand'+to+i;
let bones=0,morphs=0;
for(const n of gltf.nodes||[])if(BONES[n.name]){n.name=BONES[n.name];bones++;}
for(const m of gltf.meshes||[]){
 if(m.extras?.targetNames)m.extras.targetNames=m.extras.targetNames.map(t=>MORPHS[t]?(morphs++,MORPHS[t]):t);
 for(const p of m.primitives||[])if(p.extras?.targetNames)p.extras.targetNames=p.extras.targetNames.map(t=>MORPHS[t]||t);
}
for(const m of gltf.meshes||[]){const names=m.primitives?.find(p=>p.extras?.targetNames)?.extras.targetNames;if(names)m.extras={...m.extras,targetNames:names};}
if(bones<20)throw Error('Bone rename incomplete: '+bones);
if(gltf.extensions)delete gltf.extensions.VRM;
if(gltf.extensionsUsed)gltf.extensionsUsed=gltf.extensionsUsed.filter(e=>e!=='VRM');
let json=Buffer.from(JSON.stringify(gltf));
const pad=(4-(json.length%4))%4;json=Buffer.concat([json,Buffer.from(' '.repeat(pad))]);
const rest=vrm.slice(20+jsonLen);
const out=Buffer.alloc(12+8+json.length+rest.length);
out.writeUInt32LE(0x46546C67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4E4F534A,16);json.copy(out,20);rest.copy(out,20+json.length);
mkdirSync(process.argv[2]||'public',{recursive:true});
writeFileSync((process.argv[2]||'public')+'/avatar-shino.glb',out);
const got=sha(out);
console.log('shino.glb written:',out.length,'bytes · sha256',got,'· bones',bones,'· morphs',morphs);
if(AVATAR_SHA256&&got!==AVATAR_SHA256)throw Error('Converted avatar hash mismatch: '+got);
