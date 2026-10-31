"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const supported = () => typeof window !== "undefined" &&
  typeof window.speechSynthesis?.speak === "function" &&
  typeof window.SpeechSynthesisUtterance === "function";
const serverSnapshot = () => false;

export function RandomPronunciation({ text, automatic }: { text: string; automatic: boolean }) {
  const available = useSyncExternalStore(subscribe, supported, serverSnapshot);
  const [failed, setFailed] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  // Only the card's English title is passed here; never its meaning or notes.
  const english = text.replace(/[^\p{Script=Latin}\x20-\x7E]/gu, " ").replace(/\s+/g, " ").trim();
  const hasEnglish = /\p{Script=Latin}/u.test(english);

  const stop = useCallback(() => {
    pending.current?.();
    pending.current = null;
    current.current = null;
    if (supported()) window.speechSynthesis.cancel();
  }, []);

  const play = useCallback(() => {
    stop();
    if (!available || !hasEnglish) return;
    setFailed(false);
    const synth = window.speechSynthesis;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearWait = () => {
      synth.removeEventListener("voiceschanged", speak);
      if (timer !== undefined) clearTimeout(timer);
      pending.current = null;
    };
    function speak() {
      if (finished) return;
      finished = true;
      clearWait();
      const voices = synth.getVoices();
      const language = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replaceAll("_", "-");
      const voice = voices.find(voice => language(voice).startsWith("en-gb")) ||
        voices.find(voice => /^en(?:-|$)/.test(language(voice)));
      const utterance = new SpeechSynthesisUtterance(english);
      utterance.lang = voice?.lang || "en-GB";
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      current.current = utterance;
      utterance.onend = () => { if (current.current === utterance) current.current = null; };
      utterance.onerror = event => {
        if (current.current !== utterance) return;
        current.current = null;
        if (event.error !== "interrupted" && event.error !== "canceled") setFailed(true);
      };
      try { synth.speak(utterance); }
      catch { if (current.current === utterance) { current.current = null; setFailed(true); } }
    }
    if (synth.getVoices().length) speak();
    else {
      // Mobile browsers can populate voices asynchronously. Wait briefly, then
      // let the engine resolve the requested English language itself.
      synth.addEventListener("voiceschanged", speak);
      timer = setTimeout(speak, 500);
      pending.current = () => { finished = true; clearWait(); };
    }
  }, [available, english, hasEnglish, stop]);

  useEffect(() => {
    if (!automatic) { stop(); return stop; }
    const timer = window.setTimeout(play, 0);
    return () => { clearTimeout(timer); stop(); };
  }, [automatic, play, stop]);

  return <div className="random-pronunciation">
    <button type="button" className="secondary review-speaker"
      aria-label={`Replay English pronunciation: ${text}`}
      title="Replay pronunciation" disabled={!available || !hasEnglish} onClick={play}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M11 5 6 9H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {!available && <small>Speech is not supported in this browser.</small>}
    {available && failed && <small aria-live="polite">Tap the speaker to try pronunciation again.</small>}
  </div>;
}
