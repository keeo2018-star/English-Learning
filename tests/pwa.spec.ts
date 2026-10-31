import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

test('PWA manifest, icons, Apple metadata and viewport are valid on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ id: '/', name: 'English Learning', short_name: 'English', start_url: '/', scope: '/', display: 'standalone', theme_color: '#f5f4ef', background_color: '#f5f4ef' });
  expect(manifest.icons.some((icon: { purpose: string; sizes: string }) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'English');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /user-scalable=no|maximum-scale=1/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThan(0);
  const resources = await page.evaluate(async () => {
    const paths = ['/favicon.ico', '/icons/apple-touch-icon.png', '/icons/apple-splash-390x844-3.png'];
    return Promise.all(paths.map(async path => ({ path, status: (await fetch(path)).status })));
  });
  expect(resources.every(resource => resource.status === 200)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest');
  expect(parsed.errors).toEqual([]);
  expect(parsed.url).toContain('/manifest.webmanifest');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const installability = await cdp.send('Page.getInstallabilityErrors');
  // Playwright's isolated contexts are incognito, where browser installation is
  // deliberately disabled. No app/manifest installability errors are allowed.
  expect(installability.installabilityErrors.every(error => error.errorId === 'in-incognito')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('service worker caches only public assets and sessions survive reopening and offline recovery', async ({ page, context }) => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('english-learning-install-'));
    const requests = (await Promise.all(names.map(async name => (await caches.open(name)).keys()))).flat();
    return requests.map(request => new URL(request.url).pathname).sort();
  });
  expect(cached).toEqual(['/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/offline.html']);
  const headers = await page.evaluate(async () => {
    const response = await fetch('/sw.js');
    return { cache: response.headers.get('cache-control'), scope: response.headers.get('service-worker-allowed') };
  });
  expect(headers.cache).toContain('no-store');
  expect(headers.scope).toBe('/');
  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 390, height: 844 });
  // Do not seed a session in this page: use the existing browser storage.
  await mockCloud(reopened, route => route.fulfill({ json: [sampleWord] }), false);
  await reopened.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await reopened.goto('/library');
  await expect(reopened.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
  await reopened.goto('/add');
  await expect(reopened.getByLabel('Word or phrase')).toBeVisible();
  await reopened.goto('/review');
  await expect(reopened.getByRole('button', { name: 'Reveal meaning', exact: true })).toBeVisible();
  await context.setOffline(true);
  await reopened.goto('/library');
  await expect(reopened.getByRole('heading', { name: 'You’re offline.' })).toBeVisible();
  await context.setOffline(false);
  await reopened.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(reopened.getByRole('heading', { name: sampleWord.word, exact: true })).toBeVisible();
});
