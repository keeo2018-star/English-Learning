"use client";
import type {TargetLanguage} from '@/lib/collections';
import { PronunciationControl } from './pronunciation-control';
export function ReviewPronunciation({ text, automatic, label,language,accent }: { accent?:'UK'|'US';language?:TargetLanguage;text: string; automatic: boolean; label?: string }) {
  return <PronunciationControl text={text} accent={accent} language={language} automatic={automatic} label={label} compact showErrors />;
}
