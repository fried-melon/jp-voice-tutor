import test from'node:test';import assert from'node:assert/strict';
import{loadReviewQueue,saveReviewQueue,REVIEW_QUEUE_STORAGE_KEY}from'../shared/offline-review-storage.mjs';
import{enqueueReview,acknowledgeReview}from'../shared/offline-reviews.mjs';
function mem(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_map:m}}
const row=id=>[id,'card','2026-10-27T00:00:00Z',3,'rule','normal','N','Y',8,'test-harness','[synthetic]','Y','Good'];
const rowB=id=>[id,'card2','2026-10-27T01:00:00Z','','self','extra','N','N',15,'test-harness','[synthetic]','N',''];
test('save/load round trip preserves queue order and row content',()=>{
 const s=mem();let q=[];q=enqueueReview(q,row('TEST-C1-store-001'));q=enqueueReview(q,rowB('TEST-C1-store-002'));
 saveReviewQueue(s,q);const loaded=loadReviewQueue(s);assert.deepEqual(loaded,q);assert.notEqual(loaded[0].row,q[0].row);
 q=acknowledgeReview(q,{reviewId:'TEST-C1-store-001',row:row('TEST-C1-store-001'),committed:true});
 saveReviewQueue(s,q);assert.deepEqual(loadReviewQueue(s),q);
 saveReviewQueue(s,[]);assert.equal(s.getItem(REVIEW_QUEUE_STORAGE_KEY),null);assert.deepEqual(loadReviewQueue(s),[]);
});
test('corrupt or tampered payloads are quarantined, never used',()=>{
 const s=mem();s.setItem(REVIEW_QUEUE_STORAGE_KEY,'{not json');
 assert.deepEqual(loadReviewQueue(s),[]);assert.equal(s.getItem(REVIEW_QUEUE_STORAGE_KEY),null);assert.equal(s.getItem(REVIEW_QUEUE_STORAGE_KEY+'.quarantine'),'{not json');
 saveReviewQueue(s,[{reviewId:'TEST-C1-store-003',row:row('TEST-C1-store-003')}]);
 const tampered=JSON.parse(s.getItem(REVIEW_QUEUE_STORAGE_KEY));tampered[0].row[12]='Easy';s.setItem(REVIEW_QUEUE_STORAGE_KEY,JSON.stringify(tampered));
 assert.deepEqual(loadReviewQueue(s),[]);assert.equal(JSON.parse(s.getItem(REVIEW_QUEUE_STORAGE_KEY+'.quarantine'))[0].row[12],'Easy');
 const formula=[{reviewId:'TEST-C1-store-004',row:row('TEST-C1-store-004').map((v,i)=>i===10?'=HYPERLINK("x")':v)}];
 assert.throws(()=>saveReviewQueue(s,formula),/Formula-like|Invalid/);
});
test('reviewId/row identity mismatch and oversize queues rejected',()=>{
 const s=mem();assert.throws(()=>saveReviewQueue(s,[{reviewId:'A',row:row('TEST-C1-store-005')}]));
 const big=Array.from({length:501},(_,i)=>({reviewId:`TEST-C1-bulk-${i}`,row:row(`TEST-C1-bulk-${i}`)}));
 assert.throws(()=>saveReviewQueue(s,big),/Invalid/);
 s.setItem(REVIEW_QUEUE_STORAGE_KEY,JSON.stringify(big));assert.deepEqual(loadReviewQueue(s),[]);
});
