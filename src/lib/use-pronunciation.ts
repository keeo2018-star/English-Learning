"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { englishText, pronounce, pronunciationSupported, stopPronunciation, type Accent, type PronunciationStatus } from './pronunciation';
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
  const play = useCallback(() => {
    if (!audio.current || !available) return;
    void pronounce({ owner: owner.current, text, accent, recording, audio: audio.current,
      report: value => { if (alive.current) setStatus(value); } });
  }, [available, text, accent, recording]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stop(); };
  }, [stop]);
  useEffect(() => {
    if (!automatic) { stop(); return; }
    const timer = setTimeout(play, 0);
    return () => { clearTimeout(timer); stop(); };
  }, [automatic, play, stop]);
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
