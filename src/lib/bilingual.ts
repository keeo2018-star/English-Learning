import {lookupDictionary,type DictionaryResult} from './dictionary';
import {searchLanguage,searchText,translationText,englishResult,type Direction,type SearchItem} from './bilingual-contract';
export type BilingualResult={query:string;language:'en'|'zh';items:SearchItem[];reference?:DictionaryResult;message?:string};
const cache=new Map<string,{value:BilingualResult;expires:number}>(),pending=new Map<string,Promise<BilingualResult>>();
export async function bilingualLookup(input:string,direction:Direction='auto',fetcher:typeof fetch=fetch):Promise<BilingualResult>{
 const query=searchText(input),language=searchLanguage(query,direction),key=language+':'+query,hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.value;if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{
  if(language==='en'&&query.length<=120){try{const reference=await lookupDictionary(query.replace(/[.!?]+$/,''),fetcher);if(reference.chinese.length||reference.english.length){return{query,language,reference,items:[{english:query,meaning:reference.chinese[0]||'',usage:'',example:reference.examples[0]?.source||'',exampleTranslation:reference.examples[0]?.translation||'',source:'dictionary' as const}]};}}catch{/* Full-segment translation remains independent of dictionary coverage. */}}
  if(new TextEncoder().encode(query).length>500)throw Error('Try a shorter passage (roughly 160 Chinese characters).');
  const response=await fetcher('https://api.mymemory.translated.net/get?'+new URLSearchParams({q:query,langpair:language==='zh'?'zh-CN|en':'en|zh-CN'}),{signal:AbortSignal.timeout(7000),cache:'no-store'}).catch(()=>{throw Error('Translation could not connect. Please try again.');});if(!response.ok)throw Error('Translation is unavailable. Please try again.');
  const data=await response.json(),translated=typeof data?.responseData?.translatedText==='string'?translationText(data.responseData.translatedText):'';if(data.responseStatus!==200||data.quotaFinished||typeof translated!=='string'||translated.includes('<')||translated.length>2000)throw Error('Translation is unavailable. You can try a shorter phrase.');
  if(language==='zh'&&!englishResult(translated,2000))throw Error('No reliable English translation was returned.');
  if(language==='en'&&!/[\p{Script=Han}]/u.test(translated))throw Error('No Chinese meaning was returned.');
  return{query,language,items:[{english:language==='zh'?translated:query,meaning:language==='zh'?query:translated,usage:'',example:'',exampleTranslation:'',source:'translation' as const}],message:'Translation via MyMemory. Context can change the best wording.'};
 })().then(value=>{if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{value,expires:Date.now()+3600000});return value;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
