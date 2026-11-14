// GrantDO: isolated store for OAuth credential material (Sheets TEST connection).
// Separate from LIMITS/ReviewProjectionDO by design (architecture review 2026-11-02):
// unrelated lifecycle, and derived-state rebuild must never delete grants.
// Every route fails closed (503) unless SHEETS_AUTH_ENABLED==='yes' AND the
// GRANT_STORE binding + secrets exist. No client-supplied file IDs: the TEST
// spreadsheet is created by the app under drive.file and deleted after the test.
import{beginOwnerAuth,decryptGrant,SHEETS_DATA_SCOPE}from'../shared/sheets-oauth-security.mjs';
import{savePendingAuth,saveGrant,revokeGrant,loadGrant}from'../shared/sheets-grant-repository.mjs';
import{handleOwnerCallback,refreshGrantAccess,TOKEN_ENDPOINT}from'../shared/sheets-oauth-flow.mjs';
const b64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=t=>Uint8Array.from(atob(String(t).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export class GrantDO{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 binding(){return{ownerSub:this.env.OWNER_GOOGLE_SUB,clientId:this.env.GOOGLE_CLIENT_ID,origin:this.env.APP_ORIGIN,keyVersion:this.env.SHEETS_GRANT_KEY_VERSION||'v1'};}
 keyBytes(){const b=unb64(this.env.SHEETS_GRANT_KEY||'');if(b.byteLength!==32)throw Error('grant_key');return b;}
 callbackUri(){return this.env.APP_ORIGIN+'/api/sheets-auth/callback';}
 async fetch(request){
  if(this.env.SHEETS_AUTH_ENABLED!=='yes')return json({error:'sheets_auth_disabled'},503);
  const db=this.ctx.storage;const path=new URL(request.url).pathname;
  try{
   if(path==='/start'){
    // Owner already authenticated by the worker route (JWT). One-time state is
    // bound to ownerSub+clientId+origin and expires in 5 minutes; PKCE verifier
    // is stored server-side with the pending record and never leaves the DO.
    const record=beginOwnerAuth(this.binding());
    const verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
    const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    savePendingAuth(db,{...record,verifier});
    const q=new URLSearchParams({client_id:this.env.GOOGLE_CLIENT_ID,redirect_uri:this.callbackUri(),response_type:'code',scope:SHEETS_DATA_SCOPE,access_type:'offline',prompt:'consent',state:record.state,code_challenge:challenge,code_challenge_method:'S256'});
    return json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+q,expiresAt:new Date(record.expiresAt).toISOString()});
   }
   if(path==='/callback'){
    const u=new URL(request.url);const code=u.searchParams.get('code')||'';const state=u.searchParams.get('state')||'';
    let verifier=null;try{const row=db.sql.exec('SELECT record FROM oauth_pending WHERE state=?',state).toArray()[0];verifier=row?JSON.parse(row.record).verifier:null;}catch{verifier=null;}
    if(!verifier)return json({error:'invalid_state'},403);
    await handleOwnerCallback(db,{binding:this.binding(),keyBytes:this.keyBytes(),code,state,exchange:async({code:c,endpoint})=>{
     const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000),body:new URLSearchParams({code:c,client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,redirect_uri:this.callbackUri(),grant_type:'authorization_code',code_verifier:verifier})});
     if(!r.ok)throw Error('exchange_failed');return r.json();}});
    return new Response('<!doctype html><meta charset="utf-8"><p>연결 확인이 끝났어요. 앱으로 돌아가 주세요.</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
   }
   if(path==='/test'){
    const access=await refreshGrantAccess(db,{binding:this.binding(),keyBytes:this.keyBytes(),refresh:async({refreshToken,endpoint})=>{
     const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000),body:new URLSearchParams({refresh_token:refreshToken,client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token'})});
     if(!r.ok)throw Error('invalid_grant');return r.json();}});
    if(!access.connected)return json(access,409);
    const t=access.accessToken.token;const auth={Authorization:'Bearer '+t,'Content-Type':'application/json'};let fileId=null,fileDeleted=false,readBack=false,rows=0,testError=null;
    try{
     const created=await (await fetch('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:auth,signal:AbortSignal.timeout(15000),body:JSON.stringify({properties:{title:'jp-tutor-connection-TEST'}})})).json();
     fileId=typeof created.spreadsheetId==='string'&&created.spreadsheetId?created.spreadsheetId:null;
     if(!fileId)throw Error('test_file_create_failed');
     const ap=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/Sheet1!A1:C1:append?valueInputOption=RAW`,{method:'POST',headers:auth,signal:AbortSignal.timeout(15000),body:JSON.stringify({values:[['TEST','synthetic-connection-check',new Date().toISOString()]]})});
     if(!ap.ok)throw Error('append_failed');
     const rb=await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/Sheet1!A1:C1`,{headers:auth,signal:AbortSignal.timeout(15000)})).json();
     rows=rb?.values?.length??0;readBack=rows===1&&rb.values[0][1]==='synthetic-connection-check';
    }catch(e){testError=String(e?.message||e).slice(0,80);}
    // Synthetic file deletion is verified by readback, not merely attempted.
    if(fileId){try{
     await fetch('https://www.googleapis.com/drive/v3/files/'+fileId,{method:'DELETE',headers:auth,signal:AbortSignal.timeout(15000)});
     const chk=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?fields=id',{headers:auth,signal:AbortSignal.timeout(15000)});
     fileDeleted=chk.status===404;
    }catch{fileDeleted=false;}}
    // Approved TEST default: revoke + credential wipe automatically on completion OR failure.
    const cleanup=await this.revokeAndWipe(db);
    const unresolved=[];
    if(fileId&&!fileDeleted)unresolved.push('test_file_delete_unverified');
    if(!cleanup.googleRevoked)unresolved.push('google_revoke_unconfirmed');
    return json({ok:!testError&&readBack,testError,rowsWritten:rows,readBack,fileDeleted,cleanup,unresolved},!testError&&readBack?200:502);
   }
   if(path==='/disconnect'){
    const cleanup=await this.revokeAndWipe(db);
    return json({connected:false,googleRevoked:cleanup.googleRevoked});
   }
   return json({error:'not_found'},404);
  }catch(e){return json({error:'grant_operation_failed',reason:String(e?.message||e).slice(0,80)},502);}
 }
 async revokeAndWipe(db){
  let googleRevoked=false;
  try{const state=loadGrant(db,{keyVersion:this.binding().keyVersion});
   if(state.connected){const rt=await decryptGrant(state.encryptedGrant,this.keyBytes(),this.binding());
    const r=await fetch('https://oauth2.googleapis.com/revoke?token='+encodeURIComponent(rt),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000)});
    googleRevoked=r.ok;}
  }catch{/* revoke failure never blocks the local wipe and is reported as unconfirmed */}
  revokeGrant(db);return{googleRevoked,grantWiped:true};
 }
}
