"use client";

import {DefinitionList,BilingualExample} from '@/components/learning/reference-reading';
import {selectExample} from '@/lib/example-quality';
import {primaryMeaning} from '@/lib/learning-quality';
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
  return <div className={styles.pronunciation} role="group" aria-label="Pronunciation and grammar">
    {partOfSpeech&&<small className={styles.pronunciationMeta}>{partOfSpeech}</small>}
    {shared&&<span className={styles.ipa}>{ipa}</span>}
    {language==='en' ? accents.map(({accent,info})=><PronunciationControl
      key={accent} text={word} accent={accent} recording={info?.audio}
      phonetic={shared?undefined:info?.text} showErrors={showErrors} activeStyle={activeStyle} utility/>)
      : <PronunciationControl text={word} language={language} showErrors={showErrors} activeStyle={activeStyle} utility/>}
  </div>;
}
export function DictionaryReferenceContent({result,word,hideChinese=false,savedMeaning='',savedExample,visibleExample='',hasPrimaryExample=false}:{result:DictionaryResult;word:string;hideChinese?:boolean;savedMeaning?:string;savedExample?:string;visibleExample?:string;hasPrimaryExample?:boolean}){
  const primary=selectExample(word,savedMeaning||result.chinese[0]||result.english[0]?.definition||'',result.examples);
  const displayKey=(value?:string)=>value?.normalize('NFC').replace(/\s+/g,' ').trim()||'';
  const seen=new Set<string>();
  const remaining=result.examples.filter(item=>{const source=displayKey(item.source),key=JSON.stringify([source,displayKey(item.translation)]);if(seen.has(key))return false;seen.add(key);return source!==displayKey(savedExample)&&source!==displayKey(visibleExample)&&(hasPrimaryExample||source!==displayKey(primary));});
  const groups=[
    ...(!hideChinese&&result.chinese.length?[{title:'Chinese definitions',entries:result.chinese.filter(definition=>definition.trim()!==savedMeaning.trim()).map(definition=>({definition,partOfSpeech:''}))}]:[]),
    ...(result.english.length?[{title:'English definitions',entries:result.english}]:[]),
  ].filter(group=>group.entries.length>0);
  const examples=(rows:DictionaryResult['examples'])=>rows.map((example,index)=><BilingualExample key={index} dictionary
    source={<HighlightWord text={example.source} target={word}/>} translation={example.translation}/>);
  return <div className={styles.reference}>
    {!hasPrimaryExample&&primary&&examples(result.examples.filter(item=>item.source===primary).slice(0,1))}
    {!!groups.length&&<Disclosure label="Definitions / Other meanings">
      {groups.map(({title,entries})=><section key={title}><h3>{title}</h3>{entries.length>0&&<DefinitionList items={entries}/>}</section>)}
    </Disclosure>}
    {remaining.length>0&&<Disclosure label={`More examples (${remaining.length})`}><p className="wb-supporting">Other dictionary contexts may use a different sense. Your primary meaning: {primaryMeaning(savedMeaning)||'not selected'}.</p>{examples(remaining)}</Disclosure>}
    {!groups.length&&!result.examples.length&&<p>No definitions or examples available for this entry.</p>}
    <small className={styles.credit}>Dictionary reference via UAPI.</small>
  </div>;
}
