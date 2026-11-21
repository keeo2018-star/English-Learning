import type { LearningItem } from './learning';
const prefix = 'noted-offline-library-v1:';
// Owner-scoped snapshots; never cache authenticated HTTP responses in the service worker.
export function rememberLibrary(owner: string, items: LearningItem[]) {
  try { localStorage.setItem(prefix+owner,JSON.stringify(items)); } catch { /* Storage quota cannot interrupt learning. */ }
}
export function offlineLibrary(owner: string): LearningItem[] | null {
  try {
    const rows = JSON.parse(localStorage.getItem(prefix+owner)||'null');
    return Array.isArray(rows)&&rows.every(row=>row&&typeof row.id==='string'&&typeof row.word==='string'&&typeof row.meaning==='string'&&(row.example==null||typeof row.example==='string')) ? rows : null;
  } catch { return null; }
}
export function forgetLibrary(owner: string) {
 try {
  localStorage.removeItem(prefix+owner);
  for(const key of Object.keys(localStorage))if(key.startsWith('noted-example-v1:')&&key.includes(JSON.stringify(owner)))localStorage.removeItem(key);
 } catch { /* Restricted storage. */ }
}
