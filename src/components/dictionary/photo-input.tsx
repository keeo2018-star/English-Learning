'use client';

import {useEffect,useRef,useState} from 'react';
import {Sheet} from '@/components/ui/sheet';
import {ImeTextarea} from '@/components/ui/ime-field';
import {photoCanvas,recognizePhoto,selectedInput} from '@/lib/photo-text';

export function PhotoInput({onClose,onUse,replace}:{onClose:()=>void;onUse:(value:string)=>void;replace:boolean}){
  const [preview,setPreview]=useState(''),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const canvas=useRef<HTMLCanvasElement|null>(null), active=useRef<AbortController|null>(null);
  const transcript=useRef<HTMLTextAreaElement>(null);
  function useSelectedText(){
    const input=transcript.current;
    const value=selectedInput(text,input?.selectionStart??0,input?.selectionEnd??0);
    if(value)onUse(value);
  }
  useEffect(()=>()=>active.current?.abort(),[]);
  async function choose(file:File|undefined){
    if(!file)return;
    active.current?.abort();const attempt=new AbortController();active.current=attempt;
    setBusy('Opening photo…');setError('');setPreview('');setText('');canvas.current=null;
    try{
      const image=await photoCanvas(file);
      if(attempt.signal.aborted)return;
      canvas.current=image;
      setPreview(image.toDataURL('image/jpeg',.8));
    }catch(failure){if(!attempt.signal.aborted)setError(failure instanceof Error?failure.message:'The photo could not be opened.');}
    finally{if(!attempt.signal.aborted)setBusy('');}
  }
  function rotate(){
    const current=canvas.current;
    if(!current||busy)return;
    const rotated=document.createElement('canvas');
    rotated.width=current.height;rotated.height=current.width;
    const context=rotated.getContext('2d');
    if(!context)return;
    context.translate(rotated.width,0);context.rotate(Math.PI/2);context.drawImage(current,0,0);
    canvas.current=rotated;
    setPreview(rotated.toDataURL('image/jpeg',.8));setText('');setError('');
  }
  async function scan(){
    if(!canvas.current||busy)return;
    const attempt=new AbortController();active.current=attempt;
    setBusy('Recognising text…');setError('');
    const timer=setTimeout(()=>{attempt.abort();setBusy('');setError('Recognition took too long. Try a smaller photo or paste the text.');},45000);
    attempt.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
    try{
      const result=await recognizePhoto(canvas.current,attempt.signal);
      if(!attempt.signal.aborted){
        setText(result);
        if(!result)setError('No readable text found. Try a sharper photo.');
      }
    }catch{if(!attempt.signal.aborted)setError('Couldn’t recognise this photo. Check your connection to download recognition files, or try a sharper image.');}
    finally{clearTimeout(timer);if(!attempt.signal.aborted)setBusy('');}
  }
  return <Sheet title="Scan text from photo" onClose={onClose}>
    <div className="language-sheet-fields wb-acquisition">
      <p>Recognition runs on this device. The app downloads language files and keeps your photo in this sheet.</p>
      <div className="wb-acquisition-files">
        <label>Take a photo<input type="file" accept="image/*" capture="environment" onChange={e=>void choose(e.target.files?.[0])}/></label>
        <label>Choose an image<input type="file" accept="image/*" onChange={e=>void choose(e.target.files?.[0])}/></label>
      </div>
      {preview&&/* Local, resized preview URL. */ <picture><img src={preview} alt="Selected photo preview"/></picture>}
      {preview&&<button type="button" className="secondary" disabled={!!busy} onClick={rotate}>Rotate photo</button>}
      {preview&&!text&&<button type="button" onClick={()=>void scan()} disabled={!!busy}>Recognise text</button>}
      {busy&&<p role="status">{busy}</p>}
      {text&&<><label>Recognised text<ImeTextarea ref={transcript} value={text} onValueChange={setText} rows={5}/></label>
        <small>Select a line or phrase, or edit the text before using it.</small>
        <button type="button" disabled={!text.trim()} onClick={useSelectedText}>{replace?'Replace Add text':'Use text'}</button></>}
      {error&&<p role="alert">{error}</p>}
      <button className="text-button" type="button" onClick={onClose}>Cancel</button>
    </div>
  </Sheet>;
}
