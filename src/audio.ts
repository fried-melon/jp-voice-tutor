export function pcmBase64(buffer: ArrayBuffer): string {
 let s=''; for(const byte of new Uint8Array(buffer)) s+=String.fromCharCode(byte); return btoa(s);
}
export function decodePCM(data: string): Int16Array {
 const raw=atob(data); const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const view=new DataView(bytes.buffer); const pcm=new Int16Array(bytes.length/2);
 for(let i=0;i<pcm.length;i++) pcm[i]=view.getInt16(i*2,true); return pcm;
}
export class Microphone {
 private stream?: MediaStream; private context?: AudioContext; private node?: AudioWorkletNode; private source?: MediaStreamAudioSourceNode;
 private flushSequence=0;private flushWaiters=new Map<number,()=>void>();
 private prepared?:Promise<void>;
 async flush(pause=false){
  if(!this.node)return;const id=++this.flushSequence;
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{this.flushWaiters.delete(id);reject(Error('Capture flush timeout'));},1000);this.flushWaiters.set(id,()=>{clearTimeout(timeout);resolve();});this.node!.port.postMessage({type:'flush',id,pause});});
 }

 setCaptureActive(active:boolean){this.node?.port.postMessage({type:'active',value:active,id:0});}
 // Must be called synchronously in the Start gesture. Does not request microphone.
 prepare(){
  if(this.context&&this.context.state!=='closed')return;
  this.context=new AudioContext();this.prepared=this.context.resume();void this.prepared.catch(()=>{});
 }
 async start(onAudio: (data:string)=>void,signal:AbortSignal,onFailure:()=>void,captureActive=true) {
  if(signal.aborted)return;
  this.prepare();const context=this.context!;const resume=this.prepared!;
  signal.addEventListener('abort',()=>this.stop(),{once:true});context.onstatechange=()=>{if(!signal.aborted&&context.state!=='running')onFailure();};
  try {
  const request=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});void request.then(s=>{if(signal.aborted)s.getTracks().forEach(t=>t.stop());},()=>{});
  this.stream=await Promise.race([request,new Promise<MediaStream>((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});if(signal.aborted)reject(Error('Cancelled'));})]);
   if(signal.aborted){this.stop();return;}for(const track of this.stream.getTracks()){track.onended=()=>{if(!signal.aborted)onFailure();};track.onmute=()=>{if(!signal.aborted)onFailure();};}
   await Promise.race([resume,new Promise((_,reject)=>setTimeout(()=>reject(Error('Microphone resume timeout')),3000))]);
   await context.audioWorklet.addModule(new URL('mic-worklet.js',document.baseURI).href);
   if(signal.aborted){this.stop();return;}this.node=new AudioWorkletNode(context,'pcm16-capture');if(!captureActive)this.node.port.postMessage({type:'active',value:false,id:0});
   this.node.port.onmessage=e=>{if(e.data instanceof ArrayBuffer)onAudio(pcmBase64(e.data));else if(e.data?.type==='flushed'){this.flushWaiters.get(e.data.id)?.();this.flushWaiters.delete(e.data.id);}};
   this.source=context.createMediaStreamSource(this.stream); this.source.connect(this.node);
   const silent=context.createGain();silent.gain.value=0;this.node.connect(silent).connect(context.destination);
  }catch(e){this.stop();throw e;}
 }
 stop(){for(const done of this.flushWaiters.values())done();this.flushWaiters.clear();this.node?.port.close();this.node?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());if(this.context&&this.context.state!=='closed'){this.context.onstatechange=null;void this.context.close();}this.stream=undefined;this.context=undefined;this.prepared=undefined;}
}
