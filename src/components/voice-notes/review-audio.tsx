"use client";
import {ReviewPronunciation} from '@/components/dictionary/review-pronunciation';
import type {VoiceFile} from '@/lib/voice-notes';
import {VoicePlayer} from './voice-player';
import styles from './voice-notes.module.css';
export function ExpressionReviewAudio({text,automatic,note}:{text:string;automatic:boolean;note?:VoiceFile}){
 return <div className={styles.reviewAudio}><ReviewPronunciation text={text} automatic={automatic} label={note?'Standard':undefined}/>{note&&<VoicePlayer key={note.id} file={note} compact label="My recording"/>}</div>;
}
