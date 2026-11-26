export const learningLanguages = {
  en: { label: 'English', locale: 'en-GB' },
  'zh-CN': { label: 'Simplified Chinese', locale: 'zh-CN' },
  fr: { label: 'French', locale: 'fr-FR' },
  es: { label: 'Spanish', locale: 'es-ES' },
} as const;

export type TargetLanguage = keyof typeof learningLanguages;
export type LearningCollection = {
  id: string;
  user_id: string;
  target_language: TargetLanguage;
  explanation_language: 'en' | 'zh-CN';
  proficiency_level: string;
  display_order: number;
  preferences: Record<string, unknown>;
  created_at: string;
};

// Installation and activation are separate administrator-reviewed steps.
// Older cached snapshots and the original auto-activating SQL cannot opt in.
export function collectionLearningEnabled(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.version === 1 && snapshot.multilingual_enabled === true &&
    snapshot.learning_ready === true;
}

export const collectionKey = (
  owner: string,
  id: string,
  kind: 'draft' | 'review' | 'preference',
) => `noted-collection-${kind}-v1:${owner}:${id}`;

export function parseCollections(value: unknown, owner: string): LearningCollection[] {
  if (!value || typeof value !== 'object') return [];
  const items = (value as { collections?: unknown }).collections;
  if (!Array.isArray(items)) return [];
  return items.filter((c): c is LearningCollection =>
    !!c && typeof c.id === 'string' && c.user_id === owner &&
    Object.hasOwn(learningLanguages, c.target_language) &&
    ['en', 'zh-CN'].includes(c.explanation_language) &&
    Number.isInteger(c.display_order) && typeof c.created_at === 'string' &&
    Number.isFinite(Date.parse(c.created_at)) &&
    typeof c.proficiency_level === 'string' && !!c.preferences &&
    typeof c.preferences === 'object' && !Array.isArray(c.preferences)
  ).sort((a, b) => a.display_order - b.display_order ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function chooseActiveCollection(
  items: LearningCollection[], owner: string, saved: string | null,
) {
  return items.find(c => c.user_id === owner && c.id === saved) ||
    items.find(c => c.user_id === owner && c.target_language === 'en' &&
      c.explanation_language === 'zh-CN') ||
    items.find(c => c.user_id === owner) || null;
}

export function isOriginalEnglish(c: LearningCollection | null | undefined) {
  return !c || c.target_language === 'en' && c.explanation_language === 'zh-CN';
}
export function collectionItems<T extends {collection_id?:string|null}>(items:T[], collection:LearningCollection|null, legacy=false):T[] {
  return collection ? items.filter(item => item.collection_id === collection.id || legacy && !item.collection_id) : items;
}
export function targetText(value:unknown,target:TargetLanguage,max=2000):value is string {
  if(typeof value!=='string'||value.length>max||/[<>\x00-\x08]/.test(value)||/^https?:/i.test(value))return false;
  return target==='zh-CN'?/\p{Script=Han}/u.test(value):/\p{Script=Latin}/u.test(value)&&!/\p{Script=Han}/u.test(value);
}
export function inputLanguage(text:string,target:TargetLanguage,source:TargetLanguage|'auto'='auto'):TargetLanguage {
  if(source!=='auto')return source;
  if(/\p{Script=Han}/u.test(text))return 'zh-CN';
  // Identify clear multiword patterns; isolated Latin cognates remain ambiguous.
  const markers={en:new Set(['the','of','this','that','would','wouldn’t',"wouldn't",'with','your','you','it','to','i','not']),fr:new Set(['je','ne','pas','cette','avec','vous','une','des','pour','les','de','le']),es:new Set(['esta','este','usted','hola','para','una','los','las','del','que','el'])};
  const distinctive:Record<'en'|'fr'|'es',RegExp>={
    en:/\b(?:hello|goodbye|thanks|thank you|good morning)\b/i,
    fr:/\b(?:bonjour|bonsoir|salut|merci|au revoir|s’il vous plaît)\b/i,
    es:/\b(?:hola|adiós|gracias|buenos días|buenas noches|por favor)\b/i,
  };
  const clear=Object.entries(distinctive).filter(([,pattern])=>pattern.test(text.trim()));
  if(clear.length===1)return clear[0][0] as TargetLanguage;
  const tokens=text.toLowerCase().match(/[\p{Script=Latin}’']+/gu)||[];
  const scores=Object.entries(markers).map(([language,words])=>({language:language as TargetLanguage,score:new Set(tokens.filter(token=>words.has(token))).size})).sort((a,b)=>b.score-a.score);
  if(scores[0].score>=2&&scores[0].score>scores[1].score)return scores[0].language;
  // Preserve target-language manual capture when Latin scripts cannot be distinguished.
  return target==='zh-CN'?'en':target;
}
