"use client";
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Card } from '@/components/ui/primitives';
import type { Suggestion, MeaningSuggestion } from '@/lib/smart-add';
import styles from './smart-add.module.css';
const cache = new Map<string, Suggestion[]>();
const knownMeanings = new Map<string, string>();
export function AddWordFlow(props: {
  busy: boolean; canSave: boolean; checkingAccount: boolean;
  onManualSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  if (!props.canSave) return <Card className="wb-ui-text"><p>{props.checkingAccount ? 'Checking your account…' : 'Sign in to save words to your private library.'}</p>{!props.checkingAccount && <Link className="wb-control" href="/auth">Sign in</Link>}</Card>;
  return <SmartAddForm {...props} />;
}
function SmartAddForm({ busy, onManualSubmit }: { busy: boolean; onManualSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  const [word, setWord] = useState(''), [meaning, setMeaning] = useState(''), [type, setType] = useState('auto');
  const [items, setItems] = useState<Suggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [status, setStatus] = useState(''), [revision, setRevision] = useState(0), [composing, setComposing] = useState(false);
  const manual = useRef(false), focused = useRef(false), submitted = useRef(false), immediate = useRef(false), dismissed = useRef('');
  const explicitLookup = useRef<string | null>(null), manualRevision = useRef(0);
  const touch = useRef<{ id: number; x: number; y: number; word: string } | null>(null), ignoreClick = useRef(false);
  const current = useRef(''), version = useRef(0), meaningInput = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<() => void>(() => {}), input = useRef<HTMLInputElement>(null), id = useId();
  function changeWord(next: string) {
    version.current++;
    current.current = next;
    if (!manual.current || meaningInput.current?.value === '') { manual.current = false; setMeaning(''); }
    setStatus(''); setWord(next); setItems([]); setOpen(false); setActive(-1); dismissed.current = '';
  }
  function choose(item: Suggestion) { immediate.current = true; changeWord(item.word); dismissed.current = item.word; setRevision(value => value + 1); input.current?.focus(); }
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
    if (!composing && query.length >= 1) {
      if (query.length >= 2 && query.length <= 64 && /^[a-z][a-z '’-]*$/i.test(query) && dismissed.current !== word) suggestionTimer = setTimeout(async () => {
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
    cancel.current(); version.current++; current.current = ''; manual.current = false;
    setWord(''); setMeaning(''); setType('auto'); setItems([]); setOpen(false); setStatus(''); setActive(-1);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitted.current) return;
    submitted.current = true; cancel.current(); version.current++; setOpen(false); setStatus('');
    try { await onManualSubmit(event); } finally { submitted.current = false; }
  }
  return <form className="panel word-form" onSubmit={submit} onReset={reset}>
    <div className={styles.field}>
      <label htmlFor={`${id}-word`}>Word or phrase<input ref={input} id={`${id}-word`} name="word" value={word} onChange={event => changeWord(event.target.value)} placeholder="e.g. meticulous" required maxLength={120} disabled={busy}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onFocus={() => { focused.current = true; if (items.length) setOpen(true); }} onBlur={() => { focused.current = false; setOpen(false); }}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onKeyDown={event => {
          if (composing || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return; }
          if (event.key === 'Escape') { event.preventDefault(); dismissed.current = word; setOpen(false); setActive(-1); }
          else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) { event.preventDefault(); setOpen(true); setActive(index => event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1)); }
          else if (event.key === 'Enter' && open && active >= 0) { event.preventDefault(); choose(items[active]); }
        }} /></label>
      {open && <div className={styles.list} role="listbox" id={`${id}-list`} aria-label="English suggestions">{items.map((item, index) => <button key={item.word} id={`${id}-${index}`} role="option" aria-selected={active === index} tabIndex={-1} type="button" className={styles.option}
        onPointerDown={event => beginOption(event, item)} onPointerUp={event => finishOption(event, item)} onPointerCancel={() => { touch.current = null; }}
        onPointerMove={event => { const start = touch.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 12) touch.current = null; }}
        onClick={event => { if (ignoreClick.current && event.detail !== 0) { ignoreClick.current = false; return; } choose(item); }}><span>{item.word}</span>{item.meaning && <small>{item.meaning}</small>}</button>)}</div>}
    </div>
    <div className={styles.meaningField}>
      <div className={styles.meaningHeader}><label htmlFor={`${id}-meaning`}>Meaning</label><button type="button" className="text-button" disabled={busy || !word.trim()} onClick={() => { explicitLookup.current = word; immediate.current = true; setRevision(value => value + 1); }}>Suggest meaning</button></div>
      <textarea ref={meaningInput} id={`${id}-meaning`} rows={3} aria-label="Meaning" name="meaning" value={meaning} onCompositionStart={() => { manual.current = true; manualRevision.current++; setStatus(''); }} onChange={event => { manual.current = true; manualRevision.current++; setMeaning(event.target.value); setStatus(''); }} placeholder="中文解释或你的理解（可留空）" maxLength={2000} disabled={busy} />
      {status && <p className={styles.meaningStatus} role="status">{status}</p>}
    </div>
    <label>Content type<select name="item_type" value={type} onChange={event => { version.current++; setType(event.target.value); }} disabled={busy}><option value="auto">Automatic</option><option value="word">Word</option><option value="expression">Expression</option></select></label>
    <div className="form-bottom"><span>Your meaning stays editable. <Link href="/privacy">Suggestion sources</Link></span><button disabled={busy}>{busy ? 'Saving…' : 'Add to my library + '}</button></div>
  </form>;
}
