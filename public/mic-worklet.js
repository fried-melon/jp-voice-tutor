/* Windowed-sinc low-pass fractional resampler. 128 taps, 7 kHz cutoff,
 * 1024 fractional phases; 512 PCM16 samples per 32 ms packet. */
class PCM16Capture extends AudioWorkletProcessor {
 constructor(){super();this.active=true;this.position=0;this.next=0;this.ring=new Float32Array(256);this.samples=new Int16Array(512);this.index=0;
  this.port.onmessage=event=>{
   if(event.data?.type==='active'){
    this.active=Boolean(event.data.value);this.position=0;this.next=0;this.ring.fill(0);this.index=0;
    this.port.postMessage({type:'active-set',id:event.data.id});return;
   }
   if(event.data?.type==='flush'){
   if(event.data.pause)this.active=false;
   if(this.index){const tail=this.samples.slice(0,this.index);this.port.postMessage(tail.buffer,[tail.buffer]);this.samples=new Int16Array(512);this.index=0;}
   this.port.postMessage({type:'flushed',id:event.data.id});
  }};
  this.table=[];const cutoff=Math.min(7000/sampleRate,.45);
  for(let phase=0;phase<=1024;phase++){const coefficients=new Float64Array(128);let norm=0;
   for(let k=0;k<128;k++){const x=k-63+phase/1024;const a=2*cutoff*x;const sinc=a===0?1:Math.sin(Math.PI*a)/(Math.PI*a);const w=.42-.5*Math.cos(2*Math.PI*k/127)+.08*Math.cos(4*Math.PI*k/127);coefficients[k]=2*cutoff*sinc*w;norm+=coefficients[k];}
   for(let k=0;k<128;k++)coefficients[k]/=norm;this.table.push(coefficients);
  }
 }
 process(inputs){if(!this.active)return true;const channel=inputs[0]?.[0];if(!channel)return true;
  for(const value of channel){const n=this.position++;this.ring[n%256]=value;
   if(n>=Math.floor(this.next)){const base=Math.floor(this.next);const fraction=this.next-base;const c=this.table[Math.round(fraction*1024)];let s=0;
    for(let k=0;k<128;k++){const at=base-k;if(at>=0)s+=this.ring[at%256]*c[k];}
    this.next+=sampleRate/16000;s=Math.max(-1,Math.min(1,s));this.samples[this.index++]=Math.round(s*(s<0?32768:32767));
    if(this.index===512){this.port.postMessage(this.samples.buffer,[this.samples.buffer]);this.samples=new Int16Array(512);this.index=0;}
   }
  }return true;
 }
}
registerProcessor('pcm16-capture',PCM16Capture);
