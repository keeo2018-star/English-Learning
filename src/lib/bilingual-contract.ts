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

type MemoryMatch = { segment?: unknown; translation?: unknown; match?: unknown };
export function memoryVariants(query: string, translated: string, matches: unknown): string[] {
  const clean = (input: string) => translationText(input).normalize('NFC').trim().replace(/\s+/g, ' ');
  const primary = clean(translated), source = clean(query);
  const variants = Array.isArray(matches) ? matches.slice(0, 20).flatMap((match: MemoryMatch | null) =>
    match && typeof match.segment === 'string' && clean(match.segment) === source &&
    typeof match.match === 'number' && match.match >= 0.99 && typeof match.translation === 'string'
      ? [{ text: clean(match.translation), score: match.match }] : []
  ).filter(item => item.text.length > 0 && item.text.length <= 120 && !/[<>\x00-\x1f]/.test(item.text))
    .sort((a, b) => b.score - a.score) : [];
  const titleStyle = /^[\p{Lu}][\p{Ll}]+(?: [\p{Lu}][\p{Ll}]+)+$/u.test(primary);
  // A higher-rated exact match may be more useful than the provider's default.
  // Suppress casing variants only if this same source has attested lowercase evidence.
  const exactLowercase = titleStyle && variants.find(item => item.text === primary.toLowerCase());
  const primaryScore = variants.find(item => item.text === primary)?.score;
  const better = primaryScore !== undefined && variants.find(item => item.score > primaryScore);
  const preferred = exactLowercase ? exactLowercase.text : better ? better.text : primary;
  const titleRemainder = titleStyle && better && /^[\p{Ll}]+$/u.test(better.text) &&
    primary.toLowerCase().startsWith(better.text + ' ');
  return [...new Set([preferred, primary, ...variants.map(item => item.text)])].filter(value =>
    value.length > 0 && value.length <= 120 && !/[<>\x00-\x1f]/.test(value) &&
    (value === preferred || !(value === primary && titleRemainder) && value.toLowerCase() !== preferred.toLowerCase())
  ).slice(0, 5);
}
