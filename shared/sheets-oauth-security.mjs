// No-effect security primitives only. No OAuth redirect/network/credential store.
export const SHEETS_DATA_SCOPE='https://www.googleapis.com/auth/drive.file';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function beginOwnerAuth({ownerSub,clientId,origin,now=Date.now()}){
 if(!ownerSub||!clientId||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('Invalid auth binding');
 return{state:b64(crypto.getRandomValues(new Uint8Array(32))),ownerSub,clientId,origin,expiresAt:now+300000,used:false};
}
// Persisted record consumption must be atomic in ownerDO transaction.
export function consumeOwnerState(record,{state,ownerSub,clientId,origin,now=Date.now()}){
 if(!record||record.used||record.expiresAt<=now||record.state!==state||record.ownerSub!==ownerSub||record.clientId!==clientId||record.origin!==origin)throw Error('Invalid or expired OAuth state');
 return{...record,used:true};
}
function aad(binding){if(!binding.ownerSub||!binding.clientId||!binding.keyVersion)throw Error('Missing grant binding');return enc.encode(JSON.stringify([binding.ownerSub,binding.clientId,binding.keyVersion,'drive.file']))}
export async function encryptGrant(refreshToken,keyBytes,binding){
 if(typeof refreshToken!=='string'||!refreshToken||keyBytes.byteLength!==32)throw Error('Invalid encryption input');
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(binding)},key,enc.encode(refreshToken));
 return{version:1,keyVersion:binding.keyVersion,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function decryptGrant(record,keyBytes,binding){
 if(record.version!==1||record.keyVersion!==binding.keyVersion||keyBytes.byteLength!==32)throw Error('Invalid grant version/key');
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['decrypt']);return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv),additionalData:aad(binding)},key,unb64(record.ciphertext)));
}
export function validateSelectedTestFile({ownerSub,expectedOwnerSub,fileId,expectedTestFileId,grantedScopes=[]}){
 if(ownerSub!==expectedOwnerSub||!fileId||fileId!==expectedTestFileId||!grantedScopes.includes(SHEETS_DATA_SCOPE))throw Error('Owner/file/scope mismatch');
 if(grantedScopes.some(x=>!['openid','email','profile','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile',SHEETS_DATA_SCOPE].includes(x)))throw Error('Unexpected data scope');return{fileId,scope:SHEETS_DATA_SCOPE,learnerWritesEnabled:false};
}
export function disconnectedGrantState(){return{connected:false,encryptedGrant:null,pendingAuth:null,learnerWritesEnabled:false,projectionEnabled:false}};
