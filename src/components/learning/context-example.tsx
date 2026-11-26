'use client';
import {useEffect,useRef,useState} from 'react';
import {cachedExample,resolveExample,type ExampleItem} from '@/lib/context-examples';
import {vocabularyDetails} from '@/lib/vocabulary-details';
import {trustedSavedExample} from '@/lib/learning-quality';
import type {TargetLanguage} from '@/lib/collections';
import {HighlightWord} from '@/components/dictionary/highlight-word';
import {Disclosure} from '@/components/ui/disclosure';

export function ContextExample({item,owner,lookup=true,language='en',labelExample=false}: {
 item:ExampleItem;owner:string;persist?:boolean;lookup?:boolean;labelExample?:boolean;language?:TargetLanguage;
}){
 const anchor=useRef<HTMLSpanElement>(null);
 const identity=JSON.stringify([owner,item.id,item.word,item.meaning,item.example,item.learning_details]);
 const [resolved,setResolved]=useState<{key:string;text:string}|null>(null);
 const trusted=trustedSavedExample({...item,example:item.example||''});
 useEffect(()=>{
  let active=true,visible=false;
  const current={id:item.id,word:item.word,meaning:item.meaning,example:''};
  const load=()=>{
   if(!active||!visible||trusted)return;
   const cached=cachedExample(owner,current);if(cached)setResolved({key:identity,text:cached});
   if(lookup)void resolveExample(owner,current,false).then(text=>{if(active)setResolved({key:identity,text});});
  };
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible)load();},{rootMargin:'100px'}):null;
  if(observer&&anchor.current)observer.observe(anchor.current.parentElement||anchor.current);else{visible=true;load();}
  window.addEventListener('online',load);
  return()=>{active=false;observer?.disconnect();window.removeEventListener('online',load);};
 },[identity,owner,item.id,item.word,item.meaning,lookup,trusted]);
 const text=trusted?item.example||'':resolved?.key===identity?resolved.text:'';
 const details=vocabularyDetails(item.learning_details,text,language);
 return <>
  <span ref={anchor} aria-hidden="true"/>
  {text&&<blockquote className="wb-learning-content" data-context-example>
   {(item.example_source==='ai'||details?.exampleSource==='ai')&&trusted?<small className="ai-label">AI-generated example</small>:labelExample&&<small className="saved-learning-note">{trusted?'Saved example':'Dictionary example'}</small>}
   {details?.exampleSource==='ai'&&!details.highlight?text:<HighlightWord text={text} target={item.word} surface={trusted?details?.highlight:undefined} language={language}/>}
   {trusted&&details?.exampleTranslation&&<small className="saved-learning-note">{details.exampleTranslation}</small>}
  </blockquote>}
  {labelExample&&item.example?.trim()&&!trusted&&<Disclosure label="Saved example · check meaning"><p className="wb-supporting">This example has not been confirmed for your meaning. Your original text is kept.</p><blockquote className="wb-learning-content">{item.example}</blockquote></Disclosure>}
  {item.personal_note&&<Disclosure label="Personal note"><p className="saved-learning-note">{item.personal_note}</p></Disclosure>}
 </>;
}
