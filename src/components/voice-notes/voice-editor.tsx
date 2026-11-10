"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {inspectVoice} from '@/lib/voice-file';
import {VOICE_MAX_BYTES,voiceError,type VoiceDraft} from '@/lib/voice-notes';
import {pauseContextVideos} from '@/lib/learning-media';
import {stopPronunciation} from '@/lib/pronunciation';
import {VoicePlayer} from './voice-player';
import styles from './voice-notes.module.css';
const subscribe=()=>()=>{};
const supported=()=>typeof window!=='undefined'&&typeof MediaRecorder!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
export function Microphone(){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>}
export function VoiceEditor({draft,onDraft,onBusy,disabled=false}:{draft:VoiceDraft|null;onDraft:(value:VoiceDraft|null)=>void;onBusy?:(value:boolean)=>void;disabled?:boolean}){
 const canRecord=useSyncExternalStore(subscribe,supported,()=>false);
 const [recording,setRecording]=useState(false),[requesting,setRequesting]=useState(false),[reading,setReading]=useState(false),[elapsed,setElapsed]=useState(0),[error,setError]=useState(''),[preview,setPreview]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),generation=useRef(0),alive=useRef(true),started=useRef(0),permissionPending=useRef(false),finishing=useRef(false),stopDelay=useRef<ReturnType<typeof setTimeout>|null>(null),finishTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 const draftCallback=useRef(onDraft),busyCallback=useRef(onBusy);useEffect(()=>{draftCallback.current=onDraft;busyCallback.current=onBusy;},[onDraft,onBusy]);
 const release=useCallback(()=>{if(timer.current)clearInterval(timer.current);timer.current=null;if(stopDelay.current)clearTimeout(stopDelay.current);stopDelay.current=null;if(finishTimeout.current)clearTimeout(finishTimeout.current);finishTimeout.current=null;finishing.current=false;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;},[]);
 const stop=useCallback(()=>{
  permissionPending.current=false;const rec=recorder.current;
  if(finishing.current&&alive.current)return;
  if(rec?.state==='recording'){
   finishing.current=true;if(timer.current)clearInterval(timer.current);timer.current=null;
   if(alive.current){setRecording(false);setRequesting(false);setReading(true);busyCallback.current?.(true);}
   const finish=()=>{stopDelay.current=null;try{if(rec.state==='recording')rec.stop();}catch{generation.current++;release();if(alive.current){setReading(false);busyCallback.current?.(false);setError('The recording could not finish. Please try recording again.');}}};
   // Give a newly started encoder a small capture window. Never stop microphone
   // tracks until its final dataavailable/stop events have flushed the container.
   const remaining=alive.current?Math.max(0,600-(performance.now()-started.current)):0;
   finishTimeout.current=setTimeout(()=>{if(recorder.current!==rec)return;generation.current++;release();if(alive.current){setReading(false);busyCallback.current?.(false);setError('The recording could not finish. Please try recording again.');}},5000);
   if(remaining)stopDelay.current=setTimeout(finish,remaining);else finish();
   if(!alive.current)release();
  }else{release();if(alive.current){setRecording(false);setRequesting(false);}busyCallback.current?.(false);}
 },[release]);
 function cancel(){generation.current++;if(recorder.current?.state==='recording')recorder.current.stop();release();recorder.current=null;setReading(false);busyCallback.current?.(false);}
 useEffect(()=>{const requestGeneration=generation;alive.current=true;queueMicrotask(()=>{if(alive.current){setRecording(false);setRequesting(false);setReading(false);busyCallback.current?.(false);}});const interrupted=()=>{if(recorder.current?.state==='recording'){stop();setError('Recording stopped when the app was interrupted. Preview it before saving.');}else if(permissionPending.current){generation.current++;release();setRequesting(false);busyCallback.current?.(false);}};const hidden=()=>{if(document.hidden)interrupted();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',interrupted);return()=>{alive.current=false;requestGeneration.current++;stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',interrupted);};},[stop,release]);
 useEffect(()=>{if(!draft)return;const url=URL.createObjectURL(draft.file);queueMicrotask(()=>{if(alive.current)setPreview(url)});return()=>{URL.revokeObjectURL(url);};},[draft]);
 async function inspect(file:File,token:number){setReading(true);busyCallback.current?.(true);try{const value=await inspectVoice(file);if(alive.current&&generation.current===token){draftCallback.current(value);setError('');}}catch(e){if(alive.current&&generation.current===token)setError(voiceError(e));}finally{if(alive.current&&generation.current===token){setReading(false);busyCallback.current?.(false);}}}
 async function record(){
  if(!canRecord||disabled)return;const token=++generation.current;setError('');setRequesting(true);permissionPending.current=true;busyCallback.current?.(true);stopPronunciation();pauseContextVideos();
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current||generation.current!==token){media.getTracks().forEach(track=>track.stop());return;}
   permissionPending.current=false;stream.current=media;
   const mime=typeof MediaRecorder.isTypeSupported==='function'?['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type)):undefined;
   const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;const chunks:BlobPart[]=[];let bytes=0;
   rec.ondataavailable=event=>{if(!alive.current||generation.current!==token)return;if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>VOICE_MAX_BYTES){setError('Recording exceeded 8 MB. Please record a shorter clip.');generation.current++;stop();release();setReading(false);busyCallback.current?.(false);}}};
   rec.onerror=()=>{if(!alive.current||generation.current!==token)return;setError('Recording was interrupted. Try again or upload audio.');generation.current++;stop();release();setReading(false);busyCallback.current?.(false);};
   rec.onstop=()=>{media.getTracks().forEach(track=>track.stop());if(recorder.current===rec)release();if(!alive.current||generation.current!==token)return;setRecording(false);setRequesting(false);if(!bytes){setReading(false);busyCallback.current?.(false);setError('No audio was captured. Please try again and wait for the recording indicator before speaking.');return;}const actual=rec.mimeType||mime||(chunks[0] instanceof Blob?chunks[0].type:'');if(!actual){setReading(false);busyCallback.current?.(false);setError('Recording format is unavailable. Upload an M4A, MP3 or WAV instead.');return;}const type=actual.split(';')[0];const file=new File(chunks,'voice-note.'+(type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm'),{type});void inspect(file,token);};
   media.getTracks().forEach(track=>{track.onended=()=>{if(rec.state==='recording')stop();};});
   rec.onstart=()=>{if(!alive.current||generation.current!==token){if(rec.state==='recording')rec.stop();media.getTracks().forEach(track=>track.stop());return;}started.current=performance.now();setElapsed(0);setRequesting(false);setRecording(true);timer.current=setInterval(()=>{const seconds=(performance.now()-started.current)/1000;if(alive.current)setElapsed(Math.min(30,Math.floor(seconds)));if(seconds>=29.5)stop();},100);};
   rec.start();
  }catch(e){release();if(alive.current&&generation.current===token){permissionPending.current=false;setRequesting(false);setRecording(false);busyCallback.current?.(false);setError(e instanceof DOMException&&['NotAllowedError','SecurityError'].includes(e.name)?'Microphone access was not allowed. You can still upload audio.':'Recording is unavailable on this device. You can upload audio instead.');}}
 }
 return <div className={styles.editor}>
  <p className={styles.help}>Save how this expression sounds. Short clips welcome · up to 30 seconds / 8 MB. Wait for the recording indicator before speaking.</p>
  {!recording&&!requesting&&!reading&&<div className={styles.actions}><button type="button" className="secondary" disabled={disabled||!canRecord} onClick={()=>void record()}><Microphone/>{draft?'Record again':'Record audio'}</button><label className={`wb-control wb-control-outline ${styles.upload}`}>Upload audio<input aria-label="Upload audio" type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.flac" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file){const token=++generation.current;setError('');stopPronunciation();void inspect(file,token);}}}/></label></div>}
  {!canRecord&&!requesting&&<p className={styles.help}>Recording is not supported here. Upload an audio file instead.</p>}
  {requesting&&<div className={styles.actions}><span role="status">Starting microphone…</span><button type="button" className="secondary" onClick={cancel}>Cancel recording</button></div>}
  {recording&&<div className={styles.actions}><span className={styles.indicator} aria-hidden="true"/><span role="status">Recording · 0:{String(elapsed).padStart(2,'0')}</span><button type="button" onClick={stop}>Stop recording</button></div>}
  {reading&&<p role="status">Preparing audio…</p>}
  {draft&&preview&&!recording&&!reading&&<><VoicePlayer url={preview} label="Preview recording"/><button type="button" className="text-button" disabled={disabled} onClick={()=>{cancel();onDraft(null);setPreview('');setError('');}}>Discard recording</button></>}
  {error&&<p role="status" className={styles.help}>{error}</p>}
 </div>;
}
