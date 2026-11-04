import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewQueue } from '../../src/lib/review.ts';
import { newReviewSession, readReviewSession, completeSessionCard } from '../../src/lib/review-session.ts';
import { localDateKey, reviewCoverage, activityLevel } from '../../src/lib/activity.ts';
import { itemType } from '../../src/lib/learning.ts';
const item = {word:'hello',id:'one',meaning:'test',example:'',interval_days:0,due_at:'2020-01-01T00:00:00Z'};
test('30-item weighted session contains unique Words and Expressions; smaller pools stay finite', () => {
  const pool = Array.from({length:50},(_,i)=>({...item,id:String(i),word:i%2?'an expression':'hello'}));
  const q = createReviewQueue(pool, Date.now(), () => .5);
  assert.equal(q.length,30); assert.equal(new Set(q.map(c=>c.id)).size,30);
  assert.ok(q.some(c=>itemType(pool.find(w=>w.id===c.id))==='expression'));
  assert.ok(q.some(c=>itemType(pool.find(w=>w.id===c.id))==='word'));
  assert.equal(createReviewQueue(pool.slice(0,8)).length,8);
});
test('persisted session resumes exactly once; completion is idempotent and scoped to account', () => {
  let s=newReviewSession('a',createReviewQueue([item,{...item,id:'two'}]));
  const first=s.queue[0].eventId;
  s=completeSessionCard(s, first); s=completeSessionCard(s,first);
  assert.equal(s.completed.length,1);
  assert.deepEqual(readReviewSession(JSON.stringify(s),'a'),s);
  assert.equal(readReviewSession(JSON.stringify(s),'b'),null);
  assert.equal(readReviewSession('{oops','a'),null);
  assert.equal(readReviewSession(JSON.stringify({...s,queue:[...s.queue,s.queue[0]]}),'a'),null);
  assert.equal(readReviewSession(JSON.stringify({...s,completed:['unknown']}),'a'),null);
  assert.deepEqual(completeSessionCard(s,'unknown'),s);
});
test('local dates and coverage distinguish unknown history, partial day and genuine zero', () => {
  const instant=new Date('2026-11-01T00:30:00Z');
  assert.equal(localDateKey(instant,'America/Los_Angeles'),'2026-10-31');
  assert.equal(localDateKey(instant,'Pacific/Auckland'),'2026-11-01');
  assert.equal(reviewCoverage('2026-10-30',instant.toISOString(),'America/Los_Angeles'),'unknown');
  assert.equal(reviewCoverage('2026-10-31',instant.toISOString(),'America/Los_Angeles'),'partial');
  assert.equal(reviewCoverage('2026-11-01',instant.toISOString(),'America/Los_Angeles'),'complete');
  assert.equal(reviewCoverage('2026-11-01',null,'UTC'),'unknown');
  assert.deepEqual([0,1,5,15,30].map(activityLevel),[0,1,2,3,4]);
});
test('legacy item types infer without rewriting user text; explicit types win', () => {
  assert.equal(itemType({word:' hello '}),'word');
  assert.equal(itemType({word:'caught off guard'}),'expression');
  assert.equal(itemType({word:'hello',item_type:'expression'}),'expression');
});
