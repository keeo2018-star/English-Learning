"use client";
import {Select} from '@/components/ui/select';
import {inputLanguage,isOriginalEnglish,learningLanguages,targetText,type LearningCollection,type TargetLanguage} from '@/lib/collections';
import {aiStatus,requestTranslation} from '@/lib/ai-client';
import type {TranslationCandidate} from '@/lib/translation-candidates';
import {englishResult,type SearchItem} from '@/lib/bilingual-contract';
import {dictionaryReference,rememberDictionaryReference} from '@/lib/dictionary-client';
import {selectExample} from '@/lib/example-quality';
import {HighlightWord} from './highlight-word';
import {ImeTextarea} from '@/components/ui/ime-field';
import {formIsComposing,imeBlocksSubmit} from '@/lib/ime';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useId, useRef, useState,useMemo,useCallback } from 'react';
import { Card } from '@/components/ui/primitives';
import type { Suggestion, MeaningSuggestion } from '@/lib/smart-add';
import styles from './smart-add.module.css';
import {Microphone} from '@/components/voice-notes/voice-editor';
import {VoiceDraftBox} from '@/components/voice-notes/voice-draft-box';
import {VoiceConfirm} from '@/components/voice-notes/voice-confirm';
import type {VoiceDraft} from '@/lib/voice-notes';
import {itemType} from '@/lib/learning';
import {useAdaptiveEditor} from '@/lib/use-adaptive-editor';
import {captureKey,textLength,extractExpression,ITEM_TEXT_LIMIT,CONTEXT_TEXT_LIMIT,type AddOutcome} from '@/lib/add-editor';
import voiceStyles from '@/components/voice-notes/voice-notes.module.css';
const cache = new Map<string, Suggestion[]>();
const knownMeanings = new Map<string, string>();
type Candidate = SearchItem & Partial<TranslationCandidate>;
export type AddDraft={translationContext?:string; candidateEdits?:Record<string,string>; candidates?:Candidate[]; selectedId?:string; ambiguous?:boolean;query:string;word:string;meaning:string;type:string;context:string;manual:boolean;voice:VoiceDraft|null;example:string;exampleSource:SearchItem['source'];source:TargetLanguage|'auto';request?:{fingerprint:string;id:string}|null};
type CollectionCapture={collection?:LearningCollection;initialDraft?:AddDraft;onDraftChange?:(draft:AddDraft)=>void;onInteractionBusy?:(busy:boolean)=>void};
export function AddWordFlow(props: CollectionCapture&{
  busy: boolean; canSave: boolean; checkingAccount: boolean;library?:{id:string;word:string}[];
  onManualSubmit: (event: React.FormEvent<HTMLFormElement>,voice?:VoiceDraft,requestId?:string) => Promise<AddOutcome>;
}) {
  if (!props.canSave) return <Card className="wb-ui-text"><p>{props.checkingAccount ? 'Checking your account…' : 'Sign in to save words to your private library.'}</p>{!props.checkingAccount && <Link className="wb-control" href="/auth">Sign in</Link>}</Card>;
  return <SmartAddForm {...props} />;
}
function SmartAddForm({ busy, onManualSubmit,library=[],collection,initialDraft,onDraftChange,onInteractionBusy }: CollectionCapture&{ busy: boolean;library?:{id:string;word:string}[]; onManualSubmit: (event: React.FormEvent<HTMLFormElement>,voice?:VoiceDraft,requestId?:string) => Promise<AddOutcome> }) {
  const [voice,setVoice]=useState<VoiceDraft|null>(initialDraft?.voice||null),[voiceBusy,setVoiceBusy]=useState(false),[voiceOpen,setVoiceOpen]=useState(false),[pendingType,setPendingType]=useState<string|null>(null);
  const [query,setQuery]=useState(initialDraft?.query||''),[candidates,setCandidates]=useState<Candidate[]>(initialDraft?.candidates||[]),[resolving,setResolving]=useState(false),[resolveError,setResolveError]=useState(''),[aiAvailable,setAiAvailable]=useState(false),[exampleSource,setExampleSource]=useState<SearchItem['source']>(initialDraft?.exampleSource||'dictionary'),[suggestedExample,setSuggestedExample]=useState(initialDraft?.example||'');
  const queryVersion=useRef(0),queryAbort=useRef<AbortController|null>(null);
  const target=collection?.target_language||'en',explanation=collection?.explanation_language||'zh-CN',legacy=isOriginalEnglish(collection);
  const [editingExpression,setEditingExpression]=useState(false);
  const [translationContext,setTranslationContext]=useState(initialDraft?.translationContext||'');
  const [candidateEdits,setCandidateEdits]=useState<Record<string,string>>(initialDraft?.candidateEdits||{});
  const [showAllCandidates,setShowAllCandidates]=useState(false);
  const [selectedId,setSelectedId]=useState(initialDraft?.selectedId||'');
  const [ambiguous,setAmbiguous]=useState(initialDraft?.ambiguous||false);
  const selectedCandidate=candidates.find(item=>(item.id||item.english)===selectedId);
  function clearCandidates(){setCandidates([]);setShowAllCandidates(false);setSelectedId('');setAmbiguous(false);setCandidateEdits({});}
  const [source,setSource]=useState<TargetLanguage|'auto'>(initialDraft?.source||'auto');
  const chinese=inputLanguage(query,target,source)!==target;
  const validTitle=useCallback((value:unknown,max=2000)=>targetText(value,target,max),[target]);

  const [word, setWord] = useState(initialDraft?.word||''), [meaning, setMeaning] = useState(initialDraft?.meaning||''), [type, setType] = useState(initialDraft?.type||'auto');
  const [context,setContext]=useState(initialDraft?.context||''),[pasted,setPasted]=useState(false),[extracting,setExtracting]=useState(false),[selected,setSelected]=useState({start:0,end:0}),[replaceContext,setReplaceContext]=useState<{expression:string;context:string}|null>(null),[saveError,setSaveError]=useState(''),[failed,setFailed]=useState(false),[remoteDuplicate,setRemoteDuplicate]=useState(false),[attemptId,setAttemptId]=useState(initialDraft?.request?.id||'');
  const resolveWithAi=useRef(false);
  const request=useRef<{fingerprint:string;id:string}|null>(initialDraft?.request||null),compositionEnded=useRef(-Infinity);
  const [items, setItems] = useState<Suggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [status, setStatus] = useState(''), [revision, setRevision] = useState(0), [composing, setComposing] = useState(false);
  const manual = useRef(initialDraft?.manual||false), focused = useRef(false), submitted = useRef(false), immediate = useRef(false), dismissed = useRef('');
  const explicitLookup = useRef<string | null>(null), manualRevision = useRef(0);
  const touch = useRef<{ id: number; x: number; y: number; word: string } | null>(null), ignoreClick = useRef(false);
  const current = useRef(initialDraft?.word||''), version = useRef(0), meaningInput = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<() => void>(() => {}), input = useRef<HTMLTextAreaElement>(null), id = useId();
  const {scale,mirror,probe,placement,reset:resetSizing}=useAdaptiveEditor(input,query,composing||busy);
  const index=useMemo(()=>new Map(library.map(item=>[captureKey(item.word),item])),[library]);
  const match=word.trim()?index.get(captureKey(word)):undefined,existing=match?.id===attemptId?undefined:match,duplicate=!!existing||remoteDuplicate;
  const learningDetails = selectedCandidate || translationContext.trim() || query.trim() !== word.trim() && word.trim()
    ? {
      originalInput: query, sourceLanguage: inputLanguage(query,target,source), explanationLanguage: explanation,
      source: selectedCandidate?.source, reference: selectedCandidate?.reference, expressionType: selectedCandidate?.expressionType,
      lemma: selectedCandidate?.lemma, partOfSpeech: selectedCandidate?.partOfSpeech, usage: selectedCandidate?.usage,
      register: selectedCandidate?.register, region: selectedCandidate?.region,
      exampleSource: suggestedExample ? exampleSource : undefined,
      exampleTranslation: suggestedExample ? selectedCandidate?.exampleTranslation : undefined,
      highlight: suggestedExample ? selectedCandidate?.highlight : undefined, translationContext,
    } : undefined;
  const overItem=textLength(word.trim())>ITEM_TEXT_LIMIT,overContext=textLength(context)>CONTEXT_TEXT_LIMIT;
  const expression=itemType({word,item_type:type==='auto'?null:type as 'word'|'expression'})==='expression';
  const extraction=extractExpression(query,selected.start,selected.end);
  const draftCallback=useRef(onDraftChange);useEffect(()=>{draftCallback.current=onDraftChange;},[onDraftChange]);
  useEffect(()=>{if(!composing)draftCallback.current?.({query,word,meaning,type,context,translationContext,candidateEdits,candidates,selectedId,ambiguous,manual:manual.current,voice,example:suggestedExample,exampleSource,source,request:request.current});},[query,word,meaning,type,context,translationContext,candidateEdits,candidates,selectedId,ambiguous,voice,suggestedExample,exampleSource,source,composing,attemptId]);
  useEffect(()=>{onInteractionBusy?.(voiceBusy||composing);return()=>onInteractionBusy?.(false);},[voiceBusy,composing,onInteractionBusy]);

  useLayoutEffect(()=>{const el=meaningInput.current;if(!el||formIsComposing(el.form))return;const top=el.scrollTop;el.style.height='0px';const cap=Math.max(80,Math.min(200,(window.visualViewport?.height||innerHeight)*.25));el.style.height=Math.max(48,Math.min(el.scrollHeight+2,cap))+'px';el.style.overflowY=el.scrollHeight>cap?'auto':'hidden';el.scrollTop=top;},[meaning]);
  useEffect(()=>{const el=input.current;if(!el)return;const update=()=>{if(document.activeElement===el&&!formIsComposing(el.form))setSelected(old=>old.start===el.selectionStart&&old.end===el.selectionEnd?old:{start:el.selectionStart,end:el.selectionEnd})};document.addEventListener('selectionchange',update);el.addEventListener('select',update);el.addEventListener('pointerup',update);return()=>{document.removeEventListener('selectionchange',update);el.removeEventListener('select',update);el.removeEventListener('pointerup',update)};},[]);
  useEffect(()=>{let active=true;const generation=queryVersion;void aiStatus().then(value=>{if(active)setAiAvailable(value.available)});return()=>{active=false;queryAbort.current?.abort();generation.current++;};},[]);
  function invalidateQuery(){queryVersion.current++;queryAbort.current?.abort();setResolving(false);setResolveError('');}
  function changeQuery(next:string){
    invalidateQuery();setQuery(next);clearCandidates();setSuggestedExample('');
    changeWord(inputLanguage(next,target,source)!==target?'':next);
  }
  function selectCandidate(item:Candidate){
    if(formIsComposing(input.current?.form)||!validTitle(item.english))return;
    changeWord(item.english);setSelectedId(item.id||item.english);setExampleSource(item.source);
    const key=item.id||item.english;
    const savedEdit=Object.hasOwn(candidateEdits,key)?candidateEdits[key]:undefined;
    const preserveMeaning=savedEdit!==undefined||manual.current&&(word===item.english||!selectedCandidate);
    if(savedEdit!==undefined)setMeaning(savedEdit);
    if(!preserveMeaning)setMeaning(item.meaning);
    manual.current=preserveMeaning;
    setSuggestedExample(preserveMeaning?'':item.example||'');
  }
  async function resolveQuery(ai=false){
    if(formIsComposing(input.current?.form)||!query.trim()||submitted.current||
      (queryAbort.current&&!queryAbort.current.signal.aborted))return;
    resolveWithAi.current=ai;
    const controller=new AbortController();queryAbort.current=controller;const ticket=++queryVersion.current,text=query;
    cancel.current();version.current++;setOpen(false);setResolving(true);setResolveError('');
    try{
      let results:Candidate[], unclear=false;
      if(ai){
        const response=await requestTranslation({q:text,source,target,explanation,context:translationContext,
          level:collection?.proficiency_level||'unspecified'},controller.signal);
        results=response.candidates;unclear=response.ambiguous;
      } else {
        const bilingual=legacy&&source==='auto'&&['en','zh-CN'].includes(inputLanguage(text,target,source));
        const response=await fetch(bilingual?'/api/bilingual':'/api/collection-lookup',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(bilingual?{query:text,direction:'auto'}:{query:text,target,explanation,source}),signal:controller.signal});
        const data=await response.json();if(!response.ok)throw Error('Lookup unavailable. Your draft is kept.');
        results=Array.isArray(data.items)?data.items:[];
        if(data.reference&&ticket===queryVersion.current)rememberDictionaryReference(text,data.reference);
      }
      if(ticket!==queryVersion.current||controller.signal.aborted||submitted.current)return;
      const seen=new Set<string>();
      const clean=results.filter(item=>{
        if(!item||!validTitle(item.english,ITEM_TEXT_LIMIT)||typeof item.meaning!=='string')return false;
        const key=item.english.normalize('NFC').replace(/\s+/g,' ');
        if(seen.has(key))return false;seen.add(key);return true;
      }).slice(0,5);
      if(!clean.length)throw Error('No usable match. Try a more specific expression.');
      setCandidates(clean);setShowAllCandidates(false);setAmbiguous(unclear);
      selectCandidate(clean[0]);
    }catch{
      if(ticket===queryVersion.current&&!controller.signal.aborted)setResolveError(
        ai?'AI translation is unavailable. Retry or use standard lookup. Your draft is kept.':'Lookup couldn’t find a match. Retry or enter a meaning manually.');
    } finally {
      if(ticket===queryVersion.current){queryAbort.current=null;setResolving(false);}
    }
  }
  useEffect(()=>{
    if(selectedCandidate||manual.current||target!=='en'||!word.trim()||!englishResult(word)||composing||suggestedExample)return;let active=true;const ticket=queryVersion.current;const timer=setTimeout(()=>{void dictionaryReference(word).then(reference=>{if(active&&ticket===queryVersion.current&&!submitted.current){setSuggestedExample(selectExample(word,meaning,reference.examples));setExampleSource('dictionary');}}).catch(()=>{});},700);
    return()=>{active=false;clearTimeout(timer)};
  },[word,meaning,composing,suggestedExample,target,selectedCandidate]);
  function changeWord(next: string) {
    cancel.current();version.current++;
    current.current = next;
    if (!manual.current) setMeaning('');
    setAttemptId('');setSelected({start:0,end:0});setSaveError('');setFailed(false);setRemoteDuplicate(false);
    setStatus(''); setWord(next); setItems([]); setOpen(false); setActive(-1); dismissed.current = '';
  }
  function choose(item: Suggestion) { if(formIsComposing(input.current?.form))return; setPasted(false);setExtracting(false);immediate.current = true; changeQuery(item.word); dismissed.current = item.word; setRevision(value => value + 1); input.current?.focus(); }
  function beginOption(event: React.PointerEvent, item: Suggestion) {
    event.preventDefault(); ignoreClick.current = false;
    touch.current = event.pointerType === 'touch' || event.pointerType === 'pen' ? { id: event.pointerId, x: event.clientX, y: event.clientY, word: item.word } : null;
  }
  function finishOption(event: React.PointerEvent, item: Suggestion) {
    const start = touch.current; touch.current = null;
    if (start && start.id === event.pointerId && start.word === item.word && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) {
      event.preventDefault(); ignoreClick.current = true; choose(item);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    const query = word.trim().replace(/\s+/g, ' '), generation = ++version.current;
    const explicit = explicitLookup.current === word, edits = manualRevision.current;
    explicitLookup.current = null;
    const valid = () => !abort.signal.aborted && !submitted.current && version.current === generation && current.current === word;
    let suggestionTimer: ReturnType<typeof setTimeout> | undefined, meaningTimer: ReturnType<typeof setTimeout> | undefined;
    if ((!selectedCandidate||explicit)&&legacy&&!chinese && !composing && query.length >= 1 && textLength(query)<=ITEM_TEXT_LIMIT) {
      if (!word.includes('\n') && query.length >= 2 && query.length <= 64 && /^[a-z][a-z '’-]*$/i.test(query) && dismissed.current !== word) suggestionTimer = setTimeout(async () => {
        try {
          let values = cache.get(query.toLowerCase());
          if (!values) {
            const response = await fetch('/api/smart-add/suggestions?' + new URLSearchParams({ q: query }), { signal: abort.signal });
            if (!response.ok) return;
            const data = await response.json(); values = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : [];
            if (cache.size >= 50) cache.delete(cache.keys().next().value!);
            cache.set(query.toLowerCase(), values!);
          }
          if (valid()) { setItems(values!.map(item => ({ ...item, meaning: knownMeanings.get(item.word.toLowerCase()) }))); setActive(-1); setOpen(focused.current && dismissed.current !== word && !!values?.length); }
        } catch { /* Optional suggestions must never prevent saving. */ }
      }, 250);
      if (!manual.current || explicit) meaningTimer = setTimeout(async () => {
        if (!valid() || manualRevision.current !== edits || (manual.current && !explicit)) return;
        setStatus('Finding meaning…');
        try {
          const response = await fetch('/api/smart-add/meaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: query, type }), signal: abort.signal });
          const data: MeaningSuggestion = await response.json();
          if (!valid() || manualRevision.current !== edits || (manual.current && !explicit)) return;
          if (response.ok && typeof data.meaning === 'string' && data.meaning) {
            if (knownMeanings.size >= 50) knownMeanings.delete(knownMeanings.keys().next().value!);
            knownMeanings.set(query.toLowerCase(), data.meaning);
            manual.current = false;
            setMeaning(data.meaning); setStatus(data.source === 'translation' ? 'Auto-filled · Editable · Translation' : 'Auto-filled · Editable');
          }
          else setStatus('No meaning available. You can write your own.');
        } catch { if (valid() && manualRevision.current === edits && (!manual.current || explicit)) setStatus('Meaning unavailable. You can write your own.'); }
      }, immediate.current ? 0 : 600);
    }
    immediate.current = false;
    const stop = () => { clearTimeout(suggestionTimer); clearTimeout(meaningTimer); abort.abort(); };
    cancel.current = stop;
    return stop;
  }, [word, type, revision, composing,chinese,legacy,selectedCandidate]);
  useEffect(()=>{
    if(selectedCandidate||legacy||chinese||composing||!word.trim()||manual.current||!validTitle(word)||textLength(word)>ITEM_TEXT_LIMIT)return;
    const abort=new AbortController(),ticket=queryVersion.current,edits=manualRevision.current;
    const timer=setTimeout(()=>{void fetch('/api/collection-lookup',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({query:word,target,explanation,source:target})}).then(response=>response.ok?response.json():null).then(data=>{if(!abort.signal.aborted&&ticket===queryVersion.current&&edits===manualRevision.current&&!manual.current&&data?.items?.[0]?.meaning)setMeaning(data.items[0].meaning);}).catch(()=>{});},800);
    return()=>{clearTimeout(timer);abort.abort();};
  },[word,target,explanation,legacy,chinese,composing,validTitle,selectedCandidate]);
  async function suggestMeaning(){
    if(formIsComposing(input.current?.form)||!validTitle(word)||resolving)return;
    if(legacy&&!chinese){
      explicitLookup.current=word;immediate.current=true;setRevision(value=>value+1);return;
    }
    const generation=queryVersion.current, edits=manualRevision.current, expression=word;
    setStatus('Finding meaning…');
    try{
      const response=await fetch('/api/collection-lookup',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:expression,target,explanation,source:target})});
      const data=await response.json();
      if(generation!==queryVersion.current||edits!==manualRevision.current||current.current!==expression||submitted.current)return;
      const suggested=response.ok?data.items?.[0]?.meaning:null;
      if(typeof suggested!=='string'||!suggested.trim())throw Error('Meaning unavailable');
      setMeaning(suggested);setSuggestedExample('');setStatus('Suggested meaning');
      if(selectedId)setCandidateEdits(previous=>({...previous,[selectedId]:suggested}));
      manual.current=true;
    }catch{
      if(generation===queryVersion.current&&edits===manualRevision.current&&current.current===expression)
        setStatus('Meaning unavailable. You can write your own.');
    }
  }
  function reset() {
    invalidateQuery();setQuery('');setEditingExpression(false);clearCandidates();setTranslationContext('');setSuggestedExample('');setExampleSource('dictionary');cancel.current(); request.current=null;setAttemptId('');version.current++; current.current = ''; manual.current = false;
    setVoice(null);setVoiceOpen(false);setContext('');setPasted(false);setExtracting(false);setSaveError('');setFailed(false);setRemoteDuplicate(false);resetSizing();setWord(''); setMeaning(''); setType('auto'); setItems([]); setOpen(false); setStatus(''); setActive(-1);
    requestAnimationFrame(() => {const field=input.current;if(field?.getClientRects().length&&!formIsComposing(field.form)){field.focus({preventScroll:true});field.scrollIntoView({block:'nearest',behavior:'instant'});}});
  }
  function acceptExtraction(value:{expression:string;context:string}){changeQuery(value.expression);setContext(value.context);setType('expression');setPasted(false);setExtracting(false);setReplaceContext(null);setStatus('Expression extracted. Original text kept in My Context.');input.current?.focus({preventScroll:true});}
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(submitted.current||busy||voiceBusy||composing||imeBlocksSubmit(event.currentTarget,event.timeStamp))return;
    if(!validTitle(word)){setSaveError('Resolve a word or expression in the learning language before saving.');return;}
    if(duplicate){setSaveError('Already in your Library');return;}
    if(overItem||overContext){setSaveError(overItem?'Extract or shorten the learning item to 120 characters. Your full text is still here.':'My Context supports 3000 characters. Please shorten it before saving.');return;}
    const el=input.current,selection=el?{start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,scroll:el.scrollTop,focused:document.activeElement===el}:null;
    const fingerprint=JSON.stringify([word,meaning,context,suggestedExample,type,voice?.id,learningDetails]);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
    invalidateQuery();setAttemptId(request.current.id);submitted.current=true;cancel.current();version.current++;setOpen(false);setStatus('');setSaveError('');
    try{const result=await onManualSubmit(event,voice||undefined,request.current.id);if(!result.saved){setRemoteDuplicate(!!result.duplicate);setFailed(!result.duplicate);setSaveError(result.message||'Couldn’t save. Please try again.');if(el&&selection){requestAnimationFrame(()=>{if(formIsComposing(el.form))return;if(selection.focused&&el.getClientRects().length)el.focus({preventScroll:true});el.setSelectionRange(selection.start,selection.end,selection.direction);el.scrollTop=selection.scroll;});}}}
    catch{setFailed(true);setSaveError('Couldn’t save. Check your connection and retry.');}
    finally{submitted.current=false;}
  }
  function keyDown(event:React.KeyboardEvent<HTMLTextAreaElement>){
          if(composing||event.nativeEvent.isComposing||event.keyCode===229||event.timeStamp-compositionEnded.current<80)return;
          if(event.key==='Escape'){event.preventDefault();dismissed.current=word;setOpen(false);setActive(-1);}
          else if((event.key==='ArrowDown'||event.key==='ArrowUp')&&items.length&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();setOpen(true);setActive(index=>event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length-1:index-1));}
          else if(event.key==='Enter'&&open&&active>=0&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();choose(items[active]);}
          else if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(!word.trim())void resolveQuery();else event.currentTarget.form?.requestSubmit();}
          else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void resolveQuery();}

  }
  return <form className={`word-form ${styles.unified}`} aria-label="Add learning item" aria-busy={busy} onSubmit={submit} onReset={reset}>
    <div className={styles.queryArea}><div className={styles.field}>
      <ImeTextarea ref={input} id={`${id}-word`} aria-label="Word or phrase" value={query} onValueChange={changeQuery} placeholder={collection?`Type in ${learningLanguages[target].label} or another language…`:'Type in English or Chinese…'} required readOnly={busy} rows={1} style={{lineHeight:1.4}} data-adaptive-editor="true" data-has-value={!!query} data-scale={scale} className={`${styles.english} ${styles.queryInput}`}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} aria-describedby={`${id}-help`} enterKeyHint="search" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onFocus={()=>{focused.current=true;if(items.length&&dismissed.current!==word)setOpen(true)}} onBlur={()=>{focused.current=false;setOpen(false)}}
        onPaste={()=>{setPasted(true);setExtracting(false)}}
        onSelect={event=>{if(!formIsComposing(event.currentTarget.form))setSelected({start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd})}}
        onImeStateChange={active=>{if(active){invalidateQuery();cancel.current();version.current++;setOpen(false);setItems([]);setActive(-1);}setComposing(active);}} onCompositionEnd={event=>{compositionEnded.current=event.timeStamp;setComposing(false)}}
        onKeyDown={keyDown}/>
      <div ref={mirror} className={styles.mirror} aria-hidden="true"/>
      <span ref={probe} className={styles.probe} data-scale="0" aria-hidden="true">&#8203;</span>
      {query&&<button type="button" className={styles.clear} aria-label="Clear input" disabled={busy} onPointerDown={event=>event.preventDefault()} onClick={()=>{if(formIsComposing(input.current?.form))return;changeQuery('');setPasted(false);setExtracting(false);resetSizing();input.current?.focus({preventScroll:true});}}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>}

      {open&&<div className={styles.list} data-above={placement.above||undefined} style={{maxHeight:placement.height}} role="listbox" id={`${id}-list`} aria-label="English suggestions">{items.map((item,index)=><button key={item.word} id={`${id}-${index}`} role="option" aria-selected={active===index} tabIndex={-1} type="button" className={styles.option}
        onPointerDown={event=>beginOption(event,item)} onPointerUp={event=>finishOption(event,item)} onPointerCancel={()=>{touch.current=null}}
        onPointerMove={event=>{const start=touch.current;if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>=12)touch.current=null}}
        onClick={event=>{if(ignoreClick.current&&event.detail!==0){ignoreClick.current=false;return;}choose(item)}}><span>{item.word}</span>{item.meaning&&<small>{item.meaning}</small>}</button>)}</div>}
    </div>
    {query.trim()&&<div className={styles.resolveActions}><button type="button" className="text-button" disabled={busy||resolving||!query.trim()} onClick={()=>void resolveQuery()}>{resolving?'Resolving…':chinese?'Translate':'Look up'}</button>{collection&&query.trim()&&<label className={styles.sourceChoice}><Select aria-label="Input language" title="Language of the text you typed" value={source} disabled={busy} onChange={event=>{const next=event.target.value as TargetLanguage|'auto';invalidateQuery();setSource(next);clearCandidates();setSuggestedExample('');changeWord(inputLanguage(query,target,next)===target?query:'');}}><option value="auto">Input: Auto</option>{Object.entries(learningLanguages).map(([code,lang])=><option key={code} value={code}>Input: {lang.label}</option>)}</Select></label>}{aiAvailable&&query.trim()&&<><button type="button" className="text-button" disabled={busy||resolving||!query.trim()} onClick={()=>void resolveQuery(true)}>{selectedCandidate?'Regenerate with AI':'Translate with AI'}</button></>}</div>}

    {resolveError&&<p role="alert" className={styles.saveError}>{resolveError}</p>}
    <details className={styles.contextField}>
      <summary>+ Add translation context</summary>
      <ImeTextarea aria-label="Translation context" value={translationContext} onValueChange={value=>{invalidateQuery();setTranslationContext(value);}}
        maxLength={500} rows={2} placeholder="Add context to get a more accurate translation…" readOnly={busy}/>
      <small>{aiAvailable?'Translate with AI sends the input and translation context to Gemini.':'Basic lookup does not use translation context. AI is unavailable in this session.'}</small>
    </details>
    {resolveError&&<button type="button" className="text-button" onClick={()=>void resolveQuery(resolveWithAi.current)}>Retry lookup</button>}
    </div>
    {candidates.length>1&&<section className={styles.translationList} aria-label="Translations">
      <h2>Translations</h2>
      <div role="group" aria-label="Translation candidates" className={styles.candidates}>
        {candidates.slice(0,showAllCandidates?candidates.length:3).map((item,index)=>
          <button type="button" key={item.id||item.english} aria-pressed={item===selectedCandidate}
            onClick={()=>selectCandidate(item)} disabled={busy||voiceBusy||resolving}>
            <strong>{item.english}</strong>
            <small>{[index===0?(item.source==='ai'&&!ambiguous?'Best match':'Suggested match'):'',item.usage,item.register,item.region].filter(Boolean).join(' · ')||item.meaning}</small>
          </button>)}
      </div>
      {candidates.length>3&&<button type="button" className="text-button" aria-expanded={showAllCandidates}
        onClick={()=>setShowAllCandidates(!showAllCandidates)}>{showAllCandidates?'Show fewer':`Show ${candidates.length-3} more translations`}</button>}
    </section>}
    {(word||context||voice||editingExpression)&&<section className={`panel ${styles.preview}`} aria-label="Vocabulary card preview" data-empty={!query.trim()&&!meaning&&!context&&!voice||undefined}>
    <input type="hidden" name="word" value={word}/>
    {selectedCandidate&&<p className={styles.meaningStatus}>{selectedCandidate.reference==='cc-cedict'?
      <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict" target="_blank" rel="noreferrer">CC-CEDICT dictionary match</a>
      : selectedCandidate.source==='translation'?'Basic translation · Context and examples unavailable'
      : selectedCandidate.source==='ai'?'AI translation':'Dictionary lookup'}</p>}
    {(word||editingExpression)&&<div className={styles.titleRow}>
      {word&&<h2 className={styles.previewTitle}>{word}</h2>}
      <button type="button" className={styles.editExpression} aria-label="Edit vocabulary" aria-expanded={editingExpression}
        onClick={()=>setEditingExpression(!editingExpression)} disabled={busy||resolving}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12-4-4L4 15z"/></svg>
      </button>
    </div>}
    {editingExpression&&<ImeTextarea aria-label="Vocabulary expression" rows={1} value={word} readOnly={busy||resolving}
      onValueChange={value=>{
        invalidateQuery();manual.current=true;manualRevision.current++;changeWord(value);
        setSelectedId('');setSuggestedExample('');
      }}/>}
    {(selectedCandidate?.partOfSpeech||selectedCandidate?.expressionType)&&<p className={styles.meaningStatus}>
      {[selectedCandidate.partOfSpeech,selectedCandidate.expressionType].filter(Boolean).join(' · ')}</p>}
    {chinese&&!word&&<p className={styles.meaningStatus}>Translate to choose an entry in the learning language.</p>}
    <div id={`${id}-help`} className={styles.captureHelp}>
      {overItem?<span>Keep the learning item within 120 characters. {chinese?'Refine your query or choose a shorter target-language candidate; your original text is preserved.':/\s/u.test(word.trim())?'Extract a phrase below; your pasted text is preserved.':'Shorten it before saving; your text is preserved.'}</span>:null}
      {!chinese&&(pasted||overItem)&&/\s/u.test(word.trim())&&!extracting&&<button type="button" className="text-button" onPointerDown={event=>event.preventDefault()} onClick={()=>{if(formIsComposing(input.current?.form))return;setExtracting(true);input.current?.focus({preventScroll:true});}}>Extract an expression</button>}
      {extracting&&<div className={styles.extraction}><p>Select a phrase in the text, then confirm. The full text will become My Context.</p><div className={styles.inlineActions}><button type="button" disabled={!extraction||busy} onPointerDown={event=>event.preventDefault()} onClick={()=>{if(extraction&&!formIsComposing(input.current?.form)){if(context.trim()&&context!==extraction.context)setReplaceContext(extraction);else acceptExtraction(extraction)}}}>Confirm expression</button><button type="button" className="text-button" onClick={()=>setExtracting(false)}>Cancel extraction</button></div></div>}
      {duplicate&&<div role="status" className={styles.duplicate}><strong>Already in your Library</strong><Link className="wb-control wb-control-outline" href={'/library?q='+encodeURIComponent(existing?.word||word.trim())}>View existing item</Link></div>}
    </div>
    <div className={styles.meaningField}>

      <ImeTextarea lang={explanation==='en'?'en':'zh-Hans'} autoCapitalize="none" autoCorrect="off" spellCheck={false} ref={meaningInput} className={styles.meaning} id={`${id}-meaning`} rows={1} aria-label="Meaning" name="meaning" value={meaning} onImeStateChange={active=>{if(active){manual.current=true;manualRevision.current++;setStatus('');}}} onValueChange={value => { manual.current = true; manualRevision.current++; setAttemptId('');setFailed(false);setSaveError('');setMeaning(value); if(selectedId)setCandidateEdits(edits=>({...edits,[selectedId]:value})); setSuggestedExample(''); setStatus(''); }} placeholder={explanation==='en'?'Meaning in your own words…':'中文解释或你的理解'} maxLength={2000} readOnly={busy} />

      {status && <p className={styles.meaningStatus} role="status">{status}</p>}
    </div>
    {selectedCandidate?.lemma&&selectedCandidate.lemma!==word&&<p className={styles.meaningStatus}>Dictionary form: {selectedCandidate.lemma}</p>}
    {selectedCandidate?.usage&&<p className={styles.meaningStatus}>{selectedCandidate.usage}</p>}
    <div className={styles.previewSettings}><div className={styles.typeControl}><Select id={`${id}-type`} aria-label="Content type" name="item_type" value={type} onChange={event => { const value=event.target.value;if(formIsComposing(input.current?.form))return;if(voice&&itemType({word,item_type:value==='auto'?null:value as 'word'|'expression'})==='word'){setPendingType(value);return;}version.current++;setAttemptId('');setType(value); }} disabled={busy||voiceBusy}><option value="auto">{expression?"Expression":"Word"} · Auto</option><option value="word">Word</option><option value="expression">Expression</option></Select></div><button type="button" className="text-button" disabled={busy||resolving||!validTitle(word)}
      onClick={()=>void suggestMeaning()}>Suggest meaning</button></div>
    {suggestedExample&&<blockquote className={styles.previewExample}>
      {selectedCandidate?.source==='ai'&&!selectedCandidate.highlight?suggestedExample:
        <HighlightWord text={suggestedExample} target={word} surface={selectedCandidate?.highlight} language={target}/>}
      {selectedCandidate?.exampleTranslation&&<small>{selectedCandidate.exampleTranslation}</small>}
      {exampleSource==='ai'&&<small>AI-generated example</small>}</blockquote>}
    {selectedCandidate&&!aiAvailable&&!suggestedExample&&<p className={styles.meaningStatus}>AI examples are unavailable in this session.</p>}
    {selectedCandidate&&aiAvailable&&(!suggestedExample||!selectedCandidate.exampleTranslation)&&
      <button type="button" className="text-button" disabled={resolving||busy} onClick={()=>void resolveQuery(true)}>
        {selectedCandidate.source==='ai'?'Retry learning example':'Generate learning examples with AI'}</button>}
    {word&&<label className={styles.personalNote}>Personal notes <span>Optional</span>
      <ImeTextarea aria-label="My Context" name="personal_note" value={context}
        onValueChange={value=>{setAttemptId('');setContext(value);setSaveError('');setFailed(false)}}
        placeholder="Where did you come across this word?" rows={2} readOnly={busy}/>
      {overContext&&<small role="status">Shorten your note to 3000 characters before saving.</small>}
    </label>}
    <input type="hidden" name="example" value={suggestedExample}/>
    <input type="hidden" name="learning_details" value={JSON.stringify(learningDetails)??''}/>
    {!expression&&<p className={styles.meaningStatus}>Voice notes are available for expressions. Change the content type to Expression to record one.</p>}
    {itemType({word,item_type:type==='auto'?null:type as 'word'|'expression'})==='expression'&&<details className={voiceStyles.draft} open={voiceOpen} onToggle={event=>setVoiceOpen(event.currentTarget.open)}><summary><Microphone/>Add a voice note</summary>{voiceOpen&&<VoiceDraftBox draft={voice} onDraft={value=>{setVoice(value);if(value)setType('expression');}} onBusy={setVoiceBusy} disabled={busy}/>}</details>}
    {pendingType!==null&&<VoiceConfirm title="Discard this draft recording?" description="Voice Notes are available only for Expressions. Keep Expression to retain this recording." confirmLabel="Discard and change type" busy={false} onCancel={()=>setPendingType(null)} onConfirm={()=>{setVoice(null);setType(pendingType);setPendingType(null);setVoiceOpen(false);}}/>}
    {replaceContext&&<VoiceConfirm title="Replace My Context?" description="Your existing context will be replaced by the complete text currently in the main input. The text stays unchanged until you confirm." confirmLabel="Use original text as context" busy={busy} onCancel={()=>setReplaceContext(null)} onConfirm={()=>acceptExtraction(replaceContext)}/>}
    {saveError&&!duplicate&&<p role="alert" className={styles.saveError}>Couldn’t save — {saveError}</p>}
    <div className="form-bottom"><button type="submit" disabled={busy||voiceBusy||duplicate||!word.trim()||overItem||overContext}>{busy ? 'Saving…' : failed?'Retry':'Add to my library + '}</button></div>
    </section>}
  </form>;
}
