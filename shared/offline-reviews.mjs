// Pure offline transport state. Not mounted to browser storage or a live endpoint.
// No audio/transcript/pseudonym fields in transport. Server must verify owner separately.
export function enqueueReview(queue,row){
 if(!Array.isArray(row)||row.length!==13||typeof row[0]!=='string'||!row[0])throw Error('Invalid A-M review row');
 const existing=queue.find(x=>x.reviewId===row[0]);if(existing){if(JSON.stringify(existing.row)!==JSON.stringify(row))throw Error('Conflicting duplicate UUID');return queue}
 return[...queue,{reviewId:row[0],row:structuredClone(row)}];
}
export function acknowledgeReview(queue,{reviewId,row,committed}){
 // Never remove on timeout, auth failure, generic HTTP200, or mismatched response.
 if(committed!==true)return queue;
 const item=queue.find(x=>x.reviewId===reviewId);if(!item)return queue;
 if(JSON.stringify(item.row)!==JSON.stringify(row))throw Error('Acknowledgement content mismatch');
 return queue.filter(x=>x.reviewId!==reviewId);
}
export function appendIdempotentTestCopy(rows,row){
 const prior=rows.find(x=>x[0]===row[0]);if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('Conflicting duplicate UUID');return{rows,ack:{reviewId:row[0],row:structuredClone(prior),committed:true}}}
 const next=[...rows,structuredClone(row)];return{rows:next,ack:{reviewId:row[0],row:structuredClone(row),committed:true}};
}
