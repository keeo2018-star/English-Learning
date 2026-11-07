import { test, expect } from "@playwright/test";
import { mockCloud, cloudUrl, sampleWord } from "./helpers/cloud";

test.describe("Noted home", () => {
  for (const width of [320, 390, 768, 1440]) test(`three equal core actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    let reads = 0;
    if (cloudUrl) await mockCloud(page, route => { reads++; return route.fulfill({ json: [sampleWord] }); });
    await page.addInitScript(() => { Math.random = () => .5; });
    await page.goto('/');
    await expect(page).toHaveTitle('Noted');
    await expect(page.getByRole('link', { name: 'Noted home' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Add', exact: true })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Make room for new words.' })).toBeVisible();
    await expect(page.getByText('Make it stick.')).toBeVisible();
    const navigation = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
    for (const name of ['Add', 'Discover', 'Random Review']) {
      const action = page.getByRole('main').getByRole('link', { name, exact: true });
      await action.evaluate(element => element.scrollIntoView({ block: 'center' }));
      const bounds = (await action.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(90);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(navigation!.y);
      expect(await action.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(22, 22, 22)');
    }
    await expect(page.getByRole('main').getByRole('link', { name: 'Add', exact: true })).toHaveCSS('background-color', 'rgb(193, 255, 50)');
    await expect(page.getByRole('main').getByRole('link', { name: 'Discover', exact: true })).toHaveCSS('background-color', 'rgb(140, 184, 255)');
    await expect(page.getByRole('link', { name: 'Random Review', exact: true })).toHaveCSS('background-color', 'rgb(255, 138, 91)');
    const coreBoxes = await Promise.all(['Add', 'Discover', 'Random Review'].map(name => page.getByRole('main').getByRole('link', { name, exact: true }).boundingBox()));
    expect(new Set(coreBoxes.map(box => Math.round(box!.width))).size).toBe(1);
    expect(new Set(coreBoxes.map(box => Math.round(box!.height))).size).toBe(1);
    const library = page.getByRole('main').getByRole('link', { name: 'Library', exact: true });
    await expect(library).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(library).toHaveCSS('border-top-width', '1px');
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
    expect(reads).toBe(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Home', 'Add', 'Discover', 'Review', 'Profile']) await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name, exact: true })).toBeVisible();
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/noted-home-${width}.png`, fullPage: true });
    if (cloudUrl) {
      await library.click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
      await page.goto('/');
      await page.getByRole('link', { name: 'Random Review', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
    }
  });
});
