import {lookupRelated,relatedQuery,type RelatedResult} from '@/lib/related-words';
const cache=new Map<string,{value:RelatedResult;expires:number}>(),pending=new Map<string,Promise<RelatedResult>>();
export async function GET(request:Request){const word=relatedQuery(new URL(request.url).searchParams.get('word')||'');if(!word)return Response.json({items:[],family:[],source:'Datamuse'},{headers:{'Cache-Control':'no-store'}});
 try{let value=cache.get(word);if(!value||value.expires<Date.now()){
  let task=pending.get(word);if(!task){task=lookupRelated(word);pending.set(word,task);}let result:RelatedResult;try{result=await task;}finally{pending.delete(word);}
  value={value:result,expires:Date.now()+(result.items.length?3600000:300000)};if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(word,value);
 }return Response.json(value.value,{headers:{'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=3600'}});
 }catch{return Response.json({message:'Related words are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
