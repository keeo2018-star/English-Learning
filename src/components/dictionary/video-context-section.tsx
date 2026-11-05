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
  const [fitsPlayer, setFitsPlayer] = useState(false);
  const section = useRef<HTMLElement>(null);
  const installed = useSyncExternalStore(subscribe, standalone, () => false);
  const id = useId();
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      // 16:9 needs at least 356px width to satisfy the official 200px player height.
      setFitsPlayer(entries[0].contentRect.width >= 356);
    });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  return <section ref={section} className={styles.section} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>In the Wild</h3>
    <p>Hear it in a real conversation.</p>
    <button type="button" className="wb-control wb-control-outline" aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide video' : 'Watch in context'}</button>
    {expanded && <div id={id} className={styles.expanded}>
      {installed || !fitsPlayer ? <><p>Watch on YouGlish in your browser.</p><a className="wb-control wb-control-outline" href={officialContextUrl(word)} target="_blank" rel="noopener noreferrer" onClick={() => stopPronunciation()}>Open YouGlish ↗</a></> : <>
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
