'use client';
import {useEffect,useState} from 'react';

// Scope the visual response at the consumer; never suppress global focus rings.
export function useInputModality(enabled=true){
 const [modality,setModality]=useState<'unknown'|'pointer'|'keyboard'>('unknown');
 useEffect(()=>{
  if(!enabled)return;
  const pointer=()=>setModality('pointer');
  const keyboard=(event:KeyboardEvent)=>{if(!event.altKey&&!event.ctrlKey&&!event.metaKey)setModality('keyboard');};
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
  return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);};
 },[enabled]);
 return modality;
}
