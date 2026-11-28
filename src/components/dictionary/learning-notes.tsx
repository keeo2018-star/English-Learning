'use client';

import {useEffect,useRef,useState} from 'react';
import {aiStatus,requestEnrichment,cachedEnrichment,type AiStatus} from '@/lib/ai-client';
import type {DictionaryEnrichment,EnrichmentInput} from '@/lib/dictionary-enrichment';
import {Disclosure} from '@/components/ui/disclosure';
import {Button} from '@/components/ui/button';
import {HighlightWord} from './highlight-word';
import styles from './dictionary.module.css';

export function useLearningNotes(input:EnrichmentInput|null) {
  const [status,setStatus]=useState<AiStatus|null>(null);
  const [check,setCheck]=useState(0);
  const [cached,setCached]=useState<{input:EnrichmentInput;notes:DictionaryEnrichment}|null>(null);
  const [failure,setFailure]=useState<{input:EnrichmentInput;message:string}|null>(null);
  const [working,setWorking]=useState<EnrichmentInput|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{
    if(!input)return;
    const controller=new AbortController();
    void aiStatus().then(value=>{if(!controller.signal.aborted)setStatus(value);});
    void cachedEnrichment(input,AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]))
      .then(notes=>{if(notes&&!controller.signal.aborted)setCached({input,notes});}).catch(()=>{});
    return()=>{controller.abort();active.current?.abort();active.current=null;};
  },[input,check]);
  async function generate(){
    if(!input||active.current)return;
    const request=new AbortController();
    active.current=request;
    setWorking(input);setFailure(null);
    try{
      const notes=await requestEnrichment(input,request.signal);
      if(!request.signal.aborted)setCached({input,notes});
    } catch(error) {
      if(!request.signal.aborted)setFailure({input,message:error instanceof Error?error.message:'Could not generate learning notes.'});
    } finally {
      if(active.current===request){active.current=null;setWorking(null);}
    }
  }
  return {
    status, notes:input&&cached?.input===input?cached.notes:null,
    error:failure?.input===input?failure.message:'', busy:working===input&&!!input,
    generate, checkAgain:()=>setCheck(value=>value+1),
  };
}

export function AiMeaningAction({state}:{state:ReturnType<typeof useLearningNotes>}) {
  const {status,notes,error,busy,generate,checkAgain}=state;
  if(!status||notes)return null;
  if(!status.available)return <p className="wb-supporting" role="status">
    AI meaning is unavailable. <button type="button" className="text-button" onClick={checkAgain}>Check again</button>
  </p>;
  return <div className={styles.aiMeaningAction}>
    <Button variant="ghost" size="small" compactSurface disabled={busy} aria-busy={busy} onClick={()=>void generate()}>
      {busy?'Generating AI meaning…':error?'Retry AI meaning':'AI meaning'}
    </Button>
    <small>Sends this entry, its meaning and learning settings to Gemini.</small>
    {error&&<p role="status">{error}</p>}
  </div>;
}

export function LearningNotes({input,notes}:{input:EnrichmentInput;notes:DictionaryEnrichment}) {
  if(!notes.comparisons.length&&!notes.collocations.length&&!notes.contexts.length&&!notes.usage)return null;
  return <Disclosure label="Learning notes" defaultOpen>
    <section className={styles.learningNotes} aria-label="AI learning notes">
      <small>AI-assisted suggestions</small>
      {notes.comparisons.length>0&&<Disclosure label="Compare words" defaultOpen><dl>
        {notes.comparisons.map(item=><div key={item.expression}><dt>{item.expression}</dt><dd>{item.explanation}{item.coreMeaning&&<p><strong>Meaning:</strong> {item.coreMeaning}</p>}{item.register&&<p><strong>Tone:</strong> {item.register}</p>}{item.situation&&<p><strong>Use:</strong> {item.situation}</p>}{item.example&&<p>{item.example}</p>}</dd></div>)}
      </dl></Disclosure>}
      {notes.collocations.length>0&&<section><h4>Suggested collocations</h4><dl>
        {notes.collocations.map(item=><div key={item.expression}><dt><HighlightWord text={item.expression} target={input.word}/></dt><dd>{item.explanation}</dd></div>)}
      </dl></section>}
      {(notes.contexts.length>0||notes.usage)&&<section><h4>When to use it</h4>
        {notes.usage&&<p>{notes.usage}</p>}
        {notes.contexts.length>0&&<ul>{notes.contexts.map(context=><li key={context}>{context}</li>)}</ul>}
      </section>}
    </section>
  </Disclosure>;
}
