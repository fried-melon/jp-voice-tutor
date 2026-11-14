import{canonicalReviewRow,normalizeProviderReviewRow,REVIEW_HEADERS}from'./review-schema.mjs';
// Readback-driven TEST ONLY projector. Runtime caller must serialize per owner
// using one atomic ledger worker. This alone cannot eliminate concurrent writes.
export async function projectSyntheticReview(row,{targetId,allowedTestCopyId,prefix,readRows,appendRaw}={}){
 if(!allowedTestCopyId||targetId!==allowedTestCopyId||!prefix?.startsWith('TEST-C1-')||!row[0]?.startsWith(prefix)||row[9]!=='test-harness'||!String(row[10]).includes('[synthetic]'))throw Error('Synthetic testcopy boundary');
 const canonical=canonicalReviewRow(row);
 async function inspect(){const rows=await readRows(targetId);if(!Array.isArray(rows)||JSON.stringify(rows[0])!==JSON.stringify(REVIEW_HEADERS))throw Error('Header mismatch');const matches=rows.slice(1).filter(r=>r[0]===row[0]);if(matches.length>1)throw Error('Duplicate exists: manual review');if(matches.length===1){if(JSON.stringify(normalizeProviderReviewRow(matches[0]))!==JSON.stringify(canonical))throw Error('Conflicting existing UUID');return true}return false}
 if(await inspect())return{projected:true,appended:false,reconciled:true};
 let error=null;try{await appendRaw(targetId,canonical,{valueInputOption:'RAW'})}catch(e){error=e}
 // A timeout is ambiguous, not permission to retry. Always read back, no second append.
 try{if(await inspect())return{projected:true,appended:true,reconciled:!!error}}catch(e){return{projected:false,pending:true,reason:'readback-conflict-or-unavailable'}}
 return{projected:false,pending:true,reason:error?'append-ambiguous':'readback-not-found'};
}
// Durable state is required across requests, not just within one call. Once an
// append was attempted, absent readback stays uncertain until explicit owner
// reconciliation, never another blind append (including process restarts).
export async function projectWithDurableState(row,options,state){
 if(state?.status==='uncertain'){
  const result=await projectSyntheticReview(row,{...options,appendRaw:async()=>{throw Error('Prior attempt uncertain: append disabled')}});
  return{...result,state:{status:result.projected?'projected':'uncertain'}};
 }
 const result=await projectSyntheticReview(row,options);return{...result,state:{status:result.projected?'projected':'uncertain'}};
}
