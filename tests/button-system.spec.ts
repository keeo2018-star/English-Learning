import { expect, test, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';
import { dailyItems, discoverFixture, mockDiscover } from './helpers/discover';

const evidence = process.env.NOTED_BUTTON_EVIDENCE;
const baseline = process.env.NOTED_BUTTON_BASELINE === '1';

async function appearance(button: Locator) {
  return button.evaluate(node => {
    const css = getComputedStyle(node);
    return {
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      border: css.borderTopWidth, borderColor: css.borderTopColor, outline: css.outlineStyle, outlineOffset: css.outlineStyle === 'none' ? null : css.outlineOffset,
      shadow: css.boxShadow, focused: document.activeElement === node,
      background: css.backgroundColor, radius: css.borderRadius,
    };
  });
}

for (const width of [320, 390, 1440]) {
  test(`Discover Dictionary keeps its button geometry through all ten cards at ${width}px`, async ({ page, browserName }) => {
    test.skip(!cloudUrl, 'Requires configured cloud fixture');
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = discoverFixture();
    fixture.ready();
    await mockDiscover(page, fixture);
    await page.route('**/api/dictionary?*', route => route.fulfill({
      json: { word: new URL(route.request().url()).searchParams.get('word'), phonetics: [], chinese: [], english: [], examples: [], synonyms: [] },
    }));
    await page.goto('/discover');
    const records = [];
    if (evidence) await mkdir(evidence, { recursive: true });
    const prefix = `${evidence}/${browserName}-${width}`;
    for (const [index, item] of dailyItems.entries()) {
      await expect(page.getByRole('heading', { name: item.word, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Reveal meaning' }).click();
      const trigger = page.getByRole('button', { name: 'Dictionary for ' + item.word });
      await trigger.scrollIntoViewIfNeeded();
      const before = await appearance(trigger);
      if (!index && evidence) await page.screenshot({ path: prefix + '-before-opening.png' });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const after = await appearance(trigger);
      records.push({ index: index + 1, before, after });
      if (!index && evidence) await page.screenshot({ path: prefix + '-after-closing.png' });
      if (!baseline) {
        expect(after).toEqual({ ...before, focused: true });
        expect(after).toMatchObject({ border: '1px', outline: 'none', shadow: 'none' });
        expect(after.height).toBeGreaterThanOrEqual(36);
        expect(after.height).toBeLessThanOrEqual(40);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      if (!index) {
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(trigger).toBeFocused();
        const keyboard = await appearance(trigger);
        if (!baseline) expect(keyboard).toMatchObject({ border: '1px', borderColor: 'rgba(0, 0, 0, 0)', outline: 'solid', outlineOffset: '-2px' });
      }
      await page.getByRole('button', { name: 'I know it', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Nice work.' })).toBeVisible();
    if (evidence) await writeFile(prefix + '.json', JSON.stringify(records, null, 2));
  });
}

test('Review Dictionary keeps one border after touch dismissal and has distinct keyboard focus', async ({ page }) => {
  test.skip(!cloudUrl, 'Requires configured cloud fixture');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({
    json: { word: sampleWord.word, phonetics: [], chinese: [], english: [], examples: [], synonyms: [] },
  }));
  await page.goto('/review');
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  const trigger = page.getByRole('button', { name: 'Dictionary for ' + sampleWord.word });
  const original = await appearance(trigger);
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (touch) await trigger.tap();
  else await trigger.click();
  const close = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
  if (touch) await close.tap();
  else await close.click();
  await expect(trigger).toBeFocused();
  expect(await appearance(trigger)).toEqual({ ...original, focused: true });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  expect(await appearance(trigger)).toMatchObject({
    border: '1px', borderColor: 'rgba(0, 0, 0, 0)', outline: 'solid', outlineOffset: '-2px',
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await appearance(trigger)).toMatchObject({ outline: 'solid', outlineOffset: '-2px' });
});
