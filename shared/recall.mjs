// One lesson-derived retrieval cue inside the existing session, never a scheduler.
export function createRecallState(){return{used:false,event:null};}
/** @param {any} state @param {any} lesson @param {string} kind @param {{active?:boolean,ready?:boolean,elapsed?:number,limit?:number,hintSeen?:boolean}} options */
export function requestRecall(state,lesson,kind,{active=false,ready=false,elapsed=0,limit=0,hintSeen=false,now}={}){
 if(state.used||!active||!ready||limit-elapsed<20)return null;
 if(!['word','sentence'].includes(kind))return null;
 // Only the reviewed katakana word is enabled; kanji reading QA remains pending.
 if(kind==='word'&&lesson.id!=='M1-S1')return null;
 const cue=kind==='word'?{ja:'ポイントカード',meaning:'포인트 카드'}:{ja:lesson.target,meaning:lesson.targetMeaning};
 state.used=true;state.event={lessonId:lesson.id,kind,mode:'practice',countsForSchedule:false,status:'pending',hintSeen,independent:false,at:now||new Date().toISOString(),cueJa:cue.ja};
 return{cue,event:state.event,message:kind==='word'?`같은 레슨 복습 한 번만 합니다. 단어 「${cue.ja}」를 일본어로 한 번 말하고 반드시 한국어로 "한국어로 무슨 뜻일까요?"라고 물은 뒤 기다려 주세요. 일본어 질문 금지. 모범 뜻을 먼저 말하지 마세요. 답 후 피드백은 한국어 2문장 이내. 점수·암기 성공·FSRS 기록을 만들지 마세요.`:`같은 레슨 문장 복습 한 번만 합니다. 한국어 뜻 「${cue.meaning}」를 말하고 일본어로 어떻게 답하는지 물은 뒤 기다려 주세요. 모범 일본어를 먼저 말하지 마세요. 답 후 뜻과 상황 적합성을 짧게 확인하세요. 바로 전 모범 따라하기를 독립 인출이라 부르지 말고, 음성 인식 불확실·중단을 실패로 판정하지 마세요. 점수·스케줄 기록은 만들지 마세요.`};
}
