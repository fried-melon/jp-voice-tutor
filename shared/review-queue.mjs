// Versioned preview planner. NOT FSRS and NOT an accepted grading contract.
// Caller supplies reviewed lesson-card definitions and private events; no I/O here.
export const REVIEW_CONTRACT='cycle1-preview-1';
export function createPracticeEvent({cardId,lessonId,kind,outcome='pending',hintUsed=false,independent=false,at=Date.now(),reviewId=crypto.randomUUID()}){
 if(!cardId||!lessonId||!['word','sentence','reading'].includes(kind))throw Error('Invalid card');
 if(!['pending','modeled','independent','hinted','explicit-easy'].includes(outcome))throw Error('Invalid outcome');
 // Technical/ASR ambiguity never becomes failure or a scheduler rating.
 return{reviewId,contract:REVIEW_CONTRACT,cardId,lessonId,kind,at,outcome,hintUsed:!!hintUsed,independent:!!independent,countsForSchedule:false,mode:'preview-practice'};
}
export function appendPreviewEvent(events,event){if(events.some(e=>e.reviewId===event.reviewId))return events;return[...events,event];}
export function planPreviewRecall(cards,events,{now=Date.now(),lessonId,limit=1}={}){
 // No compulsory catch-up: a bounded selection, never queue debt or failure.
 // Preview spacing is explicit fixed interval, not a learned retention model.
 const intervals=[86400000,3*86400000,7*86400000];
 return cards.filter(c=>c.lessonId===lessonId&&c.qa==='approved'&&!c.suspended).map(card=>{
  const history=events.filter(e=>e.cardId===card.id&&e.contract===REVIEW_CONTRACT&&['independent','explicit-easy'].includes(e.outcome)&&e.independent&&!e.hintUsed).sort((a,b)=>a.at-b.at);
  const last=history.at(-1);const dueAt=last?last.at+intervals[Math.min(history.length-1,intervals.length-1)]:0;
  return{card,dueAt,previewOnly:true};
 }).filter(x=>x.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt||a.card.id.localeCompare(b.card.id)).slice(0,Math.max(0,Math.min(1,limit)));
}
