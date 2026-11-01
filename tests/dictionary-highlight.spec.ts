import { test, expect } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';

test.describe('selectable learning-word highlights', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  for (const word of ['satiate', 'caught off guard']) test(`highlights ${word} in dictionary and revealed personal context`, async ({ page }) => {
    const example = word === 'satiate' ? 'Satiate his hunger, but not satiated or insatiate.' : 'I was CAUGHT OFF GUARD by the question.';
    await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, word, example }] }));
    await page.route('**/api/dictionary?*', route => route.fulfill({ json: { word, phonetics: [], chinese: [], english: [{ partOfSpeech: 'verb', definition: example }], examples: [{ source: example, translation: '' }], synonyms: [word] } }));
    await page.goto('/library');
    await page.getByRole('button', { name: `Dictionary for ${word}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const mark = dialog.locator('blockquote mark');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText(word === 'satiate' ? 'Satiate' : 'CAUGHT OFF GUARD');
    await expect(mark).toHaveCSS('background-color', 'rgb(193, 255, 50)');
    await expect(mark).toHaveCSS('user-select', 'text');
    expect(await dialog.locator('blockquote p').textContent()).toBe(example);
    await expect(dialog.locator('section').filter({ has: page.getByRole('heading', { name: 'English', exact: true }) }).locator('p mark')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/review');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.locator('.review-card blockquote mark')).toHaveCount(1);
    expect(await page.locator('.review-card blockquote').textContent()).toBe(example);
  });
});
