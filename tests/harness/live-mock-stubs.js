window.__log = [];
const zeros = new Uint8Array(4800);
let bin = '';
for (const b of zeros) bin += String.fromCharCode(b);
window.__silence = btoa(bin);

function serverMsg(obj) {
  return { data: JSON.stringify({ serverContent: obj }) };
}

class FakeWS {
  get bufferedAmount() { return window.__harnessBacklog ? 1e9 : 0; }
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    window.__log.push('ws:new');
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 20);
  }
  send(msg) {
    window.__log.push('ws:send');
    const m = JSON.parse(msg);
    if (m.setup) {
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
      }, 30);
    } else if (m.clientContent || (m.realtimeInput && m.realtimeInput.activityEnd)) {
      const recallInstr = m.clientContent && (m.clientContent.turns || []).some(t => (t.parts || []).some(p => (p.text || '').includes('복습 한 번만')));
      if (recallInstr) {
        const mode = window.__harnessRecall || 'match';
        const q = serverMsg({ outputTranscription: { text: '복습을 시작할게요.' } });
        setTimeout(() => { if (this.onmessage) this.onmessage(q); }, 60);
        if (mode === 'modeled') {
          setTimeout(() => { if (this.onmessage) this.onmessage(serverMsg({ outputTranscription: { text: 'ポイントカード입니다.' } })); }, 100);
          setTimeout(() => { if (this.onmessage) this.onmessage(serverMsg({ inputTranscription: { text: 'ポイントカード' } })); }, 150);
        } else if (mode === 'match') {
          setTimeout(() => { if (this.onmessage) this.onmessage(serverMsg({ inputTranscription: { text: 'ポイントカード' } })); }, 120);
        }
        setTimeout(() => { if (this.onmessage) this.onmessage(serverMsg({ turnComplete: true })); }, 220);
        return;
      }
      if (window.__harnessNoReply) return;
      const audioTurn = serverMsg({
        modelTurn: { parts: [{ inlineData: { data: window.__silence, mimeType: 'audio/pcm;rate=24000' } }] },
        outputTranscription: { text: 'いらっしゃいませ。今日はコンビニの練習です。' }
      });
      const moreText = serverMsg({ outputTranscription: { text: ' こんにちは、と言ってみましょう。' } });
      const done = serverMsg({ turnComplete: true });
      setTimeout(() => { if (this.onmessage) this.onmessage(audioTurn); }, 60);
      setTimeout(() => { if (this.onmessage) this.onmessage(moreText); }, 110);
      setTimeout(() => { if (this.onmessage) this.onmessage(done); }, 160);
      if (window.__harnessInterrupt) setTimeout(() => { if (this.onmessage) this.onmessage(serverMsg({ interrupted: true })); }, 500);
    }
  }
  close() {
    this.readyState = 3;
    window.__log.push('ws:close');
    if (this.onclose) this.onclose({ code: 1000 });
  }
}
FakeWS.OPEN = 1;
FakeWS.CONNECTING = 0;
FakeWS.CLOSING = 2;
FakeWS.CLOSED = 3;
window.WebSocket = FakeWS;

const actx = new (window.AudioContext || window.webkitAudioContext)();
const dest = actx.createMediaStreamDestination();
navigator.mediaDevices.getUserMedia = async () => {
  window.__log.push('gum:stubbed');
  return dest.stream;
};
return 'stubs-installed';
