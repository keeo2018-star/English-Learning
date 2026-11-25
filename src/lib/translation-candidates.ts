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
  expressionType?: 'word' | 'phrase' | 'sentence';
  register?: string;
  region?: string;
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

function relatedSurface(surface: string, expression: string, lemma: string, language: TargetLanguage) {
  const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase(language)
    .replace(/[.!?。！？]+$/u, '').replace(/\s+/g, ' ').trim();
  const sample = normalize(surface);
  if (!sample) return false;
  return [expression, lemma].map(normalize).filter(Boolean).some(base => {
    if (sample === base) return true;
    if (language === 'zh-CN') return false;
    const words = sample.split(' '), roots = base.split(' ');
    if (words.length !== roots.length) return false;
    return words.every((word,index) => {
      const root = roots[index];
      if (word === root) return true;
      const shorter = Math.min(word.length, root.length) - 1;
      return shorter >= 3 && word.slice(0,shorter) === root.slice(0,shorter);
    });
  });
}

export function parseTranslation(value: unknown, input: TranslationInput): TranslationResult {
  if (!value || typeof value !== 'object') throw Error('No usable translation was returned.');
  const result = value as Record<string, unknown>;
  const seen = new Set<string>();
  const candidates = (Array.isArray(result.candidates) ? result.candidates.slice(0, 5) : []).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const original = index === 0 && input.source === input.target;
    const expression = field(item.expression ?? item.english, 120);
    const lemma = field(item.lemma, 120);
    const type: TranslationCandidate['expressionType'] = item.expressionType === 'word' || item.expressionType === 'phrase' || item.expressionType === 'sentence' ? item.expressionType : undefined;
    // Use an explicitly classified common dictionary form when the spelling only varies by case.
    // User text, proper names, acronyms, and original sentence punctuation are left as provided.
    const english = original ? input.query : item.casing === 'common' && type !== 'sentence' &&
      lemma && lemma.toLocaleLowerCase(input.target) === expression.toLocaleLowerCase(input.target)
      ? lemma.toLocaleLowerCase(input.target) : expression;
    const meaning = field(item.meaning, 1000);
    if (!targetText(english, input.target, 120) || !targetText(meaning, input.explanation) || seen.has(english)) return [];
    seen.add(english);
    const example = field(item.example, 600);
    const highlight = field(item.highlight, 120);
    const validSurface = relatedSurface(highlight,english,lemma,input.target) && highlightParts(example, highlight, {
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
      lemma, expressionType: type, register: field(item.register, 80), region: field(item.region, 80), partOfSpeech: field(item.partOfSpeech, 80),
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
