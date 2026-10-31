import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

for (const width of [390, 1440]) {
  test(`random review includes future words without repeats or schedule writes (${width}px)`, async ({ page }) => {
    test.skip(!cloudUrl, 'Requires mocked cloud configuration');
    await page.setViewportSize({ width, height: 844 });
    const entries = ['alpha', 'beta', 'gamma'].map((word, index) => ({
      ...sampleWord, id: `random-${index}`, word, meaning: `Meaning of ${word}`,
      due_at: '2099-01-01T00:00:00Z',
    }));
    const writes: string[] = [];
    await mockCloud(page, route => {
      if (route.request().method() !== 'GET') writes.push(route.request().method());
      return route.fulfill({ json: entries });
    });
    await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible();
    const random = page.getByRole('button', { name: 'Random review', exact: true });
    await random.click();
    await expect(random).toHaveAttribute('aria-pressed', 'true');
    const seen = new Set<string>();
    for (let index = 0; index < entries.length; index++) {
      await expect(page.getByRole('status')).toContainText(`${index + 1} OF 3`);
      const card = page.locator('.review-card.wb-card');
      const word = (await card.locator('h2').textContent())!;
      expect(seen.has(word)).toBe(false);
      seen.add(word);
      await expect(card.getByText(`Meaning of ${word}`, { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Reveal meaning' }).click();
      await expect(card.getByText(`Meaning of ${word}`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: index === 2 ? 'Finish review' : 'Next word', exact: true }).click();
    }
    expect([...seen].sort()).toEqual(['alpha', 'beta', 'gamma']);
    await expect(page.getByRole('heading', { name: 'Random review complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Shuffle again' }).click();
    await expect(page.getByRole('status')).toContainText('1 OF 3');
    await expect(page.getByRole('button', { name: 'Reveal meaning' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Due words', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible();
    expect(writes).toEqual([]);
  });
}

test('single word can complete and restart; empty library has no random action', async ({ page }) => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  let entries = [sampleWord];
  await mockCloud(page, route => route.fulfill({ json: entries }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/review');
  await page.getByRole('button', { name: 'Random review', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal meaning' }).click();
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByText('You revisited 1 word. Your review schedule is unchanged.')).toBeVisible();
  await page.getByRole('button', { name: 'Shuffle again' }).click();
  await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
  entries = [];
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make room for your first word.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveCount(0);
});
