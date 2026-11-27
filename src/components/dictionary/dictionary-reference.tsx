"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import type { TargetLanguage } from '@/lib/collections';
import type {DictionaryResult} from '@/lib/dictionary';
import {Disclosure} from '@/components/ui/disclosure';
import {HighlightWord} from './highlight-word';
import {PronunciationControl} from './pronunciation-control';
import styles from './dictionary.module.css';

export function DictionaryPronunciation({word,phonetics,showErrors=true,activeStyle=false,partOfSpeech,language='en'}:{
  word:string;phonetics:DictionaryResult['phonetics'];showErrors?:boolean;activeStyle?:boolean;partOfSpeech?:string;language?:TargetLanguage;
}){
  const accents = (['UK','US'] as const).map(accent=>({accent, info:phonetics.find(item=>item.accent===accent)}));
  const ipa = accents[0].info?.text;
  const shared = language==='en' && ipa && accents[1].info?.text===ipa;
  return <div className={styles.pronunciation}>
    {partOfSpeech&&<small className={styles.pronunciationMeta}>{partOfSpeech}</small>}
    {shared&&<span className={styles.ipa}>{ipa}</span>}
    {language==='en' ? accents.map(({accent,info})=><PronunciationControl
      key={accent} text={word} accent={accent} recording={info?.audio}
      phonetic={shared?undefined:info?.text} showErrors={showErrors} activeStyle={activeStyle} utility/>)
      : <PronunciationControl text={word} language={language} showErrors={showErrors} activeStyle={activeStyle} utility/>}
  </div>;
}
export function DictionaryReferenceContent({result,word,hideChinese=false}:{result:DictionaryResult;word:string;hideChinese?:boolean}){
  const [showAllExamples, setShowAllExamples] = useState(false);
  const initialExampleCount = Math.min(2, Math.max(1, result.examples.length - 1));
  const remainingExamples = result.examples.length - initialExampleCount;
  const groups=[
    ...(!hideChinese&&result.chinese.length?[{title:'Chinese definitions',entries:result.chinese.map(definition=>({definition,partOfSpeech:''}))}]:[]),
    ...(result.english.length?[{title:'English definitions',entries:result.english}]:[]),
  ];
  function renderDefinitions(entries:DictionaryResult['english'],start=0){
    return <ol className={styles.definitions} start={start+1}>{entries.map(({definition,partOfSpeech},index)=><li key={index}>
      {partOfSpeech&&<small>{partOfSpeech}</small>}<p className="wb-learning-content">{definition}</p>
    </li>)}</ol>;
  }
  const examples=(rows:DictionaryResult['examples'])=>rows.map((example,index)=><blockquote data-dictionary-example key={index} className="wb-learning-content">
    {example.source&&<p><HighlightWord text={example.source} target={word}/></p>}
    {example.translation&&<p lang="zh">{example.translation}</p>}
  </blockquote>);
  return <div className={styles.reference}>
    {groups.map(({title,entries})=><section key={title}><h3>{title}</h3>
      {renderDefinitions(entries.slice(0,1))}
      {entries.length>1&&<Disclosure label={`More definitions (${entries.length-1})`}>{renderDefinitions(entries.slice(1),1)}</Disclosure>}
    </section>)}
    {result.examples.length>0&&<section><h3>Examples</h3>
      {examples(showAllExamples ? result.examples : result.examples.slice(0, initialExampleCount))}
      {remainingExamples>0&&<Button variant="ghost" size="small" compactSurface type="button"
        className={styles.exampleDisclosure} aria-expanded={showAllExamples}
        aria-label={showAllExamples ? 'Show fewer examples' : `Show all ${result.examples.length} examples`}
        onClick={() => setShowAllExamples(value => !value)}>
        {showAllExamples ? 'Show fewer examples' : `More examples (${remainingExamples})`}
        <Icon name="chevronDown" size={16}/>
      </Button>}
    </section>}
    {!groups.length&&!result.examples.length&&<p>No definitions or examples available for this entry.</p>}
    <small className={styles.credit}>Dictionary reference via UAPI.</small>
  </div>;
}
