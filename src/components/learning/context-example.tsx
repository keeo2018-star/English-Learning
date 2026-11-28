'use client';
import {useEffect,useRef,useState,useContext} from 'react';
import {BilingualExample,VisibleReferenceExample} from './reference-reading';
import {cachedExample,type ExampleItem} from '@/lib/context-examples';
import {bestDisplayExample,type ExampleCandidate} from '@/lib/example-quality';
import {dictionaryReference} from '@/lib/dictionary-client';
import {vocabularyDetails} from '@/lib/vocabulary-details';
import {trustedSavedExample} from '@/lib/learning-quality';
import type {TargetLanguage} from '@/lib/collections';
import {HighlightWord} from '@/components/dictionary/highlight-word';
import {Disclosure} from '@/components/ui/disclosure';

export function ContextExample({item,owner,lookup=true,language='en',labelExample=false,review=false}: {
 item:ExampleItem;owner:string;lookup?:boolean;labelExample?:boolean;review?:boolean;language?:TargetLanguage;
}){
 const anchor=useRef<HTMLSpanElement>(null);
 const identity=JSON.stringify([owner,item.id,item.word,item.meaning,item.example,item.learning_details]);
 const [resolved,setResolved]=useState<{key:string;example:ExampleCandidate}|null>(null);
 const trusted=trustedSavedExample({...item,example:item.example||''});
 useEffect(()=>{
  let active=true,visible=false;
  const current={id:item.id,word:item.word,meaning:item.meaning,example:''};
  const load=()=>{
   if(!active||!visible||trusted)return;
   const cached=cachedExample(owner,current);if(cached)setResolved({key:identity,example:{source:cached}});
   if(lookup)void dictionaryReference(item.word).then(result=>{
    const example=bestDisplayExample(item.word,item.meaning,result.examples);
    if(active&&example)setResolved({key:identity,example});
   }).catch(()=>{});
  };
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible)load();},{rootMargin:'100px'}):null;
  if(observer&&anchor.current)observer.observe(anchor.current.parentElement||anchor.current);else{visible=true;load();}
  window.addEventListener('online',load);
  return()=>{active=false;observer?.disconnect();window.removeEventListener('online',load);};
 },[identity,owner,item.id,item.word,item.meaning,lookup,trusted]);
 const reference=resolved?.key===identity?resolved.example:undefined;
 const text=trusted?item.example||'':reference?.source||'';
 const details=vocabularyDetails(item.learning_details,text,language);
 const reportExample=useContext(VisibleReferenceExample);
 useEffect(()=>{if(labelExample)reportExample?.(text);return()=>{if(labelExample)reportExample?.('');};},[labelExample,reportExample,text]);
 return <>
  <span ref={anchor} aria-hidden="true"/>
  {text&&labelExample?<BilingualExample context sourceLanguage={language} label={(item.example_source==='ai'||details?.exampleSource==='ai')&&trusted?'AI-generated example':trusted?'Saved example':'Dictionary example'}
    source={details?.exampleSource==='ai'&&!details.highlight?text:<HighlightWord text={text} target={item.word} surface={trusted?details?.highlight:undefined} language={language}/>} translation={trusted?details?.exampleTranslation:reference?.translation} translationLanguage={details?.explanationLanguage==='en'?'en':'zh'}/>:text&&<blockquote className="wb-learning-content" data-context-example>
   {(item.example_source==='ai'||details?.exampleSource==='ai')&&trusted?<small className="ai-label">AI-generated example</small>:labelExample&&<small className="saved-learning-note">{trusted?'Saved example':'Dictionary example'}</small>}
   {details?.exampleSource==='ai'&&!details.highlight?text:<HighlightWord text={text} target={item.word} surface={trusted?details?.highlight:undefined} language={language}/>}
   {trusted&&details?.exampleTranslation&&<small className="saved-learning-note">{details.exampleTranslation}</small>}
  </blockquote>}
  {labelExample&&!review&&item.example?.trim()&&!trusted&&<Disclosure label="Saved example · check meaning"><p className="wb-supporting">This example has not been confirmed for your meaning. Your original text is kept.</p><BilingualExample sourceLanguage={language} source={item.example} translation={vocabularyDetails(item.learning_details,item.example,language)?.exampleTranslation}/></Disclosure>}
  {item.personal_note&&<Disclosure label="Personal note"><p className="saved-learning-note">{item.personal_note}</p></Disclosure>}
 </>;
}
