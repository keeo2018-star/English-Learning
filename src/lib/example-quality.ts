import {senseEvidence,primaryMeaning} from './learning-quality';
// Conservative selection: absence is better than a misleading invented context.
export type ExampleCandidate = { source: string; translation?: string };
export function exampleKey(text: string) {
  return text.normalize('NFKC').replace(/[‘’ʼ＇]/g,"'").replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/\s+/g,' ').trim().toLowerCase();
}
export function containsItem(sentence: string, item: string) {
  const text = exampleKey(sentence), term = exampleKey(item).replace(/[.!?]+$/, '');
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}
export function selectExample(word: string, meaning: string, candidates: ExampleCandidate[]) {
  const target = exampleKey(word).replace(/[.!?]+$/, '');
  const sense=primaryMeaning(meaning);
  return candidates.map((candidate, index) => {
    const sentence = candidate.source?.trim() || '', translated = candidate.translation || '';
    if (sentence.length < 12 || sentence.length > 360 || sentence.split(/\s+/).length < 3 || /[<>\x00-\x08]/.test(sentence) || !containsItem(sentence, word) || exampleKey(sentence).replace(/[.!?]+$/, '') === target) return null;
    if(!senseEvidence(sense,translated,sentence,word))return null;
    const overlap = [...new Set(sense)].filter(char => translated.includes(char)).length;
    return { text: sentence, score: overlap * 10 - index };
  }).filter((v): v is { text: string; score: number } => !!v).sort((a,b) => b.score-a.score)[0]?.text || '';
}
