import { test, expect, type Page } from '@playwright/test';
import { cloudUrl, cloudOrigin, mockCloud, sampleWord } from './helpers/cloud';
const letters = (n: number) => { let value = ''; for (let i = 0; i < 4; i++) { value = String.fromCharCode(97 + n % 26) + value; n = Math.floor(n / 26); } return value; };
async function setup(page: Page, count = 1000) {
  const state = { reads: 0, lookups: [] as string[], fail: false };
  const entries = Array.from({ length: count }, (_, i) => ({ ...sampleWord,
    id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    word: i === count - 1 ? 'needle' : `vocab${letters(i)}`,
    item_type: i % 2 ? 'expression' : 'word', meaning: i === count - 1 ? '捕捉细节' : `Meaning ${i}`,
    example: i === count - 1 ? 'Caught   off guard by a question.' : '' }));
  await mockCloud(page, route => {
    state.reads++;
    if (state.fail) return route.fulfill({ status: 403, json: { message: 'Temporarily unavailable' } });
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
    return route.fulfill({ json: entries.slice(offset, offset + 1000) });
  });
  await page.route('**/api/dictionary?*', route => {
    state.lookups.push(new URL(route.request().url()).searchParams.get('word') || '');
    return route.fulfill({ status: 404, json: {} });
  });
  return state;
}
test.describe('Library search performance and reliability', () => {
  test.skip(!cloudUrl, 'Requires a mocked Supabase account');
  for (const width of [390, 1440]) test(`large Library bounds rows and lookups while searching every saved item (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await setup(page);
    await page.goto('/library');
    await expect(page.getByRole('status', { name: 'Library count' })).toHaveText('1000 items');
    await expect(page.locator('.word-row')).toHaveCount(30);
    expect(await page.locator('*').count()).toBeLessThan(1800);
    await expect.poll(() => state.lookups.length).toBeGreaterThan(0);
    expect(state.lookups.length).toBeLessThan(30);
    const reads: string[] = [];
    page.on('request', request => { if (request.url().startsWith(cloudOrigin + '/rest/v1/words')) reads.push(request.url()); });
    await page.getByLabel('Search library').pressSequentially('needle');
    await expect(page.getByRole('heading', { name: 'needle', exact: true })).toBeVisible();
    await expect(page.locator('.word-row')).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Library count' })).toHaveText('1 result · 1000 total items');
    expect(reads).toHaveLength(0); // Typing searches the complete local index, not Supabase.
    await page.getByLabel('Search library').fill('');
    await expect(page.locator('.word-row')).toHaveCount(30);
    expect(state.lookups.length).toBeLessThan(35);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test('pagination stays bounded, filters reset the page, and full-width/Chinese/example searches work', async ({ page }) => {
    await setup(page, 61); await page.goto('/library');
    const pages = page.getByRole('navigation', { name: 'Library pages' });
    await expect(pages.getByRole('status')).toHaveText('1–30 of 61');
    await pages.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pages.getByRole('status')).toHaveText('31–60 of 61');
    await expect(page.getByRole('region', { name: 'Library results' })).toBeFocused();
    await expect(page.locator('.word-row')).toHaveCount(30);
    await pages.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pages.getByRole('status')).toHaveText('61–61 of 61');
    await expect(page.locator('.word-row')).toHaveCount(1);
    await expect(pages.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await page.getByRole('group', { name: 'Library content type' }).getByRole('button', { name: 'Words', exact: true }).click();
    await expect(pages.getByRole('status')).toHaveText('1–30 of 31');
    const search = page.getByLabel('Search library');
    for (const text of ['  ＮＥＥＤＬＥ  ', '捕捉', 'caught off guard']) {
      await search.fill(text);
      await expect(page.locator('.word-row')).toHaveCount(1);
      await expect(page.locator('.word-row h2')).toHaveText('needle');
    }
    await search.fill('nothing matches');
    await expect(page.getByText('No matching words. Try another search.', { exact: true })).toBeVisible();
    await search.fill('');
    await expect(pages.getByRole('status')).toHaveText('1–30 of 31');
  });
  test('a background sync failure retains search results and editing is not interrupted', async ({ page }) => {
    const state = await setup(page, 3); await page.goto('/library');
    await page.getByLabel('Search library').fill('needle');
    await expect(page.locator('.word-row')).toHaveCount(1);
    await expect(page.locator('.word-row h2')).toHaveText('needle');
    state.fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText(/Could not refresh. Showing your last loaded items/)).toBeVisible();
    await expect(page.locator('.word-row h2')).toHaveText('needle');
    await expect(page.getByLabel('Search library')).toHaveValue('needle');
    await page.getByRole('button', { name: 'Edit needle', exact: true }).click();
    await page.getByRole('textbox', { name: 'Meaning', exact: true }).fill('Unsaved edit stays here');
    const reads = state.reads;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('textbox', { name: 'Meaning', exact: true })).toHaveValue('Unsaved edit stays here');
    expect(state.reads).toBe(reads);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    state.fail = false;
    await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
    await expect(page.getByText(/Could not refresh. Showing your last loaded items/)).toHaveCount(0);
    await expect(page.locator('.word-row h2')).toHaveText('needle');
  });
});
