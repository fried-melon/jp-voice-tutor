import {parseTurnMarker,findAcceptedAtom} from './turn-feedback.mjs';
// UI evidence filter only. Does not assess unseen audio or change spoken output.
export function presentTurn({text,userText,lesson,phase='scene',targetDone=false}){
 const parsed=parseTurnMarker(text);
 if(!parsed.marker)return {text,marker:null,goal:false};
 const atom=findAcceptedAtom(userText,lesson);
 const help=/[가-힣]/.test(userText||'')&&/[?？]|뭐|어떻게|무슨|뜻|천천히|다시|모르|알려|도와/.test(userText||'');
 if(phase!=='scene'||targetDone||help)return{text:parsed.marker==='pass'?'시작 목표의 통과 판정을 적용하지 않는 대화예요. 정답·숙달 판정으로 기록하지 않아요.':parsed.marker==='correction'?'시작 목표와 다른 문장이라는 이유만으로 오류로 표시하지 않아요. 대화 맥락에 맞는 표현을 이어서 연습해요.':parsed.rest,marker:null,goal:false};
 if(parsed.marker==='pass'&&!atom)return{text:'인식된 말과 시작 목표 표현의 일치를 확인하지 못했어요. 이 표시는 정답 판정이 아니에요.',marker:null,goal:false,unverified:true};
 if(parsed.marker==='correction'&&atom)return{text:'인식된 문장은 이 장면에서 허용하는 표현이에요. 목표 예시와 달라도 그것만으로 오류가 되지 않아요.',marker:null,goal:false,disputed:true};
 return{text:parsed.rest,marker:parsed.marker,goal:parsed.marker==='pass'&&!!atom,atom};
}
