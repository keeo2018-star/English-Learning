import { test, expect, type Page } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

const officialScript = 'https://youglish.com/public/emb/widget.js';
const widgetFixture = `
window.videoCalls = [];
window.YG = { Widget: class {
  constructor(host, options) { this.host = host; this.options = options; this.events = options.events; window.videoWidget = this; const frame = document.createElement('iframe'); frame.title = 'Official player fixture'; frame.style.width = '100%'; frame.style.height = '240px'; host.append(frame); window.videoOptions = options; }
  fetch(query, language, accent) { window.videoCalls.push(['fetch', query, language, accent]); if (window.videoScenario === 'pending') return; setTimeout(() => { if(window.videoScenario === 'error') this.events.onError({code: 3}); else { this.events.onFetchDone({totalResult: window.videoScenario === 'empty' ? 0 : 2}); this.events.onPlayerReady({}); } }, 30); }
  pause() { window.videoCalls.push(['pause']); }
  replay() { window.videoCalls.push(['replay']); this.events.onPlayerStateChange({state: 1}); }
  next() { window.videoCalls.push(['next']); }
  close() { window.videoCalls.push(['close']); this.host.replaceChildren(); }
  removeEventListener() {}
}};
window.onYouglishAPIReady();
`;
async function setup(page: Page, word = 'caught off guard', wide = true) {
  if (wide) await page.setViewportSize({ width: 1280, height: 900 });
  await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, word }] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: { word, phonetics: [{ accent: 'UK', text: '/test/' }], chinese: [], english: [], examples: [], synonyms: [] } }));
  await page.goto('/library');
  await page.getByRole('button', { name: `Dictionary for ${word}` }).click();
}
async function expand(page: Page) {
  await page.getByRole('button', { name: 'Watch in context', exact: true }).click();
  await page.getByRole('button', { name: 'Agree & load video', exact: true }).click();
}
test.describe('In the Wild', () => {
  test.skip(!cloudUrl, 'Requires configured cloud fixture');
  for (const word of ['subtle', 'caught off guard', "I wouldn’t put it that way, even if somebody asked me directly."]) {
    test(`lazy official widget preserves complete query: ${word}`, async ({ page }) => {
      let requests = 0;
      await page.route(officialScript, route => { requests++; return route.fulfill({ contentType: 'application/javascript', body: widgetFixture }); });
      await setup(page, word);
      expect(requests).toBe(0);
      await expect(page.getByRole('button', { name: 'Watch in context', exact: true }).locator('svg')).toBeVisible();
      await page.getByRole('button', { name: 'Watch in context', exact: true }).click();
      await expect(page.getByText('Loading connects to YouGlish and YouTube.', { exact: false })).toBeVisible();
      expect(requests).toBe(0);
      await page.getByRole('button', { name: 'Agree & load video', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { videoCalls: unknown[] }).videoCalls)).toContainEqual(['fetch', word, 'english', 'uk']);
      expect(await page.evaluate(() => (window as unknown as { videoOptions: { autoStart: number } }).videoOptions.autoStart)).toBe(0);
      await expect(page.getByText('exact spoken matches aren’t independently verified.', { exact: false })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Powered by YouGlish.com' })).toHaveAttribute('href', /youglish.com\/pronounce\//);
      await page.getByRole('button', { name: 'US English', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { videoCalls: unknown[] }).videoCalls)).toContainEqual(['fetch', word, 'english', 'us']);
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await page.getByRole('button', { name: 'Next clip', exact: true }).click();
      await page.getByRole('button', { name: 'Hide video', exact: true }).click();
      await expect(page.locator('iframe')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { videoCalls: unknown[] }).videoCalls)).toContainEqual(['close']);
    });
  }
  for (const scenario of ['empty', 'error', 'network']) test(`${scenario} has a friendly fallback and cleans up`, async ({ page }) => {
    await page.addInitScript(value => { (window as unknown as { videoScenario: string }).videoScenario = value; }, scenario);
    await page.route(officialScript, route => scenario === 'network' ? route.abort() : route.fulfill({ contentType: 'application/javascript', body: widgetFixture }));
    await setup(page);
    await expand(page);
    await expect(page.getByText(scenario === 'empty' ? 'No matching video found yet.' : 'Video couldn’t load. It may be unavailable, blocked, or temporarily limited.')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Powered by YouGlish.com' })).toBeVisible();
    if (scenario !== 'empty') {
      await page.evaluate(() => { (window as unknown as { videoScenario: string }).videoScenario = 'ready'; });
      await page.route(officialScript, route => route.fulfill({ contentType: 'application/javascript', body: widgetFixture }));
      await page.getByRole('button', { name: 'Try video again' }).click();
      await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
    }
  });
  test('pending load can be collapsed before script finishes', async ({ page }) => {
    await page.route(officialScript, async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.fulfill({ contentType: 'application/javascript', body: widgetFixture }); });
    await setup(page);
    await expand(page);
    await expect(page.getByText('Finding video examples…')).toBeVisible();
    await page.getByRole('button', { name: 'Hide video', exact: true }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.waitForTimeout(800);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
  test('provider that never becomes ready times out without a broken player', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { videoScenario: string }).videoScenario = 'pending'; });
    await page.route(officialScript, route => route.fulfill({ contentType: 'application/javascript', body: widgetFixture }));
    await setup(page);
    await page.clock.install();
    await expand(page);
    await expect(page.getByText('Finding video examples…')).toBeVisible();
    await page.clock.fastForward(26000);
    await expect(page.getByText('Video couldn’t load. It may be unavailable, blocked, or temporarily limited.')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });
  for (const width of [320, 390, 1440]) test(`responsive container ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(officialScript, route => route.fulfill({ contentType: 'application/javascript', body: widgetFixture }));
    await setup(page, 'caught off guard', false);
    const preview = page.getByRole('button', { name: 'Watch in context', exact: true });
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator('svg')).toBeVisible();
    // The reference preview is intentionally compact; the actual official player below stays >=200px.
    const previewHeight = await preview.evaluate(element => element.getBoundingClientRect().height);
    expect(previewHeight).toBeGreaterThanOrEqual(160);
    expect(previewHeight).toBeLessThanOrEqual(220);
    await page.screenshot({ path: `/tmp/noted-video-card-preview-${width}.png` });
    await page.getByRole('button', { name: 'Watch in context', exact: true }).click();
    await page.getByRole('button', { name: 'Agree & load video', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open YouGlish' })).toHaveCount(0);
    expect(await page.locator('iframe').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(200);
    expect(await page.locator('iframe').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(200);
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/noted-video-${width}.png` });
  });
  test('installed PWA uses official external link without loading provider', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
    let requests = 0;
    await page.route(officialScript, route => { requests++; return route.abort(); });
    await setup(page);
    await page.getByRole('button', { name: 'Watch in context', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Open YouGlish' })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: 'Agree & load video' })).toHaveCount(0);
    expect(requests).toBe(0);
  });
  test('video playback stops pronunciation; pronunciation pauses video', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () { this.dataset.playing = 'true'; return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () { this.dataset.playing = 'false'; };
      window.speechSynthesis.speak = utterance => { (window as unknown as { activeUtterance?: SpeechSynthesisUtterance }).activeUtterance = utterance; };
    });
    await page.route(officialScript, route => route.fulfill({ contentType: 'application/javascript', body: widgetFixture }));
    await setup(page);
    await expand(page);
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
    const audioButton = page.getByRole('dialog').locator('button[data-accent="UK"]');
    await audioButton.click();
    await expect(audioButton).toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => (window as unknown as { videoCalls: unknown[] }).videoCalls)).toContainEqual(['pause']);
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await expect(audioButton).toHaveAttribute('aria-busy', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('iframe')).toHaveCount(0);
  });
  test('privacy page discloses provider terms', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy & terms' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'YouTube Terms of Service', exact: true })).toHaveAttribute('href', 'https://www.youtube.com/t/terms');
    await expect(page.getByRole('link', { name: 'Google Privacy Policy', exact: true })).toHaveAttribute('href', 'https://policies.google.com/privacy');
  });
});
