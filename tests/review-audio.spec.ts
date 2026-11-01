import { test, expect, type Page } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';
type Playback = { src: string; player: number };
async function setup(page: Page, blocked = false) {
  await page.addInitScript(blocked => {
    Math.random = () => .5;
    const plays: Playback[] = [], loads: string[] = [];
    let identity = 0, deny = blocked, attempts = 0;
    const players = new WeakMap<HTMLMediaElement, number>();
    HTMLMediaElement.prototype.load = function () { loads.push(this.src); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.play = function () {
      Object.assign(window, { audioAttempts: ++attempts });
      if (deny) { deny = false; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
      if (!players.has(this)) players.set(this, ++identity);
      plays.push({ src: this.src, player: players.get(this)! }); return Promise.resolve();
    };
    Object.assign(window, { audioPlays: plays, audioLoads: loads });
  }, blocked);
  await mockCloud(page, route => route.fulfill({ json: [
    { ...sampleWord, word: 'hello' }, { ...sampleWord, id: 'second-word', word: 'world' },
  ] }));
  const calls: string[] = [];
  await page.route('**/api/dictionary?*', route => {
    const word = new URL(route.request().url()).searchParams.get('word')!; calls.push(word);
    return route.fulfill({ json: { word, phonetics: [{ accent: 'UK', text: '', audio: `https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=${word}` }], chinese: [], english: [], examples: [], synonyms: [] } });
  });
  return calls;
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { audioPlays: Playback[] }).audioPlays);
test.describe('review recording lifecycle', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  for (const width of [390, 1440]) test(`Due autoplay uses one player and preloads the next card (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const calls = await setup(page);
    await page.goto('/review');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioLoads: string[] }).audioLoads.some(src => src.includes('word=world')))).toBe(true);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    expect(await plays(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(2);
    const log = await plays(page);
    expect(log[0].player).toBe(log[1].player);
    expect(log[1].src).toContain('word=world');
    expect(calls.filter(word => word === 'world')).toHaveLength(1);
    await page.reload();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect(calls.filter(word => word === 'hello')).toHaveLength(1); // Session URL cache survives reload.
  });
  test('blocked autoplay resumes on the first reveal gesture without errors or duplicate reveal playback', async ({ page }) => {
    await setup(page, true); await page.goto('/review');
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioAttempts: number }).audioAttempts || 0)).toBe(1);
    const button = page.getByRole('button', { name: 'Play pronunciation', exact: true });
    await expect(button).toHaveAttribute('aria-busy', 'false');
    expect(await plays(page)).toHaveLength(0);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await expect(page.getByText('Tap the speaker to try pronunciation again.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(2);
  });
  test('mount and hydration autoplay once with cold and cached pronunciation data', async ({ page }) => {
    await setup(page);
    await page.goto('/review');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await page.reload();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await page.setViewportSize({ width: 400, height: 844 });
    expect(await plays(page)).toHaveLength(1);
  });
  test('a stale dictionary response cannot play after leaving the card', async ({ page }) => {
    await setup(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/dictionary?*', async route => {
      await gate;
      return route.fulfill({ json: { phonetics: [{ accent: 'UK', text: '', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=hello' }] } });
    });
    await page.goto('/review');
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.getByLabel('Search library')).toBeVisible();
    release();
    await expect(page.locator('.word-row').first().getByRole('button', { name: 'Play pronunciation', exact: true })).toBeEnabled();
    expect(await plays(page)).toHaveLength(0);
  });
});
