import test from 'node:test';
import assert from 'node:assert/strict';
import { rateItem, reviewState, reviewWeight, createReviewQueue, reinsertUnsure, contextPrompt, makeReviewCard } from '../../src/lib/review.ts';
const now = Date.parse('2026-11-01T12:00:00Z');
const day = 86400000;
const word = { id: 'one', word: 'caught off guard', meaning: 'Surprised', example: 'I was completely caught off guard by the question.', due_at: new Date(now).toISOString(), interval_days: 0, created_at: new Date(now).toISOString() };
test('legacy rows stay neutral until rated; Sure follows increasing spaced intervals', () => {
  assert.equal(reviewState(word), null);
  let item = word, time = now;
  for (const days of [1, 3, 7, 14, 30, 60]) {
    item = rateItem(item, 'sure', time);
    assert.equal(item.interval_days, days);
    assert.equal(Date.parse(item.due_at), time + days * day);
    time += days * day;
  }
  assert.equal(item.review_state.consecutive_sure, 6);
  assert.equal(item.review_state.review_count, 6);
});
test('same-day Sure cannot manufacture strength or increase the interval ladder', () => {
  const first = rateItem(word, 'sure', now);
  let item = first;
  for (let i = 1; i < 8; i++) item = rateItem(item, 'sure', now + i * 60000);
  assert.equal(item.interval_days, 1);
  assert.equal(item.review_state.consecutive_sure, 1);
  assert.equal(item.review_state.memory_strength, first.review_state.memory_strength);
});
test('Not sure raises difficulty/priority, weakens memory and schedules sooner', () => {
  const sure = rateItem(word, 'sure', now);
  const unsure = rateItem(sure, 'unsure', now + day);
  assert.equal(unsure.interval_days, 0);
  assert.equal(Date.parse(unsure.due_at), now + day + 600000);
  assert.ok(unsure.review_state.difficulty_score > sure.review_state.difficulty_score);
  assert.ok(unsure.review_state.memory_strength < sure.review_state.memory_strength);
  assert.ok(reviewWeight(unsure, now + day) > reviewWeight(sure, now + day));
  assert.equal(unsure.review_state.unsure_count, 1);
});
test('weighted selection favors overdue uncertain items while retaining strong items', () => {
  const weak = rateItem(word, 'unsure', now - day * 10);
  const strong = { ...rateItem(word, 'sure', now), id: 'strong', due_at: new Date(now + 60 * day).toISOString() };
  strong.review_state = { ...strong.review_state, memory_strength: 60, consecutive_sure: 6, difficulty_score: .1 };
  let seed = 42;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  let weakFirst = 0, strongFirst = 0;
  for (let i = 0; i < 5000; i++) {
    const queue = createReviewQueue([weak, strong], now, random);
    if (queue[0].id === weak.id) weakFirst++; else strongFirst++;
  }
  assert.ok(weakFirst > strongFirst * 3);
  assert.ok(strongFirst > 0);
  const pool = Array.from({ length: 30 }, (_, i) => ({ ...word, id: String(i) }));
  const queue = createReviewQueue(pool, now, random);
  assert.equal(queue.length, 30);
  assert.equal(new Set(queue.map(card => card.id)).size, 30);
});
test('uncertain cards return after 3–7 others, at most once, never immediately', () => {
  const queue = Array.from({ length: 12 }, (_, i) => ({ id: String(i), direction: 'forward' }));
  for (const random of [() => 0, () => .99]) {
    const next = reinsertUnsure(queue, 0, random);
    const repeat = next.findIndex((card, i) => i > 0 && card.id === '0');
    assert.ok(repeat >= 4 && repeat <= 8);
    assert.equal(reinsertUnsure(next, repeat).length, next.length);
  }
  assert.equal(reinsertUnsure(queue.slice(0, 1), 0).length, 1);
  assert.equal(reinsertUnsure(queue, 11).length, 12);
  assert.equal(reinsertUnsure(queue.slice(0, 2), 0)[1].id, '1');
});
test('context uses a personal example only with a complete word/phrase match', () => {
  assert.equal(contextPrompt(word), 'I was completely _____ by the question.');
  assert.equal(contextPrompt({ ...word, word: 'guard', example: 'A guardian arrived.' }), null);
  assert.equal(contextPrompt({ ...word, example: '' }), null);
  assert.equal(makeReviewCard(word, () => .95).direction, 'context');
  assert.equal(makeReviewCard({ ...word, example: '' }, () => .8).direction, 'reverse');
  assert.equal(makeReviewCard(word, () => .5).direction, 'forward');
});
test('invalid optional state is neutral and never changes learning content', () => {
  assert.equal(reviewState({ ...word, review_state: { version: 99 } }), null);
  const updated = rateItem(word, 'unsure', now);
  for (const key of ['word', 'meaning', 'example', 'id']) assert.equal(updated[key], word[key]);
});
