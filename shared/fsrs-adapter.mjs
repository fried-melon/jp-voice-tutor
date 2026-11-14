import{fsrs,createEmptyCard,Rating}from'ts-fsrs';
export const SCHEDULER_CONTRACT='cycle1-fsrs6-evidence-v1';
export const SCHEDULER_VERSION='ts-fsrs@5.4.2';
// Explicit product policy, not model mathematics: no mandatory minute-scale queue.
export const schedulerParameters=Object.freeze({request_retention:.9,enable_fuzz:false,enable_short_term:true,learning_steps:[],relearning_steps:[]});
export function classifyReview(e){
 if(e.technicalIssue||e.asrUncertain||!e.completed)return{eligible:false,reason:'pending'};
 if(e.mode!=='normal'||e.modeled||e.hintBeforeAttempt)return{eligible:false,reason:'practice-only'};
 if(e.independentAttempt!==true)return{eligible:false,reason:'no-independent-attempt'};
 // Hint-assisted success after a failed unaided attempt is not Hard.
 if(e.unaidedCorrect===false)return{eligible:true,rating:Rating.Again,reason:'unaided-failure'};
 if(e.unaidedCorrect!==true||e.hintUsed)return{eligible:false,reason:'ambiguous-evidence'};
 if(e.selfReport==='easy')return{eligible:true,rating:Rating.Easy,reason:'explicit-easy'};
 if(e.selfReport==='hard')return{eligible:true,rating:Rating.Hard,reason:'correct-with-effort'};
 return{eligible:true,rating:Rating.Good,reason:'independent-correct'};
}
export function replayReviews(events,{createdAt,initialCard}={}){
 let card=initialCard?structuredClone(initialCard):createEmptyCard(new Date(createdAt||0));const logs=[],seen=new Map();const scheduler=fsrs(schedulerParameters);
 // Caller's append order is authoritative. Reject time travel, never silently reorder.
 let last=-Infinity;
 for(const e of events){if(!e.reviewId||!Number.isFinite(e.at))throw Error('Invalid review identity/time');const signature=JSON.stringify(e);if(seen.has(e.reviewId)){if(seen.get(e.reviewId)!==signature)throw Error('Conflicting duplicate review UUID');continue}seen.set(e.reviewId,signature);if(e.at<last)throw Error('Non-monotonic review history');last=e.at;const decision=classifyReview(e);if(!decision.eligible){logs.push({reviewId:e.reviewId,...decision});continue}const result=scheduler.next(card,new Date(e.at),decision.rating);card=result.card;logs.push({reviewId:e.reviewId,contract:SCHEDULER_CONTRACT,scheduler:SCHEDULER_VERSION,...decision,log:result.log});}
 return{card,logs};
}
export function selectDueCards(cards,{now,lessonId,max=1}={}){return cards.filter(x=>x.qa==='approved'&&!x.suspended&&x.lessonId===lessonId&&new Date(x.card.due).getTime()<=now).sort((a,b)=>new Date(a.card.due)-new Date(b.card.due)||a.id.localeCompare(b.id)).slice(0,Math.min(1,Math.max(0,max)));}
const gradeNames={1:'Again',2:'Hard',3:'Good',4:'Easy'};
function seoulDay(at){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(at)}
// Persistence shape only. Does not access DB. Caller stores original evidence separately.
export function qualifyScheduleRows(events){
 const seen=new Map(),daily=new Set(),lastByCard=new Map();return events.map(e=>{
  if(!e.cardId||!e.reviewId||!Number.isFinite(e.at))throw Error('Missing review card/identity/time');
  const signature=JSON.stringify(e);if(seen.has(e.reviewId)){if(seen.get(e.reviewId)!==signature)throw Error('Conflicting duplicate review UUID');return{reviewId:e.reviewId,duplicate:true,counts_for_schedule:'N',scheduler_rating:'',reason:'duplicate'}}seen.set(e.reviewId,signature);
  if(e.at<(lastByCard.get(e.cardId)??-Infinity))throw Error('Non-monotonic card history');lastByCard.set(e.cardId,e.at);
  const decision=classifyReview(e),key=`${e.cardId}:${seoulDay(e.at)}`;
  if(!decision.eligible)return{reviewId:e.reviewId,counts_for_schedule:'N',scheduler_rating:'',reason:decision.reason};
  if(daily.has(key))return{reviewId:e.reviewId,counts_for_schedule:'N',scheduler_rating:'',reason:'same-day-extra'};
  daily.add(key);return{reviewId:e.reviewId,counts_for_schedule:'Y',scheduler_rating:gradeNames[decision.rating],reason:decision.reason};
 });
}

export function replayQualifiedCard(events,{cardId,createdAt,initialCard}={}){
 if(!cardId)throw Error('Missing cardId');
 const own=events.filter(e=>e.cardId===cardId);const rows=qualifyScheduleRows(own);
 const eligible=own.filter((e,i)=>rows[i].counts_for_schedule==='Y');
 return{...replayReviews(eligible,{createdAt,initialCard}),rows};
}
