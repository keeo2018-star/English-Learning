import {VOICE_MAX_SECONDS,voiceMime,type VoiceDraft} from './voice-notes';
export async function inspectVoice(file:File):Promise<VoiceDraft>{
 const mime=voiceMime(file),url=URL.createObjectURL(file);let context:AudioContext|undefined;
 try{
  let duration=await new Promise<number>(resolve=>{
   const audio=new Audio();audio.preload='metadata';const timer=setTimeout(()=>finish(NaN),5000);
   const finish=(value:number)=>{clearTimeout(timer);audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();resolve(value)};
   audio.onloadedmetadata=()=>finish(audio.duration);audio.onerror=()=>finish(NaN);audio.src=url;
  });
  if(!Number.isFinite(duration)||duration<=0){
   const AudioEngine=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!AudioEngine)throw new Error('This browser cannot read that audio format. Try an M4A, MP3 or WAV file.');
   context=new AudioEngine();const decoded=await context.decodeAudioData(await file.arrayBuffer());duration=decoded.duration;
  }
  if(!Number.isFinite(duration)||duration<=0)throw new Error('This audio could not be read. Try another file.');
  if(duration>VOICE_MAX_SECONDS+0.05)throw new Error('Voice notes can be no longer than 30 seconds.');
  return {id:crypto.randomUUID(),file,mime,duration:Math.min(duration,VOICE_MAX_SECONDS)};
 }finally{URL.revokeObjectURL(url);if(context)void context.close().catch(()=>{});}
}
