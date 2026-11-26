"use client";
import {ImeInput} from '@/components/ui/ime-field';
import {imeBlocksSubmit} from '@/lib/ime';
import {useEffect,useMemo,useRef,useState} from 'react';
import {vocabularyKey,componentOnly,relatedQuery,relatedSenseMatches,relatedMeaning,relatedPreview,type RelatedTerm} from '@/lib/related-words';
import {dictionaryReference} from '@/lib/dictionary-client';
import {IconButton} from "@/components/ui/icon";
import styles from './dictionary.module.css';
export type RelatedInput={request_id?:string;word:string;meaning:string;example:string;item_type:'word'|'expression';example_source?:'ai'|'dictionary'|'personal'|null};
type Info={meaning:string;example:string;chinese:string[];english:string[]};
const cache=new Map<string,{items:RelatedTerm[];at:number}>(),meanings=new Map<string,Info>();
async function information(term:string){
 const key=vocabularyKey(term),hit=meanings.get(key);if(hit)return hit;
 const d=await dictionaryReference(term);
 const info={meaning:d.chinese.find(x=>typeof x==='string'&&/[\u3400-\u9fff]/u.test(x))||'',example:d.examples.find(x=>x.source)?.source||'',chinese:d.chinese,english:d.english.map(x=>x.definition)};
 if(meanings.size>=150)meanings.delete(meanings.keys().next().value!);meanings.set(key,info);return info;
}
export function RelatedWords({word,meaning='',synonyms,onOpen,onSave,savedWords=[],referenceReady}:{word:string;meaning?:string;synonyms:string[];onOpen:(word:string)=>void;onSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];referenceReady:boolean}){
 const [items,setItems]=useState<RelatedTerm[]>([]),[phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[attempt,setAttempt]=useState(0),[limit,setLimit]=useState(3),[accepted,setAccepted]=useState<RelatedTerm[]>([]),[checked,setChecked]=useState(false),[hasMore,setHasMore]=useState(false),[checking,setChecking]=useState(false),[translations,setTranslations]=useState<Record<string,string>>({}),[saving,setSaving]=useState<string[]>([]),[saved,setSaved]=useState<string[]>([]),[message,setMessage]=useState(''),[needsMeaning,setNeedsMeaning]=useState(''),[custom,setCustom]=useState('');
 const inFlight=useRef(new Set<string>()),alive=useRef(true),section=useRef<HTMLElement|null>(null),[visible,setVisible]=useState(false);
 const scope=word+'\0'+meaning,scopeRef=useRef(scope);
 const known=useMemo(()=>new Set([...savedWords,...saved].map(vocabularyKey)),[savedWords,saved]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{const controller=new AbortController(),key=vocabularyKey(word),old=cache.get(key);
  const accept=(next:RelatedTerm[])=>{if(!controller.signal.aborted){setItems(next);setPhase('ready');}};
  if(old&&Date.now()-old.at<3600000){queueMicrotask(()=>accept(old.items));return()=>controller.abort();}
  void fetch('/api/related-words?'+new URLSearchParams({word,v:'2'}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.items))throw Error();const next=d.items.filter((x:RelatedTerm)=>typeof x.word==='string');if(controller.signal.aborted)return;if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{items:next,at:Date.now()});accept(next);}).catch(()=>{if(!controller.signal.aborted)setPhase('error')});return()=>controller.abort();
 },[word,attempt]);
 const all=useMemo<RelatedTerm[]>(()=>{const key=(text:string)=>relatedQuery(text)||vocabularyKey(text),seen=new Set([key(word)]);return [...items.filter(item=>item.relation==='synonym'||item.relation==='antonym'),...items.filter(item=>item.relation!=='synonym'&&item.relation!=='antonym'),...synonyms.map(word=>({word}))].filter(x=>relatedQuery(x.word)&&!componentOnly(word,x.word)&&!seen.has(key(x.word))&&!!seen.add(key(x.word))).slice(0,24)},[items,synonyms,word]);
 useEffect(()=>{if(!section.current||!referenceReady)return;const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer?.disconnect()}},{rootMargin:'100px'}):null;if(observer)observer.observe(section.current);else queueMicrotask(()=>setVisible(true));return()=>observer?.disconnect();},[phase,all.length,referenceReady]);
 useEffect(()=>{
  if(!visible||phase==='loading')return;
  let cancelled=false,next=0,complete=0,failures=0;
  const budget=Math.min(all.length,limit*2);
  const changed=scopeRef.current!==scope;scopeRef.current=scope;
  const publish=(values:RelatedTerm[])=>setAccepted(previous=>{
   const seen=new Set<string>();return (changed?values:[...previous,...values]).filter(item=>!seen.has(vocabularyKey(item.word))&&!!seen.add(vocabularyKey(item.word))).slice(0,limit);
  });
  const found=new Map<number,RelatedTerm>();
  queueMicrotask(()=>{if(!cancelled){setChecking(true);setChecked(false);if(changed)setAccepted([]);}});
  const worker=async()=>{
   while(next<budget&&found.size<limit&&failures<2&&!cancelled){const index=next++,term=all[index];
    try{const info=await information(term.word);if(cancelled)return;
     if((term.relation==='antonym'||term.relation==='synonym'||(!!meaning.trim()&&!!info.meaning))&&relatedSenseMatches(meaning,info.chinese,info.english,term.relation)){
      found.set(index,term);setTranslations(old=>({...old,[vocabularyKey(term.word)]:relatedMeaning(meaning,info.chinese,info.english,term.relation)}));

     }
    }catch{failures++;}
    complete++;
   }
  };
  void Promise.all([worker(),worker()]).then(()=>{if(!cancelled){publish([...found.entries()].sort((a,b)=>a[0]-b[0]).slice(0,limit).map(([,item])=>item));setHasMore(complete<all.length||found.size>limit);setChecked(true);setChecking(false);}});
  return()=>{cancelled=true;};
 },[all,limit,meaning,scope,visible,phase]);
 async function save(term:string){const key=vocabularyKey(term);if(!onSave||known.has(key)||inFlight.current.has(key))return;inFlight.current.add(key);setSaving(x=>[...x,key]);setMessage('');try{let info=meanings.get(key);if(!info){try{info=await information(term);}catch{/* Never invent a translation. */}}if(!alive.current)return;await onSave({word:term,meaning:needsMeaning===term?custom.trim():translations[key]||info?.meaning||'',example:info?.example||'',item_type:/\s/.test(term)?'expression':'word'});if(alive.current){setSaved(x=>[...x,term]);setNeedsMeaning('');setCustom('');}}catch(e){if(alive.current){const msg=e instanceof Error?e.message:'Could not save. Try again.';setMessage(msg);if(/meaning|23514/i.test(msg)){setNeedsMeaning(term);if(needsMeaning!==term)setCustom('');}}}finally{inFlight.current.delete(key);if(alive.current)setSaving(x=>x.filter(t=>t!==key))}}
 if(phase==='ready'&&checked&&!accepted.length)return null;
 return <section ref={section} className={styles.related} aria-label="Related Words"><h3>Related Words</h3>
  {(!accepted.length&&(phase==='loading'||checking||!checked))&&phase!=='error'&&<p role="status">Finding relevant connections…</p>}
  {phase==='error'&&<p className="wb-ui-text">Connections are unavailable. <button type="button" className="text-button" onClick={()=>{setPhase('loading');setAttempt(x=>x+1)}}>Try related words again</button></p>}
  <div className={styles.relatedGrid}>{accepted.map(item=>{const key=vocabularyKey(item.word);return <div className={styles.relatedItem} key={key}><button type="button" className={styles.relatedTerm} onClick={()=>onOpen(item.word)}><span className="wb-learning-content">{item.word}</span>{item.relation==='antonym'&&<span className={styles.relation}>Antonym</span>}{translations[key]&&<small lang="zh">{relatedPreview(translations[key])}</small>}</button>{onSave&&<IconButton icon={known.has(key)?'check':'add'} label={(known.has(key)?'Saved ':'Save ')+item.word}
     aria-busy={saving.includes(key)} disabled={known.has(key)||saving.includes(key)} onClick={()=>void save(item.word)}/>}</div>})}</div>
  {hasMore&&<button type="button" className={`text-button ${styles.explore}`} disabled={checking} aria-busy={checking} onClick={()=>setLimit(n=>n+3)}>{checking?'Finding more…':'Explore more'}</button>}
  {checked&&!checking&&!hasMore&&limit>3&&accepted.length<=limit-3&&<p role="status" className="wb-ui-text">No more relevant connections found.</p>}
  {needsMeaning&&<form className={styles.relatedMeaning} onSubmit={e=>{e.preventDefault();if(!imeBlocksSubmit(e.currentTarget,e.timeStamp))void save(needsMeaning)}}><label>Meaning for {needsMeaning}<ImeInput lang="zh-Hans" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Meaning for related word" value={custom} onValueChange={setCustom} maxLength={2000} required/></label><button disabled={saving.includes(vocabularyKey(needsMeaning))}>Save with meaning</button></form>}
  {message&&<p role="status">{message}</p>}
  {!!accepted.length&&<p className={styles.credit}>Lexical connections via Datamuse / dictionary. Meanings via UAPI when available.</p>}
 </section>;
}
