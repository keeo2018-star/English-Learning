'use client';

import {useEffect,useRef,useState} from 'react';
import {cachedEnrichment,requestEnrichment} from '@/lib/ai-client';
import type {DictionaryEnrichment,EnrichmentInput} from '@/lib/dictionary-enrichment';
import {HighlightWord} from './highlight-word';
import styles from './dictionary.module.css';

export function LearningNotes({input}:{input:EnrichmentInput}) {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [notes,setNotes]=useState<DictionaryEnrichment|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const active=useRef<AbortController|null>(null);
  const {word,target,explanation,level,partOfSpeech}=input;
  useEffect(()=>{
    const controller=new AbortController();
    void cachedEnrichment({word,target,explanation,level,partOfSpeech},controller.signal).then(state=>{
      if(!controller.signal.aborted){setAvailable(state.available);setNotes(state.result);}
    }).catch(()=>{if(!controller.signal.aborted)setAvailable(false);});
    return()=>{controller.abort();active.current?.abort();};
  },[word,target,explanation,level,partOfSpeech]);
  async function generate(){
    if(active.current)return;
    const request=new AbortController();
    active.current=request;
    setBusy(true);setError('');
    try{setNotes(await requestEnrichment(input,request.signal));}
    catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Could not generate learning notes.');}
    finally{active.current=null;if(!request.signal.aborted)setBusy(false);}
  }
  if(available===null)return null;
  if(!available)return <p className={styles.learningAvailability}>AI learning notes are unavailable in this session.</p>;
  return <section className={notes?styles.learningNotes:styles.learningAvailability} aria-label="AI learning notes">
    <h3>Learning notes</h3>
    {notes?<><small>AI-assisted suggestions</small>
      {notes.comparisons.length>0&&<section><h4>Similar but not the same</h4><dl>
        {notes.comparisons.map(item=><div key={item.expression}><dt>{item.expression}</dt><dd>{item.explanation}</dd></div>)}
      </dl></section>}
      {notes.collocations.length>0&&<section><h4>Suggested collocations</h4><dl>
        {notes.collocations.map(item=><div key={item.expression}><dt><HighlightWord text={item.expression} target={input.word}/></dt><dd>{item.explanation}</dd></div>)}
      </dl></section>}
      {(notes.contexts.length>0||notes.usage)&&<section><h4>When to use it</h4>
        {notes.usage&&<p>{notes.usage}</p>}
        {notes.contexts.length>0&&<ul>{notes.contexts.map(context=><li key={context}>{context}</li>)}</ul>}
      </section>}
    </>:<><p>Send this expression and its learning settings to Gemini for comparisons and usage. Your saved notes and meaning stay private.</p>
      <button className="text-button" type="button" disabled={busy} onClick={()=>void generate()}>
        {busy?'Preparing learning notes…':error?'Retry learning notes':'Generate learning notes'}
      </button>
    </>}
    {error&&<p role="status">{error}</p>}
  </section>;
}
