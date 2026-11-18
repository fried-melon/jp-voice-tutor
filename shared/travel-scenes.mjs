// Fictional practice scripts. Never a real booking, price or route.
export const TRAVEL_SCENES=[
 {id:'shop',label:'편의점',lesson:'M1-S1',steps:[
  {clerk:'ポイントカードはお持ちですか。',goal:'카드가 있는지 답하기',example:'持っていません。'},
  {clerk:'袋はどうしますか。',goal:'봉투 부탁하기',example:'袋をお願いします。'},
  {clerk:'お会計、520円になります。',goal:'연습용 금액 되묻기',example:'520円ですか。'},
  {clerk:'お支払いはどうなさいますか。',goal:'결제 수단 말하기',example:'カードでお願いします。'}]},
 {id:'food',label:'식당 주문',lesson:'M2-S7',steps:[
  {clerk:'何名様ですか。',goal:'인원수 말하기',example:'一人です。'},
  {clerk:'店内でお召し上がりですか。',goal:'매장에서 먹는다고 말하기',example:'はい、店内で。'},
  {clerk:'ご注文はお決まりですか。',goal:'음식 주문하기',example:'カレーを一つお願いします。'},
  {clerk:'お飲み物はいかがですか。',goal:'물 부탁하기',example:'水をお願いします。'},
  {clerk:null,goal:'학습자가 계산 요청하기',example:'お会計をお願いします。'}]},
 {id:'directions',label:'길 묻기',lesson:'M3-S16',steps:[
  {clerk:null,goal:'학습자가 역 위치 묻기',example:'駅はどこですか。'},
  {clerk:'この道をまっすぐ行ってください。',goal:'직진인지 확인하기',example:'まっすぐですか。'},
  {clerk:'はい。次の角を右に曲がってください。',goal:'오른쪽인지 확인하기',example:'右ですね。'},
  {clerk:'はい。駅は左側です。',goal:'감사 인사하기',example:'ありがとうございます。'}]},
 {id:'transit',label:'교통',lesson:'M3-S13',steps:[
  {clerk:null,goal:'학습자가 버스 방향 확인하기',example:'このバスは駅に行きますか。'},
  {clerk:'はい、行きます。',goal:'운임 묻기',example:'いくらですか。'},
  {clerk:'220円です。',goal:'연습용 운임 확인하기',example:'220円ですね。'},
  {clerk:'はい。次は駅前です。',goal:'다음 정류장 확인하기',example:'次は駅前ですか。'}]},
 {id:'hotel',label:'숙소 체크인',lesson:'M4-S19',steps:[
  {clerk:null,goal:'학습자가 체크인 요청하기',example:'チェックインをお願いします。'},
  {clerk:'ご予約はございますか。',goal:'가상 예약이 있다고 답하기',example:'はい、予約しています。'},
  {clerk:'朝食は7時からです。',goal:'조식 시간 확인하기',example:'7時からですね。'},
  {clerk:'はい。ほかにご質問はございますか。',goal:'짐 맡길 수 있는지 묻기',example:'荷物を預けてもいいですか。'}]}
];
export function travelSceneFor(lessonId){
 if(lessonId?.startsWith('M1-'))return TRAVEL_SCENES[0];
 if(lessonId?.startsWith('M2-'))return TRAVEL_SCENES[1];
 if(['M3-S16','M3-S17'].includes(lessonId))return TRAVEL_SCENES[2];
 if(lessonId?.startsWith('M3-'))return TRAVEL_SCENES[3];
 if(lessonId?.startsWith('M4-'))return TRAVEL_SCENES[4];
 return null;
}
export function sceneInstruction(lessonId){const scene=travelSceneFor(lessonId);if(!scene)return '';
 return '\n\n여행 장면 흐름 (가상 연습용 데이터):\n'+JSON.stringify(scene)+'\n선택한 단일 연습으로 시작하되 학습자가 답하면 이 장면의 다른 단계로 이어가세요. 이미 한 단계는 반복하지 않고 4~5번 주고받는 대화를 목표로 합니다. 학습자 개시 단계는 학습자가 먼저 말하도록 한국어로 상황만 제시하세요. 예시 답을 전부 먼저 읽지 마세요. 한 번에 질문은 하나만. 실제 개인정보나 예약 확인 자료는 요구하지 마세요. 클라이언트의 자유대화 신호가 오면 장면이 덜 끝났어도 자유대화로 넘어갑니다.';
}
