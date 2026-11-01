import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

test.describe('unified learning navigation', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  for (const width of [320, 390, 1440]) test(`modes and separate setting remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => { Math.random = () => .5; });
    await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
    await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
    await page.goto('/review');
    const modes = page.getByRole('navigation', { name: 'Learning navigation' });
    const due = modes.getByRole('button', { name: 'Due words', exact: true });
    const random = modes.getByRole('button', { name: 'Random review', exact: true });
    const library = modes.getByRole('link', { name: 'Library', exact: true });
    await expect(due).toHaveAttribute('aria-pressed', 'true');
    for (const control of [due, random, library]) {
      await expect(control).toBeVisible();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      await expect(control).toHaveCSS('font-size', '14px');
      await expect(control).toHaveCSS('border-radius', '999px');
    }
    const setting = page.getByRole('checkbox', { name: 'Auto pronunciation', exact: true });
    await expect(modes.getByRole('checkbox')).toHaveCount(0);
    await setting.uncheck();
    await random.click();
    await expect(random).toHaveAttribute('aria-pressed', 'true');
    await expect(setting).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
    await library.click();
    await expect(page).toHaveURL(/\/library$/);
    const libraryModes = page.getByRole('navigation', { name: 'Learning navigation' });
    const selected = libraryModes.getByRole('link', { name: 'Library', exact: true });
    await expect(selected).toHaveAttribute('aria-current', 'page');
    await expect(selected).toHaveClass(/wb-knockout/);
    await page.keyboard.press("Tab");
    await selected.focus();
    await expect(selected).toHaveCSS('outline-width', '2px');
    await expect(page.getByLabel('Search library')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Auto pronunciation' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/noted-learning-modes-${width}.png`, fullPage: true });
    await libraryModes.getByRole('link', { name: 'Due words', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Due words', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Random review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Library opened through modes retains search, edit, dictionary, pronunciation and delete', async ({ page }) => {
    let entries = [sampleWord];
    await mockCloud(page, route => {
      if (route.request().method() === 'PATCH') {
        entries = [{ ...entries[0], ...route.request().postDataJSON() }];
        return route.fulfill({ json: entries[0] });
      }
      if (route.request().method() === 'DELETE') { entries = []; return route.fulfill({ json: { id: sampleWord.id } }); }
      return route.fulfill({ json: entries });
    });
    await page.route('**/api/dictionary?*', route => route.fulfill({ json: { word: sampleWord.word, phonetics: [{ accent: 'UK', text: 'test' }], chinese: ['测试'], english: [], examples: [], synonyms: [] } }));
    await page.goto('/review');
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByLabel('Search library').fill(sampleWord.word);
    await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play pronunciation', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: `Dictionary for ${sampleWord.word}` }).click();
    await expect(page.getByRole('dialog').getByText('测试', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: `Edit ${sampleWord.word}`, exact: true }).click();
    await page.locator('form.edit-form').getByRole('textbox', { name: 'Meaning', exact: true }).fill('A personal discovery');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('A personal discovery', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Delete ${sampleWord.word}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete word', exact: true }).click();
    await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toHaveCount(0);
  });
});
