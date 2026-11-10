"use client";
import {useCallback,useEffect,useState} from 'react';
import {voiceError,voiceFiles,type VoiceFile} from './voice-notes';
const cache=new Map<string,{at:number;files:VoiceFile[]}>();
export function useVoiceNotes(owner:string|undefined,items:string[]){
 const ids=[...new Set(items)].sort().join(','),key=(owner||'')+'/'+ids;
 const [revision,setRevision]=useState(0),[state,setState]=useState<{key:string;files:VoiceFile[];error:string}>({key:'',files:[],error:''});
 const refresh=useCallback(()=>{if(owner)for(const id of ids.split(','))cache.delete(owner+'/'+id);setRevision(x=>x+1);},[owner,ids]);
 useEffect(()=>{
  let active=true;const abort=new AbortController();
  const timer=setTimeout(async()=>{
   if(!active||!owner||!ids)return;
   const list=ids.split(','),missing=list.filter(id=>!cache.has(owner+'/'+id)||Date.now()-cache.get(owner+'/'+id)!.at>30000);
   try{
    if(missing.length){const files=await voiceFiles(missing,abort.signal);if(!active)return;for(const id of missing)cache.set(owner+'/'+id,{at:Date.now(),files:files.filter(f=>f.item_id===id)});}
    while(cache.size>256)cache.delete(cache.keys().next().value!);
    if(active)setState({key,files:list.flatMap(id=>cache.get(owner+'/'+id)?.files||[]),error:''});
   }catch(error){if(active)setState({key,files:[],error:voiceError(error)});}
  },100);
  return()=>{active=false;clearTimeout(timer);abort.abort();};
 },[owner,ids,key,revision]);
 useEffect(()=>{if(!owner||!ids)return;const sync=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);const timer=setInterval(sync,60000);return()=>{window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);clearInterval(timer)};},[owner,ids,refresh]);
 return {files:state.key===key?state.files:[],error:state.key===key?state.error:'',ready:state.key===key||!owner||!ids,refresh};
}
