// Closing-stage lines the client injects for the model to read verbatim.
// Facts only — no judgment, score, or mastery vocabulary.
import{normalizeJa}from'./turn-feedback.mjs';

export function buildClosingLines({lesson,userText,seconds,nextTitle}){
 const matched=[];
 const heard=normalizeJa(userText);
 for(const arr of Object.values(lesson?.accepted||{}))
  for(const v of arr){const n=normalizeJa(v);if(n&&heard.includes(n)&&!matched.includes(v))matched.push(v);}
 const mm=Math.floor((seconds||0)/60),ss=Math.max(0,(seconds||0)%60);
 const lines=[`오늘 연습 정리: ${lesson.title} — ${lesson.canDo}를 연습했어요.`];
 lines.push(matched.length?`직접 말해 본 표현: ${matched.join(', ')}.`:'오늘은 목표 표현까지는 이어지지 않았어요. 다음에 이어서 해 봐요.');
 lines.push(`연습 시간: 약 ${mm>0?mm+'분 ':''}${ss}초.`);
 lines.push(nextTitle?`다음 연습은 '${nextTitle}'이에요.`:'모든 연습을 한 번씩 다 해 봤어요.');
 return lines;
}
