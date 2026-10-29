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
  await page.route(cloudOrigin + "/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rest/v1/words") return words(route);
    if (path === "/auth/v1/token") return route.fulfill({ json: session() });
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path === "/auth/v1/logout") return route.fulfill({ json: {} });
    return route.fulfill({
      status: 400,
      json: { message: "Unexpected mocked request" },
    });
  });
}
