import { test, expect, type Page } from '@playwright/test';
import { mockCloud, cloudUrl, cloudOrigin, sampleWord } from './helpers/cloud';
async function setup(page: Page) {
  const writes: Record<string, unknown>[] = [];
  await mockCloud(page, async route => {
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); writes.push(body); return route.fulfill({ json: { ...sampleWord, ...body } }); }
    return route.fulfill({ json: [sampleWord] });
  });
  await page.route('**/api/smart-add/suggestions?*', route => route.fulfill({ json: { suggestions: [{ word: 'subtle' }, { word: 'subtly' }, { word: 'subtlety' }] } }));
  await page.route('**/api/smart-add/meaning', route => route.fulfill({ json: { meaning: '微妙的', source: 'dictionary' } }));
  await page.goto('/add');
  return writes;
}
test.describe('Smart Add', () => {
  test.skip(!cloudUrl, 'Requires cloud fixtures');
  test('debounced suggestions, keyboard navigation and selection never save automatically', async ({ page }) => {
    const writes = await setup(page); let calls = 0;
    await page.route('**/api/smart-add/suggestions?*', route => { calls++; return route.fulfill({ json: { suggestions: [{ word: 'subtle' }, { word: 'subtly' }, { word: 'subtlety' }] } }); });
    const word = page.getByLabel('Word or phrase'); await word.fill('s'); await page.waitForTimeout(300); expect(calls).toBe(0);
    await word.fill('su'); await word.fill('sub'); await word.fill('subt');
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3); expect(calls).toBe(1);
    await word.press('ArrowDown'); await expect(word).toHaveAttribute('aria-activedescendant', /-0$/);
    await word.press('ArrowDown'); await word.press('ArrowUp'); await word.press('Enter');
    await expect(word).toHaveValue('subtle'); await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue('微妙的');
    await expect(page.getByText('Auto-filled · Editable', { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
    await word.press('Enter'); await expect(page.getByText('Word saved. Ready for your next review.')).toBeVisible();
    expect(writes[0]).toMatchObject({ word: 'subtle', meaning: '微妙的' }); await expect(word).toHaveValue('');
  });
  test('Enter without an active suggestion quick-saves English only', async ({ page }) => {
    const writes = await setup(page);
    await page.route('**/api/smart-add/meaning', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fulfill({ json: { meaning: '迟到的结果', source: 'dictionary' } }); });
    const word = page.getByLabel('Word or phrase'); await word.fill('subt'); await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
    await expect(page.getByText('Finding meaning…')).toBeVisible(); await word.press('Enter');
    await expect(page.getByText('Word saved. Ready for your next review.')).toBeVisible();
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ word: 'subt', meaning: '' });
    await page.waitForTimeout(1700); await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue(''); expect(writes).toHaveLength(1);
  });
  for (const manual of ['我的解释', '', '微妙的（我自己的理解）']) test(`manual input and deliberate clearing survive late lookup: ${manual || 'empty'}`, async ({ page }) => {
    await setup(page); let finish = () => {}; const gate = new Promise<void>(resolve => finish = resolve);
    await page.route('**/api/smart-add/meaning', async route => { await gate; await route.fulfill({ json: { meaning: '不应该覆盖', source: 'dictionary' } }); });
    await page.getByLabel('Word or phrase').fill('subtle'); await expect(page.getByText('Finding meaning…')).toBeVisible();
    const meaning = page.getByLabel('Meaning', { exact: true }); await meaning.fill('先写一点'); await meaning.fill(manual); finish();
    await page.waitForTimeout(200); await expect(meaning).toHaveValue(manual);
    await page.getByLabel('Content type').selectOption('expression'); await page.waitForTimeout(700); await expect(meaning).toHaveValue(manual);
  });
  test('old word responses cannot overwrite a newer word', async ({ page }) => {
    await setup(page); let release = () => {}; const gate = new Promise<void>(resolve => release = resolve);
    await page.route('**/api/smart-add/meaning', async route => { const old = route.request().postDataJSON().word === 'subtle'; if (old) await gate; await route.fulfill({ json: { meaning: old ? '旧词释义' : '大量的', source: 'dictionary' } }); });
    await page.getByLabel('Word or phrase').fill('subtle'); await expect(page.getByText('Finding meaning…')).toBeVisible();
    await page.getByLabel('Word or phrase').fill('substantial'); await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue('大量的');
    release(); await page.waitForTimeout(200); await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue('大量的');
  });
  test('Chinese IME composition takes priority before text is committed', async ({ page }) => {
    await setup(page); let release = () => {}; const gate = new Promise<void>(resolve => release = resolve);
    await page.route('**/api/smart-add/meaning', async route => { await gate; await route.fulfill({ json: { meaning: '不应该覆盖', source: 'dictionary' } }); });
    await page.getByLabel('Word or phrase').fill('subtle'); await expect(page.getByText('Finding meaning…')).toBeVisible();
    const meaning = page.getByLabel('Meaning', { exact: true }); await meaning.focus(); await meaning.dispatchEvent('compositionstart'); release();
    await page.waitForTimeout(200); await expect(meaning).toHaveValue('');
    await meaning.fill('自己的解释'); await meaning.dispatchEvent('compositionend'); await expect(meaning).toHaveValue('自己的解释');
  });
  test('edited automatic meaning stays personal; explicit request can replace a cleared meaning', async ({ page }) => {
    await setup(page); const word = page.getByLabel('Word or phrase'), meaning = page.getByLabel('Meaning', { exact: true });
    await word.fill('subtle'); await expect(meaning).toHaveValue('微妙的'); await meaning.fill('微妙的，个人备注');
    await word.fill('substantial'); await page.waitForTimeout(750); await expect(meaning).toHaveValue('微妙的，个人备注');
    await meaning.fill(''); await page.getByRole('button', { name: 'Suggest meaning' }).click(); await expect(meaning).toHaveValue('微妙的');
    await meaning.fill(''); await word.fill('subtly'); await expect(meaning).toHaveValue('微妙的');
  });
  test('complete expression and custom sentence are preserved with type override', async ({ page }) => {
    const writes = await setup(page); const requests: { word: string; type: string }[] = [];
    await page.route('**/api/smart-add/meaning', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { meaning: '我不会这么说。', source: 'translation' } }); });
    const sentence = "I wouldn't put it that way.";
    await page.getByLabel('Content type').selectOption('expression'); await page.getByLabel('Word or phrase').fill(sentence);
    await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue('我不会这么说。');
    expect(requests.at(-1)).toEqual({ word: sentence, type: 'expression' });
    await expect(page.getByText('Auto-filled · Editable · Translation')).toBeVisible();
    await page.getByRole('button', { name: /Add to my library/ }).click(); expect(writes[0]).toMatchObject({ word: sentence, meaning: '我不会这么说。', item_type: 'expression' });
  });
  test('a failed explicit suggestion does not release ownership of a personal meaning', async ({ page }) => {
    await setup(page); const word = page.getByLabel('Word or phrase'), meaning = page.getByLabel('Meaning', { exact: true });
    await word.fill('subtle'); await meaning.fill('始终保留的个人解释');
    await page.route('**/api/smart-add/meaning', route => route.abort());
    await page.getByRole('button', { name: 'Suggest meaning' }).click(); await expect(page.getByText('Meaning unavailable. You can write your own.')).toBeVisible();
    await word.fill('substantial'); await expect(meaning).toHaveValue('始终保留的个人解释');
  });
  test('no results and offline providers never block manual save', async ({ page }) => {
    const writes = await setup(page);
    await page.route('**/api/smart-add/suggestions?*', route => route.fulfill({ json: { suggestions: [] } }));
    await page.route('**/api/smart-add/meaning', route => route.abort());
    await page.getByLabel('Word or phrase').fill('my own unusual expression'); await expect(page.getByText('Meaning unavailable. You can write your own.')).toBeVisible();
    await expect(page.getByRole('listbox')).toHaveCount(0); await page.getByLabel('Meaning', { exact: true }).fill('自定义');
    await page.getByRole('button', { name: /Add to my library/ }).click(); expect(writes[0].meaning).toBe('自定义');
  });
  for (const width of [320, 390, 1440]) test(`pointer selection and layout ${width}`, async ({ page, isMobile }) => {
    await page.setViewportSize({ width, height: 844 }); const writes = await setup(page);
    const word = page.getByLabel('Word or phrase'); await word.fill('subt');
    const option = page.getByRole('option', { name: 'subtle', exact: true });
    if (isMobile) await option.tap(); else await option.click();
    await expect(word).toHaveValue('subtle'); await expect(word).toBeFocused(); expect(writes).toHaveLength(0);
    expect(await word.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(width < 700 ? 16 : 13);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/noted-smart-add-${width}.png` });
  });
  test('Escape and blur keep pending suggestions closed; IME Enter never submits', async ({ page }) => {
    const writes = await setup(page); const word = page.getByLabel('Word or phrase');
    await word.fill('subt'); await expect(page.getByRole('listbox')).toBeVisible(); await word.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
    await word.dispatchEvent('compositionstart'); await word.press('Enter'); expect(writes).toHaveLength(0);
    await word.dispatchEvent('compositionend'); await page.getByLabel('Meaning', { exact: true }).focus(); await expect(page.getByRole('listbox')).toHaveCount(0);
  });
  test('English-only items remain reviewable with an explicit empty-meaning state', async ({ page }) => {
    await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, meaning: '' }] }));
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.getByText('No meaning saved yet. Open Dictionary to add one.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sure', exact: true })).toBeEnabled();
  });
  test('installed PWA supports suggestions and touch selection without external navigation', async ({ page, isMobile }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
    await setup(page);
    await page.getByLabel('Word or phrase').fill('subt');
    const option = page.getByRole('option', { name: 'subtle', exact: true });
    if (isMobile) await option.tap(); else await option.click();
    await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue('微妙的');
    await expect(page).toHaveURL(/\/add$/);
  });
  test('old database constraint is explained and a manual meaning can still save', async ({ page }) => {
    await setup(page);
    await page.route(cloudOrigin + '/rest/v1/words*', route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: [sampleWord] });
      const body = route.request().postDataJSON();
      return body.meaning ? route.fulfill({ json: { ...sampleWord, ...body } }) : route.fulfill({ status: 400, json: { code: '23514', message: 'new row violates words_meaning_check' } });
    });
    await page.getByLabel('Word or phrase').fill('subtle');
    await page.getByLabel('Word or phrase').press('Enter');
    await expect(page.getByText('English-only saving needs the database update. Add a meaning for now.')).toBeVisible();
    await expect(page.getByLabel('Word or phrase')).toHaveValue('subtle');
    await page.getByLabel('Meaning', { exact: true }).fill('自定义');
    await page.getByRole('button', { name: /Add to my library/ }).click();
    await expect(page.getByText('Word saved. Ready for your next review.')).toBeVisible();
  });
});
