import {inputLanguage,targetText,type TargetLanguage} from './collections';
import {lookupDictionary} from './dictionary';
import {bilingualLookup} from './bilingual';
import {searchText,translationText,type SearchItem} from './bilingual-contract';
const cache=new Map<string,{expires:number;items:SearchItem[]}>(),pending=new Map<string,Promise<SearchItem[]>>();
export async function collectionLookup(input:string,target:TargetLanguage,explanation:'en'|'zh-CN',source:TargetLanguage|'auto'='auto',fetcher:typeof fetch=fetch):Promise<SearchItem[]> {
 const query=searchText(input),language=inputLanguage(query,target,source),key=JSON.stringify([query,language,target,explanation]);
 const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.items;if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{
  if(target==='en'&&explanation==='zh-CN'&&['en','zh-CN'].includes(language))return (await bilingualLookup(query,language==='en'?'en':'zh',fetcher)).items;
  if(target===explanation&&language===target){
   if(target!=='en')throw Error('No definition source is available for this context yet. You can write your own meaning.');
   const reference=await lookupDictionary(query,fetcher),definition=reference.english[0]?.definition;
   if(!definition)throw Error('No English definition was found. You can write your own meaning.');
   return [{english:query,meaning:definition,usage:'',example:reference.examples[0]?.source||'',exampleTranslation:'',source:'dictionary' as const}];
  }
  const translate=async(text:string,from:TargetLanguage,to:TargetLanguage)=>{
   if(from===to)return text;
   if(new TextEncoder().encode(text).length>500)throw Error('Try a shorter passage. Your draft is kept.');
   const response=await fetcher('https://api.mymemory.translated.net/get?'+new URLSearchParams({q:text,langpair:from+'|'+to}),{signal:AbortSignal.timeout(7000),cache:'no-store'}).catch(()=>{throw Error('Translation could not connect. Your draft is kept. You can write your own meaning.');});
   if(!response.ok)throw Error('Translation is unavailable. You can enter your own meaning.');const data=await response.json(),result=data?.responseData?.translatedText;
   if(data.responseStatus!==200||data.quotaFinished||typeof result!=='string'||!result.trim()||/[<>\x00-\x08]/.test(result)||result.length>2000)throw Error('Translation is unavailable. Your draft is kept.');
   return translationText(result).trim();
  };
  let title=await translate(query,language,target);
  // Translation memory can contain orphaned fragments from longer texts. For a
  // damaged Chinese headword result, translate an exact dictionary gloss instead.
  const unmatchedParentheses=(value:string)=>(value.match(/\(/g)?.length||0)!==(value.match(/\)/g)?.length||0);
  if(unmatchedParentheses(title)&&language==='zh-CN'&&(target==='fr'||target==='es')){
   const known=await import('./cedict').then(module=>module.cedictLookup(query)).catch(()=>[]);
   if(known[0])title=await translate(known[0].english,'en',target);
  }
  if(unmatchedParentheses(title))throw Error('No reliable translation was returned. Your draft is kept.');
  if(!targetText(title,target))throw Error('No usable result in the selected learning language was returned.');
  // Use the detected source for the meaning to avoid compounding errors by round-tripping through the target.
  let meaning:string;
  if(language!==target&&language!==explanation&&target!==explanation){
   const direct=await translate(query,language,explanation).catch(()=>'');
   meaning=targetText(direct,explanation)?direct:await translate(title,target,explanation);
  }else meaning=await translate(query,language,explanation);
  if(!targetText(meaning,explanation))throw Error('No reliable meaning in the explanation language was returned. You can enter your own.');
  return [{english:title,meaning,usage:'',example:'',exampleTranslation:'',source:'translation' as const}];
 })().then(items=>{if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+3600000,items});return items;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
