"use client";
import { PronunciationControl } from './pronunciation-control';
export function ReviewPronunciation({ text, automatic, label }: { text: string; automatic: boolean; label?: string }) {
  return <PronunciationControl text={text} automatic={automatic} label={label} compact showErrors />;
}
