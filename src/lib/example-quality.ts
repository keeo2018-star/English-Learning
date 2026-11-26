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
  const han = (v: string) => v.replace(/[^\p{Script=Han}]/gu, '').replace(/[的了是在和或与一个这那很地得]/g, '');
  const sense = han(meaning);
  return candidates.map((candidate, index) => {
    const sentence = candidate.source?.trim() || '', translated = han(candidate.translation || '');
    if (sentence.length < 12 || sentence.length > 360 || sentence.split(/\s+/).length < 3 || /[<>\x00-\x08]/.test(sentence) || !containsItem(sentence, word) || exampleKey(sentence).replace(/[.!?]+$/, '') === target) return null;
    const overlap = [...new Set(sense)].filter(char => translated.includes(char)).length;
    // If a translated example clearly uses another sense, do not guess.
    if (sense.length >= 2 && translated.length >= 2 && overlap === 0) return null;
    return { text: sentence, score: overlap * 10 - index };
  }).filter((v): v is { text: string; score: number } => !!v).sort((a,b) => b.score-a.score)[0]?.text || '';
}

// Reference providers return bilingual pairs, but usually do not identify the
// grammatical sense of each example. Require the complete saved gloss in the
// paired translation. Explicitly POS-labelled entries need reviewed examples.
export function selectReferenceExample(word: string, meaning: string, candidates: ExampleCandidate[]) {
  if (/^(?:n|v|adj|adv)\.\s/i.test(meaning.trim())) return '';
  const glosses = meaning.split(/[；;，,、/]/u).map(gloss => gloss.trim())
    .filter(gloss => /^[\p{Script=Han}]{2,}$/u.test(gloss));
  if (!glosses.length) return '';
  return selectExample(word, meaning, candidates.filter(candidate =>
    /[.!?]["’”']?$/u.test(candidate.source.trim()) &&
    glosses.some(gloss => candidate.translation?.includes(gloss))
  ));
}
