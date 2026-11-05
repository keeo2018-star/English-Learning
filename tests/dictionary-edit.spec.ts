import { test, expect, type Page } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord, user } from './helpers/cloud';
async function setup(page: Page) {
  let entry = { ...sampleWord };
  const writes: Record<string, unknown>[] = [];
  const state = { fail: false, gate: undefined as Promise<void> | undefined, writes, entry: () => entry };
  await mockCloud(page, async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); writes.push(body);
      expect(new URL(route.request().url()).searchParams.get('user_id')).toBe(`eq.${user.id}`);
      if (state.gate) await state.gate;
      if (state.fail) return route.fulfill({ status: 403, json: { message: 'Save temporarily unavailable' } });
      entry = { ...entry, ...body };
      return route.fulfill({ json: entry });
    }
    return route.fulfill({ json: [entry] });
  });
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
    word: sampleWord.word, phonetics: [], chinese: ['机缘巧合'],
    english: [{ partOfSpeech: 'noun', definition: 'A fortunate discovery by chance.' }],
    examples: Array.from({ length: 3 }, () => ({ source: 'Serendipity brought a useful discovery. '.repeat(15), translation: '偶然间有所发现。'.repeat(10) })), synonyms: ['chance'],
  } }));
  return state;
}
async function open(page: Page, mode: 'library' | 'review' = 'library') {
  await page.goto('/' + mode);
  if (mode === 'review') await page.getByRole('button', { name: 'Reveal answer' }).click();
  const trigger = page.getByRole('button', { name: `Dictionary for ${sampleWord.word}`, exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  return trigger;
}
async function drag(page: Page, distance: number, fromHeader = true, dx = 0) {
  await page.getByRole('dialog').evaluate((element, options) => {
    const target = options.fromHeader ? element.querySelector('[data-dictionary-drag-handle]:not([aria-hidden])')! : element.querySelector('aside p')!;
    const bounds = target.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2, y = bounds.top + 5;
    const send = (name: string, clientX: number, clientY: number) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: name === 'touchend' ? [] : [{ clientX, clientY }] });
      target.dispatchEvent(event);
    };
    send('touchstart', x, y); send('touchmove', x + options.dx, y + options.distance); send('touchend', x + options.dx, y + options.distance);
  }, { distance, fromHeader, dx });
}
test.describe('Dictionary quick editing and mobile dismissal', () => {
  test.skip(!cloudUrl, 'Uses a mocked authenticated account');
  for (const mode of ['library', 'review'] as const) test(`edits only the custom meaning from ${mode}, preserves scheduling and persists on reload`, async ({ page }) => {
    const state = await setup(page);
    await open(page, mode);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Edit my meaning', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'My meaning', exact: true })).toBeFocused();
    await dialog.getByRole('textbox', { name: 'My meaning', exact: true }).fill('即时修改的自定义解释');
    await dialog.getByRole('button', { name: 'Save meaning', exact: true }).click();
    await expect(dialog.locator('aside p')).toHaveText('即时修改的自定义解释');
    expect(state.writes).toEqual([{ meaning: '即时修改的自定义解释' }]);
    expect(state.entry()).toMatchObject({ word: sampleWord.word, due_at: sampleWord.due_at, interval_days: sampleWord.interval_days, example: sampleWord.example });
    await expect(dialog.getByRole('heading', { name: 'English', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/library'); await page.reload();
    await expect(page.locator('.word-row').getByText('即时修改的自定义解释', { exact: true })).toBeVisible();
  });
  test('save failure retains the draft; saving blocks closing and duplicate submission', async ({ page }) => {
    const state = await setup(page); state.fail = true;
    await open(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Edit my meaning', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'My meaning', exact: true }).fill('A draft to retry');
    await dialog.getByRole('button', { name: 'Save meaning', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Save temporarily unavailable');
    await expect(dialog.getByRole('textbox', { name: 'My meaning', exact: true })).toHaveValue('A draft to retry');
    let release!: () => void;
    state.fail = false; state.gate = new Promise<void>(resolve => { release = resolve; });
    await dialog.getByRole('button', { name: 'Save meaning', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await dialog.getByRole('form', { name: 'Edit my meaning' }).dispatchEvent('submit');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.locator('aside p')).toHaveText('A draft to retry');
    expect(state.writes).toHaveLength(2); // One failed attempt, one successful retry.
  });
  test('mobile pull-down closes, while short/horizontal gestures and content scrolling do not', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page); const trigger = await open(page);
    const dialog = page.getByRole('dialog');
    await drag(page, 35); await expect(dialog).toBeVisible();
    await drag(page, 110, true, 180); await expect(dialog).toBeVisible();
    await drag(page, 130); await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByRole('heading', { name: 'Examples', exact: true })).toBeVisible();
    await dialog.evaluate(element => { element.scrollTop = 100; });
    await drag(page, 140, false); await expect(dialog).toBeVisible();
    await drag(page, 140); await expect(dialog).toHaveCount(0); // Sticky header can dismiss mid-reading.
  });
  test('native Chromium touch input can pull the mobile sheet closed', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native CDP touch test; WebKit uses the portable gesture cases.');
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page); await open(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const header = await page.getByRole('dialog').locator('[data-dictionary-drag-handle]:not([aria-hidden])').boundingBox();
    const x = header!.x + header!.width / 2, y = header!.y + header!.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [25, 65, 125]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + distance }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cdp.detach();
  });
  test('editing disables accidental pull-down dismissal; Cancel leaves the original meaning intact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await setup(page); await open(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Edit my meaning', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'My meaning', exact: true }).fill('Unsaved draft');
    await drag(page, 140); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('alert')).toHaveText('Save or cancel your edit before closing.');
    await expect(dialog.getByRole('textbox', { name: 'My meaning', exact: true })).toHaveValue('Unsaved draft');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog.locator('aside p')).toHaveText(sampleWord.meaning);
    expect(state.writes).toHaveLength(0);
  });
});
