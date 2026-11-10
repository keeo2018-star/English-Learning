"use client";
import {useEffect,useRef,useState} from 'react';
import {claimVoiceAudio,playVoiceAudio,resumePronunciation,stopPronunciation,type PronunciationStatus} from '@/lib/pronunciation';
import {signedVoice,type VoiceFile} from '@/lib/voice-notes';
import styles from './voice-notes.module.css';
export const durationLabel=(duration:number)=>`0:${String(Math.round(duration)).padStart(2,'0')}`;
export function VoicePlayer({file,url,compact=false,label='Play voice note'}:{file?:VoiceFile;url?:string;compact?:boolean;label?:string}){
 const audio=useRef<HTMLAudioElement>(null),owner=useRef(Symbol('voice')),alive=useRef(true),signed=useRef<{url:string;expires:number}|null>(null);
 const [status,setStatus]=useState<PronunciationStatus>('idle');const [loaded,setLoaded]=useState(false);
 const report=(value:PronunciationStatus)=>{if(alive.current)setStatus(value)};
 useEffect(()=>{alive.current=true;const token=owner.current,element=audio.current;queueMicrotask(()=>{if(alive.current){setStatus('idle');setLoaded(false);}});return()=>{alive.current=false;stopPronunciation(token);signed.current=null;if(element){element.removeAttribute('src');element.load();}};},[file?.id,url]);
 const play=()=>{
  if(!audio.current)return;
  if(status==='playing'||status==='loading'){stopPronunciation(owner.current);return;}
  if(resumePronunciation(owner.current))return;
  void playVoiceAudio({owner:owner.current,audio:audio.current,report,onReady:()=>{if(alive.current)setLoaded(true)},source:async()=>{
   if(url)return url;if(!file)throw new Error('Recording unavailable');
   if(signed.current&&signed.current.expires>Date.now())return signed.current.url;
   const next=await signedVoice(file);signed.current={url:next,expires:Date.now()+45000};return next;
  }});
 };
 return <div className={compact?styles.compactPlayer:styles.player}>
  {(!loaded||compact||status==='error')&&<button type="button" className="secondary" aria-label={label} aria-busy={status==='loading'} aria-pressed={status==='playing'} onClick={play}>{status==='playing'?'Pause':status==='loading'?'Loading…':label}{file&&!compact&&<span>{durationLabel(file.duration_seconds)}</span>}</button>}
  <audio ref={audio} controls={!compact} hidden={!compact&&!loaded} preload="none" aria-label="Voice note audio" onPlay={()=>{if(audio.current){claimVoiceAudio(owner.current,audio.current,report);report('playing')}}} onPause={()=>stopPronunciation(owner.current)} onError={()=>report('error')}/>
  {status==='blocked'&&<small>Tap Play again to listen.</small>}
  {status==='error'&&<small role="status">This recording could not play. Try again, or use M4A, MP3 or WAV on this device.</small>}
 </div>;
}
