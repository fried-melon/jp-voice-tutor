import{canonicalReviewRow}from'./review-schema.mjs';
// For endpoint test-copy qualification only. Runtime adapter must provide an
// actual transactional SQLite store. Never directly append to Sheets on retry.
export function acceptIntoLedger(db,row){
 const canonical=canonicalReviewRow(row),payload=JSON.stringify(canonical);
 return db.transactionSync(()=>{
  db.sql.exec('CREATE TABLE IF NOT EXISTS review_test_outbox (review_id TEXT PRIMARY KEY, payload TEXT NOT NULL, projected INTEGER NOT NULL DEFAULT 0)');
  const prior=db.sql.exec('SELECT payload,projected FROM review_test_outbox WHERE review_id=?',canonical[0]).toArray()[0];
  if(prior){if(prior.payload!==payload)throw Error('Conflicting duplicate UUID');return{reviewId:canonical[0],row:JSON.parse(prior.payload),committed:true,projected:!!prior.projected,duplicate:true}}
  db.sql.exec('INSERT INTO review_test_outbox (review_id,payload,projected) VALUES (?,?,0)',canonical[0],payload);
  return{reviewId:canonical[0],row:canonical,committed:true,projected:false,duplicate:false};
 });
}
// committed means canonical ledger acceptance, NOT confirmed Sheet projection.
// Crash after Sheet append/before marking requires prefix+UUID reconciliation.
// Any live projector must read exact test-copy UUID+row before retrying append.
