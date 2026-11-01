import { test, expect, type Page } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';

type SpeechLog = { kind: string; text?: string; lang?: string; voice?: string; overlap?: boolean };
async function speechMock(page: Page, voices: string[] = ['en-US', 'en-GB'], delayed = false) {
  await page.addInitScript(({ languages, delayed }) => {
    const log: SpeechLog[] = [];
    const target = new EventTarget();
    let active = false;
    let available = delayed ? [] : languages;
    const mock = {
      getVoices: () => available.map(lang => ({ lang, name: lang })),
      cancel: () => { log.push({ kind: 'cancel' }); active = false; },
      speak: (utterance: SpeechSynthesisUtterance) => {
        log.push({ kind: 'speak', text: utterance.text, lang: utterance.lang,
          voice: utterance.voice?.name, overlap: active });
        active = true;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: mock });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      text: string; lang = ''; voice = null;
      constructor(text: string) { this.text = text; }
    } });
    Object.assign(window, { speechLog: log, loadSpeechVoices: () => {
      available = languages;
      target.dispatchEvent(new Event('voiceschanged'));
    } });
  }, { languages: voices, delayed });
}
const speaks = (page: Page) => page.evaluate(() =>
  (window as unknown as { speechLog: SpeechLog[] }).speechLog.filter(event => event.kind === 'speak'));
async function setup(page: Page) {
  await page.addInitScript(() => { Math.random = () => .5; });
  await mockCloud(page, route => route.fulfill({ json: [
    { ...sampleWord, id: 'speech-1', word: 'Take it easy. 保持轻松', meaning: '不要紧张', example: 'Never read this note.' },
    { ...sampleWord, id: 'speech-2', word: 'Good morning!', meaning: '早上好', example: 'Never read this either.' },
  ] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/review');
}

test.describe('shared review speech fallback', () => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  for (const width of [390, 1440]) test(`Due and Random autoplay once, respect the setting and never overlap (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await speechMock(page); await setup(page);
    await expect.poll(async () => (await speaks(page)).length).toBe(1);
    expect((await speaks(page))[0].text).toBe('Take it easy.');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    expect(await speaks(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect.poll(async () => (await speaks(page)).length).toBe(2);
    expect((await speaks(page))[1].text).toBe('Good morning!');
    const setting = page.getByRole('checkbox', { name: 'Auto pronunciation', exact: true });
    await setting.uncheck();
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Random review', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
    expect(await speaks(page)).toHaveLength(2);
    await page.getByRole('button', { name: 'Play pronunciation', exact: true }).click();
    await expect.poll(async () => (await speaks(page)).length).toBe(3);
    await setting.check();
    await expect.poll(async () => (await speaks(page)).length).toBe(4);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    expect(await speaks(page)).toHaveLength(4);
    expect((await speaks(page)).every(event => !event.overlap && event.voice === 'en-GB')).toBe(true);
  });
  test('empty voice catalogs use an English locale immediately and voiceschanged never repeats autoplay', async ({ page }) => {
    await speechMock(page, ['zh-CN', 'en-US'], true); await setup(page);
    await expect.poll(async () => (await speaks(page)).length).toBe(1);
    expect((await speaks(page))[0].lang).toBe('en-GB');
    await page.evaluate(() => (window as unknown as { loadSpeechVoices: () => void }).loadSpeechVoices());
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    expect(await speaks(page)).toHaveLength(1);
  });
  test('browsers without speech support keep review usable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    });
    await setup(page);
    await expect(page.getByRole('button', { name: 'Play pronunciation', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.getByRole('button', { name: 'Sure', exact: true })).toBeVisible();
  });
});
