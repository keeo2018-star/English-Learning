'use client';

import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './icon';
import {LanguageMark} from './language-mark';
import {languageIdentity} from '@/lib/language-colors';

export type LanguageOption = { id:string; label:string; language?:string; description?:string };

export function LanguagePicker({options,value,onSelect,label,disabled=false,align='end', plain=false}:{
  options:LanguageOption[]; value:string; onSelect:(id:string)=>void; label:string; disabled?:boolean; align?:'start'|'end'; plain?:boolean;
}) {
  const selected=options.find(option=>option.id===value);
  const [open,setOpen]=useState(false);
  const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const firstFocus=useRef<'active'|'first'|'last'>('active');
  const id=useId();
  const [placement,setPlacement]=useState<{host:HTMLDialogElement;style:CSSProperties}|null>(null);
  function position(){
    const button=trigger.current;
    const host=button?.closest('dialog');
    if(!button||!host)return;
    const rect=button.getBoundingClientRect(),viewport=window.visualViewport;
    const bottom=(viewport?.offsetTop??0)+(viewport?.height??window.innerHeight);
    const above=rect.top-(viewport?.offsetTop??0), below=bottom-rect.bottom;
    const opensUp=below<180&&above>below;
    setPlacement({host,style:{position:'fixed',left:Math.max(8,Math.min(rect.left,innerWidth-233)),right:'auto',
      top:opensUp?'auto':rect.bottom+4,bottom:opensUp?innerHeight-rect.top+4:'auto',
      maxHeight:Math.max(60,Math.min(280,(opensUp?above:below)-12))}});
  }
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
    const dismiss=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false);};
    const dismissOnResize=()=>setOpen(false);
    document.addEventListener('pointerdown',dismiss);
    window.addEventListener('resize',dismissOnResize);
    return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',dismissOnResize);};
  },[open]);
  const optionsMenu=    <div id={id} ref={menu} style={placement?.style} className="language-menu" role="menu" aria-label={plain?label:label==='Calendar language'?'Calendar languages':'Learning Collections'} onKeyDown={event=>{
      const buttons=items(),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
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
        {(!plain||option.language)&&<LanguageMark language={option.language||''} dot/>}
        <span className="language-option-copy"><strong>{option.label}</strong>
          {option.description&&<small id={`${id}-option-${index}`}>{option.description}</small>}</span>
        {option.id===value&&<Icon name="check" size={16}/>}
      </button>)}
    </div>;
  return <div ref={container} className="learning-language" data-align={align} data-plain={plain||undefined} role="group" aria-label={plain?label:label==='Calendar language'?'Filter learning activity':'Learning language'}>
    <button ref={trigger} type="button" className="language-trigger" data-collection-name={selected?.label}
      style={{'--wb-language-color':selected?.language?languageIdentity(selected.language).color:'var(--wb-grey)'} as CSSProperties}
      aria-label={label} aria-describedby={`${id}-value`} aria-controls={open?id:undefined} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onClick={()=>{firstFocus.current='active';if(!open)position();setOpen(value=>!value);}}
      onKeyDown={event=>{
        if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
        event.preventDefault();firstFocus.current=event.key==='ArrowUp'?'last':'first';
        if(!open){position();setOpen(true);}else (firstFocus.current==='last'?items().at(-1):items()[0])?.focus({preventScroll:true});
      }}>
      <span id={`${id}-value`}>{selected?.label||'All languages'}</span><Icon name="chevronDown" size={16}/>
    </button>
    {open&&(placement?createPortal(optionsMenu,placement.host):optionsMenu)}
  </div>;
}
