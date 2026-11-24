'use client';
import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase';
import {aiStatus} from '@/lib/ai-client';
export function AiSettings({user}:{user:User}){
 const [available,setAvailable]=useState(false),[enabled,setEnabled]=useState(user.user_metadata?.noted_ai_after_save===true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void aiStatus().then(s=>{if(active)setAvailable(s.available)});return()=>{active=false};},[]);
 if(!available&&!enabled)return null;
 return <section className="ai-settings"><h2>Optional AI help</h2><label><input type="checkbox" checked={enabled} disabled={busy||(!available&&!enabled)} onChange={async event=>{if(!supabase)return;const value=event.target.checked;setBusy(true);setError('');const result=await supabase.auth.updateUser({data:{noted_ai_after_save:value}});if(result.error)setError('Could not save this preference. Please retry.');else setEnabled(value);setBusy(false);}}/>Prepare an AI explanation after I save an entry</label><p>Sends only the English entry to Gemini. My meaning, My Context and Voice Notes stay private. Google’s free-tier terms may allow submitted text to improve its products.</p>{error&&<p role="status">{error}</p>}</section>;
}
