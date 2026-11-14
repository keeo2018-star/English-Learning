"use client";
import {ImeInput} from '@/components/ui/ime-field';
import {imeBlocksSubmit} from '@/lib/ime';
import {useEffect,useMemo,useRef,useState} from 'react';
import {vocabularyKey,type RelatedTerm} from '@/lib/related-words';
import {dictionaryReference} from '@/lib/dictionary-client';
import styles from './dictionary.module.css';
export type RelatedInput={word:string;meaning:string;example:string;item_type:'word'|'expression'};
const cache=new Map<string,{items:RelatedTerm[];at:number}>(),meanings=new Map<string,{meaning:string;example:string}>();
export function RelatedWords({word,synonyms,onOpen,onSave,savedWords=[],referenceReady}:{word:string;synonyms:string[];onOpen:(word:string)=>void;onSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];referenceReady:boolean}){
 const [items,setItems]=useState<RelatedTerm[]>([]),[phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[attempt,setAttempt]=useState(0),[more,setMore]=useState(false),[translations,setTranslations]=useState<Record<string,string>>({}),[saving,setSaving]=useState<string[]>([]),[saved,setSaved]=useState<string[]>([]),[message,setMessage]=useState(''),[needsMeaning,setNeedsMeaning]=useState(''),[custom,setCustom]=useState('');
 const inFlight=useRef(new Set<string>()),alive=useRef(true),section=useRef<HTMLElement|null>(null),[visible,setVisible]=useState(false);
 const known=useMemo(()=>new Set([...savedWords,...saved].map(vocabularyKey)),[savedWords,saved]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{const controller=new AbortController();const key=vocabularyKey(word);const old=cache.get(key);
  const accept=(next:RelatedTerm[])=>{if(!controller.signal.aborted){setItems(next);setPhase('ready');}};
  if(old&&Date.now()-old.at<3600000){queueMicrotask(()=>accept(old.items));return()=>controller.abort();}
  void fetch('/api/related-words?'+new URLSearchParams({word}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.items))throw Error();const next=d.items.filter((x:RelatedTerm)=>typeof x.word==='string');if(controller.signal.aborted)return;if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{items:next,at:Date.now()});accept(next);}).catch(()=>{if(!controller.signal.aborted)setPhase('error')});return()=>controller.abort();
 },[word,attempt]);
 const all=useMemo(()=>{const seen=new Set([vocabularyKey(word)]);return [...synonyms.map(word=>({word})),...items].filter(x=>/^[a-z][a-z '’-]*$/i.test(x.word)&&x.word.length<=120&&!seen.has(vocabularyKey(x.word))&&!!seen.add(vocabularyKey(x.word))).slice(0,12)},[items,synonyms,word]);
 const shown=all.slice(0,more?12:6);
 useEffect(()=>{if(!section.current||!referenceReady)return;const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer?.disconnect()}},{rootMargin:'80px'}):null;if(observer)observer.observe(section.current);else queueMicrotask(()=>setVisible(true));return()=>observer?.disconnect();},[phase,all.length,referenceReady]);
 useEffect(()=>{if(!visible)return;const abort=new AbortController();let next=0;const terms=all.slice(0,more?12:6);
  const worker=async()=>{while(next<terms.length&&!abort.signal.aborted){const term=terms[next++].word,key=vocabularyKey(term);try{let info=meanings.get(key);if(!info){const data=await dictionaryReference(term);info={meaning:Array.isArray(data.chinese)?data.chinese.find(x=>typeof x==='string'&&/[\u3400-\u9fff]/u.test(x))||'':'',example:data.examples?.find(x=>x.source)?.source||''};if(abort.signal.aborted)return;if(meanings.size>=150)meanings.delete(meanings.keys().next().value!);meanings.set(key,info);}if(!abort.signal.aborted)setTranslations(old=>({...old,[key]:info!.meaning}));}catch{/* English term remains usable. */}}};void Promise.all([worker(),worker()]);return()=>abort.abort();
 },[all,more,visible]);
 async function save(term:string){const key=vocabularyKey(term);if(!onSave||known.has(key)||inFlight.current.has(key))return;inFlight.current.add(key);setSaving(x=>[...x,key]);setMessage('');try{let info=meanings.get(key);if(!info){try{const d=await dictionaryReference(term);info={meaning:d.chinese.find(x=>/[\u3400-\u9fff]/u.test(x))||'',example:d.examples.find(x=>x.source)?.source||''};meanings.set(key,info);}catch{/* No invented translation. */}}if(!alive.current)return;await onSave({word:term,meaning:needsMeaning===term?custom.trim():info?.meaning||translations[key]||'',example:info?.example||'',item_type:/\s/.test(term)?'expression':'word'});if(alive.current){setSaved(x=>[...x,term]);setNeedsMeaning('');setCustom('');}}catch(e){if(alive.current){const msg=e instanceof Error?e.message:'Could not save. Try again.';setMessage(msg);if(/meaning|23514/i.test(msg)){setNeedsMeaning(term);if(needsMeaning!==term)setCustom('');}}}finally{inFlight.current.delete(key);if(alive.current)setSaving(x=>x.filter(t=>t!==key))}}
 if(phase==='ready'&&!all.length)return null;
 return <section ref={section} className={styles.related} aria-label="Related Words"><h3>Related Words</h3>
  {!all.length&&phase==='loading'&&<p role="status">Finding connections…</p>}
  {!all.length&&phase==='error'&&<p className="wb-ui-text">Connections are unavailable. <button type="button" className="text-button" onClick={()=>{setPhase('loading');setAttempt(x=>x+1)}}>Try related words again</button></p>}
  <div className={styles.relatedGrid}>{shown.map(item=>{const key=vocabularyKey(item.word);return <div className={styles.relatedItem} key={key}><button type="button" className={styles.relatedTerm} onClick={()=>onOpen(item.word)}><span className="wb-learning-content">{item.word}</span>{translations[key]&&<small lang="zh">{translations[key].slice(0,100)}</small>}</button>{onSave&&<button type="button" className={`text-button ${styles.relatedSave}`} aria-label={(known.has(key)?'Saved ':'Save ')+item.word} disabled={known.has(key)||saving.includes(key)} onClick={()=>void save(item.word)}>{known.has(key)?'Saved':saving.includes(key)?'Saving…':'Save'}</button>}</div>})}</div>
  {all.length>6&&!more&&<button type="button" className="text-button" onClick={()=>setMore(true)}>Explore more</button>}
  {needsMeaning&&<form className={styles.relatedMeaning} onSubmit={e=>{e.preventDefault();if(!imeBlocksSubmit(e.currentTarget,e.timeStamp))void save(needsMeaning)}}><label>Meaning for {needsMeaning}<ImeInput lang="zh-Hans" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Meaning for related word" value={custom} onValueChange={setCustom} maxLength={2000} required/></label><button disabled={saving.includes(vocabularyKey(needsMeaning))}>Save with meaning</button></form>}
  {message&&<p role="status">{message}</p>}
  {!!all.length&&<p className={styles.credit}>Connections via Datamuse / dictionary synonyms. Meanings via UAPI when available.</p>}
 </section>;
}
