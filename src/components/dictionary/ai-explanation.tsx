'use client';
import {useEffect,useState} from 'react';
import {aiStatus,cachedAi,requestAi} from '@/lib/ai-client';
import type {AiEntry} from '@/lib/bilingual-contract';
export function AiExplanation({word}:{word:string}){
 const [entry,setEntry]=useState<AiEntry|null>(null),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void aiStatus().then(async state=>{if(active)setAvailable(state.available);if(state.available){const hit=await cachedAi(word,'en');if(active)setEntry(hit);}});return()=>{active=false;};},[word]);
 if(!available&&!entry)return null;
 return <section className="ai-explanation" aria-label="AI explanation"><h3>AI explanation</h3><p className="ai-label">AI-generated · Not a verified dictionary quotation</p>{entry?<><p className="wb-learning-content">{entry.explanation}</p>{entry.alternatives[0]?.usage&&<p>{entry.alternatives[0].usage}</p>}{entry.related.length>0&&<p>AI connections: {entry.related.map(item=>item.english).join(' · ')}</p>}</>:<><p>Uses this English entry only. Your meaning, context and recordings are not sent.</p><button type="button" className="text-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setEntry(await requestAi(word,'en'));}catch(e){setError(e instanceof Error?e.message:'AI help is unavailable.');}finally{setBusy(false)}}}>{busy?'Preparing…':'Generate AI explanation'}</button></>}{error&&<p role="status">{error}</p>}</section>;
}
export function AiMeaningSuggestion({word,onAccept}:{word:string;onAccept:(meaning:string)=>void}){
 const [available,setAvailable]=useState(false),[proposal,setProposal]=useState<{word:string;meaning:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void aiStatus().then(s=>{if(active)setAvailable(s.available)});return()=>{active=false};},[]);
 if(!available)return null;
 return <div className="ai-meaning"><button type="button" className="text-button" disabled={busy||!word.trim()} onClick={async()=>{setBusy(true);setError('');try{const result=await requestAi(word,'en');setProposal({word,meaning:result.alternatives[0].meaning});}catch(e){setError(e instanceof Error?e.message:'AI help is unavailable.');}finally{setBusy(false)}}}>{busy?'Preparing…':'Suggest with AI'}</button><small>Sends this English entry only to Gemini.</small>{proposal?.word===word&&<div><p>{proposal.meaning}</p><button type="button" className="text-button" onClick={()=>onAccept(proposal.meaning)}>Use this meaning</button></div>}{error&&<p role="status">{error}</p>}</div>;
}
