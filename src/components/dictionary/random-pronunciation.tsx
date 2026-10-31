"use client";
import { PronunciationControl } from './pronunciation-control';
export function RandomPronunciation({ text, automatic }: { text: string; automatic: boolean }) {
  return <PronunciationControl text={text} automatic={automatic} compact showErrors />;
}
