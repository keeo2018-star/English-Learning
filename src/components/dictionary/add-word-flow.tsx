"use client";
import Link from 'next/link';
import { useEffect, useId, useRef, useState,useMemo } from 'react';
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
export function AddWordFlow(props: {
  busy: boolean; canSave: boolean; checkingAccount: boolean;library?:{id:string;word:string}[];
  onManualSubmit: (event: React.FormEvent<HTMLFormElement>,voice?:VoiceDraft,requestId?:string) => Promise<AddOutcome>;
}) {
  if (!props.canSave) return <Card className="wb-ui-text"><p>{props.checkingAccount ? 'Checking your account…' : 'Sign in to save words to your private library.'}</p>{!props.checkingAccount && <Link className="wb-control" href="/auth">Sign in</Link>}</Card>;
  return <SmartAddForm {...props} />;
}
function SmartAddForm({ busy, onManualSubmit,library=[] }: { busy: boolean;library?:{id:string;word:string}[]; onManualSubmit: (event: React.FormEvent<HTMLFormElement>,voice?:VoiceDraft,requestId?:string) => Promise<AddOutcome> }) {
  const [voice,setVoice]=useState<VoiceDraft|null>(null),[voiceBusy,setVoiceBusy]=useState(false),[voiceOpen,setVoiceOpen]=useState(false),[pendingType,setPendingType]=useState<string|null>(null);
  const [word, setWord] = useState(''), [meaning, setMeaning] = useState(''), [type, setType] = useState('auto');
  const [context,setContext]=useState(''),[contextOpen,setContextOpen]=useState(false),[pasted,setPasted]=useState(false),[extracting,setExtracting]=useState(false),[selected,setSelected]=useState({start:0,end:0}),[replaceContext,setReplaceContext]=useState<{expression:string;context:string}|null>(null),[saveError,setSaveError]=useState(''),[failed,setFailed]=useState(false),[remoteDuplicate,setRemoteDuplicate]=useState(false),[attemptId,setAttemptId]=useState('');
  const request=useRef<{fingerprint:string;id:string}|null>(null),compositionEnded=useRef(-Infinity);
  const [items, setItems] = useState<Suggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [status, setStatus] = useState(''), [revision, setRevision] = useState(0), [composing, setComposing] = useState(false);
  const manual = useRef(false), focused = useRef(false), submitted = useRef(false), immediate = useRef(false), dismissed = useRef('');
  const explicitLookup = useRef<string | null>(null), manualRevision = useRef(0);
  const touch = useRef<{ id: number; x: number; y: number; word: string } | null>(null), ignoreClick = useRef(false);
  const current = useRef(''), version = useRef(0), meaningInput = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<() => void>(() => {}), input = useRef<HTMLTextAreaElement>(null), id = useId();
  const {scale,mirror,probe,placement,reset:resetSizing}=useAdaptiveEditor(input,word,composing||busy);
  const index=useMemo(()=>new Map(library.map(item=>[captureKey(item.word),item])),[library]);
  const match=word.trim()?index.get(captureKey(word)):undefined,existing=match?.id===attemptId?undefined:match,duplicate=!!existing||remoteDuplicate;
  const overItem=textLength(word.trim())>ITEM_TEXT_LIMIT,overContext=textLength(context)>CONTEXT_TEXT_LIMIT;
  const expression=itemType({word,item_type:type==='auto'?null:type as 'word'|'expression'})==='expression';
  const extraction=extractExpression(word,selected.start,selected.end);
  useEffect(()=>{const el=input.current;if(!el)return;const update=()=>{if(document.activeElement===el)setSelected(old=>old.start===el.selectionStart&&old.end===el.selectionEnd?old:{start:el.selectionStart,end:el.selectionEnd})};document.addEventListener('selectionchange',update);el.addEventListener('select',update);el.addEventListener('pointerup',update);return()=>{document.removeEventListener('selectionchange',update);el.removeEventListener('select',update);el.removeEventListener('pointerup',update)};},[]);
  function changeWord(next: string) {
    cancel.current();version.current++;
    current.current = next;
    if (!manual.current) setMeaning('');
    setAttemptId('');setSelected({start:0,end:0});setSaveError('');setFailed(false);setRemoteDuplicate(false);
    setStatus(''); setWord(next); setItems([]); setOpen(false); setActive(-1); dismissed.current = '';
  }
  function choose(item: Suggestion) { setPasted(false);setExtracting(false);immediate.current = true; changeWord(item.word); dismissed.current = item.word; setRevision(value => value + 1); input.current?.focus(); }
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
    if (!composing && query.length >= 1 && textLength(query)<=ITEM_TEXT_LIMIT) {
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
  }, [word, type, revision, composing]);
  function reset() {
    cancel.current(); request.current=null;setAttemptId('');version.current++; current.current = ''; manual.current = false;
    setVoice(null);setVoiceOpen(false);setContext('');setContextOpen(false);setPasted(false);setExtracting(false);setSaveError('');setFailed(false);setRemoteDuplicate(false);resetSizing();setWord(''); setMeaning(''); setType('auto'); setItems([]); setOpen(false); setStatus(''); setActive(-1);
    requestAnimationFrame(() => {if(input.current?.getClientRects().length)input.current.focus({ preventScroll: true });});
  }
  function acceptExtraction(value:{expression:string;context:string}){changeWord(value.expression);setContext(value.context);setContextOpen(true);setType('expression');setPasted(false);setExtracting(false);setReplaceContext(null);setStatus('Expression extracted. Original text kept in My Context.');input.current?.focus({preventScroll:true});}
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(submitted.current||busy||voiceBusy||composing)return;
    if(duplicate){setSaveError('Already in your Library');return;}
    if(overItem||overContext){setSaveError(overItem?'Extract or shorten the learning item to 120 characters. Your full text is still here.':'My Context supports 3000 characters. Please shorten it before saving.');return;}
    const el=input.current,selection=el?{start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,scroll:el.scrollTop,focused:document.activeElement===el}:null;
    const fingerprint=JSON.stringify([word,meaning,context,type,voice?.id]);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
    setAttemptId(request.current.id);submitted.current=true;cancel.current();version.current++;setOpen(false);setStatus('');setSaveError('');
    try{const result=await onManualSubmit(event,voice||undefined,request.current.id);if(!result.saved){setRemoteDuplicate(!!result.duplicate);setFailed(!result.duplicate);setSaveError(result.message||'Couldn’t save. Please try again.');if(el&&selection){requestAnimationFrame(()=>{if(selection.focused&&el.getClientRects().length)el.focus({preventScroll:true});el.setSelectionRange(selection.start,selection.end,selection.direction);el.scrollTop=selection.scroll;});}}}
    catch{setFailed(true);setSaveError('Couldn’t save. Check your connection and retry.');}
    finally{submitted.current=false;}
  }
  function keyDown(event:React.KeyboardEvent<HTMLTextAreaElement>){
          if(composing||event.nativeEvent.isComposing||event.keyCode===229||event.timeStamp-compositionEnded.current<80)return;
          if(event.key==='Escape'){event.preventDefault();dismissed.current=word;setOpen(false);setActive(-1);}
          else if((event.key==='ArrowDown'||event.key==='ArrowUp')&&items.length&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();setOpen(true);setActive(index=>event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length-1:index-1));}
          else if(event.key==='Enter'&&open&&active>=0&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();choose(items[active]);}
          else if(event.key==='Enter'&&(event.metaKey||event.ctrlKey||(!expression&&!word.includes('\n')&&!event.shiftKey))){event.preventDefault();event.currentTarget.form?.requestSubmit();}

  }
  return <form className="panel word-form" aria-label="Add learning item" aria-busy={busy} onSubmit={submit} onReset={reset}>
    <div className={styles.field}>
      <textarea ref={input} id={`${id}-word`} aria-label="Word or phrase" name="word" value={word} onChange={event=>changeWord(event.target.value)} placeholder="Type a word or phrase…" required readOnly={busy} rows={1} style={{fontSize:'var(--capture-size)',lineHeight:1.16}} data-adaptive-editor="true" data-scale={scale} className={styles.english}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} aria-describedby={`${id}-help`} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onFocus={()=>{focused.current=true;if(items.length&&dismissed.current!==word)setOpen(true)}} onBlur={()=>{focused.current=false;setOpen(false)}}
        onPaste={()=>{setPasted(true);setExtracting(false)}}
        onSelect={event=>setSelected({start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd})}
        onCompositionStart={()=>setComposing(true)} onCompositionEnd={event=>{compositionEnded.current=event.timeStamp;setComposing(false)}}
        onKeyDown={keyDown}/>
      <div ref={mirror} className={styles.mirror} aria-hidden="true"/>
      <span ref={probe} className={styles.probe} data-scale="0" aria-hidden="true">&#8203;</span>
      {word&&<button type="button" className={styles.clear} aria-label="Clear English text" disabled={busy} onPointerDown={event=>event.preventDefault()} onClick={()=>{changeWord('');setPasted(false);setExtracting(false);resetSizing();input.current?.focus({preventScroll:true});}}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>}
      {open&&<div className={styles.list} data-above={placement.above||undefined} style={{maxHeight:placement.height}} role="listbox" id={`${id}-list`} aria-label="English suggestions">{items.map((item,index)=><button key={item.word} id={`${id}-${index}`} role="option" aria-selected={active===index} tabIndex={-1} type="button" className={styles.option}
        onPointerDown={event=>beginOption(event,item)} onPointerUp={event=>finishOption(event,item)} onPointerCancel={()=>{touch.current=null}}
        onPointerMove={event=>{const start=touch.current;if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>=12)touch.current=null}}
        onClick={event=>{if(ignoreClick.current&&event.detail!==0){ignoreClick.current=false;return;}choose(item)}}><span>{item.word}</span>{item.meaning&&<small>{item.meaning}</small>}</button>)}</div>}
    </div>
    <div id={`${id}-help`} className={styles.captureHelp}>
      {overItem?<span>Keep the learning item within 120 characters. {/\s/u.test(word.trim())?'Extract a phrase below; your pasted text is preserved.':'Shorten it before saving; your text is preserved.'}</span>:expression?<span>Enter for a new line · Ctrl/⌘ Enter to save</span>:null}
      {(pasted||overItem)&&/\s/u.test(word.trim())&&!extracting&&<button type="button" className="text-button" onPointerDown={event=>event.preventDefault()} onClick={()=>{setExtracting(true);input.current?.focus({preventScroll:true});}}>Extract an expression</button>}
      {extracting&&<div className={styles.extraction}><p>Select a phrase in the English text, then confirm. The full text will become My Context.</p><div className={styles.inlineActions}><button type="button" disabled={!extraction||busy} onPointerDown={event=>event.preventDefault()} onClick={()=>{if(extraction){if(context.trim()&&context!==extraction.context)setReplaceContext(extraction);else acceptExtraction(extraction)}}}>Confirm expression</button><button type="button" className="text-button" onClick={()=>setExtracting(false)}>Cancel extraction</button></div></div>}
      {duplicate&&<div role="status" className={styles.duplicate}><strong>Already in your Library</strong><Link className="wb-control wb-control-outline" href={'/library?q='+encodeURIComponent(existing?.word||word.trim())}>View existing item</Link></div>}
    </div>
    <div className={styles.meaningField}>
      <div className={styles.meaningHeader}><label htmlFor={`${id}-meaning`}>Meaning</label><button type="button" className="text-button" disabled={busy || !word.trim()} onClick={() => { explicitLookup.current = word; immediate.current = true; setRevision(value => value + 1); }}>Suggest meaning</button></div>
      <textarea ref={meaningInput} id={`${id}-meaning`} rows={3} aria-label="Meaning" name="meaning" value={meaning} onCompositionStart={() => { manual.current = true; manualRevision.current++; setStatus(''); }} onChange={event => { manual.current = true; manualRevision.current++; setAttemptId('');setFailed(false);setSaveError('');setMeaning(event.target.value); setStatus(''); }} placeholder="中文解释或你的理解" maxLength={2000} readOnly={busy} />
      {status && <p className={styles.meaningStatus} role="status">{status}</p>}
    </div>
    {(expression||context)&&<details className={styles.contextField} open={contextOpen} onToggle={event=>setContextOpen(event.currentTarget.open)}><summary>My Context <span>Optional</span></summary><textarea aria-label="My Context" name="example" value={context} onChange={event=>{setAttemptId('');setContext(event.target.value);setSaveError('');setFailed(false)}} placeholder="Your original sentence or a personal example…" rows={3} readOnly={busy}/>{overContext&&<p role="status">My Context is over 3000 characters. Shorten it before saving; nothing has been removed.</p>}</details>}
    {!expression&&!context&&<input type="hidden" name="example" value=""/>}
    <label>Content type<select name="item_type" value={type} onChange={event => { const value=event.target.value;if(voice&&itemType({word,item_type:value==='auto'?null:value as 'word'|'expression'})==='word'){setPendingType(value);return;}version.current++;setAttemptId('');setType(value); }} disabled={busy||voiceBusy}><option value="auto">Automatic</option><option value="word">Word</option><option value="expression">Expression</option></select></label>
    {itemType({word,item_type:type==='auto'?null:type as 'word'|'expression'})==='expression'&&<details className={voiceStyles.draft} open={voiceOpen} onToggle={event=>setVoiceOpen(event.currentTarget.open)}><summary><Microphone/>Add a voice note</summary>{voiceOpen&&<VoiceDraftBox draft={voice} onDraft={value=>{setVoice(value);if(value)setType('expression');}} onBusy={setVoiceBusy} disabled={busy}/>}</details>}
    {pendingType!==null&&<VoiceConfirm title="Discard this draft recording?" description="Voice Notes are available only for Expressions. Keep Expression to retain this recording." confirmLabel="Discard and change type" busy={false} onCancel={()=>setPendingType(null)} onConfirm={()=>{setVoice(null);setType(pendingType);setPendingType(null);setVoiceOpen(false);}}/>}
    {replaceContext&&<VoiceConfirm title="Replace My Context?" description="Your existing context will be replaced by the complete text currently in the English input. The English text stays unchanged until you confirm." confirmLabel="Use original text as context" busy={busy} onCancel={()=>setReplaceContext(null)} onConfirm={()=>acceptExtraction(replaceContext)}/>}
    {saveError&&!duplicate&&<p role="alert" className={styles.saveError}>Couldn’t save — {saveError}</p>}
    <div className="form-bottom"><span>Your meaning stays editable. <Link href="/privacy">Suggestion sources</Link></span><button type="submit" disabled={busy||voiceBusy||duplicate||!word.trim()||overItem||overContext}>{busy ? 'Saving…' : failed?'Retry':'Add to my library + '}</button></div>
  </form>;
}
