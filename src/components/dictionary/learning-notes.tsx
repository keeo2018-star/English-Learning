'use client';

import {useEffect,useRef,useState} from 'react';
import {aiStatus,requestEnrichment,cachedEnrichment,type AiStatus} from '@/lib/ai-client';
import type {DictionaryEnrichment,EnrichmentInput} from '@/lib/dictionary-enrichment';
import {Disclosure} from '@/components/ui/disclosure';
import {HighlightWord} from './highlight-word';
import styles from './dictionary.module.css';

export function LearningNotes({input}:{input:EnrichmentInput}) {
  const [status,setStatus]=useState<AiStatus|null>(null);const [check,setCheck]=useState(0);
  const [notes,setNotes]=useState<DictionaryEnrichment|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{
    let mounted=true;
    void aiStatus().then(value=>{if(mounted)setStatus(value);});void cachedEnrichment(input).then(value=>{if(mounted&&value)setNotes(value);});
    return()=>{mounted=false;active.current?.abort();};
  },[input,check]);
  async function generate(){
    if(active.current)return;
    const request=new AbortController();
    active.current=request;
    setBusy(true);setError('');
    try{setNotes(await requestEnrichment(input,request.signal));}
    catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Could not generate learning notes.');}
    finally{active.current=null;if(!request.signal.aborted)setBusy(false);}
  }
  if(!status)return <p className="wb-supporting" role="status">Checking learning notes…</p>;
  return <section className={styles.learningNotes} aria-label="AI learning notes">
    <h3>Learning notes</h3>
    {!status.available&&!notes?<p className="wb-supporting" role="status">{status.reason==='request'?'Couldn’t check AI availability.':status.reason==='quota'?'AI request limit reached.':'AI learning notes are not enabled. Dictionary reference remains available.'} <button type="button" className="text-button" onClick={()=>setCheck(n=>n+1)}>Check again</button></p>:notes?<><small>AI-assisted suggestions</small>
      {notes.comparisons.length>0&&<Disclosure label="Compare words"><dl>
        {notes.comparisons.map(item=><div key={item.expression}><dt>{item.expression}</dt><dd>{item.explanation}{item.coreMeaning&&<p><strong>Meaning:</strong> {item.coreMeaning}</p>}{item.register&&<p><strong>Tone:</strong> {item.register}</p>}{item.situation&&<p><strong>Use:</strong> {item.situation}</p>}{item.example&&<p>{item.example}</p>}</dd></div>)}
      </dl></Disclosure>}
      {notes.collocations.length>0&&<section><h4>Suggested collocations</h4><dl>
        {notes.collocations.map(item=><div key={item.expression}><dt><HighlightWord text={item.expression} target={input.word}/></dt><dd>{item.explanation}</dd></div>)}
      </dl></section>}
      {(notes.contexts.length>0||notes.usage)&&<section><h4>When to use it</h4>
        {notes.usage&&<p>{notes.usage}</p>}
        {notes.contexts.length>0&&<ul>{notes.contexts.map(context=><li key={context}>{context}</li>)}</ul>}
      </section>}
    </>:<><p>Generate with Gemini using this entry, its meaning and learning settings. Your saved meaning stays unchanged.</p>
      <button className="text-button" type="button" disabled={busy} onClick={()=>void generate()}>
        {busy?'Preparing learning notes…':error?'Retry learning notes':'Generate learning notes'}
      </button>
    </>}
    {error&&<p role="status">{error}</p>}
  </section>;
}
