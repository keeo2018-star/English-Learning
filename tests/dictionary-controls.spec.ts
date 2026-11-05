import { test, expect } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';

test.describe('Dictionary control consistency', () => {
  test.skip(!cloudUrl, 'Requires mocked account data');
  for (const width of [320, 390, 1440]) test(`shared buttons and active styles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
    });
    await mockCloud(page, route => route.fulfill({ json: [sampleWord] }));
    await page.route('**/api/dictionary?*', route => route.fulfill({ json: {
      word: sampleWord.word, phonetics: [{ accent: 'UK', text: 'test', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=serendipity' }],
      chinese: [], english: [], examples: [{ source: 'Serendipity brought us together.', translation: '' }], synonyms: ['fortune'],
    } }));
    const wav = Buffer.alloc(1644);
    wav.write('RIFF'); wav.writeUInt32LE(1636, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
    await page.route('https://uapis.cn/api/v1/dictionary/audio?*', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
    await page.goto('/library');
    const trigger = page.getByRole('button', { name: `Dictionary for ${sampleWord.word}`, exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.getByRole('dialog');
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(close.locator('svg')).toBeVisible();
    await expect(close).toHaveText('');
    const play = dialog.getByRole('button', { name: 'Play pronunciation', exact: true });
    for (const control of [close, play]) {
      await expect(control).toHaveCSS('font-size', '14px');
      await expect(control).toHaveCSS('border-radius', '999px');
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await play.click();
    await expect(play).toHaveClass(/wb-knockout/);
    await expect(play).toHaveAttribute('aria-pressed', 'true');
    await expect(play.locator('svg')).toHaveCSS('color', 'rgb(245, 244, 239)');
    const synonyms = dialog.locator('summary');
    await synonyms.click();
    await expect(synonyms).toHaveClass(/wb-knockout/);
    await expect(dialog.getByText('fortune', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await close.focus();
    await expect(close).toHaveCSS('outline-style', 'none');
    await expect(close).toHaveCSS('border-top-width', '1px');
    await expect(close).toHaveCSS('box-shadow', 'none');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/noted-dictionary-controls-${width}.png`, fullPage: true });
    await close.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.word-row mark')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await dialog.getByRole('heading', { name: sampleWord.word, exact: true }).click();
    await expect(dialog).toBeVisible(); // Reading/selection inside must not dismiss.
    await page.mouse.click(10, 10); // Backdrop (also covers tapping the original trigger).
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
