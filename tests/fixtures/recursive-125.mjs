// Fictional user questions/utterances for UI contract replay, not real model answers.
// Each scene has 25 distinct learner prompts. Expected model behavior is a rubric,
// not an automatically claimed LLM score. No real user conversation is retained.
const common=[
 ['help','이 말을 한국어로 설명해 줄래요?','뜻을 한국어로 설명하고 질문 하나만 이어가기'],
 ['repair','もう一度お願いします。','같은 말을 반복하고 새 도입은 하지 않기'],
 ['speed','조금 천천히 말해 줄래요?','속도를 낮춘 짧은 일본어로 반복하기'],
 ['help','첫 단어만 힌트로 줄 수 있어요?','전체 정답 대신 첫 단어 힌트'],
 ['help','아직 모르겠어요. 예시 하나만 알려 줄래요?','예시 하나, 독립 수행으로 칭하지 않기'],
 ['unclear','¿Sí?','목표 수행으로 칭찬하지 않고 중립 확인'],
 ['unclear','Toinsa','외국어 단편을 일본어 정답으로 추정하지 않기'],
 ['failure','못 했습니다.','일본어 목표 통과로 표시하지 않기'],
 ['free-choice','프리토킹은 음식 이야기로 해도 돼요?','자유 주제 수용하고 쉬운 일본어 질문 하나'],
 ['free-help','趣味라는 단어가 무슨 뜻이에요?','한국어 뜻 설명, 인식 실패 취급하지 않기'],
 ['free-grammar','昨日、ラーメンを食べますでした。','과거 활용 한 부분과 문맥에 맞는 과거 예시'],
 ['free-valid','昨日、ラーメンを食べました。','올바른 문장을 목표와 다르다고 교정하지 않기'],
 ['free-unclear','(인식 불가)','발음 실패로 채점하지 않고 재확인'],
 ['privacy','제 실제 여권번호를 말해야 하나요?','개인정보를 요청하지 말고 가상 값 안내'],
 ['end','오늘은 그만할까요?','종료 의도 존중, 추가 문제 강요하지 않기']
];
const scenes=[
 {id:'shop',lesson:'M1-S1',label:'편의점',prompts:[
 ['meaning','ポイントカードはお持ちですか는 무슨 뜻이에요?','카드 소지 질문을 한국어로 설명'],
 ['valid','持っていません。','카드 없음 수용'],['variant','ありません。','허용된 다른 표현 수용'],
 ['quoted','持っていません이라는 뜻이 뭐예요?','인용을 정답 수행으로 세지 않기'],
 ['question','持っていませんか。','질문 어미를 단순 정답으로 세지 않기'],
 ['correction','持っているないです。','부정 활용 구체 교정'],
 ['bag','봉투를 달라고 하려면 뭐라고 해요?','袋をお願いします 예시 하나'],
 ['bag-valid','袋はいりません。','봉투 거절 의미 수용'],
 ['money','520엔은 일본어로 어떻게 읽어요?','가상 금액 ごひゃくにじゅうえん 안내'],
 ['pay','カードでお願いします。','결제 수단 답에 자연스러운 수용']
 ]},
 {id:'food',lesson:'M2-S7',label:'식당',prompts:[
 ['meaning','何名様ですか는 무슨 말이에요?','인원 질문 한국어 설명'],
 ['valid','一人です。','한 명 수용'],['variant','二人です。','두 명으로 달라도 올바른 답 수용'],
 ['question','一人ですか。','질문을 인원 답으로 자동 통과시키지 않기'],
 ['correction','一人をです。','불필요한 조사 구체 교정'],
 ['order','카레 하나 주세요는 뭐라고 해요?','カレーを一つお願いします 안내'],
 ['takeout','持ち帰りでお願いします。','포장 의도 수용'],
 ['water','水をください。','물 요청 수용'],
 ['money','가격이 잘 안 들렸는데 뭐라고 물어요?','もう一度 또는 금액 확인 하나'],
 ['bill','お会計をお願いします。','계산 요청에 응답']
 ]},
 {id:'directions',lesson:'M3-S16',label:'길',prompts:[
 ['meaning','まっすぐ行ってください는 무슨 뜻이에요?','직진 설명'],
 ['valid','まっすぐですね。','방향 확인 수용'],['variant','右ですね。','장면 문맥 확인, 자동 오답 금지'],
 ['question','오른쪽하고 왼쪽은 일본어로 뭐예요?','右/左 짧게 설명'],
 ['correction','駅にどこですか。','駅はどこですか 조사 교정'],
 ['start','駅はどこですか。','학습자 길 질문에 가상 길 응답'],
 ['distance','걸어서 몇 분인지는 어떻게 물어요?','歩いて何分ですか 안내'],
 ['repair-route','다음 모퉁이에서 어디로 가라고 했죠?','이미 준 가상 방향만 재안내'],
 ['confirm','次の角を右ですか。','간단한 확인 의미 우선'],
 ['thanks','ありがとうございます。','감사에 자연스럽게 응답']
 ]},
 {id:'transit',lesson:'M3-S13',label:'교통',prompts:[
 ['meaning','このバスは駅に行きますか는 무슨 뜻이에요?','버스 목적지 질문 설명'],
 ['valid','このバスは駅に行きますか。','방향 질문 수용'],['variant','駅に行きますか。','주어 생략을 불필요하게 교정하지 않기'],
 ['question','버스가 반대 방향이면 뭐라고 해요?','가상 반대 방향 표현 안내'],
 ['correction','このバスは駅を行きますか。','방향 조사 に 교정'],
 ['fare','いくらですか。','가상 운임 응답'],
 ['money','220円ですね。','가상 운임 확인 수용'],
 ['platform','何番線ですか。','가상 승강장 응답'],
 ['stop','次は駅前ですか。','가상 다음 정류장 확인'],
 ['real-route','지금 실제 버스 시간 알려 줄 수 있어요?','실제 조회 없이 시간표 지어내지 않기']
 ]},
 {id:'hotel',lesson:'M4-S19',label:'숙소',prompts:[
 ['meaning','チェックインをお願いします는 무슨 뜻이에요?','체크인 요청 설명'],
 ['valid','チェックインをお願いします。','요청 수용'],['variant','チェックインしたいです。','자연스러운 다른 표현 수용'],
 ['question','예약했어요는 어떻게 말해요?','予約しています 예시'],
 ['correction','予約をあります。','予約があります 활용 교정'],
 ['reservation','はい、予約しています。','가상 예약 응답 수용, 실제 증빙 요청 금지'],
 ['breakfast','朝食は何時からですか。','가상 조식 시간 안내'],
 ['time','7時からですね。','시간 확인 수용'],
 ['luggage','荷物を預けてもいいですか。','짐 맡기기 요청 수용'],
 ['checkout','チェックアウトをお願いします。','체크아웃 요청 수용']
 ]}
];
// Later scenes vary the actual learner question, not just the case identifier.
const sceneCommon={
 directions:['방금 길 안내를 한국어로 풀어서 말해 주실래요?','最後の道案内をもう一度お願いします。','길 설명이 빨라요. 더 느리게 말해 주세요.','길을 물을 때 첫 단어만 알려 주세요.','역을 찾는 질문 예시를 하나 들려주세요.','¿Dónde?','Trenoso','방향을 말하지 못했어요.','자유대화에서는 산책 이야기를 하고 싶어요.','散歩라는 말은 무슨 의미예요?','昨日、公園に行きますでした。','昨日、公園に行きました。','(길 안내 중 인식 불확실)','실제 집 주소로 길 묻기 연습을 해야 해요?','길 찾기 연습은 여기서 마칠게요.'],
 transit:['방금 버스 안내는 한국어로 어떤 뜻인가요?','バスの説明をもう一度お願いします。','버스 안내를 천천히 다시 읽어 주세요.','목적지를 물을 때 첫 단어만 힌트 주세요.','기차역에 가는지 묻는 예문 하나만 주세요.','¿Autobús?','Bahnosu','목적지를 묻는 데 실패했어요.','프리토킹은 좋아하는 여행지로 해 볼까요?','旅行이라는 단어를 한국어로 설명해 주세요.','昨日、電車に乗りますでした。','昨日、電車に乗りました。','(버스 질문 전사 불확실)','실제 교통카드 번호를 알려 드려야 하나요?','교통 연습은 이만 끝내고 싶어요.'],
 hotel:['호텔 직원의 마지막 말을 한국어로 설명해 주세요.','ホテルの説明をもう一度お願いします。','호텔 안내가 어려워요. 느리게 다시 말해 주세요.','체크인 문장의 첫 단어를 힌트로 주세요.','예약했다는 예시 하나만 들어 줄래요?','¿Habitación?','Reservoso','체크인 답을 아직 못했어요.','자유대화는 쉬는 날 이야기로 해도 괜찮아요?','休日라는 일본어는 무슨 뜻이에요?','昨日、家で休みますでした。','昨日、家で休みました。','(숙소 질문이 인식되지 않음)','실제 예약번호를 말하지 않아도 연습할 수 있어요?','오늘 호텔 연습을 그만하고 싶어요.']
};
export const QUESTION_CORPUS=scenes.flatMap(scene=>[...scene.prompts,...common.map((entry,i)=>sceneCommon[scene.id]?[entry[0],sceneCommon[scene.id][i],entry[2]]:entry)].map(([kind,question,rubric],i)=>({id:`${scene.id}-${String(i+1).padStart(2,'0')}`,scene:scene.id,lesson:scene.lesson,kind,question,rubric,phase:i>=18?'free-talk':'scene'})));
export const CORPUS_METADATA={version:2,count:QUESTION_CORPUS.length,uniqueQuestions:new Set(QUESTION_CORPUS.map(q=>q.question)).size,providerCalls:0,actualASR:false,actualModelQuality:false,description:'125 scene cases with 100+ unique learner questions; synthetic output fixtures; UI contract regression only'};
