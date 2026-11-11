"use client";
import {useState} from 'react';
import {supabase} from '@/lib/supabase';
import {stopPronunciation} from '@/lib/pronunciation';
import {removeVoiceFiles,uploadVoice,voiceError,type VoiceDraft,type VoiceFile} from '@/lib/voice-notes';
import {VoiceEditor,Microphone} from './voice-editor';
import {VoicePlayer} from './voice-player';
import {VoiceConfirm} from './voice-confirm';
import styles from './voice-notes.module.css';
export function VoiceManager({item,files,error,ready,onChange}:{item:string;files:VoiceFile[];error:string;ready:boolean;onChange:()=>void}){
 const note=files.find(f=>f.state==='active');const [deleteTargets,setDeleteTargets]=useState<VoiceFile[]>([]);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<VoiceDraft|null>(null),[busy,setBusy]=useState(false),[capturing,setCapturing]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[confirm,setConfirm]=useState<'delete'|'replace'|'discard'|null>(null),[expected,setExpected]=useState<string|null>(null);
 async function run(task:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');setFailed(false);stopPronunciation();try{await task();onChange();}catch(e){setFailed(true);setMessage(voiceError(e));}finally{setBusy(false);setConfirm(null);}}
 const save=()=>void run(async()=>{if(!draft)return;const result=await uploadVoice(item,draft,expected);setDraft(null);setOpen(false);setMessage(result.cleanupPending?'Voice note saved. Replaced-file cleanup needs retry.':'Voice note saved.');});
 const pending=files.filter(f=>f.state==='pending'),retired=files.filter(f=>f.state==='retired');
 return <section className={styles.manager} aria-label="Expression voice note">
  {note?.stored&&!open&&<VoicePlayer key={note.id} file={note}/>}
  <div className={styles.actions}>
   <button type="button" className="text-button" disabled={busy||capturing||!ready} onClick={()=>{setExpected(note?.id||null);setOpen(value=>!value);setMessage('');}}>{!open&&<Microphone/>}{open?'Close voice note editor':note?'Replace / Record again':'Add a voice note'}</button>
   {note&&<button type="button" className="text-button" disabled={busy||capturing} onClick={()=>{setDeleteTargets(note?[note]:[]);setConfirm('delete')}}>Delete voice note</button>}
  </div>
  {note&&!note.stored&&<p className={styles.help}>The audio file is unavailable. You can replace it or finish deleting it.</p>}
  {open&&(!ready?<p role="status">Loading voice note…</p>:error?<p role="status">{error} <button type="button" className="text-button" onClick={onChange}>Try again</button></p>:<><VoiceEditor draft={draft} onDraft={setDraft} onBusy={setCapturing} disabled={busy} saveAction={draft?<button type="button" disabled={busy||capturing} onClick={()=>note?setConfirm('replace'):save()}>{busy?'Saving…':note?'Replace voice note':'Save voice note'}</button>:undefined}/></>)}
  {(pending.length>0||retired.length>0)&&<details className={styles.recovery}><summary>Unfinished audio uploads</summary>{pending.some(f=>f.stored)&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{const file=pending.find(f=>f.stored)!;const result=await supabase!.rpc('voice_note_finish',{p_id:file.id});if(result.error)throw result.error;setMessage('Voice note recovered.');})}>Finish saved upload</button>}{pending.length>0&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setDeleteTargets(pending);setConfirm('discard')}}>Discard unfinished uploads</button>}{retired.length>0&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{await removeVoiceFiles(retired);setMessage('Replaced recordings cleaned up.');})}>Retry replaced-file cleanup</button>}</details>}
  {message&&<p role="status" className={styles.help}>{message}</p>}{failed&&<button type="button" className="text-button" onClick={()=>{setOpen(false);onChange();}}>Refresh recording</button>}
  {confirm&&<VoiceConfirm title={confirm==='replace'?'Replace this voice note?':confirm==='discard'?'Discard unfinished recordings?':'Delete this voice note?'} description="The Expression, meaning and review progress will be kept." confirmLabel={confirm==='replace'?'Replace recording':'Delete recording'} busy={busy} onCancel={()=>setConfirm(null)} onConfirm={()=>confirm==='replace'?save():void run(async()=>{await removeVoiceFiles(deleteTargets);setDraft(null);setOpen(false);setMessage('Recording deleted. Expression kept.');})}/>}
 </section>;
}
