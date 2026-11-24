'use client';
import { useEffect, useRef, useState } from 'react';
import { cachedExample, resolveExample, type ExampleItem } from '@/lib/context-examples';
import { HighlightWord } from '@/components/dictionary/highlight-word';
export function ContextExample({item, owner, persist = true}: {item: ExampleItem; owner: string; persist?: boolean}) {
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
      if (!current.example?.trim()) void resolveExample(owner,current,persist).then(text => {if(active)setResolved({key:identity,text});});
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting); if(visible)load();
    },{rootMargin:'100px'}) : null;
    if(observer && anchor.current)observer.observe(anchor.current.parentElement || anchor.current); else {visible=true;load();}
    window.addEventListener('online',load);
    return ()=>{active=false;observer?.disconnect();window.removeEventListener('online',load);};
  },[identity,owner,item.id,item.word,item.meaning,item.example,persist]);
  const text = item.example?.trim() ? item.example : resolved?.key === identity ? resolved.text : '';
  return <><span ref={anchor} aria-hidden="true" />{text&&<blockquote className="wb-learning-content" data-context-example>{item.example_source==='ai'&&<small className="ai-label">AI-generated example</small>}<HighlightWord text={text} target={item.word}/></blockquote>}</>;
}
