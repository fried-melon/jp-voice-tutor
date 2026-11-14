import{classifyReview}from'./fsrs-adapter.mjs';
import{buildReviewRow}from'./review-schema.mjs';
const gradeNames={1:'Again',2:'Hard',3:'Good',4:'Easy'};
// App event-to-grade integration at module level: one accepted evidence event
// -> one validated 13-column review record. No client wiring yet; the hosted
// app produces no accepted events today. Pending/technical evidence never
// earns a grade. The same-day policy input comes from the caller's durable
// state, never from a guess. Hard/Easy still require an explicit self report.
export function buildAcceptedReviewRecord({event,cardId,reviewedAtUtc,durationSec='',source,note='',alreadyScheduledToday=false}){
 if(!event?.reviewId||!cardId||!Number.isFinite(Date.parse(reviewedAtUtc)))throw Error('Missing identity/time');
 if(!['normal','extra','correction'].includes(event.mode))throw Error('Invalid mode');
 const pending=!!(event.technicalIssue||event.asrUncertain||!event.completed);
 const selfReported=event.selfReport==='easy'||event.selfReport==='hard';
 const raw={review_id:event.reviewId,card_id:cardId,reviewed_at_utc:reviewedAtUtc,rating_1to4:pending?'':String(event.performanceRating??''),rating_source:pending?'pending':selfReported?'self':(event.performanceSource??'rule'),mode:event.mode,hint_used:event.hintUsed?'Y':'N',independent:event.independentAttempt===true?'Y':'N',duration_sec:durationSec,source,note};
 const decision=classifyReview(event);
 const eligible=decision.eligible&&!alreadyScheduledToday;
 const qualified={reviewId:event.reviewId,counts_for_schedule:eligible?'Y':'N',scheduler_rating:eligible?gradeNames[decision.rating]:'',reason:!decision.eligible?decision.reason:alreadyScheduledToday?'same-day-extra':decision.reason};
 return buildReviewRow(raw,qualified);
}
