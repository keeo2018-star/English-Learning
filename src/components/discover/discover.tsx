"use client";
import {VocabularyRow} from '@/components/ui/vocabulary-row';
import {DictionaryButton} from '@/components/dictionary/dictionary-sheet';
import {Disclosure} from '@/components/ui/disclosure';
import {LearningHeader} from '@/components/collections/learning-header';
import {useCollections} from '@/lib/use-collections';
import {learningLanguages} from '@/lib/collections';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {resolveExample} from '@/lib/context-examples';
import {ContextExample} from '@/components/learning/context-example';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { AppShell } from '@/components/ui/app-shell';
import { Card, Pill } from '@/components/ui/primitives';
import { LoadingState, Feedback } from '@/components/ui/states';
import { SelectableButton } from '@/components/ui/selection';
import { PronunciationControl } from '@/components/dictionary/pronunciation-control';
import { preloadPronunciation, stopPronunciation } from '@/lib/pronunciation';
import { dailyProgress, discoverTimezone, levelLabel, posLabel, type DiscoverState } from '@/lib/discover';
import styles from './discover.module.css';
type Action = { action: string; payload: Record<string, unknown> };
export default function Discover() {
 const [user, setUser] = useState<User | null | undefined>(() => supabase ? undefined : null);
 const learning=useCollections(user?.id);
 const original=learning.collections.find(c=>c.target_language==='en'&&c.explanation_language==='zh-CN');
 const supported=!learning.enabled||!!original&&learning.active?.id===original.id;
 const [data, setData] = useState<DiscoverState | null>(null), [busy, setBusy] = useState(false);
 const [error, setError] = useState(''), [setup, setSetup] = useState(false), [revealed, setRevealed] = useState('');
 const [choice, setChoice] = useState<{ key: string; id: number } | null>(null);
 const owner = useRef<string | null>(null), generation = useRef(0), working = useRef(false), pending = useRef<Action | null>(null);
 const wordHeading = useRef<HTMLHeadingElement>(null), meaningParagraph = useRef<HTMLParagraphElement>(null), previousCard = useRef('');
 const perform = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
  if (!supabase || !owner.current || working.current||!learning.ready||!supported) return;
  const account = owner.current, request = ++generation.current;
  working.current = true; setBusy(true); setError(''); setSetup(false); pending.current = { action, payload };
  try {
   const run = async (name: string) => {
    const result = await supabase!.rpc('discover_action', { p_action: name, p_payload: payload, p_timezone: discoverTimezone() });
    if (result.error) throw result.error;
    if (!result.data?.profile || !['pending', 'skipped', 'completed'].includes(result.data.profile.assessment_status)) throw new Error('Discover returned an unreadable response.');
    return result.data as DiscoverState;
   };
   let next = await run(action);
   if (generation.current !== request || owner.current !== account) return;
   if (action === 'get' && next.profile.assessment_status !== 'pending' && !next.assessment && !next.daily) next = await run('daily');
   if (generation.current !== request || owner.current !== account) return;
   setData(next); pending.current = null;
   // The existing RPC saves bank examples atomically. Only supplement an empty
   // saved example; never replace its value or change scheduling/history.
   if(action==='daily_response'&&payload.response==='save'&&payload.needs_example===true&&typeof payload.word==='string'){
    void supabase.from('words').select('id,word,meaning,example').eq('user_id',account).eq('word',payload.word).limit(1).maybeSingle().then(({data: saved})=>{
     if(saved&&!saved.example?.trim()&&owner.current===account)void resolveExample(account,saved);
    });
   }
  } catch (caught) {
   if (generation.current !== request || owner.current !== account) return;
   const failure = caught as { code?: string; message?: string };
   const missing = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(failure.code || '');
   setSetup(missing);
   setError(missing ? 'Discover needs a one-time setup before it can save your progress. Your Library and Review are unchanged.' : failure.message || 'Could not sync Discover. Your last confirmed progress is kept. Try again.');
  } finally { if (generation.current === request) { working.current = false; setBusy(false); } }
 }, [learning.ready,supported]);
 useEffect(() => {
  if (!supabase) return;
  const requestVersion = generation;
  let active = true, observed = false;
  const apply = (next: User | null) => {
   if (!active) return;
   if (owner.current !== (next?.id || null)) {
    generation.current++; owner.current = next?.id || null; working.current = false; pending.current = null;
    setData(null); setError(''); setSetup(false); setBusy(false); setRevealed('');
   }
   setUser(next);
  };
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { observed = true; apply(session?.user || null); });
  void supabase.auth.getSession().then(({ data: session }) => { if (!observed) apply(session.session?.user || null); });
  return () => { active = false; requestVersion.current++; listener.subscription.unsubscribe(); stopPronunciation(); };
 }, []);
 useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled && user?.id&&learning.ready&&supported) void perform('get'); }); return () => { cancelled = true; }; }, [user?.id,perform,learning.ready,supported]);
 useEffect(() => {
  const sync = () => { if (document.visibilityState === 'visible' && owner.current && !working.current && !pending.current) void perform('get'); };
  window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync);
  return () => { window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
 }, [perform]);
 const continuous = (data?.discover_version || 0) >= 2;
 const assessment = data?.assessment;
 const progress = data?.daily ? dailyProgress(data.daily) : null;
 const item = progress?.current;
 const cardKey = assessment?.status === 'in_progress' ? `${assessment.id}/${assessment.question?.id}` : `${data?.daily?.id}/${item?.id}`;
 const prefetchWords = assessment?.status === 'in_progress' && assessment.question ? assessment.question.word : data?.daily ? data.daily.items.filter(word => !data.daily!.responses[String(word.id)]).slice(0, 3).map(word => word.word).join('\0') : '';
 useEffect(() => {
  prefetchWords.split('\0').filter(Boolean).forEach(word => { void preloadPronunciation(word); });
 }, [prefetchWords]);
 useEffect(() => () => stopPronunciation(), [cardKey]);
 useEffect(() => {
  if (previousCard.current && previousCard.current !== cardKey && wordHeading.current) {
   wordHeading.current.focus({ preventScroll: true });
   wordHeading.current.closest('article')?.scrollIntoView({ block: 'nearest' });
  }
  previousCard.current = cardKey;
 }, [cardKey]);
 useEffect(() => { if (revealed === cardKey) meaningParagraph.current?.focus({ preventScroll: true }); }, [revealed, cardKey]);
 const start = (retake = false) => void perform('assessment_start', { retake, request_id: crypto.randomUUID() });
 const answer = (id: number) => {
  if (!assessment?.question) return;
  setChoice({ key: cardKey, id });
  void perform('assessment_answer', { session_id: assessment.id, position: assessment.responses.length, item_id: assessment.question.id, answer_id: id });
 };
 const nextBatch = () => { if (data?.daily) void perform('next_batch', { set_id: data.daily.id }); };
 const respond = (response: 'know' | 'save') => { if (data?.daily && item) void perform('daily_response', { set_id: data.daily.id, item_id: item.id, response, word:item.word, needs_example:!item.example?.trim() }); };
 const newWords=data?.daily?.items.filter(item=>{
  const response=data.daily?.responses[String(item.id)];
  return response?.action==='save'&&response.added&&!!response.library_id;
 }).filter((item,index,items)=>items.findIndex(other=>data.daily?.responses[String(other.id)].library_id===data.daily?.responses[String(item.id)].library_id)===index)??[];
 return <AppShell active="Discover"><div className={styles.page}>
  <LearningHeader title="Discover." enabled={learning.enabled} collections={learning.collections} active={learning.active} disabled={busy} onSelect={id=>{if(id===learning.active?.id)return;generation.current++;working.current=false;pending.current=null;setData(null);setError('');stopPronunciation();learning.select(id);}}/>
  {supported&&error && <div className={styles.error}><Feedback>{error}</Feedback><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => { const retry = pending.current; void perform(retry?.action || 'get', retry?.payload || {}); }}>Try again</button>{setup && <Link href="/">Back to home</Link>}</div>}
  {supported&&data && !continuous && progress?.current && <Feedback>Continuous Discover needs a one-time database update. Your existing batch remains available.</Feedback>}
  {supported&&data&&data.profile.assessment_status!=='pending'&&!assessment&&<Disclosure className={styles.options} label="Discover options"><div className={styles.actions}><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={()=>start(true)}>{data.profile.assessment_status==='completed'?'Retake vocabulary check':'Take vocabulary check'}</button><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={()=>void perform('get')}>Sync progress</button></div></Disclosure>}
  {user&&learning.ready&&!supported?<Card><h2>More languages, soon.</h2><p>Discover for {learning.active?learningLanguages[learning.active.target_language].label:'this Collection'} isn’t available yet. You can add your own vocabulary and review it.</p><Link href="/add" className="wb-control">Add vocabulary</Link></Card>:user === undefined||!learning.ready ? <LoadingState label="Opening Discover…" /> : !user ? <Card className={styles.blue}>
   <h2>Your next words are waiting.</h2><p>Sign in to keep your vocabulary check and Discover progress in sync.</p><Link className="wb-control" href="/auth">Sign in</Link>
  </Card> : !data ? !error && <LoadingState label="Finding your place…" /> : <>
   {assessment?.status === 'in_progress' && assessment.question ? <section aria-label="Vocabulary check">
    <div className={styles.progress}><span>{assessment.responses.length + 1} / 16</span><progress aria-label="Vocabulary check progress" value={assessment.responses.length} max={16} /></div>
    <Card className={`${styles.blue} wb-learning-card`} key={cardKey}><Pill>{posLabel(assessment.question.pos)}</Pill><h2 ref={wordHeading} tabIndex={-1} className={`wb-learning-content ${styles.word}`}>{assessment.question.word}</h2>
     <PronunciationControl text={assessment.question.word} accent="UK" compact />
     {assessment.question.example && <blockquote className="wb-learning-content">{assessment.question.example}</blockquote>}
     <p>What does this word mean?</p><div className={styles.choices} role="group" aria-label="Meaning choices">{assessment.question.choices.map((option, index) => <SelectableButton key={option.id} selected={choice?.key === cardKey && choice.id === option.id} className="wb-control wb-control-outline" disabled={busy} onClick={() => answer(option.id)}><span aria-hidden="true">{String.fromCharCode(65 + index)}.</span> {option.meaning}</SelectableButton>)}</div>
     <button type="button" className={`wb-control wb-control-outline ${styles.unknown}`} disabled={busy} onClick={() => answer(0)}>I don’t know</button>
    </Card><button type="button" className="text-button" disabled={busy} onClick={() => void perform('skip')}>Skip check and discover words</button>
   </section> : assessment?.status === 'completed' ? <Card className={styles.blue}>
    <p className="eyebrow">YOUR STARTING LEVEL</p><h2 ref={wordHeading} tabIndex={-1}>{levelLabel(assessment.estimated_level || 3)} · Estimated</h2><p>We’ll use this as a starting point and keep learning what works for you.</p>
    <p className={styles.note}>An approximate vocabulary recommendation level, not a certified measure of overall English proficiency.</p>
    <button type="button" className="wb-control" disabled={busy} onClick={() => void perform('assessment_accept', { session_id: assessment.id })}>Discover my next words</button>
   </Card> : data.profile.assessment_status === 'pending' ? <Card className={styles.blue}>
    <h2>Let’s find your level.</h2><p>A quick vocabulary check to find words worth learning. No pressure, no grades.</p><p className={styles.note}>16 questions · about 2–3 minutes</p>
    <div className={styles.actions}><button type="button" className="wb-control" disabled={busy} onClick={() => start()}>Start vocabulary check</button><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => void perform('skip')}>Skip for now</button></div>
   </Card> : !data.daily ? <button type="button" className="wb-control" disabled={busy} onClick={() => void perform('daily')}>Open next words</button> : item && progress ? <section aria-label="Discover batch">
    <div className={styles.dailyHeader}><h2>{data.daily.items.length === 10 ? 'Your next 10.' : 'Your next picks.'}</h2><p>Picked for your current level.</p></div>
    <div className={styles.progress}><span>{progress.completed + 1} / {data.daily.items.length}</span><progress aria-label="Discover batch progress" value={progress.completed} max={Math.max(1, data.daily.items.length)} /></div>
    <Card className={`${styles.blue} wb-learning-card`} key={cardKey}>
     <h2 ref={wordHeading} tabIndex={-1} className={`wb-learning-content ${styles.word}`}>{item.word}</h2><PronunciationControl text={item.word} accent="UK" compact />
     {revealed !== cardKey ? <><p>Do you know this word?</p><button type="button" className="wb-control" onClick={() => setRevealed(cardKey)}>Reveal meaning</button></> : <>
      <Pill>{posLabel(item.pos)}</Pill><p ref={meaningParagraph} tabIndex={-1} className={`wb-learning-content ${styles.meaning}`}>{item.meaning}</p><ContextExample item={{...item,id:`discover:${item.id}`}} owner={user?.id || 'local-demo'} persist={false}/>
      <DictionaryButton word={item.word} meaning={item.meaning}/>
      <div className={styles.actions}><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => respond('know')}>I know it</button><button type="button" className="wb-control" disabled={busy} onClick={() => respond('save')}>Save to Library</button></div>
     </>}
    </Card>
   </section> : <Card className={`${styles.blue} ${styles.completion}`}>
    <h2 ref={wordHeading} tabIndex={-1}>{data.daily.items.length ? 'Nice work.' : data.daily.remaining_count ? 'More words are available.' : 'No new words left.'}</h2>
    {data.daily.items.length > 0 && <><p>You’ve explored {progress?.completed || 0} {(progress?.completed || 0) === 1 ? 'word' : 'words'}.</p>
     <dl className={styles.summary}><div><dt>New words saved</dt><dd>{newWords.length}</dd></div><div><dt>Already known</dt><dd>{Object.values(data.daily.responses).filter(response=>response.action==='know').length}</dd></div></dl></>}
    {!continuous ? <div><p className={styles.note}>More words aren’t available right now. Your progress is saved.</p><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={()=>void perform("get")}>Retry</button></div> : data.daily.remaining_count === 0 ? <p>No new words are available in this collection. Your history is kept; no words will be repeated.</p> : <button type="button" className="wb-control" disabled={busy} onClick={nextBatch}>Discover 10 more</button>}
    {!newWords.length&&<Link className="text-button" href="/library">Open Library</Link>}
   </Card>}
   {!item&&newWords.length>0&&<section aria-label="Your new words" className={styles.newWords}>
    <div className="wb-section-heading"><h2>Your new words</h2><Link className="text-button" href="/library">Open Library</Link></div>
    <ul>{newWords.map(word=><li key={word.id}><VocabularyRow expression={word.word} meaning={word.meaning}
      href={`/library?q=${encodeURIComponent(word.word)}`}/></li>)}</ul>
   </section>}


  </>}
  <p className={styles.sources}><Link href="/discover/sources">Sources & how it works</Link></p>
 </div></AppShell>;
}
