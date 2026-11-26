"use client";

import {selectExample} from '@/lib/example-quality';
import {primaryMeaning} from '@/lib/learning-quality';
import type {DictionaryResult} from '@/lib/dictionary';
import {Disclosure} from '@/components/ui/disclosure';
import {HighlightWord} from './highlight-word';
import {PronunciationControl} from './pronunciation-control';
import styles from './dictionary.module.css';

export function DictionaryPronunciation({word,phonetics,showErrors=true,activeStyle=false}:{
  word:string;phonetics:DictionaryResult['phonetics'];showErrors?:boolean;activeStyle?:boolean;
}){
  const shared=phonetics.length>1&&phonetics[0].text&&phonetics.every(item=>item.text===phonetics[0].text);
  return <div className={styles.pronunciation}>
    {shared&&<small>{phonetics[0].text}</small>}
    {(phonetics.length?phonetics:[{accent:'UK',text:''},{accent:'US',text:''}]).map(item=><PronunciationControl
      key={item.accent} text={word} accent={item.accent==='US'?'US':'UK'} recording={item.audio||null}
      phonetic={shared?'':item.text} showErrors={showErrors} activeStyle={activeStyle}/>)}
  </div>;
}
export function DictionaryReferenceContent({result,word,hideChinese=false,savedMeaning='',savedExample,hasPrimaryExample=false}:{result:DictionaryResult;word:string;hideChinese?:boolean;savedMeaning?:string;savedExample?:string;hasPrimaryExample?:boolean}){
  const primary=selectExample(word,savedMeaning||result.chinese[0]||result.english[0]?.definition||'',result.examples);
  const remaining=result.examples.filter(item=>item.source!==savedExample&&(hasPrimaryExample||item.source!==primary));
  const groups=[
    ...(!hideChinese&&result.chinese.length?[{title:'Chinese definitions',entries:result.chinese.filter(definition=>definition.trim()!==savedMeaning.trim()).map(definition=>({definition,partOfSpeech:''}))}]:[]),
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
    {!hasPrimaryExample&&primary&&examples(result.examples.filter(item=>item.source===primary).slice(0,1))}
    {!!groups.length&&<Disclosure label="Definitions / Other meanings">
      {groups.map(({title,entries})=><section key={title}><h3>{title}</h3>{renderDefinitions(entries)}</section>)}
    </Disclosure>}
    {remaining.length>0&&<Disclosure label={`More examples (${remaining.length})`}><p className="wb-supporting">Other dictionary contexts may use a different sense. Your primary meaning: {primaryMeaning(savedMeaning)||'not selected'}.</p>{examples(remaining)}</Disclosure>}
    {!groups.length&&!result.examples.length&&<p>No definitions or examples available for this entry.</p>}
    <small className={styles.credit}>Dictionary reference via UAPI.</small>
  </div>;
}
