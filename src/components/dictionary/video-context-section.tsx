"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createContextPlayer, officialContextUrl, type ContextPlayer, type VideoAccent } from '@/lib/video-context';
import { registerContextVideo } from '@/lib/learning-media';
import { stopPronunciation } from '@/lib/pronunciation';
import styles from './video-context.module.css';

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
const subscribe = (callback: () => void) => {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
export function VideoContextSection({ word }: { word: string }) {
  const [expanded, setExpanded] = useState(false);
  const [consented, setConsented] = useState(false);
  const [accent, setAccent] = useState<VideoAccent>('uk');
  const installed = useSyncExternalStore(subscribe, standalone, () => false);
  const id = useId();
  return <section className={styles.section} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>In the Wild</h3>
    <p>{installed ? 'Video examples open on YouGlish in your browser.' : 'Hear it in a real conversation. Video via YouGlish.'}</p>
    <div className={styles.card}>
    {!expanded ? <button type="button" className={styles.preview} aria-label="Watch in context" aria-expanded={false} onClick={() => setExpanded(true)}>
      <span className={styles.previewMeta}>VIDEO CONTEXT · {accent.toUpperCase()} ENGLISH</span>
      <span className={styles.play} aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 4.5v15l12-7.5z" /></svg></span>
      <span className={styles.previewWord}>{word}</span>
      <span className={styles.previewLabel}>{installed ? 'Watch in your browser' : 'Watch in context'}</span>
    </button> : <div id={id} className={styles.expanded}>
      <div className={styles.cardHeader}><span className={styles.previewMeta}>VIDEO CONTEXT</span><button type="button" className="wb-control wb-control-outline" aria-expanded={true} aria-controls={id} onClick={() => setExpanded(false)}>Hide video</button></div>
      {installed ? <><p>Video examples for the installed app currently open in your browser.</p><a className="wb-control wb-control-outline" href={officialContextUrl(word)} target="_blank" rel="noopener noreferrer" onClick={() => stopPronunciation()}>Open YouGlish ↗</a></> : <>
        {!consented ? <div className={styles.notice}>
          <p>Loading connects to YouGlish and YouTube. They may use cookies and process your IP address and device information. Nothing loads until you choose below.</p>
          <p><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy & terms</a></p>
          <button type="button" className="wb-control" onClick={() => setConsented(true)}>Agree & load video</button>
        </div> : <>
          <div className={styles.accents} role="group" aria-label="Video accent">
            {(['uk', 'us'] as const).map(value => <button key={value} type="button" className="wb-control wb-control-outline" data-selected={accent === value || undefined} aria-pressed={accent === value} onClick={() => setAccent(value)}>{value.toUpperCase()} English</button>)}
          </div>
          <VideoContextPlayer key={`${word}-${accent}`} word={word} accent={accent} />
        </>}
      </>}
    </div>}
    </div>
  </section>;
}
function VideoContextPlayer({ word, accent }: { word: string; accent: VideoAccent }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<ContextPlayer | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const container = host.current!;
    const mount = document.createElement('div');
    // The official widget replaces its mount. Keep React's host independent.
    mount.id = `noted-context-${crypto.randomUUID()}`;
    container.append(mount);
    const controller = new AbortController();
    let total = -1, ready = false;
    const timer = setTimeout(() => fail(), 25000);
    const unregister = registerContextVideo(() => player.current?.pause());
    function fail() { if (!controller.signal.aborted) { setStatus('error'); controller.abort(); } }
    function update() {
      if (controller.signal.aborted) return;
      if (total === 0) { clearTimeout(timer); setStatus('empty'); controller.abort(); }
      else if (total > 0 && ready) { clearTimeout(timer); setStatus('ready'); }
    }
    void createContextPlayer(mount, word, accent, {
      results: value => { total = value; setCount(value); update(); },
      ready: () => { ready = true; update(); },
      playing: () => { stopPronunciation(); },
      error: fail,
    }, controller.signal).then(value => {
      if (controller.signal.aborted) { value?.dispose(); return; }
      player.current = value;
      // Keep mounting silent, including after switching accent or retrying.
    }).catch(fail);
    return () => { clearTimeout(timer); controller.abort(); unregister(); player.current = undefined; container.replaceChildren(); };
  }, [word, accent, attempt]);
  return <div className={styles.player}>
    <p className={styles.query}>“{word}”</p>
    <p className={styles.meta}>YouGlish search results · exact spoken matches aren’t independently verified.</p>
    {status === 'loading' && <p role="status">Finding video examples…</p>}
    <div ref={host} className={styles.widget} hidden={status === 'empty' || status === 'error'} aria-label="YouGlish video player" />
    {status === 'ready' && <div className={styles.actions}>
      <button type="button" className="wb-control wb-control-outline" onClick={() => { stopPronunciation(); player.current?.replay(); }}>Replay</button>
      {count > 1 && <button type="button" className="wb-control wb-control-outline" onClick={() => { stopPronunciation(); player.current?.next(); }}>Next clip</button>}
    </div>}
    {status === 'empty' && <p role="status">No matching video found yet.</p>}
    {status === 'error' && <><p role="status">Video couldn’t load. It may be unavailable, blocked, or temporarily limited.</p><button type="button" className="wb-control wb-control-outline" onClick={() => { setStatus('loading'); setCount(0); setAttempt(value => value + 1); }}>Try video again</button></>}
    <p className={styles.meta}><a href={officialContextUrl(word, accent)} target="_blank" rel="noopener noreferrer" onClick={() => { stopPronunciation(); player.current?.pause(); }}>Powered by YouGlish.com ↗</a></p>
  </div>;
}
