export type RelatedTerm={word:string;relation?:'synonym'|'antonym'|'related'};
export type RelatedResult={items:RelatedTerm[];family:RelatedTerm[];source:'Datamuse'};
export const vocabularyKey=(s:string)=>s.normalize('NFKC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').toLowerCase();
export function relatedQuery(s:string){const query=vocabularyKey(s).replace(/[.!?]+$/,'');return query.length<=120&&/^[a-z][a-z '’-]*$/i.test(query)?query:'';}
export function componentOnly(query:string,term:string){const parts=vocabularyKey(query).split(' '),word=vocabularyKey(term);return parts.length>1&&!word.includes(' ')&&parts.some(part=>word===part||word===part+'s'||word===part+'es');}
const stop=new Set(['a','an','the','of','and','to','in','it','is','be','as','for','with','that','this','something','anything','thing']);
function candidates(data:unknown,query:string){if(!Array.isArray(data))return [];return data.slice(0,30).flatMap(r=>{
 if(typeof r?.word!=='string'||typeof r.score!=='number'||r.score<=0)return [];
 const word=r.word.trim().replace(/\s+/g,' '),key=vocabularyKey(word),tags=Array.isArray(r.tags)?r.tags.filter((x:unknown)=>typeof x==='string') as string[]:[],frequency=tags.find(t=>t.startsWith('f:')),f=frequency?Number(frequency.slice(2)):undefined;
 if(!relatedQuery(word)||key===query||componentOnly(query,word)||stop.has(key)||word.split(' ').length>7||(f!==undefined&&(!Number.isFinite(f)||(f<.3&&!word.includes(' '))))||tags.some(t=>/spelling|sounds_like/.test(t)))return [];
 return [{word,key}];
 });}
export function selectRelated(query:string,semantic:unknown,synonyms:unknown,antonyms:unknown=[]):RelatedResult{
 // Exact lexical relationships first; never use rel_trg (bag-of-words associations).
 const rows=[...candidates(synonyms,query).map(x=>({...x,relation:'synonym' as const})),...candidates(antonyms,query).map(x=>({...x,relation:'antonym' as const})),...candidates(semantic,query).map(x=>({...x,relation:'related' as const}))];
 const seen=new Set<string>();return {items:rows.filter(x=>!seen.has(x.key)&&!!seen.add(x.key)).slice(0,24).map(({word,relation})=>({word,relation})),family:[],source:'Datamuse'};
}
export async function lookupRelated(value:string,fetcher:typeof fetch=fetch):Promise<RelatedResult>{
 const query=relatedQuery(value);if(!query)return {items:[],family:[],source:'Datamuse'};
 const request=async(parameter:string)=>{const response=await fetcher('https://api.datamuse.com/words?'+new URLSearchParams({[parameter]:query,md:'pf',max:'30',...(process.env.DATAMUSE_API_KEY?{key:process.env.DATAMUSE_API_KEY}:{})}),{signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw new Error('Related words unavailable');return response.json()};
 const results=await Promise.allSettled([request('ml'),request('rel_syn'),request('rel_ant')]);
 if(results.every(r=>r.status==='rejected'))throw new Error('Related words unavailable');
 const valueAt=(i:number)=>results[i].status==='fulfilled'?results[i].value:[];
 return selectRelated(query,valueAt(0),valueAt(1),valueAt(2));
}
// Chinese stays in the browser: compare the saved sense with returned lexical data.
export function relatedSenseMatches(meaning:string,chinese:string[],english:string[],relation?:string){
 if(relation==='antonym')return true; // Explicit lexical opposition, labelled in the UI.
 const han=(s:string)=>s.replace(/[^\p{Script=Han}]/gu,'').replace(/[的了是在和或与一个这那很地得以对为及并等某种]/g,'');
 const target=han(meaning.split(/[：:。]/)[0].replace(/我自己的|解释|意思|理解/g,'')),translated=han(chinese.join(' '));
 if(target.length>=2&&translated.length){
  const overlap=[...new Set(target)].filter(char=>translated.includes(char));
  return overlap.length>=2||overlap.some(char=>!'评全整体目意情况资源知事度量行定中人物用性化点'.includes(char));
 }
 if(target.length>=2)return relation==='synonym';
 const tokens=(s:string)=>s.toLowerCase().match(/[a-z]{3,}/g)?.filter(x=>!['the','and','for','with','that','this','from','into','something','someone','being','having'].includes(x))||[];
 const saved=tokens(meaning),definitions=new Set(tokens(english.join(' ')));
 return !saved.length||relation==='synonym'||saved.some(token=>definitions.has(token));
}
export function relatedPreview(text:string){return Array.from(text.replace(/^(?:[a-z]+\.)\s*/i,'').split(/[：:。；;]/)[0].trim()).slice(0,44).join('');}

export function relatedMeaning(meaning:string,chinese:string[],english:string[]=[],relation?:string){
 const target=meaning.replace(/[^\p{Script=Han}]/gu,'');
 return chinese.flatMap(line=>line.split(/[；;]/).map(text=>text.trim()).filter(Boolean)).filter(text=>relatedSenseMatches(meaning,[text],english,relation)).map((text,index)=>({text,score:[...new Set(target)].filter(char=>text.includes(char)).length*10-index})).sort((a,b)=>b.score-a.score)[0]?.text||chinese[0]||'';
}
