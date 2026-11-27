import {supabase} from './supabase';
import type {AiEntry,Direction} from './bilingual-contract';
async function headers(){const {data}=supabase?await supabase.auth.getSession():{data:{session:null}};return {'Content-Type':'application/json',...(data.session?{Authorization:'Bearer '+data.session.access_token}:{})};}
export type AiStatus={available:boolean;message?:string;reason?:'configuration'|'quota'|'request'|'pending'|'empty'};
export async function aiStatus():Promise<AiStatus>{try{const response=await fetch('/api/ai-dictionary',{headers:await headers(),signal:AbortSignal.timeout(8000)});const data=await response.json();return {...data,available:response.ok&&data.available===true,reason:data.available?undefined:response.status===429?'quota':data.reason||'configuration'};}catch{return{available:false,reason:'request',message:'AI status could not be checked. Try again.'};}}
export class AiRequestError extends Error {constructor(message:string,public reason:NonNullable<AiStatus['reason']>){super(message);}}
function responseError(status:number,message?:string,reason?:string){return new AiRequestError(status===429?'AI request limit reached. Try again later.':status===202?'This request is already being prepared. Try again shortly.':message||'AI request failed. Your text is unchanged.',status===429?'quota':status===202?'pending':reason==='empty'?'empty':reason==='configuration'?'configuration':'request');}
const enrichmentCache=new Map<string,import('./dictionary-enrichment').DictionaryEnrichment>();
async function locallyCachedEnrichment(input:import('./dictionary-enrichment').EnrichmentInput){const h=await headers();return enrichmentCache.get(JSON.stringify([h.Authorization||'signed-out',input]))||null;}

export async function cachedAi(q:string,direction:Direction='auto'):Promise<AiEntry|null>{try{const r=await fetch('/api/ai-dictionary?'+new URLSearchParams({q,direction}),{headers:await headers(),signal:AbortSignal.timeout(10000)});const data=await r.json();return data.entry||null;}catch{return null;}}
export async function requestAi(q:string,direction:Direction='auto'):Promise<AiEntry>{const r=await fetch('/api/ai-dictionary',{method:'POST',headers:await headers(),signal:AbortSignal.timeout(23000),body:JSON.stringify({q,direction,consent:true})});const data=await r.json();if(!r.ok||!data.entry)throw Error(data.message||'AI help is unavailable.');return data.entry;}
export async function afterSaveAi(owner:string,word:string){if(!supabase)return;const {data}=await supabase.auth.getSession();if(data.session?.user.id!==owner||data.session.user.user_metadata?.noted_ai_after_save!==true)return;try{await fetch('/api/ai-dictionary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},signal:AbortSignal.timeout(23000),body:JSON.stringify({q:word,direction:'en',consent:true})});}catch{/* Saving the learning item is already confirmed and never depends on AI. */}}

export class TranslationRequestError extends Error {}

export async function requestTranslation(
  input: { q: string; source: string; target: string; explanation: string; context: string; level: string },
  signal: AbortSignal,
): Promise<import('./translation-candidates').TranslationResult> {
  const response = await fetch('/api/ai-dictionary', {
    method: 'POST', headers: await headers(), signal:AbortSignal.any([signal,AbortSignal.timeout(23000)]),
    body: JSON.stringify({ mode: 'translation', consent: true, ...input }),
  });
  const data = await response.json();
  if (!response.ok || !data.result) throw new TranslationRequestError(
    typeof data.message === 'string' ? data.message : 'AI translation is unavailable.',
  );
  return data.result;
}

export async function requestEnrichment(input:import('./dictionary-enrichment').EnrichmentInput,signal:AbortSignal) {
  const h=await headers(),key=JSON.stringify([h.Authorization||'signed-out',input]),cached=enrichmentCache.get(key);
  if(cached)return cached;
  const response=await fetch('/api/ai-dictionary',{method:'POST',headers:h,signal:AbortSignal.any([signal,AbortSignal.timeout(23000)]),
    body:JSON.stringify({mode:'enrichment',consent:true,q:input.word,target:input.target,explanation:input.explanation,level:input.level,partOfSpeech:input.partOfSpeech,meaning:input.meaning})});
  const data=await response.json();
  if(!response.ok||!data.result)throw responseError(response.status,data.message,data.reason);
  const {parseEnrichment}=await import('./dictionary-enrichment');
  const parsed=parseEnrichment(data.result,input);if(enrichmentCache.size>=100)enrichmentCache.delete(enrichmentCache.keys().next().value!);enrichmentCache.set(key,parsed);return parsed;
}

export async function cachedEnrichment(input:import('./dictionary-enrichment').EnrichmentInput,signal:AbortSignal=AbortSignal.timeout(8000)) {
  const local=await locallyCachedEnrichment(input);
  if(local)return local;
  const response=await fetch('/api/ai-dictionary',{
    method:'POST',headers:await headers(),signal,
    body:JSON.stringify({mode:'enrichment-cache',q:input.word,target:input.target,explanation:input.explanation,
      level:input.level,partOfSpeech:input.partOfSpeech,meaning:input.meaning}),
  });
  if(!response.ok)return null;
  const data=await response.json();
  const {parseEnrichment}=await import('./dictionary-enrichment');
  return data.result?parseEnrichment(data.result,input):null;
}
