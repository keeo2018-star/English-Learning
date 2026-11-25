'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';
import {chooseActiveCollection,parseCollections,type LearningCollection} from './collections';
const cacheKey=(owner:string)=>`noted-collections-v1:${owner}`;
const activeKey=(owner:string)=>`noted-active-collection-v1:${owner}`;
type Snapshot={owner:string;rows:LearningCollection[];enabled:boolean;ready:boolean};
const pending=new Map<string,Promise<{data:unknown;error:unknown}>>();
function request(owner:string){
 if(pending.has(owner))return pending.get(owner)!;
 const result=Promise.resolve(supabase!.rpc('noted_collections_snapshot').abortSignal(AbortSignal.timeout(6000))).finally(()=>pending.delete(owner));
 pending.set(owner,result);return result;
}
function local(owner:string):Snapshot {
 try{const raw=JSON.parse(localStorage.getItem(cacheKey(owner))||'null');return {owner,rows:parseCollections(raw,owner),enabled:raw?.multilingual_enabled===true,ready:raw?.version===1||!navigator.onLine};}
 catch{return {owner,rows:[],enabled:false,ready:!navigator.onLine};}
}
function savedActive(owner:string){try{return localStorage.getItem(activeKey(owner));}catch{return null;}}
export function useCollections(owner:string|null|undefined){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[selected,setSelected]=useState<{owner:string;id:string|null}|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!owner||!supabase)return;
  let alive=true;
  queueMicrotask(()=>{if(alive){setSnapshot(local(owner));setSelected({owner,id:savedActive(owner)});}});
  const failed=()=>{if(alive)setSnapshot(previous=>previous?.owner===owner?{...previous,ready:true}:{owner,rows:[],enabled:false,ready:true});};
  const refresh=async()=>{
   if(!navigator.onLine)return;
   try{
    const {data,error}=await request(owner);if(!alive)return;if(error){failed();return;}
    const rows=parseCollections(data,owner),enabled=!!data&&typeof data==='object'&&'multilingual_enabled' in data&&data.multilingual_enabled===true;
    setSnapshot({owner,rows,enabled,ready:true});
    try{const raw=JSON.stringify({version:1,multilingual_enabled:enabled,collections:rows});if(localStorage.getItem(cacheKey(owner))!==raw){localStorage.setItem(cacheKey(owner),raw);window.dispatchEvent(new CustomEvent('noted-collections-updated',{detail:{owner}}));}}catch{}
   }catch{failed();}
  };
  const changed=(event:Event)=>{
   const detail=(event as CustomEvent<{owner:string;id?:string}>).detail;
   if(event.type==='noted-collections-updated'&&detail?.owner===owner){setSnapshot(local(owner));return;}
   if(detail?.owner===owner&&detail.id){setSelected({owner,id:detail.id});return;}
   if(event instanceof StorageEvent){if(event.key===activeKey(owner))setSelected({owner,id:savedActive(owner)});if(event.key===cacheKey(owner))setSnapshot(local(owner));}
  };
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  void refresh();const timer=setInterval(visible,30000);
  window.addEventListener('noted-collection-changed',changed);window.addEventListener('noted-collections-updated',changed);window.addEventListener('storage',changed);window.addEventListener('online',refresh);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('noted-collection-changed',changed);window.removeEventListener('noted-collections-updated',changed);window.removeEventListener('storage',changed);window.removeEventListener('online',refresh);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[owner,revision]);
 const rows=snapshot&&snapshot.owner===owner?snapshot.rows:[],enabled=!!snapshot&&snapshot.owner===owner&&snapshot.enabled;
 const active=owner?chooseActiveCollection(rows,owner,selected?.owner===owner?selected.id:null):null;
 const select=useCallback((id:string)=>{if(!owner)return;setSelected({owner,id});try{localStorage.setItem(activeKey(owner),id);}catch{}window.dispatchEvent(new CustomEvent('noted-collection-changed',{detail:{owner,id}}));},[owner]);
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);
 return {collections:rows,active,enabled,ready:!supabase||!owner||!!snapshot&&snapshot.owner===owner&&snapshot.ready,select,refresh};
}
