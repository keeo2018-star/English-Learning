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
