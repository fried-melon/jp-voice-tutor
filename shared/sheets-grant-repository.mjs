import{consumeOwnerState,disconnectedGrantState}from'./sheets-oauth-security.mjs';
// Durable grant repository in the DO-shaped transactional store. One grant per
// owner. Access tokens are never persisted; only the AES-GCM encrypted refresh
// grant. Revocation wipes the ciphertext. Pending OAuth states are single-use
// and consumed atomically (read + delete in one transaction).
function tables(db){
 db.sql.exec(`CREATE TABLE IF NOT EXISTS sheets_grant (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL, version INTEGER, key_version TEXT, iv TEXT, ciphertext TEXT, connected_at TEXT, revoked_at TEXT)`);
 db.sql.exec(`CREATE TABLE IF NOT EXISTS oauth_pending (state TEXT PRIMARY KEY, record TEXT NOT NULL)`);
}
export function savePendingAuth(db,record,{now=Date.now()}={}){
 if(!record?.state||record.used)throw Error('Invalid pending record');
 return db.transactionSync(()=>{tables(db);db.sql.exec(`DELETE FROM oauth_pending WHERE json_extract(record,'$.expiresAt')<=?`,now);db.sql.exec('INSERT INTO oauth_pending (state,record) VALUES (?,?)',record.state,JSON.stringify(record));return{stored:true}});
}
export function consumePendingAuth(db,params){
 return db.transactionSync(()=>{
  tables(db);
  const row=db.sql.exec('SELECT record FROM oauth_pending WHERE state=?',params?.state??'').toArray()[0];
  if(!row)throw Error('Invalid or expired OAuth state');
  db.sql.exec('DELETE FROM oauth_pending WHERE state=?',params.state);
  return consumeOwnerState(JSON.parse(row.record),params);
 });
}
export function saveGrant(db,record,{ownerSub,clientId,keyVersion,now=Date.now()}){
 if(!ownerSub||!clientId||!keyVersion||record?.keyVersion!==keyVersion)throw Error('Grant binding mismatch');
 return db.transactionSync(()=>{tables(db);db.sql.exec(`INSERT OR REPLACE INTO sheets_grant (id,state,version,key_version,iv,ciphertext,connected_at,revoked_at) VALUES (1,'connected',?,?,?,?,?,NULL)`,record.version,record.keyVersion,record.iv,record.ciphertext,new Date(now).toISOString());return{connected:true}});
}
export function loadGrant(db,{keyVersion}={}){
 return db.transactionSync(()=>{tables(db);
  const row=db.sql.exec('SELECT state,version,key_version,iv,ciphertext,connected_at FROM sheets_grant WHERE id=1').toArray()[0];
  if(!row||row.state!=='connected')return disconnectedGrantState();
  // A key the current deployment cannot read must not look connected.
  if(keyVersion&&row.key_version!==keyVersion)return disconnectedGrantState();
  return{connected:true,encryptedGrant:{version:row.version,keyVersion:row.key_version,iv:row.iv,ciphertext:row.ciphertext},connectedAt:row.connected_at};
 });
}
export function revokeGrant(db,{now=Date.now()}={}){
 return db.transactionSync(()=>{tables(db);db.sql.exec(`INSERT OR REPLACE INTO sheets_grant (id,state,version,key_version,iv,ciphertext,connected_at,revoked_at) VALUES (1,'disconnected',NULL,NULL,NULL,NULL,NULL,?)`,new Date(now).toISOString());return disconnectedGrantState()});
}
