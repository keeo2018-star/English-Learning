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
  await mockCloud(page, route => route.fulfill({ json: [
    { ...sampleWord, id: 'speech-1', word: 'Take it easy. 保持轻松', meaning: '不要紧张', example: 'Never read this note.' },
    { ...sampleWord, id: 'speech-2', word: 'Good morning!', meaning: '早上好', example: 'Never read this either.' },
  ] }));
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/review');
}

test.describe('Random Review speech synthesis', () => {
  test.skip(!cloudUrl, 'Requires mocked cloud configuration');
  for (const width of [390, 1440]) test(`autoplay once, replay, toggle and stop on card changes (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await speechMock(page);
    await setup(page);
    const setting = page.getByRole('checkbox', { name: 'Auto pronunciation', exact: true });
    await expect(setting).toBeChecked();
    expect(await speaks(page)).toHaveLength(0); // Scheduled review never autoplays.
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await expect.poll(async () => (await speaks(page)).length).toBe(1);
    let log = await speaks(page);
    expect(log[0].voice).toBe('en-GB');
    expect(['Take it easy.', 'Good morning!']).toContain(log[0].text);
    const replay = page.getByRole('button', { name: /^Replay English pronunciation:/ });
    const bounds = await replay.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    if (width === 390) await page.locator('.review-card').screenshot({ path: '/tmp/random-speech-mobile.png' });
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    expect(await speaks(page)).toHaveLength(1);
    await replay.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await speaks(page)).length).toBe(2);
    await page.getByRole('button', { name: 'Next word', exact: true }).click();
    await expect.poll(async () => (await speaks(page)).length).toBe(3);
    log = await speaks(page);
    expect(log[2].text).not.toBe(log[0].text);
    expect(log.every(event => !event.overlap)).toBe(true);
    await setting.uncheck();
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    await page.getByRole('button', { name: 'Finish review', exact: true }).click();
    await page.getByRole('button', { name: 'Shuffle again', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reveal meaning', exact: true })).toBeVisible();
    expect(await speaks(page)).toHaveLength(3);
    await replay.click();
    await expect.poll(async () => (await speaks(page)).length).toBe(4);
    await page.getByRole('button', { name: 'Due words', exact: true }).click();
    const events = await page.evaluate(() => (window as unknown as { speechLog: SpeechLog[] }).speechLog);
    expect(events.at(-1)?.kind).toBe('cancel');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('delayed voices prefer English fallback and never repeat on voiceschanged', async ({ page }) => {
    await speechMock(page, ['zh-CN', 'en-US'], true);
    await setup(page);
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await page.evaluate(() => (window as unknown as { loadSpeechVoices: () => void }).loadSpeechVoices());
    await expect.poll(async () => (await speaks(page)).length).toBe(1);
    expect((await speaks(page))[0].voice).toBe('en-US');
    await page.evaluate(() => (window as unknown as { loadSpeechVoices: () => void }).loadSpeechVoices());
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    expect(await speaks(page)).toHaveLength(1);
  });

  test('when voices remain empty the engine receives an English language request', async ({ page }) => {
    await speechMock(page, [], true);
    await setup(page);
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await expect.poll(async () => (await speaks(page)).length).toBe(1);
    expect((await speaks(page))[0].lang).toBe('en-GB');
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    expect(await speaks(page)).toHaveLength(1);
  });

  test('pending voice loading is canceled when leaving Random Review', async ({ page }) => {
    await speechMock(page, ['en-GB'], true);
    await setup(page);
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await page.getByRole('button', { name: 'Due words', exact: true }).click();
    await page.evaluate(() => (window as unknown as { loadSpeechVoices: () => void }).loadSpeechVoices());
    expect(await speaks(page)).toHaveLength(0);
  });

  test('browsers without speech support keep review usable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    });
    await setup(page);
    await page.getByRole('button', { name: 'Random review', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Replay English pronunciation:/ })).toBeEnabled();
    await expect(page.getByText('Tap the speaker to try pronunciation again.')).toBeVisible();
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next word', exact: true })).toBeVisible();
  });
});
