import { dictionaryReference } from './dictionary-client';
import { selectReferenceExample } from './example-quality';
import { supabase } from './supabase';
import type { LearningItem } from './learning';
export type ExampleItem = Pick<LearningItem, 'personal_note'|'learning_details'> & { example_source?:'ai'|'dictionary'|'personal'|null; id: string; word: string; meaning: string; example?: string | null };
type Cached = { text: string; at: number };
const pending = new Map<string, Promise<string>>(), misses = new Map<string, number>();
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(work: () => Promise<T>) {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
  try { return await work(); } finally { const next = waiting.shift(); if (next) next(); else running--; }
}
function key(owner: string, item: ExampleItem) { return 'noted-example-v2:' + JSON.stringify([owner,item.id,item.word,item.meaning,item.example ?? null]); }
function read(cacheKey: string): Cached | null {
  try { const value = JSON.parse(localStorage.getItem(cacheKey) || 'null'); return value && typeof value.text === 'string' && value.text.length <= 360 && typeof value.at === 'number' ? value : null; } catch { return null; }
}
function remember(cacheKey: string, text: string) {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('noted-example-v2:'));
    if (keys.length >= 300 && !localStorage.getItem(cacheKey)) {
      const oldest = keys.sort((a,b)=>(read(a)?.at||0)-(read(b)?.at||0))[0]; localStorage.removeItem(oldest);
    }
    localStorage.setItem(cacheKey, JSON.stringify({text,at:Date.now()}));
  } catch { /* Private browsing / quota must not block review. */ }
}
export function cachedExample(owner: string, item: ExampleItem) { return item.example?.trim() ? item.example : read(key(owner,item))?.text || ''; }
async function persist(owner: string, item: ExampleItem, text: string) {
  if (!supabase || owner === 'local-demo' || !navigator.onLine) return text;
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id !== owner) return '';
  let query = supabase.from('words').update({example:text}).eq('user_id',owner).eq('id',item.id).eq('word',item.word).eq('meaning',item.meaning);
  query = item.example == null ? query.is('example',null) : query.eq('example',item.example);
  const { data, error } = await query.select('example').maybeSingle();
  if (error) throw error;
  if (data) return data.example || '';
  // A concurrent edit/deletion wins. Never issue an unconditional second update.
  const current = await supabase.from('words').select('example').eq('id',item.id).eq('user_id',owner).maybeSingle();
  if (current.error) throw current.error;
  return current.data?.example || '';
}
export function resolveExample(owner: string, item: ExampleItem, persistItem = false): Promise<string> {
  if (item.example?.trim()) return Promise.resolve(item.example);
  const cacheKey = key(owner,item), existing = pending.get(cacheKey);
  if (existing) return existing;
  const cached = read(cacheKey)?.text || '';
  if (!navigator.onLine || (!cached && (misses.get(cacheKey) || 0) > Date.now())) return Promise.resolve(cached);
  const task = limited(async () => {
    let text = cached;
    try {
      text = cached || selectReferenceExample(item.word,item.meaning,(await dictionaryReference(item.word)).examples);
      if (!text) { misses.set(cacheKey, Date.now()+300000); return ''; }
      // Cache before attempting cloud sync: a failed write must not lose the example.
      remember(cacheKey,text);
      if (!persistItem) return text;
      const saved = await persist(owner,item,text);
      if (!saved) { try { localStorage.removeItem(cacheKey); } catch {} }
      return saved;
    } catch { misses.set(cacheKey,Date.now()+30000); return text; }
  }).finally(() => { pending.delete(cacheKey); if (misses.size > 500) misses.delete(misses.keys().next().value!); });
  pending.set(cacheKey,task); return task;
}
