import {senseEvidence,meaningParts,conflictingSense} from './learning-quality';
export type EnrichmentInput = {
  meaning?: string;
  word: string;
  target: string;
  explanation: 'en'|'zh-CN';
  level: string;
  partOfSpeech: string;
};
export type LearningPhrase = { expression: string; explanation: string; coreMeaning?:string; register?:string; situation?:string; example?:string };
export type DictionaryEnrichment = {
  word: string;
  target: string;
  explanationLanguage: string;
  comparisons: LearningPhrase[];
  collocations: LearningPhrase[];
  contexts: string[];
  usage: string;
};

function record(raw:unknown): Record<string,unknown> {
  return raw && typeof raw==='object' && !Array.isArray(raw)?raw as Record<string,unknown>:{};
}
function normalized(text:unknown) {
  return typeof text==='string'?text.trim().normalize('NFC').toLowerCase():'';
}
function plain(raw:unknown,max:number) {
  return typeof raw==='string' && raw.length<=max && !/[<>\x00-\x08]|https?:\/\//i.test(raw)? raw.trim():'';
}

export function parseEnrichment(raw:unknown,input:EnrichmentInput):DictionaryEnrichment {
  const data=record(raw);
  if(normalized(data.word)!==normalized(input.word)||data.target!==input.target||data.explanationLanguage!==input.explanation)
    throw Error('AI returned learning notes for a different entry or language.');
  const explains=(value:unknown)=>{
    const text=plain(value,340);
    return (input.explanation==='zh-CN'?/\p{Script=Han}/u:/\p{Script=Latin}/u).test(text)&&
      (input.explanation!=='en'||!/\p{Script=Han}/u.test(text))?text:'';
  };
  function phrases(raw:unknown,comparison:boolean){
    const seen=new Set<string>();
    if(comparison)seen.add(normalized(input.word));
    return (Array.isArray(raw)?raw.slice(0,12):[]).flatMap(value=>{
      const item=record(value),expression=plain(item.expression,130),explanation=explains(item.explanation);
      const validScript=input.target==='zh-CN'?/\p{Script=Han}/u.test(expression):/\p{Script=Latin}/u.test(expression)&&!/\p{Script=Han}/u.test(expression);
      const key=normalized(expression);
      if(!validScript||!explanation||seen.has(key))return [];
      seen.add(key);
      const meaning=input.meaning||'';
      if(comparison&&meaning&&(!senseEvidence(meaning,explanation+' '+String(item.coreMeaning||''),'',input.word)||meaningParts(meaning).some(part=>conflictingSense(meaning,part))))return [];
      const extra:Partial<LearningPhrase>=comparison?{coreMeaning:explains(item.coreMeaning),register:explains(item.register),situation:explains(item.situation),example:plain(item.example,280)}:{};
      if(extra.example&&(!extra.example.toLocaleLowerCase().includes(expression.toLocaleLowerCase())||/[<>]/.test(extra.example)))delete extra.example;
      return [{expression,explanation,...Object.fromEntries(Object.entries(extra).filter(([,value])=>!!value))}];
    }).slice(0,comparison?4:5);
  }
  const comparisons=phrases(data.comparisons,true);
  const collocations=phrases(data.collocations,false);
  const contexts=[...new Set((Array.isArray(data.contexts)?data.contexts.slice(0,8):[]).map(explains).filter(Boolean))].slice(0,3);
  const usage=explains(data.usage);
  if(!comparisons.length&&!collocations.length&&!contexts.length&&!usage)throw Error('AI returned no usable learning notes.');
  return {word:input.word,target:input.target,explanationLanguage:input.explanation,comparisons,collocations,contexts,usage};
}
