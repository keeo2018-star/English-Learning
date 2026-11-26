import {supabase} from './supabase';
import type {AiEntry,Direction} from './bilingual-contract';
async function headers(){const {data}=supabase?await supabase.auth.getSession():{data:{session:null}};return {'Content-Type':'application/json',...(data.session?{Authorization:'Bearer '+data.session.access_token}:{})};}
export async function aiStatus():Promise<{available:boolean;message?:string}>{try{return await(await fetch('/api/ai-dictionary',{headers:await headers()})).json();}catch{return{available:false};}}
export async function cachedAi(q:string,direction:Direction='auto'):Promise<AiEntry|null>{try{const r=await fetch('/api/ai-dictionary?'+new URLSearchParams({q,direction}),{headers:await headers()});const data=await r.json();return data.entry||null;}catch{return null;}}
export async function requestAi(q:string,direction:Direction='auto'):Promise<AiEntry>{const r=await fetch('/api/ai-dictionary',{method:'POST',headers:await headers(),body:JSON.stringify({q,direction,consent:true})});const data=await r.json();if(!r.ok||!data.entry)throw Error(data.message||'AI help is unavailable.');return data.entry;}
export async function afterSaveAi(owner:string,word:string){if(!supabase)return;const {data}=await supabase.auth.getSession();if(data.session?.user.id!==owner||data.session.user.user_metadata?.noted_ai_after_save!==true)return;try{await fetch('/api/ai-dictionary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({q:word,direction:'en',consent:true})});}catch{/* Saving the learning item is already confirmed and never depends on AI. */}}

export async function requestTranslation(
  input: { q: string; source: string; target: string; explanation: string; context: string; level: string },
  signal: AbortSignal,
): Promise<import('./translation-candidates').TranslationResult> {
  const response = await fetch('/api/ai-dictionary', {
    method: 'POST', headers: await headers(), signal,
    body: JSON.stringify({ mode: 'translation', consent: true, ...input }),
  });
  const data = await response.json();
  if (!response.ok || !data.result) throw Error(data.message || 'AI translation is unavailable.');
  return data.result;
}

export async function requestEnrichment(input:import('./dictionary-enrichment').EnrichmentInput,signal:AbortSignal) {
  const response=await fetch('/api/ai-dictionary',{method:'POST',headers:await headers(),signal,
    body:JSON.stringify({mode:'enrichment',consent:true,q:input.word,target:input.target,explanation:input.explanation,level:input.level,partOfSpeech:input.partOfSpeech})});
  const data=await response.json();
  if(!response.ok||!data.result)throw Error(data.message||'AI learning notes are unavailable.');
  const {parseEnrichment}=await import('./dictionary-enrichment');
  return parseEnrichment(data.result,input);
}
