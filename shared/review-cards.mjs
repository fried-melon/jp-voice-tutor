// Derives the cycle-1 review card set from the actual lesson content schema.
// Pure: no I/O, no scheduler, no persistence. QA policy mirrors the recall gate
// and the integration contract: only content-reviewed cards are approved;
// kanji and unreviewed word cards stay suspended until content QA and are never
// auto-enabled by this module. Curriculum owns content; this only projects it.
export const CARD_CONTRACT='cycle1-cards-1';
// The only content-reviewed word card to date. Evidence: the recall gate in
// shared/recall.mjs (word kind limited to M1-S1) plus the cycle-1 integration
// contract ("Word recall enabled only for reviewed M1-S1 katakana"). This set
// encodes that existing evidence; it grants no new approvals. Content QA and
// any change to the approved set belong to the curriculum owner.
const APPROVED_WORDS=Object.freeze([['M1-S1','ポイントカード'],['M2-S8','持ち帰り'],['M2-S8','店内(てんない)'],['M2-S9','単品'],['M2-S9','セット'],['M2-S9','S・M・L'],['M2-S9','メニュー'],['M2-S9','定食(ていしょく)'],['M2-S11','お会計(おかいけい)'],['M2-S11','営業中(えいぎょうちゅう)'],['M2-S11','準備中(じゅんびちゅう)'],['M2-S11','伝票(でんぴょう)']]);
export function deriveReviewCards(lessons){
 if(!Array.isArray(lessons)||!lessons.length)throw Error('Missing lessons');
 const cards=[],seen=new Set();
 for(const lesson of lessons){
  if(Array.isArray(lesson?.sequence))continue; // Composite sessions (M1-S6) reuse component cards; they mint none of their own.
  if(!lesson?.id||typeof lesson.target!=='string'||!lesson.target||typeof lesson.targetMeaning!=='string'||!lesson.targetMeaning)throw Error('Invalid lesson schema');
  const push=card=>{if(seen.has(card.id))throw Error('Duplicate card id');seen.add(card.id);cards.push(Object.freeze(card))};
  push({contract:CARD_CONTRACT,id:`${lesson.id}:sentence`,lessonId:lesson.id,kind:'sentence',front:lesson.targetMeaning,back:lesson.target,qa:'approved',suspended:false});
  for(const word of lesson.reading??[]){
   if(typeof word!=='string'||!word)throw Error('Invalid reading entry');
   const approved=APPROVED_WORDS.some(([l,w])=>l===lesson.id&&w===word);
   push({contract:CARD_CONTRACT,id:`${lesson.id}:word:${word}`,lessonId:lesson.id,kind:'word',front:word,back:word,qa:approved?'approved':'pending',suspended:!approved});
  }
 }
 return cards;
}
