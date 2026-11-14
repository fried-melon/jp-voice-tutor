// Recall-event classification from REAL post-cue transcript signals only.
// Doctrine (cycle1-fsrs6-evidence-v1): an ASR string match is never
// comprehension/pronunciation proof, absence of a match is never failure, and
// technical/uncertain situations always land on pending. The main-session UI
// always shows the example answer (hintSeen), so spontaneous main-session recall
// is at best hint-assisted practice. Client events ALWAYS carry
// scheduler_rating:null and counts_for_schedule:false; the FSRS contract alone
// decides schedule eligibility from stored evidence during replay/projection.
const TECHNICAL=new Set(['first_audio_timeout','playback_interrupted','connect_failed','mic_denied','session_error']);
export const OUTCOME_LABELS={
 pending:'결과 보류 · 인식 불확실이나 중단은 실패로 기록하지 않아요',
 modeled:'모범을 듣고 따라 한 연습',
 hinted:'힌트/예시를 본 연습',
 independent:'스스로 말한 연습 · 정확성 확인은 아니에요',
 'explicit-easy':'쉬웠다고 직접 알린 연습',
};
/** after: transcript entries ({role,text,ts}) at/after the cue; variants: accepted strings incl. the target. */
export function classifyRecallEvent({variants,after,endCode,hintSeen}){
 const learners=after.filter(e=>e.role==='learner');
 if(TECHNICAL.has(endCode)&&learners.length===0)return{outcome:'pending',reason:'technical'};
 if(learners.length===0)return{outcome:'pending',reason:'no-attempt-evidence'};
 let matchIdx=-1;
 for(let i=0;i<after.length;i++){const e=after[i];if(e.role==='learner'&&variants.some(v=>typeof v==='string'&&v&&e.text.includes(v))){matchIdx=i;break;}}
 if(matchIdx<0)return{outcome:'pending',reason:'asr-no-match'}; // ambiguity is never failure
 const before=after.slice(0,matchIdx);
 if(before.some(e=>e.role==='learner'&&e.text.includes('もう一度')))return{outcome:'hinted',reason:'repeat-request'};
 if(before.some(e=>(e.role==='clerk'||e.role==='guide')&&variants.some(v=>typeof v==='string'&&v&&e.text.includes(v))))return{outcome:'modeled',reason:'model-revealed-first'};
 if(hintSeen)return{outcome:'hinted',reason:'answer-visible'};
 return{outcome:'independent',reason:'spontaneous-unaided'};
}
/** Mint the stored event for a requested recall, or [] when no recall happened. */
export function mintReviewEvent({recall,lesson,transcript,endCode,hintSeen,uuid}){
 if(!recall||!lesson||!recall.at)return[];
 const variants=recall.kind==='word'?[recall.cueJa]:[...new Set([recall.cueJa,...Object.values(lesson.accepted||{}).flat()])];
 const after=(transcript||[]).filter(e=>typeof e.ts==='string'&&e.ts>=recall.at);
 const{outcome,reason}=classifyRecallEvent({variants,after,endCode,hintSeen:!!hintSeen});
 return[{event_id:uuid,card_id:lesson.id+':'+recall.kind,kind:recall.kind,outcome,scheduler_rating:null,at:recall.at,counts_for_schedule:false,reason}];
}
