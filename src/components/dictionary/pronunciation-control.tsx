"use client";
import { usePronunciation } from '@/lib/use-pronunciation';
import type { Accent } from '@/lib/pronunciation';
import styles from './dictionary.module.css';
export function PronunciationControl({ text, accent = 'UK', recording, phonetic, automatic = false, compact = false, showErrors = false }: {
  text: string; accent?: Accent; recording?: string | null; phonetic?: string;
  automatic?: boolean; compact?: boolean; showErrors?: boolean;
}) {
  const { audio, play, status, available } = usePronunciation({ text, accent, recording, automatic });
  const loading = status === 'loading' || status === 'playing';
  return <span className={compact ? 'random-pronunciation' : styles.phonetic}>
    <button type="button" className={compact ? 'secondary review-speaker' : 'secondary'}
      aria-label={compact ? `Replay English pronunciation: ${text}` : `Play pronunciation (${accent})`}
      aria-busy={loading} disabled={!available} onClick={play} title="Replay pronunciation">
      {compact ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M11 5 6 9H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg> : <>{accent} <span aria-hidden="true">{loading ? '…' : '▶'}</span></>}
    </button>
    {phonetic && <span className="wb-learning-content">{phonetic}</span>}
    <audio ref={audio} hidden preload="none" src={recording || undefined} />
    {showErrors && status === 'error' && <small aria-live="polite">{compact ? 'Tap the speaker to try pronunciation again.' : 'Audio unavailable.'}</small>}
  </span>;
}
