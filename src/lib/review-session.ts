import type { ReviewCard } from './review';
export type ReviewSession = {
  version: 1; id: string; account: string; queue: (ReviewCard & { eventId: string })[];
  completed: string[]; startedAt: string; collectionId?:string;
};
export const reviewSessionKey = (account: string,collectionId?:string) => `noted-review-session-v1:${account}${collectionId?':'+collectionId:''}`;
export function newReviewSession(account: string, queue: ReviewCard[],collectionId?:string): ReviewSession {
  return { version: 1, id: crypto.randomUUID(), account,...(collectionId?{collectionId}:{}),
    queue: queue.map(card => ({ ...card, eventId: crypto.randomUUID() })), completed: [], startedAt: new Date().toISOString() };
}
export function readReviewSession(raw: string | null, account: string,collectionId?:string): ReviewSession | null {
  try {
    const s = JSON.parse(raw || 'null');
    if (!s || s.version !== 1 || s.account !== account || s.collectionId !== collectionId || typeof s.id !== 'string' || !Number.isFinite(Date.parse(s.startedAt)) ||
      !Array.isArray(s.queue) || s.queue.length > 30 || !Array.isArray(s.completed) ||
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

// Removing an ungraded card never fabricates a response or erases completed reviews.
export function removeSessionItem(session:ReviewSession,id:string):ReviewSession {
 return {...session,queue:session.queue.filter(card=>card.id!==id||session.completed.includes(card.eventId))};
}

// Durable/local copies can race across tabs. Never drop an acknowledged card.
export function mergeReviewSessions(next:ReviewSession,previous:ReviewSession|null):ReviewSession {
 if(!previous||previous.account!==next.account||previous.collectionId!==next.collectionId)return next;
 if(previous.id!==next.id)return Date.parse(previous.startedAt)>Date.parse(next.startedAt)?previous:next;
 const allowed=new Set(next.queue.map(card=>card.eventId));return {...next,completed:[...new Set([...next.completed,...previous.completed])].filter(id=>allowed.has(id))};
}
