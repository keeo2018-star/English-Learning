import { test, expect } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord } from './helpers/cloud';
const result = { word: 'meticulous', phonetics: [{ accent: 'UK', text: 'məˈtɪkjələs', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=meticulous' }, { accent: 'US', text: 'məˈtɪkjələs', audio: 'https://uapis.cn/api/v1/dictionary/audio?accent=us&word=meticulous' }], chinese: ['adj. 一丝不苟的，注意细节的'], english: [{ partOfSpeech: 'adj.', definition: 'Marked by extreme care in treatment of details.' }], examples: [{ source: 'He was meticulous about everything.', translation: '他对任何事情都很小心谨慎。' }], synonyms: ['careful', 'precise'] };
test.describe('personal meanings and dictionary reference', () => {
    test.skip(!cloudUrl, 'Cloud fixture requires configured build');
    test('manual save, refresh, read-only dictionary, and review preserve personal meaning', async ({ page }) => {
        let stored: Record<string, unknown> | null = null;
        const writes: Record<string, unknown>[] = [];
        let lookups = 0;
        await mockCloud(page, async (r) => { if (r.request().method() === 'POST') {
            const body = r.request().postDataJSON();
            writes.push(body);
            stored = { ...sampleWord, ...body };
            return r.fulfill({ json: stored });
        } if (r.request().method() === 'PATCH') {
            stored = { ...stored, ...r.request().postDataJSON() };
            return r.fulfill({ json: { id: sampleWord.id } });
        } return r.fulfill({ json: stored ? [stored] : [] }); });
        await page.route('**/api/dictionary?*', r => { lookups++; return r.fulfill({ json: result }); });
        await page.goto('/add');
        await page.getByLabel('Word or phrase').fill('meticulous');
        await page.getByLabel('Meaning', { exact: true }).fill('做事特别仔细，一丝不苟');
        await page.getByRole('button', { name: 'Add to my library' }).click();
        await expect(page.getByText('Word saved. Ready for your next review.')).toBeVisible();
        expect(lookups).toBe(0);
        expect(writes[0]).toMatchObject({ word: 'meticulous', meaning: '做事特别仔细，一丝不苟', interval_days: 0 });
        expect(writes[0]).not.toHaveProperty('dictionary_metadata');
        await page.goto('/library');
        await page.reload();
        const trigger = page.getByRole('button', { name: 'Dictionary for meticulous' });
        await trigger.click();
        const sheet = page.getByRole('dialog');
        await expect(sheet.getByRole('heading', { name: 'Chinese', exact: true })).toBeVisible();
        await expect(sheet.getByText('做事特别仔细，一丝不苟', { exact: true })).toBeVisible();
        await expect(sheet.getByText(result.english[0].definition)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(writes).toHaveLength(1);
        await page.goto('/review');
        await expect(page.getByRole('button', { name: 'Dictionary for meticulous' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Reveal meaning' }).click();
        await expect(page.getByText('做事特别仔细，一丝不苟', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Got it' }).click();
        expect(stored).toMatchObject({ meaning: '做事特别仔细，一丝不苟', interval_days: 1 });
    });
    for (const width of [390, 1440])
        test('reference layout ' + width, async ({ page }) => { await page.setViewportSize({ width, height: 844 }); await mockCloud(page, r => r.fulfill({ json: [{ ...sampleWord, word: 'meticulous', meaning: '做事特别仔细，一丝不苟' }] })); await page.route('**/api/dictionary?*', r => r.fulfill({ json: result })); await page.goto('/library'); await page.getByRole('button', { name: 'Dictionary for meticulous' }).click(); const sheet = page.getByRole('dialog'); await expect(sheet.getByRole('button', { name: /Play pronunciation/ })).toHaveCount(2); await expect(sheet.locator('audio[controls]')).toHaveCount(0); await expect(sheet.getByRole('heading', { name: 'Examples' })).toBeVisible(); expect(await sheet.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true); await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused(); if (width === 390)
            await page.screenshot({ path: '/tmp/wordbook-dictionary-reference-mobile.png' }); });
    test('loading, not found, retry, sparse fields and audio failure', async ({ page }) => {
        await mockCloud(page, r => r.fulfill({ json: [sampleWord] }));
        let finish: () => void = () => { };
        const gate = new Promise<void>(r => finish = r);
        let calls = 0;
        await page.route('**/api/dictionary?*', async (r) => { if (new URL(r.request().url()).searchParams.has('pronunciation')) return r.fulfill({ json: result }); calls++; if (calls === 1) {
            await gate;
            return r.fulfill({ status: 404, json: { message: 'No dictionary entry found. Your saved meaning is unchanged.' } });
        } return r.fulfill({ json: { ...result, chinese: [], english: [], examples: [], synonyms: [] } }); });
        await page.route('https://uapis.cn/api/v1/dictionary/audio?*', r => r.fulfill({ status: 502, body: 'Unavailable' }));
        await page.goto('/library');
        await page.getByRole('button', { name: 'Dictionary for serendipity' }).click();
        await expect(page.getByText('Looking up dictionary reference…')).toBeVisible();
        finish();
        await expect(page.getByText('No dictionary entry found. Your saved meaning is unchanged.')).toBeVisible();
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByText('No definitions or examples available for this entry.')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Play pronunciation (UK)' }).click();
        await expect(page.getByRole('dialog').getByText('Audio unavailable.')).toBeVisible();
    });
    test('accent buttons use available audio and support replay', async ({ page }) => {
        await page.addInitScript(() => {
            HTMLMediaElement.prototype.play = function () {
                this.dataset.plays = String(Number(this.dataset.plays || 0) + 1);
                return Promise.resolve();
            };
        });
        await mockCloud(page, r => r.fulfill({ json: [sampleWord] }));
        await page.route('**/api/dictionary?*', r => r.fulfill({ json: {
            ...result,
            phonetics: [{ accent: 'UK', text: 'məˈtɪkjələs' }, result.phonetics[1]],
        } }));
        await page.goto('/library');
        await page.getByRole('button', { name: 'Dictionary for serendipity' }).click();
        const sheet = page.getByRole('dialog');
        const play = sheet.getByRole('button', { name: 'Play pronunciation (US)' });
        await expect(sheet.getByRole('button', { name: 'Play pronunciation (UK)' })).toBeDisabled();
        await expect(play).toBeVisible();
        await expect(sheet.locator('audio')).not.toHaveAttribute('data-plays');
        await play.click();
        await expect(sheet.locator('audio')).toHaveAttribute('data-plays', '1');
        await expect(play).toBeDisabled();
        await sheet.locator('audio').dispatchEvent('ended');
        await expect(play).toBeEnabled();
        await play.click();
        await expect(sheet.locator('audio')).toHaveAttribute('data-plays', '2');
    });
    test('API unavailable and network failure retain own meaning', async ({ page }) => { await mockCloud(page, r => r.fulfill({ json: [sampleWord] })); let calls = 0; await page.route('**/api/dictionary?*', r => new URL(r.request().url()).searchParams.has('pronunciation') ? r.fulfill({ json: result }) : ++calls === 1 ? r.abort() : r.fulfill({ status: 502, json: { message: 'The dictionary is unavailable right now.' } })); await page.goto('/library'); await page.getByRole('button', { name: 'Dictionary for serendipity' }).click(); await expect(page.getByText('The dictionary couldn’t be reached. Try again later.')).toBeVisible(); await page.getByRole('button', { name: 'Try again' }).click(); await expect(page.getByText('The dictionary is unavailable right now.')).toBeVisible(); await expect(page.getByRole('dialog').getByText(sampleWord.meaning, { exact: true })).toBeVisible(); });
});
test('dictionary API rejects empty and unsafe query', async ({ request }) => { for (const word of ['', '../bad'])
    expect((await request.get('/api/dictionary', { params: { word } })).status()).toBe(400); });
