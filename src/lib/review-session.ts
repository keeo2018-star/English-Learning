import type { ReviewCard } from './review';
export type ReviewSession = {
  version: 1; id: string; account: string; queue: (ReviewCard & { eventId: string })[];
  completed: string[]; startedAt: string;
};
export const reviewSessionKey = (account: string) => `noted-review-session-v1:${account}`;
export function newReviewSession(account: string, queue: ReviewCard[]): ReviewSession {
  return { version: 1, id: crypto.randomUUID(), account,
    queue: queue.map(card => ({ ...card, eventId: crypto.randomUUID() })), completed: [], startedAt: new Date().toISOString() };
}
export function readReviewSession(raw: string | null, account: string): ReviewSession | null {
  try {
    const s = JSON.parse(raw || 'null');
    if (!s || s.version !== 1 || s.account !== account || typeof s.id !== 'string' || !Number.isFinite(Date.parse(s.startedAt)) ||
      !Array.isArray(s.queue) || !s.queue.length || s.queue.length > 30 || !Array.isArray(s.completed) ||
      s.queue.some((c: ReviewCard & { eventId: string }) => !c || typeof c.id !== 'string' || typeof c.eventId !== 'string' || !['forward', 'reverse', 'context'].includes(c.direction)) ||
      new Set(s.queue.map((c: ReviewCard) => c.id)).size !== s.queue.length ||
      new Set(s.queue.map((c: { eventId: string }) => c.eventId)).size !== s.queue.length ||
      s.completed.some((id: unknown) => typeof id !== 'string' || !s.queue.some((c: { eventId: string }) => c.eventId === id))) return null;
    return { ...s, completed: [...new Set<string>(s.completed)] };
  } catch { return null; }
}
export function completeSessionCard(session: ReviewSession, eventId: string): ReviewSession {
  if (!session.queue.some(card => card.eventId === eventId) || session.completed.includes(eventId)) return session;
  return { ...session, completed: [...session.completed, eventId] };
}
