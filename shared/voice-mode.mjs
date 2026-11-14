// Offline candidate only. Not connected to hosted token mint or UI.
export const VOICE_MODES=Object.freeze(['continuous','push-to-talk']);
export function validateVoiceMode(mode='continuous'){
 if(!VOICE_MODES.includes(mode))throw Error('Invalid voice mode');return mode;
}
export function voiceModeConfig(mode='continuous'){
 return{automaticActivityDetection:{disabled:validateVoiceMode(mode)==='push-to-talk'},activityHandling:'START_OF_ACTIVITY_INTERRUPTS'};
}
// Capture is a pre-authorized stream in memory. No recording/file/API access here.
export function createPushToTalk({send,interruptPlayback}){
 let active=false,closed=false;
 return{
  press(){if(closed||active)return false;interruptPlayback();active=true;send({realtimeInput:{activityStart:{}}});return true;},
  audio(data){if(!active||closed)return false;send({realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}});return true;},
  release(){if(!active||closed)return false;active=false;send({realtimeInput:{activityEnd:{}}});return true;},
  close(){if(active&&!closed){active=false;send({realtimeInput:{activityEnd:{}}});}closed=true;},
 };
}
// Server must derive the constrained setup from a validated field, not trust client setup.
export function constrainedVoiceSetup(baseSetup,requestedMode){
 const mode=validateVoiceMode(requestedMode);return{...baseSetup,realtimeInputConfig:voiceModeConfig(mode)};
}
// PTT controller for integration prep. Flush capture's partial32ms packet BEFORE end.
// Injected methods own mic permission and transport; no real media/API access here.
export function createPushToTalkSession({send,interruptPlayback,flushCapture}){
 const wire=createPushToTalk({send,interruptPlayback});let released=Promise.resolve(),generation=0,pressed=false,stopped=false;
 return{
  async press(){await released;if(stopped||pressed)return false;pressed=wire.press();if(pressed)generation++;return pressed;},
  audio(data){return wire.audio(data);},
  release(){if(!pressed||stopped)return released;pressed=false;const g=generation;released=(async()=>{try{await flushCapture();}catch(e){stopped=true;wire.close();throw e;}if(!stopped&&g===generation)wire.release();})();return released;},
  stop(){stopped=true;generation++;pressed=false;wire.close();},
 };
}
