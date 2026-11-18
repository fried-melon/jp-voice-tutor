import {watchPlaybackContext} from '../shared/playback-health.mjs';
// Plain Web Audio playback with the Avatar interface, for devices where the 3D
// avatar cannot load (no WebGL, very old GPU). Same lesson, voice only.
import{playbackJaw}from'../shared/playback-envelope.mjs';import{createInitialFace}from'./initial-face';
export class FallbackAudio {
 private releaseHealth?:()=>void;
 private analyser?:AnalyserNode;private samples?:Float32Array<ArrayBuffer>;private raf=0;
 private ctx?:AudioContext;private streaming=false;private sources:AudioBufferSourceNode[]=[];private playAt=0;private endNotified=false;private turnEnd=false;private idle=true;private onStartCb?:()=>void;private onEndCb?:()=>void;
 async load(_container:HTMLElement){this.ctx=new AudioContext({sampleRate:24000});this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=512;this.analyser.connect(this.ctx.destination);this.samples=new Float32Array(this.analyser.fftSize);}
 getJaw():number{if(!this.streaming||!this.analyser||!this.samples)return 0;this.analyser.getFloatTimeDomainData(this.samples);return playbackJaw(this.samples);}
 mountFace(container:HTMLElement){const update=createInitialFace(container,()=>this.getJaw());const pump=()=>{update();this.raf=requestAnimationFrame(pump);};this.raf=requestAnimationFrame(pump);}
 unlock(){return this.ctx!.resume();}
 async start(onStart:()=>void,onEnd:()=>void,onFailure:()=>void,signal:AbortSignal,onEvent:(event:{event:string;state:string})=>void=()=>{}){
  if(signal.aborted)return;
  if(this.ctx!.state!=='running')throw Error('Playback is not running');
  this.onStartCb=onStart;this.onEndCb=onEnd;this.streaming=true;this.turnEnd=false;this.idle=true;this.playAt=0;
  this.releaseHealth?.();this.releaseHealth=watchPlaybackContext(this.ctx!,{active:()=>this.streaming&&!signal.aborted,onFailure,onEvent});
 }
 audio(pcm:Int16Array){
  if(!this.streaming||!this.ctx)return;
  const buf=this.ctx.createBuffer(1,pcm.length,24000);const ch=buf.getChannelData(0);
  for(let i=0;i<pcm.length;i++)ch[i]=pcm[i]/32768;
  const src=this.ctx.createBufferSource();src.buffer=buf;src.connect(this.analyser??this.ctx.destination);
  const now=this.ctx.currentTime;if(this.playAt<now)this.playAt=now;
  src.start(this.playAt);this.playAt+=buf.duration;
  this.sources.push(src);
  if(this.idle){this.idle=false;this.endNotified=false;this.onStartCb?.();}
  src.onended=()=>{this.sources=this.sources.filter(s=>s!==src);if(this.turnEnd&&this.sources.length===0&&!this.endNotified){this.endNotified=true;this.turnEnd=false;this.idle=true;this.onEndCb?.();}};
 }
 endTurn(){this.turnEnd=true;if(this.sources.length===0&&!this.endNotified){this.endNotified=true;this.turnEnd=false;this.idle=true;this.onEndCb?.();}}
 interrupt(){for(const s of this.sources)try{s.stop();}catch{}this.sources=[];this.playAt=0;this.turnEnd=false;this.idle=true;}
 stop(){this.streaming=false;this.releaseHealth?.();this.releaseHealth=undefined;this.interrupt();}destroy(){this.stop();cancelAnimationFrame(this.raf);}
}
