// Read-only planner. Never resets due dates or creates penalty/failure events.
export const DAILY_REVIEW_CONTRACT='cycle1-daily-plan-v1';
export function planDailyReview(cards,{now,studiedLessonIds=[],active=false,playbackIdle=false,secondsLeft=0,alreadyUsed=false,completedSpeakingExchanges=0,explicitUserSelection=false}={}){
 if(!Number.isFinite(now))throw Error('Invalid now');
 const plan={contract:DAILY_REVIEW_CONTRACT,selection:null,maxTurns:1,mandatoryCatchup:false,extendsSession:false};
 if(!active||!playbackIdle||alreadyUsed||secondsLeft<20||(!explicitUserSelection&&completedSpeakingExchanges<1))return plan;
 const studied=new Set(studiedLessonIds);
 const eligible=cards.filter(c=>c.qa==='approved'&&!c.suspended&&studied.has(c.lessonId)&&['word','sentence','reading'].includes(c.kind)&&Number.isFinite(new Date(c.card?.due).getTime())&&new Date(c.card.due).getTime()<=now);
 eligible.sort((a,b)=>new Date(a.card.due)-new Date(b.card.due)||a.id.localeCompare(b.id));
 if(eligible[0])plan.selection={cardId:eligible[0].id,lessonId:eligible[0].lessonId,kind:eligible[0].kind,originalDue:new Date(eligible[0].card.due).toISOString()};
 return plan;
}
