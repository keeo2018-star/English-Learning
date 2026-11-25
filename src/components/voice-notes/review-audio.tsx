"use client";
import type {TargetLanguage} from '@/lib/collections';
import {ReviewPronunciation} from '@/components/dictionary/review-pronunciation';
import type {VoiceFile} from '@/lib/voice-notes';
import {VoicePlayer} from './voice-player';
import styles from './voice-notes.module.css';
export function ExpressionReviewAudio({text,automatic,note,language,accent}:{accent?:'UK'|'US';language?:TargetLanguage;text:string;automatic:boolean;note?:VoiceFile}){
 return <div className={styles.reviewAudio}><ReviewPronunciation text={text} accent={accent} language={language} automatic={automatic} label={note?'Standard':undefined}/>{note&&<VoicePlayer key={note.id} file={note} compact label="My recording"/>}</div>;
}
