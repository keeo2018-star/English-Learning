export type EnrichmentInput = {
  word: string;
  target: string;
  explanation: 'en'|'zh-CN';
  level: string;
  partOfSpeech: string;
};
export type LearningPhrase = { expression: string; explanation: string };
export type DictionaryEnrichment = {
  word: string;
  target: string;
  explanationLanguage: string;
  comparisons: LearningPhrase[];
  collocations: LearningPhrase[];
  contexts: string[];
  usage: string;
};

export class EnrichmentValidationError extends Error {
  readonly paths: string[];

  constructor(message: string, paths: string[]) {
    super(message);
    this.paths = paths;
  }
}

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
  const identityPaths = [
    normalized(data.word) !== normalized(input.word) ? 'word' : '',
    data.target !== input.target ? 'target' : '',
    data.explanationLanguage !== input.explanation ? 'explanationLanguage' : '',
  ].filter(Boolean);
  if (identityPaths.length) throw new EnrichmentValidationError('AI returned learning notes for a different entry or language.', identityPaths);
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
      return [{expression,explanation}];
    }).slice(0,comparison?4:5);
  }
  const comparisons=phrases(data.comparisons,true);
  const collocations=phrases(data.collocations,false);
  const contexts=[...new Set((Array.isArray(data.contexts)?data.contexts.slice(0,8):[]).map(explains).filter(Boolean))].slice(0,3);
  const usage=explains(data.usage);
  if(!comparisons.length&&!collocations.length&&!contexts.length&&!usage)throw new EnrichmentValidationError('AI returned no usable learning notes.', ['comparisons', 'collocations', 'contexts', 'usage']);
  return {word:input.word,target:input.target,explanationLanguage:input.explanation,comparisons,collocations,contexts,usage};
}
