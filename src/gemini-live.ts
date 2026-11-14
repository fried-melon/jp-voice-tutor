import {audioBacklogged} from '../shared/live-safety.mjs';
import type {LiveServerMessage} from '@google/genai';
import{MODEL,liveSetup}from'../shared/live-contract.mjs';export{MODEL};
// Wire protocol checked against https://ai.google.dev/api/live . Own the socket
// before setupComplete so cancel/error/timeout can always close it.
export class LiveTutor {
 private socket?:WebSocket;private cancelPending?:()=>void;
 async connect(credential:string,prompt:string,onMessage:(m:LiveServerMessage)=>void,onClose:(code?:number)=>void,onError:()=>void,mode='continuous'){
  const token=credential.startsWith('auth_tokens/');
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  if(!token&&!local)throw Error('A short-lived token is required outside local development');
  const method=token?'BidiGenerateContentConstrained':'BidiGenerateContent';
  const param=token?'access_token':'key';
  await new Promise<void>((resolve,reject)=>{
   let settled=false;const ws=new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.${method}?${param}=${encodeURIComponent(credential)}`);this.socket=ws;
   const fail=()=>{if(!settled){settled=true;clearTimeout(timeout);reject(Error('Live connection did not complete'));}};
   const timeout=setTimeout(()=>{fail();this.close();onError();},15000);
   this.cancelPending=fail;
   ws.onopen=()=>{ws.send(JSON.stringify({setup:liveSetup(prompt,mode)}));};
   ws.onmessage=async event=>{try{
    const raw=typeof event.data==='string'?event.data:await event.data.text();
    if(this.socket!==ws)return;const m=JSON.parse(raw);
    if(m.setupComplete&&!settled){settled=true;clearTimeout(timeout);this.cancelPending=undefined;resolve();}
    if(m.error){fail();this.close();onError();return;}onMessage(m);
   }catch{fail();this.close();onError();}};
   ws.onerror=()=>{fail();this.close();onError();};
   ws.onclose=event=>{fail();if(this.socket===ws){this.socket=undefined;onClose([1000,1001,1002,1003,1005,1006,1007,1008,1009,1010,1011,1012,1013,1015].includes(event.code)?event.code:undefined);}};
  });
 }
 send(message:unknown){const audio=(message as {realtimeInput?:{audio?:unknown}})?.realtimeInput?.audio;if(audio&&this.socket&&audioBacklogged(this.socket.bufferedAmount))return false;if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));return true;}
 begin(){this.send({clientContent:{turns:[{role:'user',parts:[{text:'오늘 연습을 시작합니다. 선택된 단일 연습의 intro 데이터대로 시작 안내를 해 주세요. 먼저 한국어로 오늘 상황·역할·오늘 목표를 짧게 말하고, 점원의 말을 일본어로 한 번, 그 뜻과 예시 답을 들려준 뒤, 준비되면 답해 보라고 안내하고 기다려 주세요. 시스템 지침대로 진행해 주세요.'}]}],turnComplete:true}});}
 recall(text:string){this.send({clientContent:{turns:[{role:'user',parts:[{text}]}],turnComplete:true}});}
 audio(data:string){return this.send({realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}});}
 close(){const ws=this.socket;this.socket=undefined;this.cancelPending?.();this.cancelPending=undefined;if(ws){ws.onmessage=null;ws.onclose=null;ws.onerror=null;ws.onopen=null;ws.close();}}
}
