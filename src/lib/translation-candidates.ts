import { highlightParts } from './highlight';
import { targetText, type TargetLanguage } from './collections';
import type { SearchItem } from './bilingual-contract';

export type TranslationInput = {
  query: string;
  source: TargetLanguage;
  target: TargetLanguage;
  explanation: 'en' | 'zh-CN';
  context: string;
  level: string;
};
export type TranslationCandidate = SearchItem & {
  id: string;
  lemma: string;
  partOfSpeech: string;
  highlight: string;
};
export type TranslationResult = {
  ambiguous: boolean;
  recommendedCandidateId: string;
  candidates: TranslationCandidate[];
};

function field(value: unknown, limit: number) {
  return typeof value === 'string' && value.length <= limit && !/[<>\x00-\x08]/.test(value)
    ? value.normalize('NFC').trim() : '';
}

export function parseTranslation(value: unknown, input: TranslationInput): TranslationResult {
  if (!value || typeof value !== 'object') throw Error('No usable translation was returned.');
  const result = value as Record<string, unknown>;
  const seen = new Set<string>();
  const candidates = (Array.isArray(result.candidates) ? result.candidates.slice(0, 5) : []).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const english = index === 0 && input.source === input.target ? input.query : field(item.expression ?? item.english, 120);
    const meaning = field(item.meaning, 1000);
    if (!targetText(english, input.target, 120) || !targetText(meaning, input.explanation) || seen.has(english)) return [];
    seen.add(english);
    const example = field(item.example, 600);
    const highlight = field(item.highlight, 120);
    const validSurface = Boolean(highlight) && highlightParts(example, highlight, {
      exact: true, language: input.target,
    }).some(part => part.highlighted);
    // Reject unrelated examples. Missing optional inflection markup does not hide a usable example.
    const literalMatch = () => highlightParts(example, english.replace(/[.!?。！？]+$/u, ''), {
      language: input.target,
    }).some(part => part.highlighted);
    const usable = targetText(example, input.target) && /[.!?。！？]$/u.test(example) &&
      (validSurface || literalMatch());
    return [{
      id: encodeURIComponent(english), english, meaning, source: 'ai' as const,
      lemma: field(item.lemma, 120), partOfSpeech: field(item.partOfSpeech, 80),
      usage: field(item.usage, 400), example: usable ? example : '',
      exampleTranslation: usable && targetText(item.exampleTranslation, input.explanation)
        ? field(item.exampleTranslation, 600) : '',
      highlight: usable && validSurface ? highlight : '',
    }];
  });
  if (!candidates.length) throw Error('No usable translation was returned.');
  if (input.source === input.target && candidates[0].english !== input.query) {
    throw Error('No usable result for the original expression was returned.');
  }
  return { ambiguous: result.ambiguous === true, recommendedCandidateId: candidates[0].id, candidates };
}
