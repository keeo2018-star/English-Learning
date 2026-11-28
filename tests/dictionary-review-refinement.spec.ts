import { expect, test, type Page } from '@playwright/test';
import { cloudOrigin, cloudUrl, mockCloud, sampleWord, user } from './helpers/cloud';

const photos = process.env.NOTED_VISUALS_DIR;
const baseline = process.env.NOTED_VISUAL_BASELINE === '1';
const collection = { id: '88888888-8888-4888-8888-888888888881', user_id: user.id, target_language: 'en', explanation_language: 'en', proficiency_level: 'A2', display_order: 0, created_at: '2026-01-01T00:00:00Z', preferences: { auto_pronunciation: false } };
const rows = Array.from({ length: 12 }, (_, index) => ({
  ...sampleWord, id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
  word: ['precise','incisive','concise','lucid','subtle','terse','nimble','vivid','acute','astute','clear','exact'][index],
  meaning: index===0 ? 'Clearly expressed and accurate' : `Distinct meaning ${index}`, collection_id: collection.id,
}));
const notes = (word: string, old = false) => ({
  word, target: 'en', explanationLanguage: 'en',
  ...(old ? {} : { aiMeaning: 'Expressed clearly and with exact detail.' }),
  comparisons: [{ expression: 'exact', explanation: 'Exact and precise both mean accurate; exact stresses correspondence.' }],
  collocations: [{ expression: 'precise wording', explanation: 'Language chosen with care.' }],
  contexts: ['Editing instructions or explaining details.'], usage: 'Use when wording must convey exactly what you mean.',
});

async function setup(page: Page) {
  let words = rows.map(word => ({ ...word }));
  let generation = 0, cacheReads = 0, libraryReads = 0;
  const events = new Set<string>();
  await mockCloud(page, route => {
    libraryReads++;
    return route.fulfill({ json: words });
  });
  await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot', route => route.fulfill({
    json: { version: 1, multilingual_enabled: true, learning_ready: true, collections: [collection, {...collection, id:'88888888-8888-4888-8888-888888888882', target_language:'fr', display_order:1}] },
  }));
  await page.route('**/api/dictionary?*', route => route.fulfill({
    json: { word: 'precise', phonetics: [], chinese: [], english: [{ partOfSpeech: 'adjective', definition: 'Marked by exactness and accuracy.' }], examples: [], synonyms: [] },
  }));
  await page.route('**/api/ai-dictionary', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true } });
    const input = route.request().postDataJSON();
    if (input.mode === 'enrichment-cache') cacheReads++;
    else generation++;
    return route.fulfill({ json: { available: true, result: notes(input.q, input.q === 'incisive') } });
  });
  await page.route(cloudOrigin+'/rest/v1/rpc/record_learning_review', async route => {
    const input = route.request().postDataJSON();
    events.add(input.p_event_id);
    words = words.map(word => word.id === input.p_item_id ? { ...word, due_at: input.p_due_at, interval_days: input.p_interval_days, review_state: input.p_review_state } : word);
    await route.fulfill({ json: words.find(word => word.id === input.p_item_id) });
  });
  return { events, generation: () => generation, cacheReads: () => cacheReads, libraryReads: () => libraryReads };
}

