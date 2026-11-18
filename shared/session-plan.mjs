// Local session control. No grading or provider access.
export function createSessionPlan(limitSeconds=240){
 let limit=[120,180,240,300].includes(limitSeconds)?limitSeconds:240;
 let phase='scene',sceneTurns=0,goalSeen=false,freeStarted=null;
 return{
  get phase(){return phase;},get sceneTurns(){return sceneTurns;},
  goal(){goalSeen=true;},learnerTurn(){sceneTurns++;},
  extend(seconds){if(seconds===300)limit=300;},
  tick(elapsed,{ready=false}={}){
   // Commit a transition only when it is delivered, never while old audio drains.
   if(!ready||elapsed>=limit)return null;
   if(phase==='scene'&&(elapsed>=Math.floor(limit*.5)||(goalSeen&&sceneTurns>=4))){phase='free-talk';freeStarted=elapsed;return phase;}
   // A late scene must not turn into free talk then a closing one second later.
   // Reserve >=30 seconds of free talk where possible; otherwise skip spoken
   // closing and let the fixed user-selected hard limit end the session.
   if(phase==='free-talk'&&elapsed>=limit-20&&elapsed-freeStarted>=30){phase='wrapup';return phase;}
   return null;
  },
  instruction(phase){
   if(phase==='free-talk')return '이제 반드시 자유 주제 프리토킹 단계입니다. 단일 목표 표현 제한은 이 단계에 적용하지 않습니다. 학습자가 여행·음식·취미 등 비민감한 자유 주제를 고르도록 짧은 한국어 질문 하나를 하고 기다리세요. 주제를 말하면 그에 관한 쉬운 일본어 대화를 이어가세요. 학습자가 한국어로 도움을 청하면 한국어로 도와주세요. 뜻이 달라지는 문법/표현 오류는 구체적 한 부분과 자연스러운 예문으로 교정하고 재시도 뒤 실제 내용에 답하세요. ASR만으로 발음이나 유창성을 평가하지 마세요. 통과 배지를 요구하거나 이전 목표로 되돌리지 말고 시간이 끝날 때까지 한 질문씩 대화를 이어가세요. 사적인 정보는 요청하지 마세요.';
   return null;
  }
 };
}
