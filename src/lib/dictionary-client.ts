import {lookupText,type DictionaryResult} from './dictionary';
const cache=new Map<string,{value:DictionaryResult;at:number}>(),pending=new Map<string,Promise<DictionaryResult>>();
// Pronunciation and contextual examples reuse the same complete dictionary response.
export function dictionaryPayload(word:string,pronunciation=false):Promise<DictionaryResult>{
 const query=lookupText(word).replace(/[.!?]+$/,'').trim(),key=query.toLowerCase(),hit=cache.get(key);
 if(hit&&Date.now()-hit.at<3600000)return Promise.resolve(hit.value);
 const waiting=pending.get(key);if(waiting)return waiting;
 const task=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{
  const response=await fetch('/api/dictionary?'+new URLSearchParams({word:query,...(pronunciation?{pronunciation:'1'}:{})}),{signal:controller.signal}),data=await response.json();
  if(!response.ok)throw new Error(typeof data.message==='string'?data.message:'The dictionary is unavailable right now.');
  if(!Array.isArray(data.phonetics))throw new Error('The dictionary returned an unreadable response.');
  // Do not retain incomplete / malformed responses as successful references.
  if(typeof data.word==='string'&&Array.isArray(data.chinese)&&Array.isArray(data.english)&&Array.isArray(data.examples)&&Array.isArray(data.synonyms)){
   if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{value:data,at:Date.now()});
  }
  return data as DictionaryResult;
 }catch(error){if(controller.signal.aborted)throw new Error('The dictionary timed out. Try again.');throw error;}finally{clearTimeout(timer);pending.delete(key);}})();pending.set(key,task);return task;
}
export async function dictionaryReference(word:string):Promise<DictionaryResult>{
 const data=await dictionaryPayload(word);
 if(typeof data.word!=='string'||!Array.isArray(data.phonetics)||!Array.isArray(data.chinese)||!Array.isArray(data.english)||!Array.isArray(data.examples)||!Array.isArray(data.synonyms))throw new Error('The dictionary returned an unreadable response.');
 return data;
}
