// Shino adapter for the pinned TalkingHead version. No network or account access.
import * as THREE from 'three';
const NEXT={LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',LeftFoot:'LeftToeBase',RightUpLeg:'RightLeg',RightLeg:'RightFoot',RightFoot:'RightToeBase'};
export function configureShino(head){
 // The model has blink/mouth shapes but not RPM's compound eye/brow shapes.
 head.mtLimits={};head.mtOnchange={};
 for(const key of ['eyeLookInLeft','eyeLookOutLeft','eyeLookInRight','eyeLookOutRight','eyesLookDown','eyesClosed','browDownLeft','browDownRight'])if(!head.mtCustoms.includes(key))head.mtCustoms.push(key);
}
export function prepareShino(gltf,reference){
 const root=gltf.scene;
 const rest=Object.fromEntries(Object.entries(reference.quaternions).map(([k,a])=>[k,new THREE.Quaternion().fromArray(a)]));
 const refPos=Object.fromEntries(Object.entries(reference.positions).map(([k,a])=>[k,new THREE.Vector3().fromArray(a)]));
 // Convert VRM's forward axis before fitting the bind frames. GLTFLoader can
 // share attribute buffers between primitive geometries, so clone before baking.
 const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
 const inverse=yaw.clone().invert(),matrix=new THREE.Matrix4().makeRotationFromQuaternion(yaw);
 root.traverse(o=>{o.position.applyQuaternion(yaw);o.quaternion.premultiply(yaw).multiply(inverse);if(o.isMesh){o.geometry=o.geometry.clone();o.geometry.applyMatrix4(matrix);}});
 root.updateWorldMatrix(true,true);
 const bones=[],positions={};
 root.traverse(b=>{if(b.isBone){positions[b.name]=b.getWorldPosition(new THREE.Vector3());if(rest[b.name])bones.push(b);}});
 const targets={};
 for(const b of bones){
  targets[b.name]=rest[b.name].clone();const next=NEXT[b.name];
  if(next){
   if(!refPos[next]||!positions[next])throw Error('Missing limb reference: '+next);
   const from=refPos[next].clone().sub(refPos[b.name]).normalize();
   const to=positions[next].clone().sub(positions[b.name]).normalize();
   targets[b.name].premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
  }
 }
 // Parents first. Preserve every descendant's world transform, including skirt
 // and hair bones that have no reference entry, rather than only named limbs.
 for(const b of bones){
  root.updateWorldMatrix(true,true);
  const saved=[];b.traverse(d=>{if(d!==b)saved.push([d,d.matrixWorld.clone()]);});
  b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(targets[b.name]));
  b.updateWorldMatrix(true,true);
  for(const [d,world] of saved){
   d.parent.updateWorldMatrix(true,false);
   new THREE.Matrix4().copy(d.parent.matrixWorld).invert().multiply(world).decompose(d.position,d.quaternion,d.scale);
   d.updateWorldMatrix(true,false);
  }
 }
 root.updateWorldMatrix(true,true);
 let maxDrift=0;
 root.traverse(o=>{if(o.isBone)maxDrift=Math.max(maxDrift,o.getWorldPosition(new THREE.Vector3()).distanceTo(positions[o.name]));});
 if(!Number.isFinite(maxDrift)||maxDrift>1e-6)throw Error('Avatar bind positions drifted');
 root.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.boneInverses=m.skeleton.bones.map(b=>b.matrixWorld.clone().invert());});
 return {maxDrift,alignedBones:bones.length};
}
export function finalizeShino(head){
 head.mtRandomized=head.mtRandomized.filter(key=>head.mtAvatar[key]);
 for(const key of ['eyeBlinkLeft','eyeBlinkRight'])if(head.mtAvatar[key]){head.mtAvatar[key].limit=null;head.mtAvatar[key].onchange=null;}
}
