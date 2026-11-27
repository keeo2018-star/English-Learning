'use client';

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './icon';

let locks = 0;
let unlockPage = () => {};
function lockPage() {
  if (locks++ === 0) {
    const y = window.scrollY, body = document.body;
    const original = {position:body.style.position, top:body.style.top, width:body.style.width, overflow:body.style.overflow};
    const frames = Array.from(document.querySelectorAll<HTMLElement>('.wb-app-frame')).map(node=>({node,overflow:node.style.overflow,scroll:node.scrollTop}));
    body.style.position='fixed'; body.style.top=`${-y}px`; body.style.width='100%'; body.style.overflow='hidden';
    frames.forEach(({node})=>{node.style.overflow='hidden';});
    unlockPage=()=>{Object.assign(body.style,original); frames.forEach(({node,overflow,scroll})=>{node.style.overflow=overflow;node.scrollTop=scroll;});window.scrollTo(0,y);};
  }
  return ()=>{if (--locks===0) unlockPage();};
}

export function Sheet({ title, onClose, busy, children, id, wide, bodyRef, returnFocus, swipe, onBackdrop, portal, footer }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode; id?: string; wide?: boolean;
  portal?:boolean; footer?:ReactNode; swipe?: boolean; onBackdrop?: boolean; bodyRef?: RefObject<HTMLDivElement|null>; returnFocus?: RefObject<HTMLElement|null>;
}) {
  const element = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const titleTarget = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  const innerBody = useRef<HTMLDivElement>(null);
  const [keyboard, setKeyboard] = useState(false);
  const backdropPointer = useRef(false);
  const dismiss = () => { if (!busy) onClose(); };
  useLayoutEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    const previous = returnFocus?.current ?? document.activeElement;
    const unlock = lockPage();
    let pointer = !previous?.matches(':focus-visible');
    const onPointer = () => { pointer = true; };
    const onKey = () => { pointer = false; };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    dialog.showModal();
    titleTarget.current?.focus({preventScroll:true});
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      if (pointer && previous instanceof HTMLElement && previous.matches('button,a[href],[role=button]') && previous.isConnected) {
        previous.dataset.wbPointerRestored = 'true';
        const clear = () => {
          delete previous.dataset.wbPointerRestored;
          previous.removeEventListener('blur', clear);
          previous.removeEventListener('keydown', clear, true);
        };
        previous.addEventListener('blur', clear, { once: true });
        previous.addEventListener('keydown', clear, { once: true, capture: true });
      }
      dialog.close();
      unlock();
      if (previous instanceof HTMLElement && previous.matches('button,a[href],input,textarea,select,[role=button]') && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [returnFocus]);
  useEffect(()=>{
    const dialog=element.current, body=innerBody.current, viewport=window.visualViewport;
    if(!dialog||!body)return;
    let frame=0, baseline=viewport?.height??window.innerHeight, editing=false, reading=body.scrollTop, wasKeyboard=false;
    const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&target.matches('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]');
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const height=viewport?.height??window.innerHeight, offset=viewport?.offsetTop??0;
        if(!editing)baseline=Math.max(baseline,height);
        const open=baseline-height>120;
        setKeyboard(open);
        dialog.style.setProperty('--wb-sheet-viewport',`${height}px`);
        dialog.style.top=`${Math.max(offset,offset+height-dialog.getBoundingClientRect().height)}px`;
        dialog.style.bottom='auto';
        if(open&&editable(document.activeElement)){
          const active=document.activeElement as HTMLElement, rect=active.getBoundingClientRect(), bounds=body.getBoundingClientRect();
          // Scroll the sheet, never the background or document. Keep edit actions in view too.
          const actions=active.closest('form')?.querySelector('button[type=submit],button:not([type])')?.getBoundingClientRect();
          const bottom=Math.min(actions?.bottom??rect.bottom,rect.bottom+96);
          if(bottom>bounds.bottom-12)body.scrollTop+=bottom-bounds.bottom+12;
          if(rect.top<bounds.top+12)body.scrollTop-=bounds.top+12-rect.top;
        } else if(wasKeyboard&&!open){body.scrollTop=reading;}
        wasKeyboard=open;
      });
    };
    const focus=(event:FocusEvent)=>{if(editable(event.target)){if(!editing)reading=body.scrollTop;editing=true;}update();};
    const blur=()=>{if(!editable(document.activeElement))editing=false;update();};
    body.addEventListener('focusin',focus);body.addEventListener('focusout',blur);
    viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
    const observer=new ResizeObserver(update);observer.observe(dialog);update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();body.removeEventListener('focusin',focus);body.removeEventListener('focusout',blur);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  useEffect(() => {
    const node=header.current, dialog=element.current;
    if(!swipe||busy||!node||!dialog)return;
    let start:{x:number;y:number;distance:number}|null=null;
    const reset=()=>{start=null;dialog.style.removeProperty('--wb-sheet-drag');delete dialog.dataset.dragging;};
    const begin=(event:TouchEvent)=>{
      reset();
      if(!matchMedia('(max-width: 699px)').matches||event.touches.length!==1||
        (event.target instanceof Element&&event.target.closest('button,a,input')))return;
      const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,distance:0};
    };
    const move=(event:TouchEvent)=>{
      if(!start||event.touches.length!==1)return;
      const touch=event.touches[0],dy=touch.clientY-start.y,dx=Math.abs(touch.clientX-start.x);
      if(dy<0||dx>Math.max(12,dy)){reset();return;}
      if(dy<8)return;
      if(event.cancelable)event.preventDefault();
      start.distance=dy;dialog.dataset.dragging='true';dialog.style.setProperty('--wb-sheet-drag',Math.min(dy,180)+'px');
    };
    const end=()=>{const close=(start?.distance??0)>=96;reset();if(close)onClose();};
    node.addEventListener('touchstart',begin,{passive:true});
    node.addEventListener('touchmove',move,{passive:false});
    node.addEventListener('touchend',end);
    node.addEventListener('touchcancel',reset);
    return()=>{reset();node.removeEventListener('touchstart',begin);node.removeEventListener('touchmove',move);
      node.removeEventListener('touchend',end);node.removeEventListener('touchcancel',reset);};
  },[busy,onClose,swipe]);
  const sheet = <dialog ref={element} id={id} className="language-sheet wb-bottom-sheet" data-wide={wide||undefined} aria-labelledby={heading}
    onPointerDown={event=>{backdropPointer.current=event.target===event.currentTarget;}}
    onClick={event=>{if(onBackdrop&&backdropPointer.current&&event.target===event.currentTarget)dismiss();backdropPointer.current=false;}}
    onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="wb-sheet-layout">
      <header ref={header} className="wb-sheet-header" data-dictionary-drag-handle={swipe!==undefined||undefined}><h2 id={heading} ref={titleTarget} tabIndex={-1}>{title}</h2>
        <div className="wb-sheet-header-actions">{keyboard&&<button type="button" className="text-button" onClick={()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}}>Done</button>}
        <IconButton icon="close" label="Close" variant="soft" disabled={busy} onClick={dismiss}/></div>
      </header>
      <div className="wb-sheet-body" ref={node=>{innerBody.current=node;if(bodyRef)bodyRef.current=node;}}>{children}</div>
      {footer&&<footer className="wb-sheet-footer">{footer}</footer>}
      <div className="wb-sheet-toast-anchor" role="status" aria-live="polite" aria-atomic="true"/>
    </div>
  </dialog>;
  return portal&&typeof document!=='undefined'?createPortal(sheet,document.body):sheet;
}
