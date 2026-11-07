export const DISCOVER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const levelLabel = (value: number) => DISCOVER_LEVELS[Math.max(0, Math.min(5, Math.round(value) - 1))];
export const localDiscoverDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const discoverTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const posLabel = (pos: string) => ({ n: 'Noun', v: 'Verb', a: 'Adjective', r: 'Adverb' }[pos] || pos);
export type DiscoverItem = { id: number; word: string; meaning: string; pos: string; example: string; definition: string; level: number };
export type DiscoverQuestion = { id: number; word: string; pos: string; example?: string; level: number; choices: { id: number; meaning: string }[] };
export type DiscoverAssessment = { id: string; status: 'in_progress' | 'completed' | 'abandoned'; responses: { item_id: number; answer_id: number; correct: boolean; level: number }[]; question: DiscoverQuestion | null; estimated_level: number | null; result_seen: boolean };
export type DiscoverDaily = { id: string; local_date: string; timezone: string; item_ids: number[]; items: DiscoverItem[]; responses: Record<string, { action: 'know' | 'save'; library_id: string | null; added: boolean }>; difficulty: number };
export type DiscoverState = { profile: { assessment_status: 'pending' | 'skipped' | 'completed'; starting_level: number; recommendation_level: number }; assessment: DiscoverAssessment | null; daily: DiscoverDaily | null };
export function dailyProgress(daily: DiscoverDaily) {
 const completed = daily.items.filter(item => daily.responses[String(item.id)]);
 return { completed: completed.length, saved: completed.filter(item => daily.responses[String(item.id)].action === 'save').length, current: daily.items.find(item => !daily.responses[String(item.id)]) };
}
