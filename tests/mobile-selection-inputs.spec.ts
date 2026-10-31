import { test, expect, type Page, type Locator } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

async function setup(page: Page) {
  await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, meaning: '放轻松，慢慢来。' }] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
    word: sampleWord.word, phonetics: [{ accent: 'UK', text: 'ˌserənˈdɪpəti' }],
    chinese: ['意外的幸运发现'], english: [{ partOfSpeech: 'noun', definition: 'A fortunate discovery by chance.' }],
    examples: [{ source: 'A chance encounter.', translation: '一次偶然的相遇。' }], synonyms: ['chance', 'fortune'],
  } }));
}
async function selectable(locator: Locator, expected: 'none' | 'text') {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-user-select') || getComputedStyle(element).userSelect)).toBe(expected);
}
async function fields(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const dialogs = page.getByRole('dialog');
  const root = await dialogs.count() ? dialogs : page;
  const controls = root.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea,select');
  await expect(controls.first()).toBeVisible();
  expect(await controls.count()).toBeGreaterThan(0);
  for (const field of await controls.all()) {
    if (!await field.isVisible()) continue;
    const before = await field.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(element).fontSize), scale: window.visualViewport?.scale || 1 };
    });
    expect(before.font).toBeGreaterThanOrEqual(16);
    expect(before.height).toBeGreaterThanOrEqual(48);
    await selectable(field, 'text');
    await field.focus();
    await expect(field).toBeFocused();
    const after = await field.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, scale: window.visualViewport?.scale || 1 };
    });
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
    expect(after.scale).toBeCloseTo(before.scale, 2);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /maximum-scale=1|user-scalable=no/);
}

test.describe('mobile interface selection and iPhone field typography', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  test('mobile UI is not selectable while vocabulary, meanings and dictionary content remain selectable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.goto('/');
    await selectable(page.locator('h1'), 'none');
    const title = (await page.locator('h1').boundingBox())!;
    await page.mouse.move(title.x + 2, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + title.width - 2, title.y + title.height / 2, { steps: 12 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString().trim() || '')).toBe('');
    await selectable(page.getByRole('navigation', { name: 'Main navigation' }), 'none');
    expect(await page.getByRole('search').locator('label').evaluate(element => getComputedStyle(element).userSelect)).toBe('none');
    await page.goto('/library');
    expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).not.toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).userSelect)).not.toBe('none');
    const card = page.locator('.word-row');
    await selectable(page.locator('.page-title p'), 'none');
    await selectable(card.locator('h2'), 'text');
    await selectable(card.locator('.wb-word-content > p'), 'text');
    await selectable(card.locator('blockquote'), 'text');
    expect(await card.locator('h2').evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-touch-callout'))).not.toBe('none');
    // Native pointer selection, rather than programmatically constructing a Range.
    const word = card.locator('h2');
    await word.scrollIntoViewIfNeeded();
    const box = (await word.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 15 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString().trim().length || 0)).toBeGreaterThan(0);
    await page.getByRole('button', { name: `Dictionary for ${sampleWord.word}` }).click();
    const dialog = page.getByRole('dialog');
    await selectable(dialog.locator('h2'), 'text');
    await selectable(dialog.getByRole('heading', { name: 'Chinese', exact: true }), 'none');
    await selectable(dialog.getByText('意外的幸运发现', { exact: true }), 'text');
    await selectable(dialog.getByText('A fortunate discovery by chance.', { exact: true }), 'text');
    await selectable(dialog.getByText('一次偶然的相遇。', { exact: true }), 'text');
    await selectable(dialog.getByRole('button', { name: 'Close', exact: true }), 'none');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/review');
    await selectable(page.locator('.review-card h2'), 'text');
    await selectable(page.getByRole('button', { name: 'Reveal meaning', exact: true }), 'none');
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    await selectable(page.locator('.wb-meaning-reveal'), 'text');
    await page.goto('/auth');
    await selectable(page.locator('.wb-auth-panel h1'), 'none');
    await selectable(page.getByLabel('Email', { exact: true }).locator('..'), 'none');
  });

  test('mobile text fields stay at least 16px before and after focus across all forms', async ({ page }) => {
    await setup(page);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/'); await fields(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/add'); await fields(page);
    const meaning = page.getByLabel('Meaning', { exact: true });
    await meaning.focus();
    const original = (await meaning.boundingBox())!;
    await page.setViewportSize({ width: 390, height: 500 });
    const keyboardSize = (await meaning.boundingBox())!;
    expect(keyboardSize.width).toBeCloseTo(original.width, 0);
    expect(keyboardSize.height).toBeCloseTo(original.height, 0);
    await expect(meaning).toHaveCSS('font-size', '16px');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Word or phrase').fill('Copy this text');
    await page.getByLabel('Word or phrase').selectText();
    expect(await page.getByLabel('Word or phrase').evaluate(element => (element as HTMLInputElement).selectionEnd! - (element as HTMLInputElement).selectionStart!)).toBe(14);
    await page.goto('/auth'); await fields(page);
    await page.getByRole('button', { name: 'Create an account', exact: true }).click(); await fields(page);
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click(); await fields(page);
    await page.goto('/auth/reset'); await fields(page);
    await page.goto('/library'); await fields(page);
    await page.getByRole('button', { name: `Edit ${sampleWord.word}`, exact: true }).click(); await fields(page);
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.innerHTML = '<label>Modal text<input></label><label>Modal notes<textarea></textarea></label><label>Modal select<select><option>One</option></select></label>';
      document.body.append(dialog); dialog.showModal();
    });
    await fields(page);
  });
});

test('desktop field sizes remain unchanged', async ({ page, isMobile }) => {
  test.skip(!cloudUrl || isMobile, 'Desktop typography check');
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('searchbox')).toHaveCSS('font-size', '15px');
  await page.goto('/add');
  await expect(page.getByLabel('Word or phrase')).toHaveCSS('font-size', '13px');
});
