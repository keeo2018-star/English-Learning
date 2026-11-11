import {inspectVoice} from './voice-file';
import {VOICE_MAX_BYTES,VOICE_MAX_SECONDS,voiceMime,type VoiceDraft} from './voice-notes';
import {voiceActivity,encodeVoiceWav} from './voice-activity';
export type ProcessedVoice={original:VoiceDraft;trimmed?:VoiceDraft;status:'trimmed'|'original'|'uncertain'|'silence'|'unsupported'};
export async function processVoice(file:File):Promise<ProcessedVoice>{
 const mime=voiceMime(file);let context:AudioContext|undefined;
 try{
  const Engine=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Engine)throw new Error('No decoder');
  context=new Engine();const decoded=await context.decodeAudioData(await file.arrayBuffer());
  if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>VOICE_MAX_SECONDS+.05)throw new Error('Invalid duration');
  // Decode once. Both duration and the newly encoded WAV come from real samples,
  // avoiding repeated HTMLAudio metadata waits and a second decode on iPhone.
  const original:VoiceDraft={id:crypto.randomUUID(),file,mime,duration:Math.min(decoded.duration,VOICE_MAX_SECONDS)};
  if(decoded.numberOfChannels<1||decoded.numberOfChannels>2)return {original,status:'unsupported'};
  const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
  const activity=voiceActivity(channels,decoded.sampleRate);
  if(activity.kind!=='speech')return {original,status:activity.kind};
  if(activity.start<.15&&decoded.duration-activity.end<.15)return {original,status:'original'};
  const start=Math.floor(activity.start*decoded.sampleRate),end=Math.min(decoded.length,Math.ceil(activity.end*decoded.sampleRate));
  if((end-start)*channels.length*2+44>VOICE_MAX_BYTES||end<=start)return {original,status:'unsupported'};
  const bytes=encodeVoiceWav(channels,decoded.sampleRate,start,end);
  const trimmed:VoiceDraft={id:crypto.randomUUID(),file:new File([bytes],'voice-note.wav',{type:'audio/wav'}),mime:'audio/wav',duration:(end-start)/decoded.sampleRate};
  return {original,trimmed,status:'trimmed'};
 }catch{return {original:await inspectVoice(file),status:'unsupported'};}finally{if(context)void context.close().catch(()=>{});}
}
