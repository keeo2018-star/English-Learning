import { test, expect, type Page } from '@playwright/test';
import { cloudOrigin, cloudUrl, mockCloud, sampleWord, session } from './helpers/cloud';
import { localDateKey } from '../src/lib/activity';
test.use({ timezoneId: 'America/Los_Angeles' });
type Item = typeof sampleWord & { item_type?: 'word' | 'expression'; review_state?: Record<string, unknown> };
function store(count: number) {
  return { items: Array.from({ length: count }, (_, i) => ({ ...sampleWord,
    id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    word: i % 2 ? `expression number ${i}` : `hello${i}`, item_type: i % 2 ? 'expression' : 'word',
    example: '', created_at: '2026-11-04T08:00:00Z', meaning: `Meaning ${i}` } as Item)),
    events: new Map<string, { learning_item_id: string; reviewed_at: string; familiarity_rating: string }>(),
    failAfterCommit: false, calls: 0, timezone: '', reviewGate: undefined as Promise<void> | undefined };
}
async function setup(page: Page, state = store(4)) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.addInitScript(() => { Math.random = () => .5; });
  const auth = session();
  auth.expires_at = Date.parse('2027-01-01T00:00:00Z') / 1000;
  const token = auth.access_token.split('.');
  token[1] = Buffer.from(JSON.stringify({ sub: auth.user.id, exp: auth.expires_at })).toString('base64url');
  auth.access_token = token.join('.');
  await mockCloud(page, async route => {
    const request = route.request(); const url = new URL(request.url());
    const id = url.searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'POST') {
      const item = { ...request.postDataJSON(), id: crypto.randomUUID() };
      state.items.unshift(item); return route.fulfill({ json: item });
    }
    if (request.method() === 'PATCH') {
      state.items = state.items.map(item => item.id === id ? { ...item, ...request.postDataJSON() } : item);
      return route.fulfill({ json: state.items.find(item => item.id === id) });
    }
    if (request.method() === 'DELETE') { state.items = state.items.filter(item => item.id !== id); return route.fulfill({ json: { id } }); }
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000);
    return route.fulfill({ json: state.items.slice(offset, offset + limit) });
  }, true, auth);
  await page.route('**/api/dictionary?*', route => route.fulfill({ status: 404, json: {} }));
  await page.route(cloudOrigin + '/rest/v1/rpc/record_learning_review', async route => {
    state.calls++;
    if (state.reviewGate) await state.reviewGate;
    const p = route.request().postDataJSON();
    if (!state.events.has(p.p_event_id)) {
      state.events.set(p.p_event_id, { learning_item_id: p.p_item_id, reviewed_at: '2026-11-04T12:00:00Z', familiarity_rating: p.p_rating });
      state.items = state.items.map(item => item.id === p.p_item_id ? { ...item, due_at: p.p_due_at, interval_days: p.p_interval_days, review_state: p.p_review_state } : item);
    }
    if (state.failAfterCommit) { state.failAfterCommit = false; return route.abort('connectionreset'); }
    return route.fulfill({ json: state.items.find(item => item.id === p.p_item_id) });
  });
  await page.route(cloudOrigin + '/rest/v1/rpc/learning_calendar', route => {
    const p = route.request().postDataJSON(); state.timezone = p.p_timezone;
    const dates = new Map<string, { reviewed: Set<string>; added: number }>();
    const get = (date: string) => { if (!dates.has(date)) dates.set(date, { reviewed: new Set(), added: 0 }); return dates.get(date)!; };
    for (const event of state.events.values()) get(localDateKey(new Date(event.reviewed_at), p.p_timezone)).reviewed.add(event.learning_item_id);
    for (const item of state.items) get(localDateKey(new Date(item.created_at), p.p_timezone)).added++;
    return route.fulfill({ json: { tracking_since: '2026-11-02T15:00:00Z', days: [...dates].filter(([date]) => date.startsWith(p.p_month.slice(0, 7))).map(([date, value]) => ({ date, reviewed: value.reviewed.size, added: value.added })) } });
  });
  return state;
}
test.describe('learning sessions, calendar and Library metadata', () => {
  test.skip(!cloudUrl, 'Uses isolated mocked Supabase accounts');
  for (const width of [390, 1440]) test(`30 distinct mixed items; submitted progress and completion (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await setup(page, store(35));
    await page.goto('/review?mode=random');
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText(`${i} / 30`);
      await expect(page.getByRole('progressbar', { name: 'Items reviewed' })).toHaveAttribute('value', String(i));
      const word = (await page.locator('.review-card h2').textContent())!;
      expect(seen.has(word)).toBe(false); seen.add(word);
      await page.getByRole('button', { name: 'Reveal answer' }).click();
      await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText(`${i} / 30`);
      await page.getByRole('button', { name: i % 3 ? 'Sure' : 'Not sure', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Review complete.' })).toBeVisible();
    await expect(page.getByText('30 items reviewed.', { exact: true })).toBeVisible();
    expect(state.events.size).toBe(30);
    expect(new Set([...state.events.values()].map(e => e.learning_item_id)).size).toBe(30);
    expect([...seen].some(word => word.includes('expression'))).toBe(true);
    expect([...seen].some(word => word.includes('hello'))).toBe(true);
    await page.reload();
    await expect(page.getByText('30 items reviewed.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start another review' }).click();
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('0 / 30');
  });
  test('smaller session survives refresh and navigation; an uncertain item is not repeated', async ({ page }) => {
    const state = await setup(page, store(3));
    await page.goto('/review?mode=random');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Not sure', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 3');
    const next = await page.locator('.review-card h2').textContent();
    await page.reload();
    await expect(page.locator('.review-card h2')).toHaveText(next!);
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 3');
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'Random review', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 3');
    for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Reveal answer' }).click(); await page.getByRole('button', { name: 'Sure', exact: true }).click(); }
    await expect(page.getByText('3 items reviewed.', { exact: true })).toBeVisible();
    expect(state.events.size).toBe(3);
  });
  test('a lost save response and refresh retry the same event without counting twice', async ({ page }) => {
    const state = await setup(page, store(2)); state.failAfterCommit = true;
    await page.goto('/review?mode=random');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sure', exact: true })).toBeEnabled();
    expect(state.events.size).toBe(1);
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('0 / 2');
    await page.reload();
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 2');
    expect(state.events.size).toBe(1); expect(state.calls).toBe(2);
    expect(state.items[0].review_state?.review_count).toBe(1);
  });
  test('two tabs saving the same session card cannot duplicate its review event', async ({ page, context }) => {
    const state = await setup(page, store(3));
    await page.goto('/review?mode=random');
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('0 / 3');
    const other = await context.newPage(); await setup(other, state);
    await other.goto('/review?mode=random');
    let release!: () => void;
    state.reviewGate = new Promise<void>(resolve => { release = resolve; });
    for (const tab of [page, other]) {
      await tab.getByRole('button', { name: 'Reveal answer' }).click();
      await tab.getByRole('button', { name: 'Sure', exact: true }).click();
    }
    await expect.poll(() => state.calls).toBe(2);
    release();
    for (const tab of [page, other]) await expect(tab.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 3');
    expect(state.events.size).toBe(1);
    await other.close();
  });
  for (const width of [320, 390, 1440]) test(`monthly calendar, local dates, history and metric selection (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await setup(page);
    for (let i = 0; i < 3; i++) state.events.set(String(i), { learning_item_id: state.items[0].id, reviewed_at: '2026-11-04T08:30:00Z', familiarity_rating: 'sure' });
    await page.goto('/review');
    await expect(page.getByRole('group', { name: 'Calendar activity' })).toHaveCount(0);
    await expect(page.getByText('Learning calendar', { exact: true })).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'November 4: 1 reviewed', exact: true })).toBeVisible();
    expect(state.timezone).toBe('America/Los_Angeles');
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: 1');
    await expect(page.locator('.calendar-day-summary')).toContainText('Added: 4');
    await page.getByRole('button', { name: 'Added', exact: true }).click();
    await expect(page.getByRole('button', { name: 'November 4: 4 added', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
    await page.getByRole('button', { name: 'November 1: review history unavailable', exact: true }).click();
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: Unavailable');
    await page.getByRole('button', { name: 'November 3: 0 reviewed', exact: true }).click();
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: 0');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: `/tmp/noted-calendar-${width}.png`, fullPage: true });
  });
  test('Profile calendar refreshes after returning from Due review; reveal is not activity', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/auth');
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: 0');
    await page.goto('/review');
    await expect(page.getByText('Learning calendar', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.goto('/auth');
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: 0');
    await page.goto('/review');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Not sure', exact: true }).click();
    await expect.poll(() => state.events.size).toBe(1);
    await page.goto('/auth');
    await expect(page.locator('.calendar-day-summary')).toContainText('Reviewed: 1');
  });
  test('Library metadata follows filters, search, content-type edits, deletion, addition and device refresh', async ({ page, context }) => {
    const state = await setup(page);
    await page.goto('/library');
    const counter = page.getByRole('status', { name: 'Library count' });
    await expect(counter).toHaveText('4 items');
    await expect(page.getByText('Words: 2 · Expressions: 2', { exact: true })).toBeVisible();
    const filters = page.getByRole('group', { name: 'Library content type' });
    await filters.getByRole('button', { name: 'Words', exact: true }).click();
    await expect(counter).toHaveText('2 items');
    await filters.getByRole('button', { name: 'Expressions', exact: true }).click();
    await expect(counter).toHaveText('2 items');
    await filters.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Search library').fill('hello0');
    await expect(counter).toHaveText('1 result · 4 total items');
    await page.getByRole('button', { name: 'Edit hello0', exact: true }).click();
    await page.getByRole('combobox', { name: 'Content type', exact: true }).selectOption('expression');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Words: 1 · Expressions: 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete hello0', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete word', exact: true }).click();
    await expect(counter).toHaveText('0 results · 3 total items');
    await page.getByLabel('Search library').fill('');
    const other = await context.newPage(); await setup(other, state);
    await other.goto('/add');
    await other.getByLabel('Word or phrase').fill('fresh');
    await other.getByLabel('Meaning', { exact: true }).fill('new');
    await other.getByRole('combobox', { name: 'Content type', exact: true }).selectOption('word');
    await other.getByRole('button', { name: /Add to my library/ }).click();
    await expect(other.getByRole('status')).toContainText('Word saved');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(counter).toHaveText('4 items');
    await expect(page.getByText('Words: 2 · Expressions: 2', { exact: true })).toBeVisible();
    await other.close();
  });
  test('signed-in Profile hides login controls; sign out restores them and removes calendar', async ({ page }) => {
    await setup(page);
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: 'Profile.', exact: true })).toBeVisible();
    await expect(page.locator('.calendar-grid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByText('Learning calendar', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator('.calendar-grid')).toHaveCount(0);
  });
  test('Library totals are not truncated by the Supabase 1000-row response limit', async ({ page }) => {
    await setup(page, store(1003)); await page.goto('/library');
    await expect(page.getByRole('status', { name: 'Library count' })).toHaveText('1003 items');
  });
  test('missing migration preserves existing reviews without inventing activity history', async ({ page }) => {
    await setup(page, store(2));
    await page.route(cloudOrigin + '/rest/v1/rpc/record_learning_review', route => route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function missing' } }));
    await page.route(cloudOrigin + '/rest/v1/rpc/learning_calendar', route => route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function missing' } }));
    await page.goto('/review?mode=random');
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: 'Sure', exact: true }).click();
    await expect(page.getByText('Review saved. Activity tracking isn’t available yet.', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Session progress' })).toHaveText('1 / 2');
    await page.goto('/auth');
    await expect(page.getByText(/Learning activity isn’t available yet/)).toBeVisible();
    await expect(page.locator('.calendar-grid')).toHaveCount(0);
  });
});
