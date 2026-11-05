import { test, expect } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';
test.describe('review controls stay stable during grading', () => {
  test.skip(!cloudUrl, 'Uses a mocked account');
  for (const rating of ['Sure', 'Not sure']) test(`${rating} preserves top controls without dimming or mask redraw`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entries = [{ ...sampleWord, word: 'hello' }, { ...sampleWord, id: 'second', word: 'world' }];
    await mockCloud(page, async route => {
      if (route.request().method() === 'PATCH') {
        await gate;
        const body = route.request().postDataJSON();
        entries = entries.map(item => item.id === sampleWord.id ? { ...item, ...body } : item);
        return route.fulfill({ json: { id: sampleWord.id } });
      }
      return route.fulfill({ json: entries });
    });
    await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
    await page.goto('/review');
    const due = page.getByRole('button', { name: 'Due words', exact: true });
    await expect(due).toHaveClass(/wb-knockout/);
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await due.evaluate(element => {
      const state = { element, styleWrites: 0, mask: (element as HTMLElement).style.getPropertyValue('--wb-knockout-mask') };
      const observer = new MutationObserver(records => { state.styleWrites += records.length; });
      observer.observe(element, { attributes: true, attributeFilter: ['style'] });
      Object.assign(window, { stableReviewControl: state });
    });
    await page.getByRole('button', { name: rating, exact: true }).click();
    await expect(due).toBeDisabled(); // Prevent changing modes before the save commits.
    await expect(due).toHaveCSS('opacity', '1');
    await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveCSS('opacity', '1');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCSS('opacity', '1');
    release();
    await expect(page.locator('.review-card h2')).toHaveText('world');
    await expect(due).toBeEnabled();
    await expect(due).toHaveClass(/wb-knockout/);
    await expect(due).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const result = await due.evaluate(element => {
      const state = (window as unknown as { stableReviewControl: { element: Element; styleWrites: number; mask: string } }).stableReviewControl;
      return { sameNode: element === state.element, styleWrites: state.styleWrites, sameMask: (element as HTMLElement).style.getPropertyValue('--wb-knockout-mask') === state.mask };
    });
    expect(result).toEqual({ sameNode: true, styleWrites: 0, sameMask: true });
  });
});
