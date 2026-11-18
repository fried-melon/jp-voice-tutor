// Audio lifecycle only. Never accepts media, transcripts or identity data.
/** @param {any} ctx @param {{active?:()=>boolean,onFailure?:()=>void,onEvent?:(event:any)=>void,timeoutMs?:number}} options */
export function watchPlaybackContext(ctx,{active=()=>false,onFailure=()=>{},onEvent=(_event)=>{},timeoutMs=1500}={}){
 let disposed=false,recovering=false,failed=false,timer;
 const emit=event=>onEvent({event,state:['running','suspended','interrupted','closed'].includes(ctx.state)?ctx.state:'other'});
 function fail(){if(disposed||failed||!active())return;failed=true;clearTimeout(timer);emit('resume-failed');onFailure();}
 const change=()=>{
  if(disposed||!active())return;emit('state');
  if(ctx.state==='running'){clearTimeout(timer);recovering=false;return;}
  if(ctx.state==='closed'){fail();return;}
  if(recovering)return;
  // Safari route changes can transiently suspend/interupt output. Try once,
  // bounded. A failed resume still ends the session rather than hiding silence.
  recovering=true;emit('resume-attempt');timer=setTimeout(fail,timeoutMs);
  Promise.resolve().then(()=>ctx.resume()).then(()=>{if(disposed||!active())return;if(ctx.state==='running'){clearTimeout(timer);recovering=false;emit('resumed');}},()=>{clearTimeout(timer);fail();});
 };
 ctx.onstatechange=change;
 return()=>{disposed=true;clearTimeout(timer);if(ctx.onstatechange===change)ctx.onstatechange=null;};
}
export function createAudioDiagnostics(clock=()=>performance.now()){
 const start=clock();const events=[];const counts={audioChunks:0,serverInterruptions:0,turns:0};
 return{
  event(event,state){if(!['playback-start','playback-end','state','resume-attempt','resumed','resume-failed','server-interruption','turn-complete','session-start','session-stop'].includes(event))return;
   if(event==='server-interruption')counts.serverInterruptions++;if(event==='turn-complete')counts.turns++;
   events.push({ms:Math.max(0,Math.round(clock()-start)),event,...(state?{state:['running','suspended','interrupted','closed'].includes(state)?state:'other'}:{})});if(events.length>64)events.shift();},
  chunk(){counts.audioChunks++;},snapshot(){return {version:1,counts:{...counts},events:events.map(e=>({...e}))};}
 };
}
