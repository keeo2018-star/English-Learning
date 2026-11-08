"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
 const [data, setData] = useState<DiscoverState | null>(null), [busy, setBusy] = useState(false);
 const [error, setError] = useState(''), [setup, setSetup] = useState(false), [revealed, setRevealed] = useState('');
 const [choice, setChoice] = useState<{ key: string; id: number } | null>(null);
 const owner = useRef<string | null>(null), generation = useRef(0), working = useRef(false), pending = useRef<Action | null>(null);
 const wordHeading = useRef<HTMLHeadingElement>(null), meaningParagraph = useRef<HTMLParagraphElement>(null), previousCard = useRef('');
 const perform = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
  if (!supabase || !owner.current || working.current) return;
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
  } catch (caught) {
   if (generation.current !== request || owner.current !== account) return;
   const failure = caught as { code?: string; message?: string };
   const missing = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(failure.code || '');
   setSetup(missing);
   setError(missing ? 'Discover needs a one-time setup before it can save your progress. Your Library and Review are unchanged.' : failure.message || 'Could not sync Discover. Your last confirmed progress is kept. Try again.');
  } finally { if (generation.current === request) { working.current = false; setBusy(false); } }
 }, []);
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
 useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled && user?.id) void perform('get'); }); return () => { cancelled = true; }; }, [user?.id, perform]);
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
 const respond = (response: 'know' | 'save') => { if (data?.daily && item) void perform('daily_response', { set_id: data.daily.id, item_id: item.id, response }); };
 return <AppShell active="Discover"><div className={styles.page}>
  <header className={styles.header}><p className="eyebrow">DISCOVER /</p><h1>Find words worth learning.</h1></header>
  {error && <div className={styles.error}><Feedback>{error}</Feedback><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => { const retry = pending.current; void perform(retry?.action || 'get', retry?.payload || {}); }}>Try again</button>{setup && <Link href="/">Back to home</Link>}</div>}
  {data && !continuous && progress?.current && <Feedback>Continuous Discover needs a one-time database update. Your existing batch remains available.</Feedback>}
  {user === undefined ? <LoadingState label="Opening Discover…" /> : !user ? <Card className={styles.blue}>
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
      <Pill>{posLabel(item.pos)}</Pill><p ref={meaningParagraph} tabIndex={-1} className={`wb-learning-content ${styles.meaning}`}>{item.meaning}</p><blockquote className="wb-learning-content">{item.example}</blockquote>
      <div className={styles.actions}><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => respond('know')}>I know it</button><button type="button" className="wb-control" disabled={busy} onClick={() => respond('save')}>Save to Library</button></div>
     </>}
    </Card>
   </section> : <Card className={`${styles.blue} ${styles.completion}`}>
    <h2 ref={wordHeading} tabIndex={-1}>{data.daily.items.length ? 'Nice work.' : data.daily.remaining_count ? 'More words are available.' : 'No new words left.'}</h2>
    {data.daily.items.length > 0 && <><p>You’ve explored {progress?.completed || 0} {(progress?.completed || 0) === 1 ? 'word' : 'words'}.</p>
     <dl className={styles.summary}><div><dt>Saved</dt><dd>{progress?.saved || 0}</dd></div><div><dt>Already known</dt><dd>{(progress?.completed || 0) - (progress?.saved || 0)}</dd></div></dl></>}
    {!continuous ? <p className={styles.note}>Continuous Discover needs a one-time database update. Your existing progress is safe.</p> : data.daily.remaining_count === 0 ? <p>No new words are available in this collection. Your history is kept; no words will be repeated.</p> : <button type="button" className="wb-control" disabled={busy} onClick={nextBatch}>Discover 10 more</button>}
    <Link className="wb-control wb-control-outline" href="/library">Open Library</Link>
   </Card>}
   {data.profile.assessment_status !== 'pending' && !assessment && <details className={styles.options}><summary>Discover options</summary><div className={styles.actions}><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => start(true)}>{data.profile.assessment_status === 'completed' ? 'Retake vocabulary check' : 'Take vocabulary check'}</button><button type="button" className="wb-control wb-control-outline" disabled={busy} onClick={() => void perform('get')}>Sync progress</button></div></details>}
  </>}
  <p className={styles.sources}><Link href="/discover/sources">Sources & how it works</Link></p>
 </div></AppShell>;
}
