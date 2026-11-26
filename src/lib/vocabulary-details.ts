import { highlightParts } from './highlight';
import { learningLanguages, type TargetLanguage } from './collections';

export type VocabularyDetails = {
  originalInput?: string;
  sourceLanguage?: TargetLanguage;
  explanationLanguage?: 'en' | 'zh-CN';
  expressionType?: 'word' | 'phrase' | 'sentence';
  lemma?: string;
  partOfSpeech?: string;
  usage?: string;
  register?: string;
  region?: string;
  exampleTranslation?: string;
  highlight?: string;
  translationContext?: string;
  exampleSource?: 'ai' | 'dictionary' | 'personal';
  source?: 'ai' | 'dictionary' | 'translation';
  reference?: 'cc-cedict';
};

export function vocabularyDetails(value: unknown, example: string, target: TargetLanguage): VocabularyDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const raw = value as Record<string, unknown>;
  const details: VocabularyDetails = {};
  const limits = { originalInput: 500, lemma: 120, partOfSpeech: 80, usage: 400, register: 80, region: 80, exampleTranslation: 600, translationContext: 500 } as const;
  for (const [key, limit] of Object.entries(limits) as [keyof typeof limits, number][]) {
    const field = raw[key];
    if (typeof field === 'string' && field.trim() && field.length <= limit) details[key] = field.trim();
  }
  if (!example) delete details.exampleTranslation;
  if (typeof raw.sourceLanguage === 'string' && Object.hasOwn(learningLanguages, raw.sourceLanguage)) details.sourceLanguage = raw.sourceLanguage as TargetLanguage;
  if (raw.explanationLanguage === 'en' || raw.explanationLanguage === 'zh-CN') details.explanationLanguage = raw.explanationLanguage;
  if (raw.source === 'ai' || raw.source === 'translation' || raw.source === 'dictionary') details.source = raw.source;
  if (example && (raw.exampleSource === 'ai' || raw.exampleSource === 'dictionary' || raw.exampleSource === 'personal')) details.exampleSource = raw.exampleSource;
  if (raw.reference === 'cc-cedict') details.reference = raw.reference;
  if (raw.expressionType === 'word' || raw.expressionType === 'phrase' || raw.expressionType === 'sentence') details.expressionType = raw.expressionType;
  if (example && typeof raw.highlight === 'string' && raw.highlight.length <= 120 &&
      highlightParts(example, raw.highlight, { exact: true, language: target }).some(part => part.highlighted)) {
    details.highlight = raw.highlight;
  }
  return Object.keys(details).length ? details : undefined;
}
