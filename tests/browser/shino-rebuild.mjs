import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const server=spawn('python3',['-m','http.server','8469','--directory','dist-avatar']);
await new Promise(r=>setTimeout(r,700));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
const p=await browser.newPage({viewport:{width:800,height:900}});
const errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto('http://127.0.0.1:8469/');
const result=await p.evaluate(async()=>{
 const THREE=await import('three');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {TalkingHead}=await import('./vendor/talkinghead/talkinghead.mjs');
 const ref=await new GLTFLoader().loadAsync('./mpfb-ref.glb');
 const skeletons=new Set();ref.scene.traverse(m=>{if(m.isSkinnedMesh&&!skeletons.has(m.skeleton)){skeletons.add(m.skeleton);m.skeleton.pose();}});ref.scene.updateWorldMatrix(true,true);
 const refPos={};ref.scene.traverse(b=>{if(b.isBone)refPos[b.name.replaceAll('mixamorig','')]=b.getWorldPosition(new THREE.Vector3());});
 const rest={};ref.scene.traverse(b=>{if(b.isBone)rest[b.name.replaceAll('mixamorig','')]=b.getWorldQuaternion(new THREE.Quaternion());});
 const head=new TalkingHead(document.getElementById('head'),{cameraView:'full',cameraDistance:0.5,cameraRotateY:0,lipsyncModules:[],avatarMood:'neutral',modelFPS:30});
 head.mtLimits={};head.mtOnchange={};
 for(const key of ['eyeLookInLeft','eyeLookOutLeft','eyeLookInRight','eyeLookOutRight','eyesLookDown','eyesClosed','browDownLeft','browDownRight'])head.mtCustoms.push(key);
 let bindDrift=0;
 await head.showAvatar({url:'./shino.glb',body:'F',avatarMood:'neutral',lipsyncLang:'en'},null,gltf=>{
   const root=gltf.scene;
   const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
   const yawInv=yaw.clone().invert();const mat=new THREE.Matrix4().makeRotationFromQuaternion(yaw);
   const geometries=new Set();
   root.traverse(o=>{o.position.applyQuaternion(yaw);o.quaternion.premultiply(yaw).multiply(yawInv);if(o.isMesh&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry=o.geometry.clone();o.geometry.applyMatrix4(mat);}});
   for(const name of new Set(head.posePropNames.map(x=>x.split('.')[0]))){
     if(root.getObjectByName(name))continue;
     const b=new THREE.Bone();b.name=name;
     const hand=name.startsWith('Left')?'LeftHand':'RightHand';
     (root.getObjectByName(hand)||root).add(b);
   }
   root.updateWorldMatrix(true,true);
   const bones=[];root.traverse(b=>{if(b.isBone&&rest[b.name])bones.push(b);});
   const next={LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',LeftFoot:'LeftToeBase',RightUpLeg:'RightLeg',RightLeg:'RightFoot',RightFoot:'RightToeBase'};
   const originalPos={};root.traverse(b=>{if(b.isBone)originalPos[b.name]=b.getWorldPosition(new THREE.Vector3());});
   const targets={};for(const b of bones){targets[b.name]=rest[b.name].clone();const n=next[b.name];if(n){const from=refPos[n].clone().sub(refPos[b.name]).normalize();const to=originalPos[n].clone().sub(originalPos[b.name]).normalize();targets[b.name].premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));}}
   const old=new Map();root.traverse(b=>{if(b.isBone)old.set(b,b.getWorldPosition(new THREE.Vector3()));});
   for(const b of bones){
     root.updateWorldMatrix(true,true);
     const saved=[];b.traverse(d=>{if(d!==b)saved.push([d,d.matrixWorld.clone()]);});
     const parentQ=b.parent.getWorldQuaternion(new THREE.Quaternion());
     b.quaternion.copy(parentQ.invert().multiply(targets[b.name]));b.updateWorldMatrix(true,true);
     for(const [d,world] of saved){d.parent.updateWorldMatrix(true,false);new THREE.Matrix4().copy(d.parent.matrixWorld).invert().multiply(world).decompose(d.position,d.quaternion,d.scale);d.updateWorldMatrix(true,false);}
   }
   root.updateWorldMatrix(true,true);
   for(const [b,pos] of old)bindDrift=Math.max(bindDrift,b.getWorldPosition(new THREE.Vector3()).distanceTo(pos));
   root.traverse(m=>{if(m.isSkinnedMesh){m.skeleton.boneInverses=m.skeleton.bones.map(b=>b.matrixWorld.clone().invert());}});
 });
 head.mtRandomized=head.mtRandomized.filter(x=>head.mtAvatar[x]);
 window.head=head;
 const meshes=[];head.armature.traverse(m=>{if(m.isSkinnedMesh)meshes.push({name:m.name,world:m.matrixWorld.elements,bind:m.bindMatrix.elements,inverse:m.bindMatrixInverse.elements});});return {bindDrift,bones:Object.keys(rest).length,reference:{quaternions:Object.fromEntries(Object.entries(rest).map(([k,q])=>[k,q.toArray()])),positions:Object.fromEntries(Object.entries(refPos).map(([k,p])=>[k,p.toArray()]))}};
});
await p.waitForTimeout(8000);
await p.screenshot({path:'/downloads/face-qa/rebuilt-real-fingers.png'});
writeFileSync('public/shino-reference.json',JSON.stringify(result.reference));delete result.reference;console.log(JSON.stringify({result,errors}));
writeFileSync('/tmp/avatar-wip/result.json',JSON.stringify({result,errors}));
}finally{await browser.close();server.kill();}
