// Optional offline integration candidate, not mounted by the deployed application.
// No pointer capture escape can leave transmission latched on.
export function bindPressToTalk(button:HTMLButtonElement,actions:{press:()=>Promise<boolean>,release:()=>Promise<void>,failure:(error:unknown)=>void}){
 let active=false,disposed=false,pointer:number|undefined;
 button.setAttribute('aria-pressed','false');
 let pending=Promise.resolve();
 const enqueue=(action:()=>Promise<unknown>)=>{pending=pending.then(action).then(()=>{},error=>{actions.failure(error);});};
 const finish=()=>{if(!active)return;active=false;button.setAttribute('aria-pressed','false');enqueue(actions.release);};
 const start=()=>{if(disposed||button.disabled||active)return;active=true;button.setAttribute('aria-pressed','true');enqueue(async()=>{if(disposed)return;const ok=await actions.press();if(!ok)finish();});};
 const down=(event:PointerEvent)=>{if(event.button!==0||active)return;event.preventDefault();pointer=event.pointerId;try{button.setPointerCapture(pointer);}catch{}start();};
 const up=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;pointer=undefined;finish();};
 const keydown=(event:KeyboardEvent)=>{if(event.key!==' '&&event.key!=='Enter')return;event.preventDefault();if(!event.repeat)start();};
 const keyup=(event:KeyboardEvent)=>{if(event.key!==' '&&event.key!=='Enter')return;event.preventDefault();finish();};
 const hidden=()=>{if(document.hidden)finish();};
 button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',finish);button.addEventListener('keydown',keydown);button.addEventListener('keyup',keyup);button.addEventListener('blur',finish);window.addEventListener('blur',finish);document.addEventListener('visibilitychange',hidden);
 return()=>{disposed=true;finish();button.removeEventListener('pointerdown',down);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',up);button.removeEventListener('lostpointercapture',finish);button.removeEventListener('keydown',keydown);button.removeEventListener('keyup',keyup);button.removeEventListener('blur',finish);window.removeEventListener('blur',finish);document.removeEventListener('visibilitychange',hidden);};
}
