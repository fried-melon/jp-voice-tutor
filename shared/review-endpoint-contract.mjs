import{REVIEW_HEADERS,REVIEW_SCHEMA_FINGERPRINT,validateReviewRow}from'./review-schema.mjs';
// Transport-only test contract. Deliberately no live route/DB implementation.
export async function acceptReviewRequest(request,{enabled=false,origin,ownerSub,verifyIdentity,atomicAppend}={}){
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}});
 if(!enabled)return json(503,{error:'review_writes_disabled'});
 if(request.headers.get('Origin')!==origin)return json(403,{error:'origin_denied'});
 if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
 const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];if(!token)return json(401,{error:'sign_in_required'});
 let identity;try{identity=await verifyIdentity(token)}catch{return json(401,{error:'invalid_identity'})}
 if(!identity?.sub||identity.sub!==ownerSub)return json(403,{error:'owner_only'});
 // Bound streaming body, not just forgeable Content-Length.
 let bytes=0,parts=[];try{const reader=request.body?.getReader();if(!reader)return json(400,{error:'invalid_body'});while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return json(413,{error:'too_large'})}parts.push(value)}const data=new Uint8Array(bytes);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length}const body=JSON.parse(new TextDecoder().decode(data));
 if(body.schema!==REVIEW_SCHEMA_FINGERPRINT||!Array.isArray(body.row)||body.row.length!==REVIEW_HEADERS.length)return json(409,{error:'schema_mismatch'});
 if(body.row.some(v=>!['string','number'].includes(typeof v)))return json(400,{error:'invalid_row'});
 // Reject spreadsheet formulas at transport boundary; write backend must use RAW.
 if(body.row.some(v=>typeof v==='string'&&/^[\s]*[=+@]/.test(v)))return json(400,{error:'formula_like_value'});
 if(typeof body.row[0]!=='string'||!body.row[0]||!body.row[1]||!Number.isFinite(Date.parse(body.row[2])))return json(400,{error:'invalid_identity_or_time'});
 const eligible=body.row[11],grade=body.row[12];if(!((eligible==='N'&&grade==='')||(eligible==='Y'&&['Again','Hard','Good','Easy'].includes(grade))))return json(400,{error:'invalid_grade'});
 try{validateReviewRow(body.row)}catch{return json(400,{error:'invalid_row_contract'})}
 // Backend MUST perform atomic UUID compare+append, return exact committed row.
 const result=await atomicAppend(body.row);if(!result?.committed||JSON.stringify(result.row)!==JSON.stringify(body.row))return json(409,{error:'append_not_confirmed'});
 return json(200,{reviewId:body.row[0],row:result.row,committed:true});
 }catch{return json(400,{error:'invalid_or_unconfirmed_request'})}
}
