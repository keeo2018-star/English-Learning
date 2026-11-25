import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { SearchItem } from './bilingual-contract';

type Sense = { expression: string; usage: string };
let dictionary: Promise<Map<string, string[]>> | undefined;

function loadDictionary() {
  dictionary ??= readFile(join(process.cwd(), 'src/data/cedict/cedict.gz')).then(compressed => {
    const index = new Map<string, string[]>();
    const data = gunzipSync(compressed).toString('utf8');
    for (const line of data.split(/\r?\n/)) {
      const match = /^(\S+) (\S+) \[.+?\] \/(.+)\/$/u.exec(line);
      if (!match) continue;
      const [, traditional, simplified, glosses] = match;
      for (const headword of new Set([traditional, simplified])) {
        const entries = index.get(headword) ?? [];
        entries.push(glosses);
        index.set(headword, entries);
      }
    }
    return index;
  }).catch(error => { dictionary = undefined; throw error; });
  return dictionary;
}

function glosses(entries: string[]): Sense[] {
  const senses: Sense[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const gloss of entry.split('/')) {
      if (/^(?:CL:|(?:old |archaic )?variant of |see |used in |abbr\. for |surname |(?:\((?:slang|vulgar|archaic|obsolete|dialect)\)))/i.test(gloss)) continue;
      const usage = /\(([^()]*)\)/.exec(gloss)?.[1] || '';
      const plain = gloss.replace(/\([^()]*\)/g, '').trim();
      for (const expression of plain.split(/;\s*/)) {
        const key = expression.trim().toLowerCase();
        if (!/^[\p{Script=Latin}][\p{Script=Latin} '\u2019-]{0,54}$/u.test(expression.trim()) || seen.has(key)) continue;
        seen.add(key);
        senses.push({ expression: expression.trim(), usage: usage.length <= 72 ? usage : '' });
      }
    }
  }
  return senses.slice(0, 5);
}

export async function cedictLookup(query: string): Promise<SearchItem[]> {
  if (!/^\p{Script=Han}{1,32}$/u.test(query)) return [];
  const entries = (await loadDictionary()).get(query);
  return glosses(entries ?? []).map(sense => ({
    english: sense.expression, meaning: query, usage: sense.usage, example: '',
    exampleTranslation: '', source: 'dictionary', reference: 'cc-cedict',
  }));
}
