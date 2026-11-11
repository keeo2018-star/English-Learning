"use client";
import {useEffect,useRef,useState,useSyncExternalStore,useId,type ReactNode} from 'react';
import {inspectVoice} from '@/lib/voice-file';
import {voiceError,type VoiceDraft} from '@/lib/voice-notes';
import {processVoice,type ProcessedVoice} from '@/lib/voice-processing';
import {ExpressionRecorder,type RecorderSnapshot} from '@/lib/voice-recorder';
import {pauseContextVideos} from '@/lib/learning-media';
import {stopPronunciation} from '@/lib/pronunciation';
import {VoicePlayer} from './voice-player';
import styles from './voice-notes.module.css';
const subscribe=()=>()=>{};
const supported=()=>typeof window!=='undefined'&&typeof MediaRecorder!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
const idle:RecorderSnapshot={phase:'idle',elapsed:0,level:0,noInput:false,error:''};
export function Microphone(){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>}
export function VoiceEditor({draft,onDraft,onBusy,disabled=false,saveAction}:{draft:VoiceDraft|null;onDraft:(value:VoiceDraft|null)=>void;onBusy?:(value:boolean)=>void;disabled?:boolean;saveAction?:ReactNode}){
 const statusId=useId();
 const canRecord=useSyncExternalStore(subscribe,supported,()=>false);
 const [snapshot,setSnapshot]=useState(idle),[processing,setProcessing]=useState(false),[editing,setEditing]=useState(!draft),[tap,setTap]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<ProcessedVoice|null>(null),[preview,setPreview]=useState('');
 const controller=useRef<ExpressionRecorder|null>(null),alive=useRef(true),version=useRef(0),pointer=useRef<number|null>(null),button=useRef<HTMLButtonElement|null>(null);
 const callbacks=useRef({onDraft,onBusy});useEffect(()=>{callbacks.current={onDraft,onBusy};},[onDraft,onBusy]);
 const awaitingChoice=!!result&&['uncertain','silence'].includes(result.status);
 const busy=processing||awaitingChoice||['preparing','starting','recording','finishing'].includes(snapshot.phase);
 useEffect(()=>{onBusy?.(busy);},[busy,onBusy]);
 const shown=awaitingChoice?result.original:draft;
 useEffect(()=>{if(!shown)return;const url=URL.createObjectURL(shown.file);queueMicrotask(()=>{if(alive.current)setPreview(url)});return()=>URL.revokeObjectURL(url);},[shown]);
 useEffect(()=>{
  alive.current=true;const token=version;queueMicrotask(()=>{if(alive.current){setSnapshot(idle);setProcessing(false);}});
  const accept=async(file:File)=>{const current=++version.current;setProcessing(true);setError('');stopPronunciation();try{const next=await processVoice(file);if(!alive.current||current!==version.current)return;setResult(next);setEditing(false);if(!['silence','uncertain'].includes(next.status))callbacks.current.onDraft(next.trimmed||next.original);}catch(e){if(alive.current&&current===version.current)setError(voiceError(e));}finally{if(alive.current&&current===version.current)setProcessing(false);}};
  const capture=new ExpressionRecorder({change:s=>{if(alive.current)setSnapshot(s)},complete:file=>void accept(file)});controller.current=capture;
  const interrupt=()=>{pointer.current=null;if(['recording','starting'].includes(capture.phase))capture.end();else if(['preparing','ready'].includes(capture.phase))capture.cancel();};
  const hidden=()=>{if(document.hidden)interrupt();};const release=(event:PointerEvent)=>{if(pointer.current!==event.pointerId)return;pointer.current=null;capture.end();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',interrupt);window.addEventListener('blur',interrupt);window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);
  return()=>{alive.current=false;token.current++;pointer.current=null;capture.dispose();controller.current=null;callbacks.current.onBusy?.(false);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',interrupt);window.removeEventListener('blur',interrupt);window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);};
 },[]);
 function engage(){const c=controller.current;if(!c||disabled||processing)return;setError('');stopPronunciation();pauseContextVideos();if(c.phase==='idle')void c.prepare();else if(c.phase==='ready')c.begin();else if(['recording','starting','preparing'].includes(c.phase))c.end();}
 function release(id:number){if(pointer.current!==id)return;pointer.current=null;controller.current?.end();}
 async function upload(file:File){controller.current?.cancel();const current=++version.current;setProcessing(true);setError('');stopPronunciation();try{const next=await inspectVoice(file);if(alive.current&&version.current===current){setResult(null);onDraft(next);setEditing(false);}}catch(e){if(alive.current&&version.current===current)setError(voiceError(e));}finally{if(alive.current&&version.current===current)setProcessing(false);}}
 const recording=snapshot.phase==='recording',ready=snapshot.phase==='ready';
 const controls=editing||!shown;
 return <div className={styles.editor}>
  {controls&&!processing&&<>
   <div className={styles.actions}>
    <button ref={button} type="button" className={`secondary ${styles.hold}`} disabled={disabled||!canRecord||snapshot.phase==='finishing'} aria-label={tap?(recording?'Stop recording':'Record audio'):'Hold to record'} aria-describedby={statusId} data-recording={recording||undefined}
     onPointerDown={event=>{if(tap||event.button!==0||pointer.current!==null)return;event.preventDefault();pointer.current=event.pointerId;try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}engage();}}
     onPointerUp={event=>release(event.pointerId)} onPointerCancel={event=>release(event.pointerId)} onLostPointerCapture={event=>release(event.pointerId)}
     onContextMenu={event=>event.preventDefault()} onClick={event=>{if(tap||event.detail===0)engage();}}>
     <Microphone/>{recording?(tap?'Stop recording':'Recording… Release to stop'):snapshot.phase==='preparing'?'Enabling microphone…':snapshot.phase==='starting'?'Starting…':snapshot.phase==='finishing'?'Finishing…':tap?'Record audio':'Hold to record'}
    </button>
    {!['preparing','starting','recording','finishing'].includes(snapshot.phase)&&<label className={`wb-control wb-control-outline ${styles.upload}`}>Upload audio<input aria-label="Upload audio" type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.flac" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label>}
   </div>
   <div className={styles.meta}>
   <div id={statusId} role="status" className={styles.captureStatus}>
    {recording?<><span className={styles.indicator}/><span>Recording {String(Math.floor(snapshot.elapsed/60)).padStart(2,'0')}:{String(Math.floor(snapshot.elapsed%60)).padStart(2,'0')}</span><span className={styles.level} aria-label="Microphone level"><span style={{transform:`scaleX(${Math.max(.03,snapshot.level)})`}}/></span>{snapshot.noInput&&<span>No audio detected</span>}</>:ready?'Ready to record':snapshot.phase==='preparing'?'Allow microphone access. Then release and hold again.':snapshot.phase==='starting'?'Wait for the recording indicator.':snapshot.phase==='finishing'?'Preparing audio…':'Up to 30 seconds · 8 MB'}
   </div>
   {!['preparing','starting','recording','finishing'].includes(snapshot.phase)&&<button type="button" className={`text-button ${styles.mode}`} disabled={disabled} onClick={()=>setTap(value=>!value)}>{tap?'Use hold recording':'Use tap recording'}</button>}
   </div>
   {!canRecord&&<p className={styles.help}>Recording is unsupported here. Upload audio instead.</p>}
  </>}
  {processing&&<p role="status" className={styles.help}>Preparing audio…</p>}
  {!controls&&shown&&preview&&!processing&&<>
   <VoicePlayer url={preview} duration={shown.duration} label="Preview recording"/>
   <div className={styles.meta}><p role="status" className={styles.help}>{result?.status==='silence'?'No speech detected. Try again.':result?.status==='uncertain'?'Speech detection is uncertain. Preview and keep the original if it sounds right.':result?.status==='unsupported'?'Automatic trimming unavailable. Original audio kept.':result?.trimmed&&draft?.id===result.trimmed.id?'Silence trimmed':result?.trimmed?'Original audio':'Ready to save'}</p>   {result?.trimmed&&!awaitingChoice&&<button type="button" className={`text-button ${styles.mode}`} disabled={disabled} onClick={()=>{stopPronunciation();onDraft(draft?.id===result.trimmed!.id?result.original:result.trimmed!);}}>{draft?.id===result.trimmed.id?'Restore original':'Use trimmed audio'}</button>}</div>
   <div className={styles.actions}>
    <button type="button" className="secondary" disabled={disabled} onClick={()=>{version.current++;setResult(null);setEditing(true);setError('');void controller.current?.prepare();}}>Record again</button>
    {result?.status==='uncertain'&&<button type="button" disabled={disabled} onClick={()=>{onDraft(result.original);setResult({...result,status:'original'});}}>Keep original</button>}
    {!awaitingChoice&&saveAction}
    <button type="button" className="text-button" disabled={disabled} onClick={()=>{version.current++;controller.current?.cancel();setResult(null);onDraft(null);setEditing(true);setError('');}}>Discard</button>
   </div>

  </>}
  {(error||snapshot.error)&&<p role="status" className={styles.help}>{error||snapshot.error}</p>}
 </div>;
}
