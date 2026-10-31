import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

for (const width of [390, 1440]) test(`selected controls have true transparent glyph masks (${width}px)`, async ({ page }) => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  await page.setViewportSize({ width, height: 844 });
  await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/review');
  const due = page.getByRole('button', { name: 'Due words', exact: true });
  await expect(due).toHaveClass(/wb-knockout/);
  for (const selector of ['.review-modes [aria-pressed="true"]', '.wb-workspace-tabs [aria-current="page"]', '.wb-navigation [aria-current="page"]']) {
    const control = page.locator(selector);
    await expect(control).toHaveClass(/wb-knockout/);
    const result = await control.evaluate(async element => {
      const style = getComputedStyle(element);
      const surface = getComputedStyle(element, '::before');
      const value = (element as HTMLElement).style.getPropertyValue('--wb-knockout-mask');
      const image = new Image();
      image.src = value.slice(5, -2);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let holes = 0, solid = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] === 0) holes++;
        if (pixels[index] === 255) solid++;
      }
      const before = element.getBoundingClientRect();
      element.classList.remove('wb-knockout');
      const after = element.getBoundingClientRect();
      element.classList.add('wb-knockout');
      return { color: style.color, background: surface.backgroundColor,
        outline: style.outlineStyle, holes, solid,
        unchangedSize: before.width === after.width && before.height === after.height };
    });
    expect(result.color).toBe('rgba(0, 0, 0, 0)');
    expect(result.background).toBe('rgb(0, 0, 0)');
    expect(result.holes).toBeGreaterThan(10);
    expect(result.solid).toBeGreaterThan(result.holes);
    expect(result.unchangedSize).toBe(true);
  }
  await page.keyboard.press('Tab');
  await due.focus();
  await expect(due).toHaveCSS('outline-width', '2px');
  await page.getByRole('button', { name: 'Random review', exact: true }).click();
  await expect(due).not.toHaveClass(/wb-knockout/);
  await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveClass(/wb-knockout/);
  await page.locator('.wb-workspace-tabs').evaluate(element => { (element as HTMLElement).style.background = '#ff80bb'; });
  await page.locator('.review-modes').evaluate(element => { (element as HTMLElement).style.background = '#91ed69'; });
  await page.screenshot({ path: `/tmp/knockout-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('high contrast mode retains readable selected labels and one focus outline', async ({ page }) => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  await page.emulateMedia({ forcedColors: 'active' });
  await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/review');
  const active = page.locator('.wb-navigation [aria-current="page"]');
  await expect(active).toHaveClass(/wb-knockout/);
  const result = await active.evaluate(element => ({
    foreground: getComputedStyle(element).color,
    label: getComputedStyle(element.lastElementChild!).color,
    background: getComputedStyle(element).backgroundColor,
    maskDisplay: getComputedStyle(element, '::before').display,
  }));
  expect(result.label).toBe(result.foreground);
  expect(result.label).not.toBe(result.background);
  expect(result.maskDisplay).toBe('none');
  await page.keyboard.press('Tab');
  await active.focus();
  await expect(active).toHaveCSS('outline-width', '2px');
});

for (const width of [390, 1440]) test(`one selected system across Home, Add, Library, Review and authentication (${width}px)`, async ({ page }) => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  await page.setViewportSize({ width, height: 844 });
  await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  for (const path of ['/', '/add', '/library', '/review', '/auth']) {
    await page.goto(path);
    const active = page.locator('.wb-selectable[data-selected="true"]');
    await expect.poll(() => active.count()).toBeGreaterThan(0);
    for (const control of await active.all()) {
      await expect(control).toHaveClass(/wb-knockout/);
      await expect(control).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Forgot password?', exact: true })).toHaveClass(/wb-knockout/);
  await page.goto('/review');
  const checkbox = page.getByRole('checkbox', { name: 'Auto pronunciation', exact: true });
  const toggle = page.locator('.wb-toggle');
  await expect(toggle).toHaveClass(/wb-knockout/);
  await page.keyboard.press('Tab'); await checkbox.focus();
  await expect(toggle).toHaveCSS('outline-width', '2px');
  await expect(checkbox).toHaveCSS('outline-style', 'none');
  await checkbox.uncheck();
  await expect(toggle).not.toHaveClass(/wb-knockout/);
});
