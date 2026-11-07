import { lookupDictionary } from './dictionary';
export type Suggestion = { word: string; meaning?: string };
export type MeaningSuggestion = { meaning: string; source: 'dictionary' | 'translation' | null };
const meanings = new Map<string, { value: MeaningSuggestion; expires: number }>();
export const normalizeEnglish = (value: string) => value.trim().replace(/\s+/g, ' ');
export async function suggestEnglish(query: string, fetcher: typeof fetch = fetch): Promise<Suggestion[]> {
  const prefix = normalizeEnglish(query).toLowerCase();
  if (prefix.length < 2 || prefix.length > 64 || !/^[a-z][a-z '’-]*$/i.test(prefix)) return [];
  const response = await fetcher('https://api.datamuse.com/sug?' + new URLSearchParams({ s: prefix, max: '15', ...(process.env.DATAMUSE_API_KEY ? { key: process.env.DATAMUSE_API_KEY } : {}) }), { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error('Suggestions unavailable');
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid suggestions');
  return [...new Set(data.flatMap(item => typeof item?.word === 'string' && /^[a-z][a-z '’-]*$/i.test(item.word) && item.word.length <= 120 ? [item.word] : []))]
    .sort((a, b) => Number(b.toLowerCase().startsWith(prefix)) - Number(a.toLowerCase().startsWith(prefix))).slice(0, 5).map(word => ({ word }));
}
export async function suggestMeaning(text: string, type: string, fetcher: typeof fetch = fetch): Promise<MeaningSuggestion> {
  const query = normalizeEnglish(text);
  if (!query || query.length > 120 || !/[a-z]/i.test(query)) return { meaning: '', source: null };
  const expression = type === 'expression' || (type !== 'word' && /\s/.test(query));
  const key = `${expression}:${query}`;
  const hit = meanings.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  let value: MeaningSuggestion = { meaning: '', source: null };
  // Look up the complete phrase; never assemble a translation from separate words.
  if (query.length <= 64 && /^[a-z][a-z '’-]*$/i.test(query)) {
    try {
      const result = await lookupDictionary(query, fetcher);
      const meaning = result.chinese.find(item => /[\u3400-\u9fff]/u.test(item));
      if (meaning) value = { meaning: meaning.split(/[；;]/).slice(0, 2).join('；').slice(0, 500), source: 'dictionary' };
    } catch { /* Missing dictionary entries never block capture. */ }
  }
  if (!value.meaning && expression) {
    const response = await fetcher('https://api.mymemory.translated.net/get?' + new URLSearchParams({ q: query, langpair: 'en|zh-CN' }), { signal: AbortSignal.timeout(7000), cache: 'no-store' });
    if (!response.ok) throw new Error('Translation unavailable');
    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (data.responseStatus === 200 && !data.quotaFinished && typeof translated === 'string' && translated.length <= 2000 && /[\u3400-\u9fff]/u.test(translated) && !translated.includes('<')) value = { meaning: translated, source: 'translation' };
    else if (data.responseStatus !== 200 || data.quotaFinished) throw new Error('Translation unavailable');
  }
  if (value.meaning) {
    if (meanings.size >= 100) meanings.delete(meanings.keys().next().value!);
    meanings.set(key, { value, expires: Date.now() + 3600000 });
  }
  return value;
}
