import type { Page, Route } from "@playwright/test";
export const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const cloudOrigin = cloudUrl ? new URL(cloudUrl).origin : "";
export const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "production-readiness-test-with-a-long-email@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
export const sampleWord = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: user.id,
  word: "serendipity",
  meaning: "A fortunate discovery",
  example: "A chance encounter.",
  due_at: "2020-01-01T00:00:00Z",
  interval_days: 0,
  created_at: "2026-01-01T00:00:00Z",
};
export function session() {
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  return {
    access_token:
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }) +
      ".test",
    refresh_token: "mock-refresh",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    user,
  };
}
export async function mockCloud(
  page: Page,
  words: (route: Route) => Promise<void>,
  signedIn = true,
  initialSession = session(),
) {
  await page.route('**/api/pronunciation?*', route => route.fulfill({ status: 503, body: 'Recording fixture unavailable' }));
  // Legacy UI tests keep their manual meanings; Smart Add tests override these.
  await page.route('**/api/smart-add/suggestions?*', route => route.fulfill({ json: { suggestions: [] } }));
  await page.route('**/api/smart-add/meaning', route => route.fulfill({ json: { meaning: '', source: null } }));
  if (signedIn)
    await page.addInitScript(
      ({ key, data }) => {
        if (!sessionStorage.getItem("mock-seeded")) {
          localStorage.setItem(key, JSON.stringify(data));
          sessionStorage.setItem("mock-seeded", "1");
        }
      },
      {
        key: "sb-" + new URL(cloudUrl!).hostname.split(".")[0] + "-auth-token",
        data: initialSession,
      },
    );
  // Legacy CRUD fixtures also exercise the new atomic review RPC. Database-level
  // transaction/security behavior is checked independently against PostgreSQL.
  const savedItems = new Map<string, Record<string, unknown>>();
  const events = new Map<string, Record<string, unknown>>();
  const routeWords = (route: Route) => words(new Proxy(route, { get(target, property) {
    if (property === "fulfill") return async (options: Parameters<Route['fulfill']>[0]) => {
      const rows = Array.isArray(options?.json) ? options.json : options?.json ? [options.json] : [];
      for (const row of rows) if (row?.id) savedItems.set(row.id, { ...savedItems.get(row.id), ...row });
      return target.fulfill(options);
    };
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } }));
  await page.route(cloudOrigin + "/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rest/v1/words") return routeWords(route);
    if (path === "/rest/v1/rpc/learning_calendar") return route.fulfill({ json: { tracking_since: new Date().toISOString(), days: [] } });
    if (path === "/rest/v1/rpc/record_learning_review") {
      const input = route.request().postDataJSON();
      if (events.has(input.p_event_id)) return route.fulfill({ json: events.get(input.p_event_id) });
      const changes = { due_at: input.p_due_at, interval_days: input.p_interval_days, review_state: input.p_review_state };
      const request = new Proxy(route.request(), { get(target, property) {
        if (property === "method") return () => 'PATCH';
        if (property === "postDataJSON") return () => changes;
        if (property === "url") return () => cloudOrigin + '/rest/v1/words?id=eq.' + input.p_item_id;
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      return words(new Proxy(route, { get(target, property) {
        if (property === "request") return () => request;
        if (property === "fulfill") return async (options: Parameters<Route['fulfill']>[0]) => {
          if (!options?.status || options.status < 400) {
            const item = { ...savedItems.get(input.p_item_id), ...changes, id: input.p_item_id };
            savedItems.set(input.p_item_id, item); events.set(input.p_event_id, item);
            return target.fulfill({ ...options, json: item });
          }
          return target.fulfill(options);
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      } }));
    }
    if (path === "/auth/v1/token") return route.fulfill({ json: session() });
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path === "/auth/v1/logout") return route.fulfill({ json: {} });
    return route.fulfill({
      status: 400,
      json: { message: "Unexpected mocked request" },
    });
  });
}
