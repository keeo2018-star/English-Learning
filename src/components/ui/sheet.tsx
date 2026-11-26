'use client';

import { useEffect, useLayoutEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './icon';

export function Sheet({ title, onClose, busy, children, id, wide, bodyRef, returnFocus, swipe, onBackdrop, portal, footer }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode; id?: string; wide?: boolean;
  portal?:boolean; footer?:ReactNode; swipe?: boolean; onBackdrop?: boolean; bodyRef?: RefObject<HTMLDivElement|null>; returnFocus?: RefObject<HTMLElement|null>;
}) {
  const element = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const titleTarget = useRef<HTMLHeadingElement>(null);
  const header = useRef<HTMLElement>(null);
  const backdropPointer = useRef(false);
  const dismiss = () => { if (!busy) onClose(); };
  useLayoutEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    const previous = returnFocus?.current ?? document.activeElement;
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
      if (previous instanceof HTMLElement && previous.matches('button,a[href],input,textarea,select,[role=button]') && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [returnFocus]);
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
        <IconButton icon="close" label="Close" variant="soft" disabled={busy} onClick={dismiss}/>
      </header>
      <div className="wb-sheet-body" ref={bodyRef}>{children}</div>
      {footer&&<footer className="wb-sheet-footer">{footer}</footer>}
      <div className="wb-sheet-toast-anchor" role="status" aria-live="polite" aria-atomic="true"/>
    </div>
  </dialog>;
  return portal&&typeof document!=='undefined'?createPortal(sheet,document.body):sheet;
}
