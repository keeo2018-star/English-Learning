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
      if (this.src.startsWith('data:audio/')) return Promise.resolve();
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
  const files: string[] = [];
  const wav = Buffer.alloc(1644);
  wav.write('RIFF'); wav.writeUInt32LE(1636, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
  await page.route('**/api/pronunciation?*', route => {
    files.push(new URL(route.request().url()).searchParams.get('source')!);
    return route.fulfill({ contentType: 'audio/wav', headers: { 'Cache-Control': 'public, max-age=86400' }, body: wav });
  });
  return Object.assign(calls, { files });
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { audioPlays: Playback[] }).audioPlays);
test.describe('review recording lifecycle', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  for (const width of [390, 1440]) test(`Due autoplay uses one player and preloads the next card (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const calls = await setup(page);
    await page.goto('/review');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await expect.poll(() => calls.files.some(src => src.includes('word=world'))).toBe(true);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    expect(await plays(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(2);
    const log = await plays(page);
    expect(log[0].player).toBe(log[1].player);
    expect(log[1].src).toMatch(/^blob:/);
    expect(calls.files.filter(src => src.includes('word=world'))).toHaveLength(1);
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
  test('entering Due Review initializes the same player inside the navigation gesture', async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      const unlocked = new WeakSet<HTMLMediaElement>();
      HTMLMediaElement.prototype.play = function () {
        if (this.src.startsWith('data:audio/')) {
          if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
          unlocked.add(this);
        } else if (!unlocked.has(this)) return Promise.reject(new DOMException('Player not initialized', 'NotAllowedError'));
        return play.call(this);
      };
    });
    await page.goto('/library');
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Due words', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(2);
    expect((await plays(page))[0].player).toBe((await plays(page))[1].player);
  });
  test('recording download overlaps lookup, but never plays before dictionary confirmation', async ({ page }) => {
    const calls = await setup(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/dictionary?*', async route => {
      const word = new URL(route.request().url()).searchParams.get('word')!;
      await gate;
      return route.fulfill({ json: { phonetics: [{ accent: 'UK', text: '', audio: `https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=${word}` }] } });
    });
    await page.goto('/review');
    await expect(page.locator('.review-card h2')).toHaveText('hello');
    await expect.poll(() => calls.files.some(source => source.includes('word=hello'))).toBe(true);
    expect(await plays(page)).toHaveLength(0);
    release();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect(calls.files.filter(source => source.includes('word=hello'))).toHaveLength(1);
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

test('pronunciation media route rejects unapproved destinations', async ({ request }) => {
  for (const source of ['', 'http://127.0.0.1/private', 'https://example.com/audio', 'https://uapis.cn/api/v1/dictionary/audio?word=hello&accent=uk&redirect=https://example.com']) {
    const response = await request.get('/api/pronunciation', { params: { source } });
    expect(response.status()).toBe(400);
  }
});
