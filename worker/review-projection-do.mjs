import{createReviewAppendHandler}from'../shared/review-live-append.mjs';
import{createSheetsClient}from'../shared/sheets-api-client.mjs';
import{createTokenClient}from'../shared/sheets-token-client.mjs';
import{refreshGrantAccess}from'../shared/sheets-oauth-flow.mjs';
import{loadGrant}from'../shared/sheets-grant-repository.mjs';
// Per-owner review ledger + TEST-copy projection Durable Object. Disabled
// unless REVIEW_WRITES_ENABLED==='yes' AND a connected encrypted grant exists.
// Storage is the real Durable Object store; Google I/O only through the pinned
// clients. Access tokens live only in this instance's memory with a 60s margin.
export class ReviewProjectionDO{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async accessToken(binding,keyBytes,tokens){
  const cached=this.cachedToken;if(cached&&cached.expiresAt-60000>Date.now())return cached.token;
  const r=await refreshGrantAccess(this.ctx.storage,{binding,keyBytes,refresh:({refreshToken,endpoint})=>tokens.refresh({refreshToken,endpoint,clientId:this.env.OAUTH_CLIENT_ID,clientSecret:this.env.OAUTH_CLIENT_SECRET})});
  if(!r.connected)throw Error('sheets_not_connected');this.cachedToken=r.accessToken;return r.accessToken.token;
 }
 async fetch(request){
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(this.env.REVIEW_WRITES_ENABLED!=='yes')return json(503,{error:'review_writes_disabled'});
  if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
  let body;try{body=await request.json()}catch{return json(400,{error:'invalid_json'})}
  if(!Array.isArray(body?.row))return json(400,{error:'invalid_row'});
  const binding={ownerSub:this.env.OWNER_GOOGLE_SUB,clientId:this.env.OAUTH_CLIENT_ID,keyVersion:this.env.GRANT_KEY_VERSION??'k1',origin:this.env.APP_ORIGIN};
  if(!loadGrant(this.ctx.storage,{keyVersion:binding.keyVersion}).connected)return json(503,{error:'sheets_not_connected'});
  const keyBytes=Uint8Array.from(atob(this.env.GRANT_ENCRYPTION_KEY??''),c=>c.charCodeAt(0));
  if(keyBytes.byteLength!==32)return json(503,{error:'grant_key_unavailable'});
  const tokens=createTokenClient();
  const sheets=createSheetsClient({getAccessToken:()=>this.accessToken(binding,keyBytes,tokens)});
  const append=createReviewAppendHandler({storage:this.ctx.storage,key:binding.ownerSub,projectionOptions:{targetId:this.env.REVIEW_TARGET_FILE_ID,allowedTestCopyId:this.env.REVIEW_ALLOWED_FILE_ID,prefix:this.env.REVIEW_ID_PREFIX,readRows:id=>sheets.readRows(id),appendRaw:(id,row,opts)=>sheets.appendRaw(id,row,opts)}});
  try{const result=await append(body.row);return json(200,{reviewId:result.row[0],row:result.row,committed:true,projection:{projected:!!result.projection?.projected}})}catch{return json(409,{error:'append_not_confirmed'})}
 }
}
