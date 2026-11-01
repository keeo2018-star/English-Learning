import type { LearningItem } from './learning';

export type RecallRating = 'unsure' | 'sure';
export type ReviewState = {
  version: 1;
  last_reviewed_at: string;
  last_spaced_success_at: string | null;
  review_count: number;
  sure_count: number;
  unsure_count: number;
  consecutive_sure: number;
  difficulty_score: number;
  memory_strength: number;
  last_rating: RecallRating;
};
export type ReviewCard = { id: string; direction: 'forward' | 'reverse' | 'context' };
const DAY = 86400000;
const intervals = [1, 3, 7, 14, 30, 60, 120, 240, 365];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const number = (v: unknown, fallback: number, max = 1000000) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, max) : fallback;
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
export function reviewState(item: LearningItem): ReviewState | null {
  const value = item.review_state;
  if (!value || value.version !== 1 || !['sure', 'unsure'].includes(value.last_rating)) return null;
  const last = validDate(value.last_reviewed_at);
  if (!last) return null;
  return {
    version: 1, last_reviewed_at: last, last_spaced_success_at: validDate(value.last_spaced_success_at),
    last_rating: value.last_rating,
    review_count: Math.floor(number(value.review_count, 0)), sure_count: Math.floor(number(value.sure_count, 0)),
    unsure_count: Math.floor(number(value.unsure_count, 0)), consecutive_sure: Math.floor(number(value.consecutive_sure, 0)),
    difficulty_score: number(value.difficulty_score, .5, 1), memory_strength: number(value.memory_strength, 1, 365),
  };
}
export function rateItem(item: LearningItem, rating: RecallRating, now = Date.now()): LearningItem {
  const previous = reviewState(item);
  const spaced = !previous?.last_spaced_success_at || now - Date.parse(previous.last_spaced_success_at) >= 20 * 3600000;
  const oldDays = number(item.interval_days, 0, 365);
  const difficulty = previous?.difficulty_score ?? .5;
  const strength = previous?.memory_strength ?? Math.max(1, oldDays);
  const sure = rating === 'sure';
  // A retry in the same day cannot climb the interval ladder or create mastery.
  const nextStep = intervals.find(days => days > oldDays) ?? 365;
  const days = sure ? spaced ? Math.max(1, Math.round(nextStep * (difficulty > .8 ? .8 : 1))) : Math.max(1, oldDays) : 0;
  const state: ReviewState = {
    version: 1, last_reviewed_at: new Date(now).toISOString(),
    last_spaced_success_at: sure && spaced ? new Date(now).toISOString() : previous?.last_spaced_success_at ?? null,
    review_count: (previous?.review_count ?? 0) + 1,
    sure_count: (previous?.sure_count ?? 0) + (sure ? 1 : 0),
    unsure_count: (previous?.unsure_count ?? 0) + (sure ? 0 : 1),
    consecutive_sure: sure ? (previous?.consecutive_sure ?? 0) + (spaced ? 1 : 0) : 0,
    difficulty_score: clamp(difficulty + (sure ? spaced ? -.06 : 0 : .15), .1, 1),
    memory_strength: sure ? spaced ? Math.min(365, Math.max(days, strength * 1.2)) : strength : Math.max(.1, strength * .4),
    last_rating: rating,
  };
  return { ...item, review_state: state, interval_days: days, due_at: new Date(now + (sure ? days * DAY : 10 * 60000)).toISOString() };
}
export function reviewWeight(item: LearningItem, now = Date.now()) {
  const state = reviewState(item);
  const due = Date.parse(item.due_at);
  const overdue = Number.isFinite(due) ? Math.max(0, (now - due) / DAY) : 0;
  const elapsed = state ? Math.max(0, (now - Date.parse(state.last_reviewed_at)) / DAY) : 0;
  const recent = item.created_at ? now - Date.parse(item.created_at) < 7 * DAY : false;
  const forgetting = Math.min(6, elapsed / Math.max(.1, state?.memory_strength ?? 1));
  const strong = state && state.consecutive_sure >= 3 && state.memory_strength >= 7;
  return Math.max(.5, 2 + Math.min(10, Math.log1p(overdue) * 3) + (due <= now ? 3 : 0) + forgetting +
    (state?.difficulty_score ?? .5) * 4 + (state?.last_rating === 'unsure' ? 6 : 0) +
    (state ? 3 * state.unsure_count / Math.max(1, state.review_count) : recent ? 3 : 0) -
    (state?.last_rating === 'sure' ? 1 : 0) - (strong ? 4 : 0));
}
export function contextPrompt(item: LearningItem): string | null {
  if (!item.example?.trim() || !item.word.trim()) return null;
  const escaped = item.word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
  const prompt = item.example.replace(pattern, '_____');
  return prompt !== item.example && /[\p{L}\p{N}]/u.test(prompt) ? prompt : null;
}
export function makeReviewCard(item: LearningItem, random = Math.random): ReviewCard {
  const roll = random();
  return { id: item.id, direction: roll >= .9 && contextPrompt(item) ? 'context' : roll >= .75 && item.meaning.trim() && item.meaning.trim().toLowerCase() !== item.word.trim().toLowerCase() ? 'reverse' : 'forward' };
}
export function createReviewQueue(items: LearningItem[], now = Date.now(), random = Math.random): ReviewCard[] {
  // Weighted sampling without replacement. Every item retains a nonzero chance.
  return items.map(item => ({ item, key: -Math.log(clamp(random(), Number.EPSILON, 1 - Number.EPSILON)) / reviewWeight(item, now) }))
    .sort((a, b) => a.key - b.key).slice(0, 12).map(({ item }) => makeReviewCard(item, random));
}
export function reinsertUnsure(queue: ReviewCard[], position: number, random = Math.random): ReviewCard[] {
  const card = queue[position];
  if (!card || queue.filter(entry => entry.id === card.id).length >= 2) return queue;
  const remaining = queue.length - position - 1;
  // With no other cards available, defer to the next session instead of repeating immediately.
  if (!remaining) return queue;
  const gap = Math.min(remaining, 3 + Math.floor(clamp(random(), 0, .999999) * 5));
  const next = [...queue];
  next.splice(position + 1 + gap, 0, { id: card.id, direction: 'forward' });
  return next;
}
