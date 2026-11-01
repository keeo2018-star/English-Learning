import { test, expect, type Page } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

type Entry = typeof sampleWord & { review_state?: Record<string, unknown> | null };
async function setup(page: Page, count = 3, random = .5) {
  let entries: Entry[] = Array.from({ length: count }, (_, i) => ({ ...sampleWord, id: `random-${i}`, word: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'][i], meaning: `Meaning ${i}`, due_at: '2099-01-01T00:00:00Z', example: '' }));
  const writes: Record<string, unknown>[] = [];
  let fail = false;
  await page.addInitScript(value => { Math.random = () => value; }, random);
  await mockCloud(page, route => {
    if (route.request().method() === 'PATCH') {
      const changes = route.request().postDataJSON(); writes.push(changes);
      if (fail) return route.fulfill({ status: 503, json: { message: 'Could not save review. Please try again.' } });
      const id = new URL(route.request().url()).searchParams.get('id')?.replace('eq.', '');
      entries = entries.map(entry => entry.id === id ? { ...entry, ...changes } : entry);
      return route.fulfill({ json: { id } });
    }
    return route.fulfill({ json: entries });
  });
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  return { writes, entries: () => entries, fail: (value: boolean) => { fail = value; } };
}

test.describe('adaptive Random Review', () => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  for (const width of [390, 1440]) test(`reveal, Sure, persist, advance without repeats (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const store = await setup(page);
    await page.goto('/review?mode=random');
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
      const card = page.locator('.review-card.wb-card');
      const word = (await card.locator('h2').textContent())!;
      expect(seen.has(word)).toBe(false); seen.add(word);
      await expect(card.getByRole('button', { name: 'Sure', exact: true })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Not sure', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Reveal answer' }).click();
      for (const label of ['Not sure', 'Sure']) {
        const button = page.getByRole('button', { name: label, exact: true });
        const size = (await button.boundingBox())!;
        expect(size.height).toBeGreaterThanOrEqual(48); expect(size.width).toBeGreaterThanOrEqual(100);
      }
      await page.getByRole('button', { name: 'Sure', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Random review complete.' })).toBeVisible();
    expect(store.writes).toHaveLength(3);
    for (const entry of store.entries()) {
      expect(entry.review_state?.last_rating).toBe('sure');
      expect(entry.review_state?.review_count).toBe(1);
      expect(entry.interval_days).toBe(1);
    }
    await page.goto('/library');
    await expect(page.locator('.wb-familiarity')).toHaveText(['Sure', 'Sure', 'Sure']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Not sure persists and returns after five other cards, without an immediate repeat', async ({ page }) => {
    const store = await setup(page, 8);
    await page.goto('/review?mode=random');
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
    const first = (await page.locator('.review-card h2').textContent())!;
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Not sure', exact: true }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.locator('.review-card h2')).not.toHaveText(first);
      await page.getByRole('button', { name: 'Reveal answer' }).click();
      await page.getByRole('button', { name: 'Sure', exact: true }).click();
    }
    await expect(page.locator('.review-card h2')).toHaveText(first);
    expect(store.entries()[0].review_state?.last_rating).toBe('unsure');
    expect(store.entries()[0].interval_days).toBe(0);
    const state = store.entries()[0].review_state!;
    expect(state.difficulty_score).toBeGreaterThan(.5);
    expect(state.memory_strength).toBeLessThan(1);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    expect(store.entries()[0].review_state?.review_count).toBe(2);
  });

  test('failed save retains the revealed card for retry, then saves once and advances', async ({ page }) => {
    const store = await setup(page, 2); store.fail(true);
    await page.goto('/review?mode=random');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Could not save review' })).toBeVisible();
    await expect(page.locator('.review-card h2')).toHaveText('alpha');
    await expect(page.getByRole('button', { name: 'Sure', exact: true })).toBeEnabled();
    store.fail(false);
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect(page.locator('.review-card h2')).toHaveText('beta');
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeFocused();
    expect(store.entries()[0].review_state?.review_count).toBe(1);
  });

  test('unknown legacy rows have no familiarity; a single unsure card finishes without immediate repetition', async ({ page }) => {
    const store = await setup(page, 1);
    await page.goto('/library'); await expect(page.locator('.wb-familiarity')).toHaveCount(0);
    await page.goto('/review?mode=random');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Not sure', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Random review complete.' })).toBeVisible();
    await page.goto('/library'); await expect(page.locator('.wb-familiarity')).toHaveText('Not sure');
    expect(store.entries()[0].review_state?.last_rating).toBe('unsure');
  });

  for (const mode of ['reverse', 'context']) test(`${mode} hides the answer and its pronunciation until reveal`, async ({ page }) => {
    await page.addInitScript(value => { Math.random = () => value; }, mode === 'reverse' ? .8 : .95);
    await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, word: 'caught off guard', meaning: '猝不及防', example: 'I was caught off guard by the question.' }] }));
    await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
    await page.goto('/review?mode=random');
    await expect(page.locator('.review-card h2')).toHaveText(mode === 'reverse' ? '猝不及防' : 'I was _____ by the question.');
    await expect(page.getByRole('button', { name: 'Play pronunciation', exact: true })).toHaveCount(0);
    await expect(page.getByText('caught off guard', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.locator('.wb-meaning-reveal')).toHaveText('caught off guard');
    await expect(page.getByRole('button', { name: 'Play pronunciation', exact: true })).toBeVisible();
  });
});
