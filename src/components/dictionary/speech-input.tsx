'use client';

import {useEffect,useRef,useState} from 'react';
import {Sheet} from '@/components/ui/sheet';
import {Select} from '@/components/ui/select';
import {ImeTextarea} from '@/components/ui/ime-field';
import {learningLanguages,type TargetLanguage} from '@/lib/collections';

type SpeechResult = { results:ArrayLike<ArrayLike<{transcript:string}>> };
type Recognition = {
  lang:string; continuous:boolean; interimResults:boolean;
  onstart:(()=>void)|null; onend:(()=>void)|null;
  onresult:((event:SpeechResult)=>void)|null; onerror:((event:{error:string})=>void)|null;
  start:()=>void; stop:()=>void; abort:()=>void;
};
function engine(){
  if(typeof window==='undefined')return;
  const browser=window as Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
  return browser.SpeechRecognition||browser.webkitSpeechRecognition;
}
const errors:Record<string,string>={
  'not-allowed':'Microphone access was denied. You can type or paste instead.',
  'service-not-allowed':'Speech recognition is unavailable here. Try keyboard dictation.',
  'no-speech':'No speech was recognised. Try speaking again.',
  'network':'Speech recognition could not connect. Check your connection.',
  'audio-capture':'No microphone is available.',
};

export function SpeechInput({language,onClose,onUse,replace}:{language:TargetLanguage;onClose:()=>void;onUse:(value:string)=>void;replace:boolean}){
 const [source,setSource]=useState(language),[text,setText]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');
 const device=useRef<Recognition|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{
  const discard=()=>{
    clearTimeout(timer.current);
    const recognition=device.current;device.current=null;
    if(recognition){recognition.onend=null;recognition.onstart=null;recognition.onresult=null;recognition.onerror=null;try{recognition.abort();}catch{/* Browser already stopped. */}}
  };
  const hide=()=>{if(document.visibilityState==='hidden'&&device.current){discard();setStatus('');setError('Listening stopped while Noted was in the background.');}};
  document.addEventListener('visibilitychange',hide);
  return()=>{document.removeEventListener('visibilitychange',hide);discard();};
 },[]);
 function start(){
  const constructor=engine();
  if(!constructor||device.current)return;
  setError('');setStatus('Requesting microphone access…');
  let heard=false, failed=false;
  const recognition=new constructor();device.current=recognition;
  recognition.lang=learningLanguages[source].locale;recognition.continuous=false;recognition.interimResults=false;
  const finish=(message?:string)=>{
    if(device.current!==recognition)return;
    clearTimeout(timer.current);device.current=null;setStatus('');
    if(message)setError(message);
  };
  recognition.onstart=()=>{if(device.current===recognition)setStatus('Listening…');};
  recognition.onresult=event=>{
    if(device.current!==recognition)return;
    const transcript=Array.from(event.results).map(result=>result[0]?.transcript||'').join(' ').trim();
    if(transcript){heard=true;setText(transcript);}
  };
  recognition.onerror=event=>{failed=true;finish(errors[event.error]||'Speech could not be recognised. Try typing or pasting.');};
  recognition.onend=()=>finish(!heard&&!failed?'No speech was recognised. Try again.':undefined);
  timer.current=setTimeout(()=>{finish(heard?undefined:'Listening timed out. Try a shorter phrase.');recognition.abort();},25000);
  try{recognition.start();}catch{finish('Speech recognition could not start. Try keyboard dictation.');}
 }
 return <Sheet title="Voice input" onClose={onClose}>
  <div className="language-sheet-fields wb-acquisition">
   <p>Your browser handles speech recognition and may send audio to its speech service. Noted keeps only the text you choose to use.</p>
   {!engine()?<p>Direct speech recognition is unavailable here. Use your keyboard’s dictation button in Add.</p>:<>
    <label>Spoken language<Select value={source} disabled={!!status} onChange={e=>setSource(e.target.value as TargetLanguage)}>
     {Object.entries(learningLanguages).map(([key,value])=><option value={key} key={key}>{value.label}</option>)}
    </Select><small>This browser needs a spoken language before it can listen.</small></label>
    {status?<><p role="status">{status}</p><button type="button" onClick={()=>{try{setStatus('Processing speech…');device.current?.stop();}catch{setError('The microphone is not ready. Cancel or wait for recognition.');}}}>Stop</button></>:
      <button type="button" onClick={start}>{text?'Listen again':'Start listening'}</button>}
   </>}
   {text&&<><label>Recognised speech<ImeTextarea value={text} onValueChange={setText} rows={3}/></label>
    <button type="button" disabled={!!status||!text.trim()} onClick={()=>onUse(text)}>{replace?'Replace Add text':'Use text'}</button></>}
   {error&&<p role="alert">{error}</p>}
   <button className="text-button" type="button" onClick={onClose}>Cancel</button>
  </div>
 </Sheet>;
}
