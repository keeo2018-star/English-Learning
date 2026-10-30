import { test, expect } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';

test('word phonetics and accent buttons appear in library and review', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dataset.played = 'true';
      return Promise.resolve();
    };
  });
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
    word: 'hello', phonetics: [
      { accent: 'UK', text: 'həˈləʊ', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=hello' },
      { accent: 'US', text: 'həˈloʊ', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=us&word=hello' },
    ], chinese: [], english: [], examples: [], synonyms: [],
  } }));
  if (cloudUrl) await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, word: 'hello' }] }));
  await page.goto('/add');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dictionary' })).toHaveCount(0);
  if (!cloudUrl) {
  await page.getByLabel('Word or phrase').fill('hello');
  await page.getByLabel('Meaning', { exact: true }).fill('A greeting');
  await page.getByRole('button', { name: 'Add to my library' }).click();
  await expect(page.getByRole('status')).toContainText('Word saved');
  }
  for (const path of ['/library', '/review']) {
    await page.goto(path);
    await expect(page.getByText('həˈləʊ', { exact: true })).toBeVisible();
    await expect(page.getByText('həˈloʊ', { exact: true })).toBeVisible();
    for (const accent of ['UK', 'US']) {
      await page.getByRole('button', { name: `Play pronunciation (${accent})`, exact: true }).click();
      await expect(page.locator(`audio[src*="accent=${accent.toLowerCase()}"]`)).toHaveAttribute('data-played', 'true');
    }
  }
  await page.getByRole('button', { name: 'Reveal meaning' }).click();
  await page.getByRole('button', { name: 'Dictionary for hello' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Play pronunciation/ })).toHaveCount(2);
});
