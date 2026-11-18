import {watchPlaybackContext} from '../shared/playback-health.mjs';
import {playbackJaw} from '../shared/playback-envelope.mjs';
import {createMascot} from './mascot';
import {createInitialFace} from './initial-face';
// TalkingHead is loaded from a pinned, MIT-licensed upstream revision.
const ROOT=new URL('vendor/talkinghead/',document.baseURI).href;
export class Avatar {
 private releaseHealth?:()=>void;
 private analyser?:AnalyserNode;private samples?:Float32Array<ArrayBuffer>;private pending:Promise<void>=Promise.resolve();private head: any; private elapsed=0; private streaming=false;private updateMascot?:()=>void;
 async load(container:HTMLElement){
  const {TalkingHead}=await import(/* @vite-ignore */ ROOT+'talkinghead.mjs');
  const mode=import.meta.env.VITE_FACE_MODE||(import.meta.env.VITE_INITIAL_2D_FACE==='true'?'2d':'mascot');
  const view=mode==='human3d'
    ?{cameraView:'head',cameraDistance:1.4,cameraY:0.35,lightAmbientIntensity:1.1,lightDirectIntensity:16}
    :{cameraView:'upper',cameraDistance:0.1};
  this.head=new TalkingHead(container,{...view,cameraRotateEnable:false,cameraZoomEnable:false,cameraPanEnable:false,lipsyncModules:[],avatarMood:'happy',modelFPS:30,update:()=>this.updateMascot?.()});
  // The scene is not a 3D editor: gestures must scroll the page, never orbit.
  this.head.controls.enabled=false;
  this.head.renderer.domElement.style.pointerEvents='none';
  const shino=import.meta.env.VITE_AVATAR_SHINO==='true';
  // MPFB example is CC0, unlike several non-commercial-only sample avatars.
  let avatarOk=true;
  try{
    if(shino){
      this.head.opt.cameraY=0.95;this.head.opt.cameraDistance=2.2;
      const adapter=await import(/* @vite-ignore */ new URL('shino-adapter.mjs',document.baseURI).href);
      const response=await fetch(new URL('shino-reference.json',document.baseURI));
      if(!response.ok)throw Error('Avatar reference unavailable');
      const reference=await response.json();adapter.configureShino(this.head);
      await this.head.showAvatar({url:new URL('avatar-shino.glb',document.baseURI).href,body:'F',avatarMood:'happy',lipsyncLang:'en'},null,(gltf:any)=>adapter.prepareShino(gltf,reference));
      adapter.finalizeShino(this.head);
    }else await this.head.showAvatar({url:new URL(import.meta.env.VITE_AVATAR_PREVIEW==='true'?'avatar-hosting-preview.glb':'avatar.glb',document.baseURI).href,body:'F',avatarMood:'happy',lipsyncLang:'en'});
  }catch(err){/* Model failed: tear down the renderer and let main.ts fall back to FallbackAudio (plain Web Audio + 2D clerk). A half-loaded head cannot own playback safely. */try{this.head.stop();}catch{}container.querySelectorAll('canvas').forEach(c=>c.remove());throw err;}
  const getJaw=()=>{if(!this.streaming||!this.analyser||!this.samples)return 0;this.analyser.getFloatTimeDomainData(this.samples);return playbackJaw(this.samples);};
  if(mode==='human3d'&&avatarOk){/* bare realistic face: TalkingHead canvas stays visible */}
  else if(mode==='mascot'&&avatarOk)this.updateMascot=await createMascot(this.head,getJaw);
  else{container.querySelectorAll('canvas').forEach(c=>c.style.visibility='hidden');this.updateMascot=createInitialFace(container,getJaw);}
 }
 unlock(){if(this.head.audioCtx.sampleRate!==24000)this.head.initAudioGraph(24000);return this.head.audioCtx.resume();}
 async start(onStart:()=>void,onEnd:()=>void,onFailure:()=>void,signal:AbortSignal,onEvent:(event:{event:string;state:string})=>void=()=>{}){
  const previous=this.pending;let release!:()=>void;this.pending=new Promise<void>(r=>release=r);
  await previous;
  try{if(signal.aborted)return;await this.head.streamStart({sampleRate:24000,lipsyncType:'blendshapes',waitForAudioChunks:true},onStart,()=>{this.elapsed=0;onEnd();});
   if(signal.aborted){this.stop();return;}if(this.head.audioCtx.state!=='running')throw Error('Playback is not running');
   this.releaseHealth?.();this.releaseHealth=watchPlaybackContext(this.head.audioCtx,{active:()=>this.streaming&&!signal.aborted,onFailure,onEvent});this.analyser=this.head.audioAnalyzerNode;if(this.analyser){this.analyser.fftSize=512;this.samples=new Float32Array(this.analyser.fftSize);}this.streaming=true;this.elapsed=0;
  }finally{release();}
 }

 audio(pcm:Int16Array){
  if(!this.streaming)return;
  const dt:number[]=[];const jaw:number[]=[];
  for(let i=0;i<pcm.length;i+=480){const block=pcm.subarray(i,Math.min(i+480,pcm.length));let sum=0;for(const n of block)sum+=(n/32768)**2;dt.push(block.length/24);jaw.push(Math.min(.65,Math.sqrt(sum/block.length)*3.5));}
  this.head.streamAudio({audio:pcm,anims:[{name:'blendshapes',delay:this.elapsed,dt,vs:{jawOpen:jaw}}]});
  this.elapsed+=pcm.length/24;
 }
 endTurn(){this.head?.streamNotifyEnd();}
 interrupt(){if(this.streaming)this.head.streamInterrupt();this.elapsed=0;}
 stop(){this.streaming=false;this.releaseHealth?.();this.releaseHealth=undefined;this.head?.streamInterrupt();this.elapsed=0;this.head?.streamStop();}
}
