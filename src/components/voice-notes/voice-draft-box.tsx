"use client";
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {voiceFiles,voiceError,type VoiceDraft} from '@/lib/voice-notes';
import {VoiceEditor} from './voice-editor';
import styles from './voice-notes.module.css';
export function VoiceDraftBox(props:{draft:VoiceDraft|null;onDraft:(value:VoiceDraft|null)=>void;onBusy:(value:boolean)=>void;disabled:boolean}){
 const [state,setState]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;queueMicrotask(async()=>{try{if(!supabase)throw new Error('Sign in to a cloud account to save private Voice Notes.');await voiceFiles([]);if(active)setState('ready');}catch(error){if(active){setError(voiceError(error));setState('error');}}});return()=>{active=false;};},[retry]);
 if(state==='checking')return <p role="status" className={styles.help}>Checking private audio storage…</p>;
 if(state==='error')return <p role="status" className={styles.help}>{error} <button type="button" className="text-button" onClick={()=>{setState('checking');setRetry(value=>value+1);}}>Try again</button></p>;
 return <VoiceEditor {...props}/>;
}
