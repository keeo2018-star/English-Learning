import {storeLibrary,clearStoredLibrary} from './offline-store';
import type { LearningItem } from './learning';
const prefix = 'noted-offline-library-v1:';
// Owner-scoped snapshots; never cache authenticated HTTP responses in the service worker.
export function rememberLibrary(owner: string, items: LearningItem[], persist=true) {
  if(persist)void storeLibrary(owner,items).catch(()=>{});
  try { localStorage.setItem(prefix+owner,JSON.stringify(items)); } catch { /* Storage quota cannot interrupt learning. */ }
}
export function offlineLibrary(owner: string): LearningItem[] | null {
  try {
    const rows = JSON.parse(localStorage.getItem(prefix+owner)||'null');
    return Array.isArray(rows)&&rows.every(row=>row&&typeof row.id==='string'&&typeof row.word==='string'&&typeof row.meaning==='string'&&(row.example==null||typeof row.example==='string')) ? rows : null;
  } catch { return null; }
}
export function forgetLibrary(owner: string) {
 void clearStoredLibrary(owner).catch(()=>{});
 try {
  if(localStorage.getItem('noted-offline-owner-v1')===owner)localStorage.removeItem('noted-offline-owner-v1');
  localStorage.removeItem(prefix+owner);
  for(const key of Object.keys(localStorage))if(key.startsWith('noted-example-v1:')&&key.includes(JSON.stringify(owner)))localStorage.removeItem(key);
 } catch { /* Restricted storage. */ }
}

// A prepared device can restore its own previously authenticated account without
// waiting for token refresh. This grants local access only, never server authority.
export function offlineIdentity():import('@supabase/supabase-js').User|null {
 try{const url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!url)return null;const owner=localStorage.getItem('noted-offline-owner-v1');if(!owner)return null;const session=JSON.parse(localStorage.getItem('sb-'+new URL(url).hostname.split('.')[0]+'-auth-token')||'null');return session?.user?.id===owner?session.user:null;}catch{return null;}
}
export function prepareOfflineIdentity(owner:string){try{localStorage.setItem('noted-offline-owner-v1',owner);}catch{/* No persistent access without storage. */}}
