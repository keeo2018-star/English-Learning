'use client';

import {createContext, type ReactNode} from 'react';
import styles from './reference-reading.module.css';

// Presentation only: the sheet uses the visible example to avoid repeating it
// in its additional examples. No saved content or lookup selection is changed.
export const VisibleReferenceExample = createContext<((text:string)=>void)|null>(null);

export function BilingualExample({source,translation,label,sourceLanguage='en',translationLanguage='zh',context=false,dictionary=false}:{
 source:ReactNode;translation?:ReactNode;label?:ReactNode;sourceLanguage?:string;translationLanguage?:string;context?:boolean;dictionary?:boolean;
}){
 return <figure className={styles.examplePair}>
  {label&&<figcaption>{label}</figcaption>}
  <blockquote className={`${styles.example} wb-learning-content`} data-context-example={context||undefined} data-dictionary-example={dictionary||undefined}>
   <p data-example-source lang={sourceLanguage}>{source}</p>
   {translation&&<p data-example-translation lang={translationLanguage}>{translation}</p>}
  </blockquote>
 </figure>;
}

export function DefinitionList({items}:{items:{definition:string;partOfSpeech?:string}[]}){
 const seen=new Set<string>();
 const unique=items.filter(item=>{const key=JSON.stringify([item.partOfSpeech?.trim(),item.definition.normalize('NFC').replace(/\s+/g,' ').trim()]);if(seen.has(key))return false;seen.add(key);return true;});
 return <ol className={styles.definitions} data-definition-list>{unique.map(({definition,partOfSpeech},index)=><li key={index} className="wb-learning-content">
  {partOfSpeech&&<><small data-grammar>{partOfSpeech}</small>{' '}</>}
  <span data-definition-text>{definition}</span>
 </li>)}</ol>;
}
