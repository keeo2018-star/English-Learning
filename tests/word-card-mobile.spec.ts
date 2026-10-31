import { test, expect } from '@playwright/test';
import { mockCloud, sampleWord, cloudUrl } from './helpers/cloud';

test('word cards stay readable on phones and tablets', async ({ page }) => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord,
    word: 'extraordinary', meaning: '非凡的；令人惊奇的。Something unusually remarkable.',
    example: 'An extraordinary discovery can change the way you see the world.',
  }, { ...sampleWord, id: 'long-word', word: 'pneumonoultramicroscopicsilicovolcanoconiosis', meaning: '由吸入极细的硅尘所导致的肺部疾病。', example: '' },
  { ...sampleWord, id: 'long-phrase', word: 'take something with a pinch of salt', meaning: '对某件事持保留态度，不完全相信。', example: '' }] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
    word: 'extraordinary', phonetics: [
      { accent: 'UK', text: '/ɪkˈstrɔː.dɪ.nər.i/' },
      { accent: 'US', text: '/ɪkˈstrɔːr.dən.er.i/' },
    ], chinese: [], english: [], examples: [], synonyms: [],
  } }));
  for (const width of [320, 375, 390, 414, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/library');
    const cards = page.locator('.word-row');
    const card = cards.first();
    await expect(card.getByRole('heading', { name: 'extraordinary' })).toBeVisible();
    await expect(card.getByText('/ɪkˈstrɔː.dɪ.nər.i/', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const item of await cards.all()) {
      expect(await item.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    if (width < 700) {
      const actions = await card.locator('.word-actions > button').evaluateAll(elements =>
        elements.map(element => { const rect = element.getBoundingClientRect(); return { top: rect.top, height: rect.height }; }));
      expect(new Set(actions.map(action => Math.round(action.top))).size).toBe(1);
      expect(actions.every(action => action.height >= 48)).toBe(true);
      const metrics = await card.evaluate(element => {
        const meaning = element.querySelector('.wb-word-content > p')!;
        const pronunciation = meaning.previousElementSibling!;
        const buttons = [...element.querySelectorAll('button')];
        return {
          meaningGap: meaning.getBoundingClientRect().top - pronunciation.getBoundingClientRect().bottom,
          left: element.getBoundingClientRect().left,
          right: innerWidth - element.getBoundingClientRect().right,
          touchTargets: buttons.every(button => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44;
          }),
        };
      });
      expect(metrics.meaningGap).toBeGreaterThanOrEqual(24);
      expect(metrics.left).toBeCloseTo(20, 0);
      expect(metrics.right).toBeCloseTo(20, 0);
      expect(metrics.touchTargets).toBe(true);
      expect(await cards.nth(1).evaluate(element => {
        const previous = element.previousElementSibling!;
        return element.getBoundingClientRect().top - previous.getBoundingClientRect().bottom;
      })).toBeGreaterThanOrEqual(20);
    }
    if (width === 1440) {
      expect(await card.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('24px');
      expect(await card.locator('h2').evaluate(element => getComputedStyle(element).fontSize)).toBe('52px');
    }
    if (width === 390) await page.screenshot({ path: '/tmp/word-cards-iphone.png', fullPage: true });
    if (width === 390) await card.screenshot({ path: '/tmp/word-card-mobile.png' });
    await page.goto('/review');
    const reveal = page.getByRole('button', { name: 'Reveal meaning' });
    const phonetic = page.getByText('/ɪkˈstrɔː.dɪ.nər.i/', { exact: true });
    await expect(phonetic).toBeVisible();
    const spacing = await reveal.evaluate(button => {
      const pronunciation = button.previousElementSibling!;
      return button.getBoundingClientRect().top - pronunciation.getBoundingClientRect().bottom;
    });
    expect(spacing).toBeGreaterThanOrEqual(36);
    if (width === 1440) await page.locator('.review-card').screenshot({ path: '/tmp/review-desktop-spacing.png' });
    await reveal.click();
    const review = page.locator('.review-card');
    await expect(review.getByText('/ɪkˈstrɔː.dɪ.nər.i/', { exact: true })).toBeVisible();
    expect(await review.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 390) await review.screenshot({ path: '/tmp/word-review-mobile.png' });
  }
});
