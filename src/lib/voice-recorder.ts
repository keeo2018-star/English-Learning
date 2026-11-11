export type RecorderPhase='idle'|'preparing'|'ready'|'starting'|'recording'|'finishing';
export type RecorderSnapshot={phase:RecorderPhase;elapsed:number;level:number;noInput:boolean;error:string};
type Options={change:(s:RecorderSnapshot)=>void;complete:(file:File)=>void;maxSeconds?:number;maxBytes?:number};
export class ExpressionRecorder{
 private options:Options;private state:RecorderSnapshot={phase:'idle',elapsed:0,level:0,noInput:false,error:''};private epoch=0;private stream?:MediaStream;private recorder?:MediaRecorder;private context?:AudioContext;private source?:MediaStreamAudioSourceNode;private analyser?:AnalyserNode;private interval?:ReturnType<typeof setInterval>;private timeout?:ReturnType<typeof setTimeout>;private idleTimer?:ReturnType<typeof setTimeout>;private started=0;private wanted=false;
 constructor(options:Options){this.options=options;}
 get phase(){return this.state.phase;}
 private emit(update:Partial<RecorderSnapshot>){this.state={...this.state,...update};this.options.change({...this.state});}
 private clearTimers(){if(this.interval)clearInterval(this.interval);if(this.timeout)clearTimeout(this.timeout);if(this.idleTimer)clearTimeout(this.idleTimer);this.interval=undefined;this.timeout=undefined;this.idleTimer=undefined;}
 private release(){this.clearTimers();this.source?.disconnect();this.source=undefined;this.analyser=undefined;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop()});this.stream=undefined;const context=this.context;this.context=undefined;if(context)void context.close().catch(()=>{});}
 private makeRecorder(media:MediaStream){const mime=typeof MediaRecorder.isTypeSupported==='function'?['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t)):undefined;return new MediaRecorder(media,mime?{mimeType:mime}:undefined);}
 async prepare(){
  if(!['idle'].includes(this.phase))return;const epoch=++this.epoch;this.emit({phase:'preparing',error:'',elapsed:0,level:0,noInput:false});
  // Resume from the explicit gesture, before permission awaits (iOS requirement).
  let context:AudioContext|undefined;try{const Engine=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(Engine){context=new Engine();this.context=context;void context.resume().catch(()=>{});}}catch{/* Meter is optional; recording still works. */}
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(epoch!==this.epoch){media.getTracks().forEach(t=>t.stop());if(context)void context.close().catch(()=>{});return;}
   this.stream=media;this.context=context;this.recorder=this.makeRecorder(media); // codec/constructor readiness; never starts capture after a permission dialog.
   try{if(context){this.source=context.createMediaStreamSource(media);const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=90;this.analyser=context.createAnalyser();this.analyser.fftSize=1024;this.source.connect(high);high.connect(this.analyser);}}catch{/* No meter on unsupported engines. */}
   media.getTracks().forEach(t=>{t.onended=()=>{if(['recording','starting'].includes(this.phase))this.end();else this.cancel();}});
   this.emit({phase:'ready'});this.idleTimer=setTimeout(()=>this.cancel(),20000);
  }catch(e){if(context)void context.close().catch(()=>{});if(epoch!==this.epoch)return;this.release();this.emit({phase:'idle',error:e instanceof DOMException&&['NotAllowedError','SecurityError'].includes(e.name)?'Microphone access was not allowed. Upload audio instead.':'Recording is unavailable. Upload audio instead.'});}
 }
 begin(){
  if(this.phase!=='ready'||!this.recorder||!this.stream)return;
  this.clearTimers();const rec=this.recorder,media=this.stream,epoch=this.epoch,chunks:Blob[]=[];let bytes=0;this.wanted=true;this.emit({phase:'starting',error:'',elapsed:0,level:0,noInput:false});
  const fail=(message:string)=>{if(epoch!==this.epoch)return;this.epoch++;this.wanted=false;try{if(rec.state==='recording')rec.stop();}catch{}this.release();this.emit({phase:'idle',error:message});};
  rec.ondataavailable=e=>{if(epoch!==this.epoch)return;if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>(this.options.maxBytes??8388608))fail('Recording exceeded 8 MB. Try a shorter clip.');}};
  rec.onerror=()=>fail('Recording was interrupted. Please try again.');
  rec.onstart=()=>{
   if(epoch!==this.epoch||!this.wanted){try{if(rec.state==='recording')rec.stop();}catch{}return;}
   if(this.timeout)clearTimeout(this.timeout);this.started=performance.now();this.emit({phase:'recording'});
   const data=new Float32Array(this.analyser?.fftSize||1024);let lastInput=this.started;
   this.interval=setInterval(()=>{if(epoch!==this.epoch)return;const elapsed=(performance.now()-this.started)/1000;let level=0;
    if(this.analyser){try{this.analyser.getFloatTimeDomainData(data);let sum=0;for(const x of data)sum+=x*x;level=Math.sqrt(sum/data.length);if(level>.0002)lastInput=performance.now();}catch{this.analyser=undefined;}}
    this.emit({elapsed,level:Math.min(1,Math.sqrt(level)*3),noInput:!!this.analyser&&performance.now()-lastInput>2000});
    if(elapsed>=(this.options.maxSeconds??30)-.5)this.end();
   },80);
  };
  rec.onstop=()=>{
   // Old callbacks may only release their own stream, never a new recording.
   media.getTracks().forEach(t=>t.stop());if(epoch!==this.epoch)return;this.epoch++;this.release();this.wanted=false;this.emit({phase:'idle',level:0});
   if(!bytes){this.emit({error:'No audio was captured. Try again.'});return;}
   const mime=(rec.mimeType||chunks[0]?.type||'').split(';')[0];if(!mime){this.emit({error:'Recording format unavailable. Upload audio instead.'});return;}
   this.options.complete(new File(chunks,'voice-note.'+(mime.includes('mp4')?'m4a':mime.includes('wav')?'wav':'webm'),{type:mime}));
  };
  this.timeout=setTimeout(()=>fail('Microphone did not start. Please try again.'),5000);
  try{rec.start();}catch{fail('Recording could not start. Please try again.');}
 }
 end(){
  if(this.phase==='preparing'){this.cancel();return;}
  if(!['starting','recording'].includes(this.phase))return;this.wanted=false;this.clearTimers();this.emit({phase:'finishing',level:0});
  const rec=this.recorder,epoch=this.epoch;
  this.timeout=setTimeout(()=>{if(epoch!==this.epoch)return;this.cancel();this.emit({error:'Recording could not finish. Please try again.'});},5000);
  try{if(rec?.state==='recording')rec.stop();else if(!rec)this.cancel();}catch{this.cancel();this.emit({error:'Recording could not finish. Please try again.'});}
 }
 cancel(){this.epoch++;this.wanted=false;const rec=this.recorder;this.recorder=undefined;try{if(rec?.state==='recording')rec.stop();}catch{}this.release();this.emit({phase:'idle',elapsed:0,level:0,noInput:false,error:''});}
 dispose(){this.cancel();}
}