test.skip(!cloudUrl, 'Requires configured cloud fixture');
for (const width of [320, 390, 1440]) {
  test(`Dictionary shows cached AI meaning and comparison at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await setup(page);
    await page.goto('/library');
    const trigger = page.getByRole('button', { name: 'Dictionary for precise', exact: true });
    await trigger.click();
    const sheet = page.getByRole('dialog');
    if (baseline) {
      await sheet.locator('summary').filter({ hasText: 'Learning notes' }).click();
      await sheet.getByText('Suggested collocations').waitFor();
      if (photos) await page.screenshot({ path: `${photos}/before-${browserName}-dictionary-${width}.png` });
      return;
    }
    const aiMeaning = sheet.getByRole('heading', { name: 'AI meaning', exact: true });
    await expect(aiMeaning).toBeVisible();
    await expect(sheet.getByText('Expressed clearly and with exact detail.')).toBeVisible();
    const mine = sheet.getByRole('heading', { name: 'My meaning', exact: true });
    await expect(mine).toBeVisible();
    expect(await aiMeaning.evaluate(node => node.compareDocumentPosition(document.querySelector('dialog aside h3')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    await expect(sheet.getByText('Clearly expressed and accurate', { exact: true })).toBeVisible();
    await expect(sheet.getByText(/Exact and precise both mean accurate/)).toBeVisible();
    expect(await sheet.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    if (photos) await page.screenshot({ path: `${photos}/after-${browserName}-dictionary-${width}.png` });
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await trigger.click();
    await expect(aiMeaning).toBeVisible();
    expect(state.cacheReads()).toBe(2);
    expect(state.generation()).toBe(0);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Dictionary for incisive', exact: true }).click();
    await expect(sheet.getByText('Suggested collocations')).toBeVisible();
    await expect(aiMeaning).toHaveCount(0);
    expect(state.generation()).toBe(0);
  });

  for (const mode of ['due', 'random']) {
    test(`Review advances ten times with stable controls in ${mode} at ${width}px`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('**/api/audio*', route => route.fulfill({ status: 404, body: '' }));
      const state = await setup(page);
      await page.goto(mode === 'random' ? '/review?mode=random' : '/review');
      const reveal = page.getByRole('button', { name: 'Reveal answer', exact: true });
      await expect(reveal).toBeVisible();
      const controls = [
        page.getByRole('heading', { name: 'Review.', exact: true }),
        page.getByRole('button', { name: 'Switch learning Collection' }),
        page.getByRole('button', { name: 'Due words', exact: true }),
        page.getByRole('button', { name: 'Random review', exact: true }),
        page.getByRole('link', { name: 'Library', exact: true }).first(),
        page.getByRole('switch', { name: 'Auto pronunciation' }),
        page.getByRole('navigation', { name: 'Main navigation' }),
      ];
      const initial = await Promise.all(controls.map(async (control, index) => {
        await control.evaluate((node, id) => node.setAttribute('data-original-control', id), String(index));
        return control.boundingBox();
      }));
      const libraryReads = state.libraryReads();
      const auto = page.getByRole('switch', { name: 'Auto pronunciation' });
      const autoEnabled = await auto.isChecked();
      const collectLoadingFlashes = await page.evaluateHandle(() => {
        let count = 0;
        const observer = new MutationObserver(records => {
          for (const record of records) for (const node of record.addedNodes) {
            if (node instanceof Element && (node.matches('.wb-loading') || node.querySelector('.wb-loading'))) count++;
          }
        });
        observer.observe(document.querySelector('main')!, { childList: true, subtree: true });
        return () => { observer.disconnect(); return count; };
      });
      const seen = new Set<string>();
      for (let index = 0; index < (baseline ? 1 : 10); index++) {
        const card = page.locator('.wb-learning-card.review-card');
        const key = await card.locator('h2').textContent();
        expect(key && !seen.has(key)).toBeTruthy();
        seen.add(key!);
        await reveal.click();
        await card.getByRole('button', { name: index % 2 ? 'Not sure' : 'Sure', exact: true }).click();
        if (baseline) {
          await card.getByRole('button', { name: 'Continue' }).waitFor();
          if (photos) await page.screenshot({ path: `${photos}/before-${browserName}-review-${mode}-${width}.png` });
          return;
        }
        await expect(reveal).toBeVisible();
        await expect(card.getByRole('button', { name: 'Continue' })).toHaveCount(0);
        expect(state.events.size).toBe(index + 1);
        const positions = await page.evaluate(count => Array.from({ length: count }, (_, id) => {
          const node = document.querySelector(`[data-original-control="${id}"]`);
          if (!node) return null;
          const { x, y } = node.getBoundingClientRect();
          return { x, y };
        }), controls.length);
        for (const [controlIndex, position] of positions.entries()) {
          const original = initial[controlIndex];
          expect(position && original && Math.abs(position.y - original.y) < 1).toBeTruthy();
          expect(position && original && Math.abs(position.x - original.x) < 1).toBeTruthy();
        }
        if (index === 0 && photos) await page.screenshot({ path: `${photos}/after-${browserName}-review-${mode}-${width}.png` });
      }
      expect(state.libraryReads()).toBe(libraryReads);
      expect(await auto.isChecked()).toBe(autoEnabled);
      expect(await collectLoadingFlashes.evaluate(read => read())).toBe(0);
      await collectLoadingFlashes.dispose();
    });
  }
}

test('A failed rating keeps the card and an immediate second tap does not duplicate the write', async ({ page }) => {
  const state = await setup(page);
  let allowFailure: () => void = () => {};
  const failure = new Promise<void>(resolve => { allowFailure = resolve; });
  const attempts: string[] = [];
  await page.route(cloudOrigin+'/rest/v1/rpc/record_learning_review', async route => {
    attempts.push(route.request().postDataJSON().p_event_id);
    if (attempts.length > 1) return route.fallback();
    await failure;
    return route.fulfill({ status: 500, json: { code: '23514', message: 'Review temporarily unavailable' } });
  });
  await page.goto('/review');
  const card = page.locator('.wb-learning-card.review-card');
  const prompt = await card.locator('h2').textContent();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  const sure = card.getByRole('button', { name: 'Sure', exact: true });
  await sure.evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => attempts.length).toBe(1);
  await expect(sure).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Switch learning Collection' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Random review', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Library', exact: true }).first()).not.toHaveAttribute('aria-disabled');
  allowFailure();
  await expect(card.getByText('Review temporarily unavailable')).toBeVisible();
  expect(state.events.size).toBe(0);
  await expect(card.locator('h2')).toHaveText(prompt!);
  await sure.click();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  expect(attempts).toEqual([attempts[0], attempts[0]]);
  expect(state.events.size).toBe(1);
});

test('Profile AI consent uses the shared switch and preserves the privacy explanation', async ({ page, browserName }) => {
  const state = await setup(page);
  const optIns: boolean[] = [];
  await page.route(cloudOrigin+'/auth/v1/user', route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const enabled = route.request().postDataJSON().data.noted_ai_after_save;
    optIns.push(enabled);
    return route.fulfill({ json: { ...user, user_metadata: { noted_ai_after_save: enabled } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth');
  const title = page.getByRole('heading', { name: 'Optional AI help' });
  await title.scrollIntoViewIfNeeded();
  if (baseline) {
    if (photos) await page.screenshot({ path: `${photos}/before-${browserName}-profile-390.png` });
    return;
  }
  const consent = page.getByRole('switch', { name: 'Prepare an AI explanation after I save an entry' });
  await expect(consent).not.toBeChecked();
  await expect(page.getByText(/My meaning, My Context and Voice Notes stay private/)).toBeVisible();
  if (photos) await page.screenshot({ path: `${photos}/after-${browserName}-profile-390.png` });
  await consent.click();
  await expect(consent).toBeChecked();
  await expect.poll(() => optIns).toEqual([true]);
  await consent.click();
  await expect(consent).not.toBeChecked();
  await expect.poll(() => optIns).toEqual([true, false]);
  expect(state.generation()).toBe(0);
});
