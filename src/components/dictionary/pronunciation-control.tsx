"use client";
import { Button } from '@/components/ui/button';
import {learningLanguages,type TargetLanguage} from '@/lib/collections';
import { usePronunciation } from '@/lib/use-pronunciation';
import type { Accent } from '@/lib/pronunciation';
import {Icon} from '@/components/ui/icon';
import styles from './dictionary.module.css';
export function PronunciationControl({ text, accent = 'UK', recording, phonetic, automatic = false, compact = false, showErrors = false, activeStyle = false, label,language='en',utility=false }: {
  language?:TargetLanguage;label?: string;utility?: boolean; text: string; accent?: Accent; recording?: string | null; phonetic?: string;
  automatic?: boolean; compact?: boolean; showErrors?: boolean; activeStyle?: boolean;
}) {
  const { audio, play, status, available } = usePronunciation({ text, accent, recording, automatic,language });
  const loading = status === 'loading' || status === 'playing';
  return <span className={compact ? 'random-pronunciation' : styles.phonetic}>
    {phonetic && <span className={styles.ipa}>{phonetic}</span>}
    <Button variant={compact&&!label?"icon":"ghost"} size={compact&&!label?"icon":"small"} compactSurface
      className={utility?styles.pronunciationButton:undefined}
      aria-label={label || "Play pronunciation"} aria-description={utility?(language==='en'?(accent==='UK'?'British English':'American English'):learningLanguages[language].label):undefined}
      data-accent={language==='en'?accent:undefined}
      data-selected={activeStyle && loading || undefined} aria-pressed={activeStyle ? loading : undefined}
      aria-busy={loading} disabled={!available} onClick={play} title={`Play pronunciation (${language==='en'?accent:learningLanguages[language].label})`}>
      <Icon name="volume" size={compact?20:16}/>{label||(!compact&&(language==='en'?accent:'Pronunciation'))}
    </Button>
    <audio ref={audio} hidden preload="none" src={recording || undefined} />
    {(status==='error'||!available)&&<small role="status">{showErrors?'Pronunciation unavailable. Tap the speaker to retry.':'Pronunciation unavailable.'}</small>}
    {status==='blocked'&&<small role="status">Tap the speaker to enable pronunciation.</small>}
  </span>;
}
