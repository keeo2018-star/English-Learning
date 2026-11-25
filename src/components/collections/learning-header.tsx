'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import {PageHeader} from '@/components/ui/page-header';
import {LanguageMark} from '@/components/ui/language-mark';
import {languageIdentity} from '@/lib/language-colors';
import {learningLanguages,type LearningCollection} from '@/lib/collections';
export function LearningHeader({title,legacyTitle=title,enabled=false,collections=[],active,onSelect,disabled=false,brand=false}:{title:ReactNode;legacyTitle?:ReactNode;enabled?:boolean;collections?:LearningCollection[];active?:LearningCollection|null;onSelect?:(id:string)=>void;disabled?:boolean;brand?:boolean}){
 return <PageHeader title={enabled?title:legacyTitle} brand={brand}>
  {enabled&&active&&collections.length>1&&onSelect&&<LanguageMenu collections={collections} active={active} onSelect={onSelect} disabled={disabled}/>}
 </PageHeader>;
}
function LanguageMenu({collections,active,onSelect,disabled}:{collections:LearningCollection[];active:LearningCollection;onSelect:(id:string)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const focusRequest=useRef<'active'|'first'|'last'>('active');
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus({preventScroll:true});};
 useLayoutEffect(()=>{if(!open)return;const options=menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');const selected=menu.current?.querySelector<HTMLButtonElement>('[aria-checked=true]');const target=focusRequest.current==='last'?options?.[options.length-1]:focusRequest.current==='first'?options?.[0]:selected;target?.focus({preventScroll:true});},[open]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 const label=learningLanguages[active.target_language].label;
 return <div className="learning-language" ref={container} role="group" aria-label="Learning language" onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}}}>
 <button ref={trigger} type="button" className="language-trigger" style={{'--wb-language-color':languageIdentity(active.target_language).color} as CSSProperties} aria-label="Switch learning Collection" aria-describedby={`active-language-${active.id}`} data-collection-name={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>{focusRequest.current='active';setOpen(value=>!value);}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusRequest.current=event.key==='ArrowUp'?'last':'first';if(!open)setOpen(true);else{const options=menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');(focusRequest.current==='last'?options?.[options.length-1]:options?.[0])?.focus({preventScroll:true});}}}}><span id={`active-language-${active.id}`}>{active.target_language==='zh-CN'?'Chinese':label}</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
 {open&&<div ref={menu} className="language-menu" role="menu" aria-label="Learning Collections" onKeyDown={event=>{const options=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')],index=options.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(index+1)%options.length:(index-1+options.length)%options.length;options[next]?.focus();}else if(event.key==='Tab')close(true);}}>
 {collections.map(row=>{const duplicate=collections.some(other=>other.id!==row.id&&other.target_language===row.target_language);return <button key={row.id} role="menuitemradio" aria-label={learningLanguages[row.target_language].label} aria-describedby={duplicate?`language-context-${row.id}`:undefined} aria-checked={row.id===active.id} tabIndex={-1} type="button" disabled={disabled} onClick={()=>{onSelect(row.id);close(true);}}><LanguageMark language={row.target_language} dot/><span className="language-option-copy"><strong>{learningLanguages[row.target_language].label}</strong>{duplicate&&<small id={`language-context-${row.id}`}>{row.explanation_language==='en'?'English':'Chinese'} explanations</small>}</span>{row.id===active.id&&<span aria-hidden="true">✓</span>}</button>})}
 </div>}
 </div>;
}
