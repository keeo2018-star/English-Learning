import { test, expect, type Page } from "@playwright/test";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const origin = url ? new URL(url).origin : "";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "callback@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const session = () => ({
  access_token:
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }) +
    ".test",
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user,
});
const storageKey = url
  ? "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token"
  : "";
async function mockCloud(page: Page, fail = false) {
  await page.route(origin + "/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/token" || path === "/auth/v1/verify")
      return route.fulfill({
        status: fail ? 400 : 200,
        json: fail
          ? {
              error: "invalid_grant",
              error_description: "Invalid or expired link",
            }
          : session(),
      });
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path === "/rest/v1/words") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 400,
      json: { message: "Unexpected mock request" },
    });
  });
}
async function verifier(page: Page, flowId?: string) {
  await page.addInitScript(
    ({ key, flowId }) =>
      localStorage.setItem(
        key + (flowId ? "-flow-" + flowId : "") + "-code-verifier",
        JSON.stringify("test-verifier"),
      ),
    { key: storageKey, flowId },
  );
}
test.describe("auth callback (mocked service)", () => {
  test.skip(!url, "Requires a Supabase-configured build");
  test("exchanges PKCE code once and persists the session", async ({
    page,
  }) => {
    await mockCloud(page);
    await verifier(page);
    let exchanges = 0;
    page.on("request", (r) => {
      if (r.url().includes("/auth/v1/token?grant_type=pkce")) {
        exchanges++;
        expect(r.postDataJSON()).toMatchObject({
          auth_code: "test-code",
          code_verifier: "test-verifier",
        });
      }
    });
    const response = await page.goto("/auth/callback?code=test-code");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByLabel("Search library")).toBeVisible();
    expect(exchanges).toBe(1);
    expect(
      await page.evaluate(
        (key) =>
          !!JSON.parse(localStorage.getItem(key) || "null")?.access_token,
        storageKey,
      ),
    ).toBe(true);
  });
  test("uses a flow-specific PKCE verifier", async ({ page }) => {
    const flowId = "11111111222243338444555555555555";
    await mockCloud(page);
    await verifier(page, flowId);
    await page.goto("/auth/callback?code=test-code&sb_flow_id=" + flowId);
    await expect(page).toHaveURL(/\/library$/);
  });
  test("supports legacy implicit session links", async ({ page }) => {
    await mockCloud(page);
    const data = session();
    await page.goto(
      "/auth/callback#" +
        new URLSearchParams({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          type: "signup",
        }),
    );
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByLabel("Search library")).toBeVisible();
  });
  test("older emails targeting library still establish a session", async ({
    page,
  }) => {
    await mockCloud(page);
    const data = session();
    await page.goto(
      "/library#" +
        new URLSearchParams({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: "3600",
          token_type: "bearer",
          type: "signup",
        }),
    );
    await expect(page.getByLabel("Search library")).toBeVisible();
    expect(
      await page.evaluate(
        (key) =>
          !!JSON.parse(localStorage.getItem(key) || "null")?.access_token,
        storageKey,
      ),
    ).toBe(true);
  });
  test("supports token-hash email templates and prevents external redirects", async ({
    page,
  }) => {
    await mockCloud(page);
    await page.goto(
      "/auth/confirm?token_hash=test-hash&type=signup&next=https://example.com",
    );
    await expect(page).toHaveURL(/\/library$/);
  });
  test("routes recovery sessions to password reset", async ({ page }) => {
    await mockCloud(page);
    await verifier(page);
    await page.goto("/auth/callback?code=test-code&next=/auth/reset");
    await expect(page).toHaveURL(/\/auth\/reset$/);
    await expect(page.getByLabel("New password")).toBeVisible();
  });
  for (const path of [
    "/auth/callback",
    "/auth/callback?code=invalid",
    "/auth/callback#error=access_denied&error_code=otp_expired",
  ]) {
    test(
      "failed callback shows a clear sign-in error: " + path,
      async ({ page }) => {
        await mockCloud(page, true);
        await verifier(page);
        await page.goto(path);
        await expect(page).toHaveURL(/\/auth\?error=auth_callback$/);
        await expect(page.getByRole("status")).toContainText(
          "We couldn’t complete the email confirmation",
        );
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
      },
    );
  }
  test("sign-up uses the production origin and callback path", async ({
    page,
  }) => {
    const production = "https://wordbook-test.vercel.app";
    // Serve our built app at a simulated production origin, without external traffic.
    await page.route(production + "/**", async (route) => {
      const target = new URL(route.request().url());
      const local = new URL(test.info().project.use.baseURL as string);
      const response = await route.fetch({
        url: local.origin + target.pathname + target.search,
      });
      await route.fulfill({ response });
    });
    let redirect = "";
    await page.route(origin + "/**", (route) => {
      const target = new URL(route.request().url());
      if (target.pathname === "/auth/v1/signup") {
        redirect = target.searchParams.get("redirect_to") || "";
        return route.fulfill({ json: { ...user, identities: [] } });
      }
      if (target.pathname === "/auth/v1/token")
        return route.fulfill({ json: session() });
      if (target.pathname === "/auth/v1/user")
        return route.fulfill({ json: user });
      return route.fulfill({ json: [] });
    });
    await page.goto(production + "/auth");
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill("callback@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-password-123");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    expect(new URL(redirect).origin).toBe(production);
    expect(new URL(redirect).pathname).toBe("/auth/callback");
    const callback = new URL(redirect);
    callback.searchParams.set("code", "production-test-code");
    await page.goto(callback.toString());
    await expect(page).toHaveURL(production + "/library");
    await expect(page.getByLabel("Search library")).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
  });
});
