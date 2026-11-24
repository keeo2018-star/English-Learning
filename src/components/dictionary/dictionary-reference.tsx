"use client";
import {useId,useState} from 'react';
import type {DictionaryResult} from '@/lib/dictionary';
import {Pill} from '@/components/ui/primitives';
import {HighlightWord} from './highlight-word';
import {PronunciationControl} from './pronunciation-control';
import styles from './dictionary.module.css';
export function DictionaryPronunciation({ word, phonetics, showErrors = true, activeStyle = false }: { word: string; phonetics: DictionaryResult["phonetics"]; showErrors?: boolean; activeStyle?: boolean }) {
    return <div className={styles.pronunciation}>
        {(phonetics.length ? phonetics : [{ accent: "UK", text: "" },{accent:"US",text:""}]).map(item => <PronunciationControl key={item.accent + item.audio} text={word}
            accent={item.accent === "US" ? "US" : "UK"} recording={item.audio || null}
            phonetic={item.text} showErrors={showErrors} activeStyle={activeStyle} />)}
    </div>;
}
export function DictionaryReferenceContent({result,word,hideChinese=false}:{result:DictionaryResult;word:string;hideChinese?:boolean}){
 const [examplesExpanded,setExamplesExpanded]=useState(false),[synonymsOpen,setSynonymsOpen]=useState(false);const id=useId();
 return (<div className={styles.reference}>
 {!hideChinese && result.chinese.length > 0 && <section><h3>Chinese</h3><ol className={styles.definitions}>{result.chinese.map((s, i) => <li key={i}><p lang="zh" className="wb-learning-content"><HighlightWord text={s} target={word} /></p></li>)}</ol></section>}
 {result.english.length > 0 && <section><h3>English</h3><ol className={styles.definitions}>{result.english.map((s, i) => <li key={i}>{s.partOfSpeech && <Pill className="wb-learning-content">{s.partOfSpeech}</Pill>}<p className="wb-learning-content"><HighlightWord text={s.definition} target={word} /></p></li>)}</ol></section>}
 {result.examples.length > 0 && <section><h3>Examples</h3><div id={id+"-examples"}>{result.examples.slice(0,examplesExpanded?undefined:2).map((s, i) => <blockquote data-dictionary-example key={i} className="wb-learning-content">{s.source && <p><HighlightWord text={s.source} target={word} /></p>}{s.translation && <p lang="zh"><HighlightWord text={s.translation} target={word} /></p>}</blockquote>)}</div>{result.examples.length>2&&<button type="button" className={`text-button ${styles.exampleToggle}`} aria-expanded={examplesExpanded} aria-controls={id+"-examples"} onClick={()=>setExamplesExpanded(value=>!value)}>{examplesExpanded?"Show fewer examples":`Show all ${result.examples.length} examples`}</button>}</section>}
 {result.synonyms.length > 0 && <details onToggle={event => setSynonymsOpen(event.currentTarget.open)}><summary className="wb-control wb-control-outline" data-selected={synonymsOpen || undefined}>Synonyms</summary><p className="wb-learning-content"><HighlightWord text={result.synonyms.join(" · ")} target={word} /></p></details>}
 {!result.chinese.length && !result.english.length && !result.examples.length && <p className="wb-ui-text">No definitions or examples available for this entry.</p>}
 <p className={`${styles.credit} wb-ui-text`}>Reference via UAPI. Your saved meaning stays yours.</p>
 </div>);
}
