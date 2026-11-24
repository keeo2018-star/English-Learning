export type Direction='auto'|'en'|'zh';
export type SearchItem={english:string;meaning:string;usage:string;example:string;exampleTranslation:string;source:'dictionary'|'translation'|'ai'};
export type AiEntry={explanation:string;alternatives:SearchItem[];related:{english:string;meaning:string}[]};
export function searchLanguage(query:string,direction:Direction='auto'):'en'|'zh'{return direction==='auto'?/[\p{Script=Han}]/u.test(query)?'zh':'en':direction;}
export function searchText(value:unknown){if(typeof value!=='string')throw Error('Enter English or Chinese text.');const q=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(!q||Array.from(q).length>500||/[\x00-\x08<>]/.test(q))throw Error('Search supports up to 500 characters of plain text.');return q;}
export function englishResult(value:unknown,max=500){return typeof value==='string'&&value.length<=max&&/[a-z]/i.test(value)&&!/[\p{Script=Han}<>\x00-\x08]/u.test(value)&&!/^https?:/i.test(value);}
export function parseAiEntry(value:unknown):AiEntry{
 if(!value||typeof value!=='object')throw Error('The explanation could not be read.');const v=value as Record<string,unknown>;
 const text=(x:unknown,max:number)=>typeof x==='string'&&x.length<=max&&!/[<>\x00-\x08]/.test(x)?x.trim():'';
 const alternatives=Array.isArray(v.alternatives)?v.alternatives.slice(0,4).flatMap(raw=>{if(!raw||typeof raw!=='object')return[];const x=raw as Record<string,unknown>;if(!englishResult(x.english,2000))return[];const meaning=text(x.meaning,1000);if(!/[\p{Script=Han}]/u.test(meaning))return[];return[{english:String(x.english).trim(),meaning,usage:text(x.usage,600),example:englishResult(x.example,600)?String(x.example).trim():'',exampleTranslation:text(x.exampleTranslation,600),source:'ai' as const}]}):[];
 const seen=new Set<string>();const unique=alternatives.filter(x=>{const key=x.english.toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ');if(seen.has(key))return false;seen.add(key);return true;});
 if(!unique.length)throw Error('No usable English result was returned.');
 return{explanation:text(v.explanation,2200),alternatives:unique,related:Array.isArray(v.related)?v.related.slice(0,6).flatMap(raw=>{if(!raw||typeof raw!=='object')return[];const x=raw as Record<string,unknown>;return englishResult(x.english,120)?[{english:String(x.english).trim(),meaning:text(x.meaning,200)}]:[]}):[]};
}

export function translationText(value:string){return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:39|34|x27|x22);/gi,entity=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&#39;':"'",'&#34;':'"','&#x27;':"'",'&#x22;':'"'}[entity.toLowerCase()]||entity));}
