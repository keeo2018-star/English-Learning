"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { englishText, pronounce, pronunciationSupported, prepareReviewPronunciation, resumePronunciation, stopPronunciation, type Accent, type PronunciationStatus } from './pronunciation';
const subscribe = () => () => {};
export function usePronunciation({ text, accent = 'UK', recording, automatic = false }: {
  text: string; accent?: Accent; recording?: string | null; automatic?: boolean;
}) {
  const owner = useRef(Symbol('pronunciation'));
  const audio = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState<PronunciationStatus>('idle');
  const available = useSyncExternalStore(subscribe, pronunciationSupported, () => false);
  const stop = useCallback(() => stopPronunciation(owner.current), []);
  const start = useCallback((automaticPlayback: boolean) => {
    if (!audio.current || !available) return;
    void pronounce({ owner: owner.current, text, accent, recording, audio: audio.current, automatic: automaticPlayback,
      report: value => { if (alive.current) setStatus(value); } });
  }, [available, text, accent, recording]);
  const play = useCallback(() => {
    if (resumePronunciation(owner.current)) return;
    if (recording === undefined) prepareReviewPronunciation();
    start(false);
  }, [start, recording]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stop(); };
  }, [stop]);
  useEffect(() => {
    if (!automatic) { stop(); return; }
    let cancelled = false;
    // Strict Mode replays setup/cleanup synchronously. Coalesce that replay in
    // the same turn without adding a timer or waiting for media readiness.
    queueMicrotask(() => { if (!cancelled) start(true); });
    return () => { cancelled = true; stop(); };
  }, [automatic, start, stop]);
  useEffect(() => {
    if (status !== 'blocked' || !automatic) return;
    const card = audio.current?.closest('.review-card');
    if (!card) return;
    const resume = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest('button');
      if (button && !button.classList.contains('review-reveal')) return;
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
      resumePronunciation(owner.current);
    };
    card.addEventListener('pointerdown', resume);
    card.addEventListener('keydown', resume);
    return () => { card.removeEventListener('pointerdown', resume); card.removeEventListener('keydown', resume); };
  }, [automatic, status]);
  useEffect(() => {
    const element = audio.current;
    if (!element || !recording) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        element.preload = 'auto'; element.load(); observer.disconnect();
      }
    }, { rootMargin: '200px' });
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, [recording]);
  return { audio, play, stop, status, available: available && /\p{Script=Latin}/u.test(englishText(text)) };
}
