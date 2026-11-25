'use client';
import { useEffect, useRef, useState } from 'react';
import { cachedExample, resolveExample, type ExampleItem } from '@/lib/context-examples';
import { vocabularyDetails } from '@/lib/vocabulary-details';
import type { TargetLanguage } from '@/lib/collections';
import { HighlightWord } from '@/components/dictionary/highlight-word';
export function ContextExample({item, owner, persist = true,lookup=true,language='en'}: {item: ExampleItem; owner: string; persist?: boolean;lookup?:boolean; language?:TargetLanguage}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const identity = JSON.stringify([owner,item.id,item.word,item.meaning,item.example]);
  const [resolved,setResolved] = useState<{key:string;text:string}|null>(null);
  useEffect(() => {
    let active = true, visible = false;
    const current = {id:item.id,word:item.word,meaning:item.meaning,example:item.example};
    const load = () => {
      if (!active || !visible) return;
      const cached = cachedExample(owner,current);
      if (cached) setResolved({key:identity,text:cached});
      if (lookup&&!item.learning_details&&!current.example?.trim()) void resolveExample(owner,current,persist).then(text => {if(active)setResolved({key:identity,text});});
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting); if(visible)load();
    },{rootMargin:'100px'}) : null;
    if(observer && anchor.current)observer.observe(anchor.current.parentElement || anchor.current); else {visible=true;load();}
    window.addEventListener('online',load);
    return ()=>{active=false;observer?.disconnect();window.removeEventListener('online',load);};
  },[identity,owner,item.id,item.word,item.meaning,item.example,item.learning_details,persist,lookup]);
  const text = item.example?.trim() ? item.example : resolved?.key === identity ? resolved.text : '';
  const details=vocabularyDetails(item.learning_details,text,language);
  return <>
    <span ref={anchor} aria-hidden="true" />
    {(details?.partOfSpeech||details?.lemma&&details.lemma!==item.word)&&<p className="saved-learning-note">
      {[details.partOfSpeech,details.lemma&&details.lemma!==item.word?`Dictionary form · ${details.lemma}`:''].filter(Boolean).join(' · ')}
    </p>}
    {details?.usage&&<p className="saved-learning-note">{details.usage}</p>}
    {text&&<blockquote className="wb-learning-content" data-context-example>
      {(item.example_source==='ai'||details?.exampleSource==='ai')&&<small className="ai-label">AI-generated example</small>}
      {details?.exampleSource==='ai'&&!details.highlight?text:<HighlightWord text={text} target={item.word} surface={details?.highlight} language={language}/>}
      {details?.exampleTranslation&&<small className="saved-learning-note">{details.exampleTranslation}</small>}
    </blockquote>}
    {item.personal_note&&<p className="saved-learning-note"><strong>Personal note</strong> {item.personal_note}</p>}
  </>;
}
