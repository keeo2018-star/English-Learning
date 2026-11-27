import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

test('PWA manifest, icons, Apple metadata and viewport are valid on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ id: '/', name: 'Noted', short_name: 'Noted', start_url: '/', scope: '/', display: 'standalone', theme_color: '#f3f2ed', background_color: '#f3f2ed' });
  expect(manifest.icons.some((icon: { purpose: string; sizes: string }) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Noted');
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

test('public app shells and assets reopen the prepared Library with networking disabled',async({page,context})=>{
 test.skip(!cloudUrl);await mockCloud(page,r=>r.fulfill({json:[sampleWord]}));await page.goto('/library');await expect(page.getByRole('button',{name:'Dictionary for '+sampleWord.word,exact:true})).toBeVisible();await page.evaluate(async()=>{await navigator.serviceWorker.ready});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const paths=await page.evaluate(async()=>{const result=[];for(const key of await caches.keys()){const cache=await caches.open(key);for(const request of await cache.keys())result.push(new URL(request.url).pathname);}return result;});expect(paths).toContain('/review');expect(paths).toContain('/library');expect(paths.some(path=>path.startsWith('/_next/static/'))).toBe(true);expect(paths.every(path=>!path.startsWith('/api/')&&!path.includes('/rest/v1/')&&!path.includes('/auth/callback'))).toBe(true);
 const headers=await page.evaluate(async()=>{const response=await fetch('/sw.js');return{cache:response.headers.get('cache-control'),scope:response.headers.get('service-worker-allowed')}});expect(headers.cache).toContain('no-store');expect(headers.scope).toBe('/');await page.close();await context.setOffline(true);const reopened=await context.newPage();await mockCloud(reopened,r=>r.fulfill({json:[sampleWord]}),false);await reopened.goto('/library');await expect(reopened.getByRole('button',{name:'Dictionary for '+sampleWord.word,exact:true})).toBeVisible();await reopened.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Review',exact:true}).click();await expect(reopened.getByRole('button',{name:'Reveal answer',exact:true})).toBeVisible();
});
