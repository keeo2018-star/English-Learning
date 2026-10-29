import { test, expect } from "@playwright/test";

test("mocked missing schema displays the actionable database error", async ({
  page,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  test.skip(!url, "Requires a configured cloud build");
  const origin = new URL(url!).origin;
  const id = "11111111-1111-4111-8111-111111111111";
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "mock@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data: unknown) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ sub: id, exp: expires, role: "authenticated" }) +
    ".mock-signature";
  const storageKey =
    "sb-" + new URL(url!).hostname.split(".")[0] + "-auth-token";
  await page.addInitScript(
    ({ storageKey, session }) =>
      localStorage.setItem(storageKey, JSON.stringify(session)),
    {
      storageKey,
      session: {
        access_token: token,
        refresh_token: "mock-refresh",
        token_type: "bearer",
        expires_at: expires,
        expires_in: 3600,
        user,
      },
    },
  );
  // Every Supabase request is mocked; this test never submits the fake session to the service.
  await page.route(origin + "/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/rest/v1/words"))
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          code: "PGRST205",
          message:
            "Could not find the table 'public.words' in the schema cache",
        }),
      });
    if (path === "/auth/v1/user")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(user),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.goto("/library");
  await expect(page.getByRole("status")).toContainText(
    "Run supabase/schema.sql",
  );
  await expect(
    page.getByRole("heading", { name: "Your library couldn’t be loaded." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});
