// Exact DBowner-confirmed 2026-10-27 header. No network or persistence effects.
export const REVIEW_HEADERS=Object.freeze(['review_id','card_id','reviewed_at_utc','rating_1to4','rating_source','mode','hint_used','independent','duration_sec','source','note','counts_for_schedule','scheduler_rating']);
export const REVIEW_SCHEMA_FINGERPRINT='b03a90468e79';
export function buildReviewRow(raw,qualified){
 if(raw.review_id!==qualified.reviewId)throw Error('Review identity mismatch');
 if(qualified.duplicate)throw Error('Duplicate must not append');
 if(!['Y','N'].includes(qualified.counts_for_schedule))throw Error('Invalid eligibility');
 if(qualified.counts_for_schedule==='N'&&qualified.scheduler_rating!=='')throw Error('Excluded grade must be empty');
 if(qualified.counts_for_schedule==='Y'&&!['Again','Hard','Good','Easy'].includes(qualified.scheduler_rating))throw Error('Eligible grade required');
 if(!raw.review_id||!raw.card_id||!Number.isFinite(Date.parse(raw.reviewed_at_utc)))throw Error('Missing identity/time');
 const note=[raw.note,`[scheduler:${qualified.reason}]`].filter(Boolean).join(' ');
 // No new columns; retain original raw performance/source/mode/hint/independence.
 return REVIEW_HEADERS.map(k=>k==='counts_for_schedule'?qualified.counts_for_schedule:k==='scheduler_rating'?qualified.scheduler_rating:k==='note'?note:(raw[k]??''));
}
export function validateReviewRow(row){
 if(!Array.isArray(row)||row.length!==13||row.some(v=>!['string','number'].includes(typeof v)))throw Error('Invalid row shape');
 if(typeof row[0]!=='string'||!row[0]||typeof row[1]!=='string'||!row[1]||!Number.isFinite(Date.parse(row[2])))throw Error('Invalid identity/time');
 if(row.some(v=>typeof v==='string'&&/^[\s]*[=+@-]/.test(v)))throw Error('Formula-like value');
 if(!['','1','2','3','4'].includes(String(row[3])))throw Error('Invalid performance');
 if(!['rule','self','model','pending'].includes(row[4]))throw Error('Invalid rating source');
 if(!['normal','extra','correction'].includes(row[5]))throw Error('Invalid mode');
 for(const i of[6,7,11])if(!['Y','N'].includes(row[i]))throw Error('Invalid boolean flag');
 if(row[8]!==''&&(!Number.isFinite(Number(row[8]))||Number(row[8])<0||Number(row[8])>300))throw Error('Invalid duration');
 if(row[11]==='N'&&row[12]!=='')throw Error('Excluded scheduler grade');
 if(row[11]==='Y'){
  if(!['Again','Hard','Good','Easy'].includes(row[12])||row[5]!=='normal'||row[4]==='pending'||row[3]===''||row[7]!=='Y')throw Error('Invalid eligible grade');
  if(['Hard','Good','Easy'].includes(row[12])&&row[6]!=='N')throw Error('Hint-assisted pass cannot schedule');
  if(['Hard','Easy'].includes(row[12])&&row[4]!=='self')throw Error('Hard/Easy require explicit self report');
 }
 return row;
}
// Provider reads may return numeric strings; compare typed canonical numbers only
// in the known numeric columns, never coercing identifiers or arbitrary text.
export function canonicalReviewRow(row){validateReviewRow(row);return row.map((v,i)=>[3,8].includes(i)&&v!==''?Number(v):v)}
// Sheets readers omit trailing blank cells. Pad only on provider-read path,
// never accept undersized outgoing payloads or truncate unexpected new columns.
export function normalizeProviderReviewRow(row){
 if(!Array.isArray(row)||row.length>REVIEW_HEADERS.length)throw Error('Unexpected provider columns');
 const padded=[...row,...Array(REVIEW_HEADERS.length-row.length).fill('')];return canonicalReviewRow(padded);
}
