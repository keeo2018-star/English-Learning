import {supabase} from './supabase';
export const VOICE_BUCKET='noted-voice-notes';
export const VOICE_MAX_BYTES=8*1024*1024;
export const VOICE_MAX_SECONDS=30;
export type VoiceDraft={id:string;file:File;duration:number;mime:string};
export type VoiceFile={id:string;user_id:string;item_id:string;storage_path:string;duration_seconds:number;mime_type:string;byte_size:number;state:'pending'|'active'|'retired';preserved_for_word:boolean;stored:boolean;created_at:string;updated_at:string;expected_active_id:string|null};
const mimeMap:Record<string,string>={'audio/mp3':'audio/mpeg','audio/x-m4a':'audio/mp4','audio/x-wav':'audio/wav','audio/wave':'audio/wav'};
const extensions:Record<string,string>={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',webm:'audio/webm',flac:'audio/flac'};
const accepted=new Set(Object.values(extensions));
export function voiceMime(file:Pick<File,'name'|'type'|'size'>){
 if(!file.size||file.size>VOICE_MAX_BYTES)throw new Error('Choose an audio file no larger than 8 MB.');
 const raw=file.type.toLowerCase().split(';')[0];
 const mime=mimeMap[raw]||((!raw||raw==='application/octet-stream')?extensions[file.name.split('.').pop()!.toLowerCase()]:raw);
 if(!accepted.has(mime))throw new Error('Choose an MP3, M4A, AAC, WAV, Ogg, WebM or FLAC audio file.');
 return mime;
}
export function voiceError(error:unknown){
 const e=error as {code?:string;message?:string};
 if(['PGRST202','PGRST205','42P01','42883'].includes(e?.code||''))return 'Voice Notes need a one-time database and private Storage setup. Your Expression is safe.';
 return e?.message||'Could not save the voice note. Your Expression is safe. Try again.';
}
export async function voiceFiles(items:string[],signal?:AbortSignal):Promise<VoiceFile[]>{
 if(!supabase)return [];
 const request=supabase.rpc('voice_notes_list',{p_items:items});const {data,error}=await (signal?request.abortSignal(signal):request);if(error)throw error;
 if(data?.version!==1||!Array.isArray(data.files))throw new Error('Voice Notes returned an unreadable response.');
 return data.files;
}
export async function removeVoiceFiles(files:VoiceFile[]){
 if(!supabase)throw new Error('Sign in to manage private recordings.');
 const stored=files.filter(file=>file.stored);
 if(stored.length){const {error}=await supabase.storage.from(VOICE_BUCKET).remove(stored.map(f=>f.storage_path));if(error)throw error;}
 for(const file of files){const {error}=await supabase.rpc('voice_note_forget',{p_id:file.id});if(error)throw error;}
}
export async function clearItemVoice(item:string){
 try{await removeVoiceFiles(await voiceFiles([item]));}catch(error){const e=error as {code?:string};if(['PGRST202','PGRST205'].includes(e.code||''))return;throw error;}
}
export async function uploadVoice(item:string,draft:VoiceDraft,expected:string|null=null){
 if(!supabase)throw new Error('Sign in to save a private voice note.');
 const {data:file,error}=await supabase.rpc('voice_note_prepare',{p_item:item,p_id:draft.id,p_duration:draft.duration,p_mime:draft.mime,p_size:draft.file.size,p_expected:expected});if(error)throw error;
 if(file.state!=='active'){
  if(!file.stored){
  const result=await supabase.storage.from(VOICE_BUCKET).upload(file.storage_path,draft.file.slice(0,draft.file.size,draft.mime),{contentType:draft.mime,cacheControl:'0',upsert:false});
  if(result.error&&!['409','Duplicate'].includes(String((result.error as {statusCode?:string}).statusCode))&&!/already exists|duplicate/i.test(result.error.message))throw result.error;
  }
  const finished=await supabase.rpc('voice_note_finish',{p_id:draft.id});if(finished.error)throw finished.error;
 }
 // Retired files remain tracked if removal fails. The current recording is safe.
 let cleanupPending=false;
 try{await removeVoiceFiles((await voiceFiles([item])).filter(f=>f.state==='retired'));}catch{cleanupPending=true;}
 return {cleanupPending};
}
export async function signedVoice(file:VoiceFile){
 if(!supabase)throw new Error('Sign in to listen.');
 const {data,error}=await supabase.storage.from(VOICE_BUCKET).createSignedUrl(file.storage_path,60);if(error)throw error;return data.signedUrl;
}
