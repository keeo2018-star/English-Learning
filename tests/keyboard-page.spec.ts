import { expect, test } from '@playwright/test';
import { cloudUrl, mockCloud } from './helpers/cloud';

for (const width of [320, 375, 390, 430]) {
  test(`Add hides navigation while the visual keyboard is open at ${width}px`, async ({ page }) => {
    test.skip(!cloudUrl, 'Requires configured cloud fixture');
    await mockCloud(page, route => route.fulfill({ json: [] }));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const viewport = window.visualViewport!;
      let height = 844;
      Object.defineProperty(viewport, 'height', { get: () => height });
      Object.assign(window, {
        notedPageViewport: (value: number) => {
          height = value;
          viewport.dispatchEvent(new Event('resize'));
        },
      });
    });
    await page.goto('/add');
    const input = page.getByRole('combobox', { name: 'Word or phrase' });
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    const resize = (height:number) => page.evaluate(h => {
      (window as unknown as { notedPageViewport: (value:number)=>void }).notedPageViewport(h);
    }, height);
    await input.focus();
    await resize(365);
    await expect(navigation).toBeHidden();
    await expect(input).toBeFocused();
    await expect(page.locator('.wb-app')).toHaveCSS('height', '365px');
    await input.blur();
    await expect(navigation).toBeHidden();
    await resize(844);
    await expect(navigation).toBeVisible();
    await expect(page.locator('.wb-app')).toHaveCSS('height', '844px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
