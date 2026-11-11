export type RelatedTerm={word:string};
export type RelatedResult={items:RelatedTerm[];family:RelatedTerm[];source:'Datamuse'};
export const vocabularyKey=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function relatedQuery(s:string){const query=vocabularyKey(s).replace(/[’]/g,"'").replace(/[.!?]+$/,'');return query.length<=120&&/^[a-z][a-z '’-]*$/i.test(query)?query:'';}
const stop=new Set(['a','an','the','of','and','to','in','it','is','be','as','for','with','that','this','something','anything','thing']);
function candidates(data:unknown,query:string){if(!Array.isArray(data))return [];return data.slice(0,30).flatMap((r,i)=>{
 if(typeof r?.word!=='string'||typeof r.score!=='number'||r.score<=0)return [];
 const word=r.word.trim().replace(/\s+/g,' '),key=vocabularyKey(word),tags=Array.isArray(r.tags)?r.tags.filter((x:unknown)=>typeof x==='string') as string[]:[],frequency=tags.find(t=>t.startsWith('f:')),f=frequency?Number(frequency.slice(2)):undefined;
 if(!relatedQuery(word)||key===query||stop.has(key)||word.split(' ').length>5||(f!==undefined&&(!Number.isFinite(f)||f<.3))||tags.some(t=>/spelling|sounds_like/.test(t)))return [];
 return [{word,key,rank:1/(1+i*.08)+(tags.includes('n')&&!tags.includes('prop')?.35:0)+(f===undefined?0:Math.min(.2,Math.log1p(f)*.15))}];
 });}
export function selectRelated(query:string,semantic:unknown,associations:unknown):RelatedResult{
 const meaning=candidates(semantic,query),topic=candidates(associations,query),semanticKeys=new Set(meaning.map(x=>x.key));
 // Topics avoid a spelling/brand homonym taking over the list (e.g. zodiac boats).
 const chosen=(topic.length?topic.map(x=>({...x,rank:x.rank+(semanticKeys.has(x.key)?.15:0)})).sort((a,b)=>b.rank-a.rank):meaning);
 const seen=new Set<string>();return {items:chosen.filter(x=>!seen.has(x.key)&&!!seen.add(x.key)).slice(0,12).map(({word})=>({word})),family:[],source:'Datamuse'};
}
export async function lookupRelated(value:string,fetcher:typeof fetch=fetch):Promise<RelatedResult>{
 const query=relatedQuery(value);if(!query)return {items:[],family:[],source:'Datamuse'};
 const request=async(parameter:string)=>{const response=await fetcher('https://api.datamuse.com/words?'+new URLSearchParams({[parameter]:query,md:'pf',max:'20',...(process.env.DATAMUSE_API_KEY?{key:process.env.DATAMUSE_API_KEY}:{})}),{signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw new Error('Related words unavailable');return response.json()};
 const results=await Promise.allSettled([request('ml'),request('rel_trg')]);
 if(results.every(r=>r.status==='rejected'))throw new Error('Related words unavailable');
 return selectRelated(query,results[0].status==='fulfilled'?results[0].value:[],results[1].status==='fulfilled'?results[1].value:[]);
}
