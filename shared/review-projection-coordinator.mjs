import{acceptIntoLedger}from'./review-test-ledger.mjs';
import{projectWithDurableState}from'./testcopy-projector.mjs';
// Serialized per-owner durable projection coordinator. The projector still
// enforces the TEST-copy boundary; this adds cross-request durable status so a
// crash or restart after an append attempt can never blind re-append.
// Storage is the Durable Object shape ({sql,transactionSync}); local tests use
// actual SQLite. One in-flight attempt per owner key. A record left in_flight
// by a crash/coordinator failure is treated as uncertain on the next load:
// append stays disabled until a readback reconciles the exact UUID row.
// Durable 'projected' is final: if the row later disappears from the target,
// that is manual-review territory, never an automatic re-append.
const inflight=new Map();
const STATUS_TABLE='review_projection_state';
function ensureTables(db){db.sql.exec(`CREATE TABLE IF NOT EXISTS ${STATUS_TABLE} (review_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL, reason TEXT, updated_at TEXT NOT NULL)`)}
function saveStatus(db,reviewId,status,attempts,reason){db.sql.exec(`INSERT OR REPLACE INTO ${STATUS_TABLE} (review_id,status,attempts,reason,updated_at) VALUES (?,?,?,?,?)`,reviewId,status,attempts,reason??null,new Date().toISOString())}
function markProjected(db,reviewId){db.sql.exec('UPDATE review_test_outbox SET projected=1 WHERE review_id=?',reviewId)}
export function loadProjectionStatus(db,reviewId){
 return db.transactionSync(()=>{ensureTables(db);return db.sql.exec(`SELECT status,attempts,reason FROM ${STATUS_TABLE} WHERE review_id=?`,reviewId).toArray()[0]??null});
}
async function attempt(db,row,options){
 const accepted=acceptIntoLedger(db,row);
 if(accepted.projected)return{projected:true,appended:false,reconciled:true,duplicate:accepted.duplicate,state:{status:'projected'},attempts:loadProjectionStatus(db,row[0])?.attempts??0};
 let prior=loadProjectionStatus(db,row[0]);
 if(prior?.status==='projected'){db.transactionSync(()=>markProjected(db,row[0]));return{projected:true,appended:false,reconciled:true,duplicate:accepted.duplicate,state:{status:'projected'},attempts:prior.attempts}}
 // Crash coercion: an interrupted attempt may already have appended.
 let status=prior?.status??'new';if(status==='in_flight')status='uncertain';
 const attempts=(prior?.attempts??0)+1;
 db.transactionSync(()=>{ensureTables(db);saveStatus(db,row[0],'in_flight',attempts,'attempt-started')});
 const result=await projectWithDurableState(row,options,{status});
 const finalStatus=result.state?.status==='projected'?'projected':'uncertain';
 db.transactionSync(()=>{ensureTables(db);saveStatus(db,row[0],finalStatus,attempts,result.reason??(result.projected?'confirmed':'unconfirmed'));if(finalStatus==='projected')markProjected(db,row[0])});
 return{...result,attempts};
}
// Serialized entry point: calls for the same owner key queue behind the current
// attempt; different keys proceed independently. key defaults to the target id.
export function coordinatedProjection(db,row,options,{key=options?.targetId}={}){
 if(!key)throw Error('Missing serialization key');
 const previous=inflight.get(key)??Promise.resolve();
 const run=previous.catch(()=>{}).then(()=>attempt(db,row,options));
 inflight.set(key,run);
 return run.finally(()=>{if(inflight.get(key)===run)inflight.delete(key)});
}
