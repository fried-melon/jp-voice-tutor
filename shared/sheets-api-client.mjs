const API_BASE='https://sheets.googleapis.com/v4/spreadsheets/';
const VALUES_RANGE='A1:Z300';
// Thin Sheets values client with injected fetch and caller-managed access
// tokens. Only the pinned values endpoints, only RAW appends, bounded range
// matching the compared test-copy window. No retries; the projector owns
// readback/reconcile policy.
function validFileId(fileId){return typeof fileId==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(fileId)}
export function createSheetsClient({fetcher=globalThis.fetch,getAccessToken}={}){
 if(typeof fetcher!=='function'||typeof getAccessToken!=='function')throw Error('Missing fetch or token source');
 async function call(path,init={}){
  let response;try{response=await fetcher(API_BASE+path,{...init,headers:{Authorization:`Bearer ${await getAccessToken()}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)})}catch(e){if(e?.name==='AbortError'||e?.name==='TimeoutError'||!e?.status)throw Object.assign(Error(`sheets_transport:${e?.name==='TimeoutError'?'timeout':'network'}`),{retryable:true});throw e}
  let data=null;try{data=await response.json()}catch{}
  if(!response.ok)throw Object.assign(Error(`sheets_error:${data?.error?.status??response.status}`),{status:response.status,retryable:response.status===429||response.status>=500});
  return data;
 }
 return{
  async readRows(fileId){
   if(!validFileId(fileId))throw Error('Invalid file id');
   const data=await call(`${fileId}/values/${VALUES_RANGE}?majorDimension=ROWS`);
   return data?.values??[];
  },
  async appendRaw(fileId,row,{valueInputOption='RAW'}={}){
   if(!validFileId(fileId))throw Error('Invalid file id');
   if(valueInputOption!=='RAW')throw Error('Non-RAW input refused');
   if(!Array.isArray(row)||!row.length)throw Error('Invalid row');
   await call(`${fileId}/values/${VALUES_RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
   return{appended:true};
  }
 };
}
