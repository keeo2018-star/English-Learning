import { test, expect, type Page } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

type Entry = { kind: string; src?: string; text?: string; voice?: string; lang?: string; rate?: number; pitch?: number; volume?: number; overlap?: boolean };
async function setup(page: Page, recorded: boolean) {
  await page.addInitScript(() => {
    const events: Entry[] = [];
    let active: string | null = null;
    let calls = 0;
    const catalog = [
      { name: 'Microsoft George', lang: 'en-GB', voiceURI: 'male-first' },
      { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'preferred-female' },
      { name: 'English US', lang: 'en-US', voiceURI: 'us' },
    ];
    const target = new EventTarget();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => ++calls % 2 ? catalog : [...catalog].reverse(),
      speak: (utterance: SpeechSynthesisUtterance) => {
        events.push({ kind: 'speech', text: utterance.text, voice: utterance.voice?.name,
          lang: utterance.lang, rate: utterance.rate, pitch: utterance.pitch, volume: utterance.volume,
          overlap: !!active }); active = 'speech';
      },
      cancel: () => { if (active === 'speech') active = null; events.push({ kind: 'cancel' }); },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      text: string; lang = ''; voice = null; rate = 0; pitch = 0; volume = 0;
      constructor(text: string) { this.text = text; }
    } });
    HTMLMediaElement.prototype.play = function () {
      events.push({ kind: 'audio', src: this.src, rate: this.playbackRate,
        volume: this.volume, overlap: !!active }); active = this.src;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      events.push({ kind: 'pause', src: this.src }); if (active === this.src) active = null;
    };
    Object.assign(window, { pronunciationLog: events });
  });
  const word = recorded ? 'hello' : 'Take it easy.';
  await mockCloud(page, route => route.fulfill({ json: [{ ...sampleWord, word }] }));
  const audio = 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=hello';
  await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
    word, phonetics: [{ accent: 'UK', text: recorded ? 'həˈləʊ' : '', ...(recorded ? { audio } : {}) }],
    chinese: [], english: [], examples: [], synonyms: [],
  } }));
  const wav = Buffer.alloc(1644);
  wav.write('RIFF'); wav.writeUInt32LE(1636, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
  await page.route('https://uapis.cn/api/v1/dictionary/audio?*', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  return word;
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { pronunciationLog: Entry[] }).pronunciationLog.filter(event => event.kind === 'audio' || event.kind === 'speech'));

for (const width of [390, 1440]) for (const recorded of [true, false]) {
  test(`${recorded ? 'recordings' : 'deterministic speech fallback'} stay identical across all pronunciation controls (${width}px)`, async ({ page }) => {
    test.skip(!cloudUrl, 'Requires mocked account data');
    await page.setViewportSize({ width, height: 844 });
    const word = await setup(page, recorded);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Play pronunciation (UK)', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await page.getByRole('button', { name: `Dictionary for ${word}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Play pronunciation (UK)', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(2);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: /Review/ }).click();
    await page.waitForURL('**/review');
    await expect(page.locator('.review-card')).toBeVisible();
    await page.locator('.review-card').getByRole('button', { name: 'Play pronunciation (UK)', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(3);
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(4);
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    expect(await plays(page)).toHaveLength(4);
    await page.getByRole('button', { name: /^Replay English pronunciation:/ }).click();
    await expect.poll(async () => (await plays(page)).length).toBe(5);
    const log = await plays(page);
    expect(log.every(event => !event.overlap)).toBe(true);
    if (recorded) {
      expect(log.every(event => event.kind === 'audio')).toBe(true);
      expect(new Set(log.map(event => event.src)).size).toBe(1);
      expect(log.every(event => event.rate === 1 && event.volume === 1)).toBe(true);
    } else {
      expect(log.every(event => event.kind === 'speech' && event.voice === 'Google UK English Female' &&
        event.lang === 'en-GB' && event.rate === 1 && event.pitch === 1 && event.volume === 1 && event.text === word)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
