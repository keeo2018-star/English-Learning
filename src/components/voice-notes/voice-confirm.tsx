"use client";
import {useEffect,useId,useRef} from 'react';
export function VoiceConfirm({title,description,busy,onCancel,onConfirm,confirmLabel='Delete recording',preserve}:{title:string;description:string;busy:boolean;onCancel:()=>void;onConfirm:()=>void;confirmLabel?:string;preserve?:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{const previous=document.activeElement;ref.current?.showModal();cancel.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true})}},[]);
 return <dialog ref={ref} className="wb-dialog" aria-labelledby={id} onCancel={event=>{event.preventDefault();if(!busy)onCancel()}}><h2 id={id}>{title}</h2><p>{description}</p><div className="actions"><button ref={cancel} type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>{preserve&&<button type="button" className="secondary" disabled={busy} onClick={preserve}>Preserve recording</button>}<button type="button" disabled={busy} onClick={onConfirm}>{busy?'Saving…':confirmLabel}</button></div></dialog>;
}
