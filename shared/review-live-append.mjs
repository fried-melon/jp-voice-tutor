import{acceptIntoLedger}from'./review-test-ledger.mjs';
import{coordinatedProjection}from'./review-projection-coordinator.mjs';
import{canonicalReviewRow}from'./review-schema.mjs';
// Live-mode atomicAppend composition for the review endpoint: ledger-first
// atomic UUID compare+commit in the per-owner durable store, then a durable
// serialized projection kick. The acknowledgement reflects ledger commit only;
// the projection outcome rides along for observability and is reconciled
// independently through durable status. A projection failure never un-commits
// the ledger row and never blocks or falsifies the acknowledgement.
export function createReviewAppendHandler({storage,projectionOptions,key}){
 if(!storage||!projectionOptions)throw Error('Missing storage or projection options');
 return async function atomicAppend(rawRow){
  const row=canonicalReviewRow(rawRow);
  const accepted=acceptIntoLedger(storage,row);
  let projection;try{projection=await coordinatedProjection(storage,row,projectionOptions,{key})}catch(error){projection={projected:false,error:String(error?.message||error)}}
  return{committed:true,row:accepted.row,duplicate:accepted.duplicate,projection};
 };
}
