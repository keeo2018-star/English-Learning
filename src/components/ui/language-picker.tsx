'use client';

import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {Icon} from './icon';
import {LanguageMark} from './language-mark';
import {languageIdentity} from '@/lib/language-colors';

export type LanguageOption = { id:string; label:string; language?:string; description?:string };

export function LanguagePicker({options,value,onSelect,label,disabled=false,align='end'}:{
  options:LanguageOption[]; value:string; onSelect:(id:string)=>void; label:string; disabled?:boolean; align?:'start'|'end';
}) {
  const selected=options.find(option=>option.id===value);
  const [open,setOpen]=useState(false);
  const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const firstFocus=useRef<'active'|'first'|'last'>('active');
  const id=useId();
  function close(restore=false){setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});}
  const items=()=>Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')??[]);
  useLayoutEffect(()=>{
    if(!open)return;
    const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')??[]);
    const option=firstFocus.current==='first'?buttons[0]:firstFocus.current==='last'?buttons.at(-1):buttons.find(button=>button.getAttribute('aria-checked')==='true')??buttons[0];
    option?.focus({preventScroll:true});
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',dismiss);
    return()=>document.removeEventListener('pointerdown',dismiss);
  },[open]);
  return <div ref={container} className="learning-language" data-align={align} role="group" aria-label={label==='Calendar language'?'Filter learning activity':'Learning language'}>
    <button ref={trigger} type="button" className="language-trigger" data-collection-name={selected?.label}
      style={{'--wb-language-color':selected?.language?languageIdentity(selected.language).color:'var(--wb-grey)'} as CSSProperties}
      aria-label={label} aria-describedby={`${id}-value`} aria-controls={open?id:undefined} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onClick={()=>{firstFocus.current='active';setOpen(value=>!value);}}
      onKeyDown={event=>{
        if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
        event.preventDefault();firstFocus.current=event.key==='ArrowUp'?'last':'first';
        if(!open)setOpen(true);else (firstFocus.current==='last'?items().at(-1):items()[0])?.focus({preventScroll:true});
      }}>
      <span id={`${id}-value`}>{selected?.label||'All languages'}</span><Icon name="chevronDown" size={16}/>
    </button>
    {open&&<div id={id} ref={menu} className="language-menu" role="menu" aria-label={label==='Calendar language'?'Calendar languages':'Learning Collections'} onKeyDown={event=>{
      const buttons=items(),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==='Escape'){event.preventDefault();close(true);}
      else if(event.key==='Tab')close(true);
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }
    }}>
      {options.map((option,index)=><button type="button" key={option.id} tabIndex={-1} role="menuitemradio" aria-label={option.label}
        aria-describedby={option.description?`${id}-option-${index}`:undefined} aria-checked={option.id===value}
        onClick={()=>{onSelect(option.id);close(true);}}>
        <LanguageMark language={option.language||''} dot/>
        <span className="language-option-copy"><strong>{option.label}</strong>
          {option.description&&<small id={`${id}-option-${index}`}>{option.description}</small>}</span>
        {option.id===value&&<Icon name="check" size={16}/>}
      </button>)}
    </div>}
  </div>;
}
