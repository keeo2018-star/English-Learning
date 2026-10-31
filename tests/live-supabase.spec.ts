import { test, expect, type Page } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const emailA = process.env.SUPABASE_TEST_EMAIL_A;
const passwordA = process.env.SUPABASE_TEST_PASSWORD_A;
const emailB = process.env.SUPABASE_TEST_EMAIL_B;
const passwordB = process.env.SUPABASE_TEST_PASSWORD_B;

// Route actual browser API calls through the environment's trusted HTTPS proxy.
// No API responses, passwords, or tokens are written to test artifacts.
async function connect(page: Page) {
  const origins = [new URL(url!).origin];
  if (process.env.PLAYWRIGHT_BASE_URL)
    origins.push(new URL(process.env.PLAYWRIGHT_BASE_URL).origin);
  for (const origin of origins)
    await page.route(origin + "/**", async (route) => {
      const request = route.request();
      try {
        const response = await fetch(request.url(), {
          method: request.method(),
          headers: request.headers(),
          body: ["GET", "HEAD"].includes(request.method())
            ? undefined
            : request.postData(),
        });
        const headers = Object.fromEntries(response.headers);
        delete headers["content-encoding"];
        delete headers["content-length"];
        await route.fulfill({
          status: response.status,
          headers,
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch {
        await route.abort("failed");
      }
    });
}
async function signIn(page: Page, email: string, password: string) {
  await connect(page);
  await page.goto("/auth");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByLabel("Search library")).toBeVisible();
}

test.describe("real Supabase", () => {
  test.skip(!url || !key, "Supabase configuration is required");
  test("configured sign-in form reports rejected credentials", async ({
    page,
  }) => {
    await connect(page);
    await page.goto("/auth");
    await page
      .getByLabel("Email", { exact: true })
      .fill("wordbook-invalid@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("invalid-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      /Invalid login credentials/i,
    );
    await expect(page).toHaveURL(/\/auth$/);
  });
  test("single confirmed account lifecycle", async ({ page, browser }) => {
    const email = process.env.SUPABASE_TEST_EMAIL,
      password = process.env.SUPABASE_TEST_PASSWORD;
    test.skip(
      !email || !password,
      "Optional single confirmed test account is not configured",
    );
    test.setTimeout(90000);
    const marker = "wordbook-single-" + Date.now();
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await mobileContext.newPage();
    let token: string | undefined;
    const headers = () => ({
      apikey: key!,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    });
    try {
      await signIn(page, email!, password!);
      token = await page.evaluate(() => {
        const storageKey = Object.keys(localStorage).find(
          (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
        );
        return storageKey
          ? (JSON.parse(localStorage.getItem(storageKey)!)
              .access_token as string)
          : undefined;
      });
      await page.goto("/add");
      await page.getByLabel("Word or phrase").fill(marker);
      await page
        .getByLabel("Meaning", { exact: true })
        .fill("A temporary learning item");
      await page.getByRole("button", { name: "Add to my library" }).click();
      await expect(page.getByRole("status")).toContainText("Word saved");
      await page.goto("/library");
      await page.reload();
      await page.getByLabel("Search library").fill(marker);
      await expect(
        page.getByRole("heading", { name: marker, exact: true }),
      ).toBeVisible();
      // A clean mobile context logs in independently: no copied local storage.
      await signIn(mobile, email!, password!);
      await mobile.getByLabel("Search library").fill(marker);
      await expect(
        mobile.getByRole("heading", { name: marker, exact: true }),
      ).toBeVisible();
      await expect(
        mobile.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
      expect(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByLabel("Search library").fill(marker + "-missing");
      await expect(page.getByText("No matching words.")).toBeVisible();
      await page.goto("/review");
      await expect(
        page
          .locator(".review-card")
          .getByRole("heading", { name: marker, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Reveal meaning" }).click();
      await expect(
        page.locator(".review-card").getByText("A temporary learning item"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Got it" }).click();
      const path = "/rest/v1/words?word=eq." + marker;
      const reviewed = await fetch(new URL(path, url), { headers: headers() });
      expect(reviewed.status).toBe(200);
      const rows = await reviewed.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].interval_days).toBe(1);
      expect(Date.parse(rows[0].due_at)).toBeGreaterThan(Date.now());
      await page.goto("/library");
      await page.getByLabel("Search library").fill(marker);
      await page
        .getByRole("button", { name: "Edit " + marker, exact: true })
        .click();
      await page
        .locator("form.edit-form")
        .getByRole("textbox", { name: "Meaning", exact: true })
        .fill("Updated learning item");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Word updated");
      await page.reload();
      await page.getByLabel("Search library").fill(marker);
      await expect(
        page.getByText("Updated learning item", { exact: true }),
      ).toBeVisible();
      await mobile.reload();
      await mobile.getByLabel("Search library").fill(marker);
      await expect(
        mobile.getByText("Updated learning item", { exact: true }),
      ).toBeVisible();
      const updated = await fetch(new URL(path, url), { headers: headers() });
      expect((await updated.json())[0].meaning).toBe("Updated learning item");
      await page
        .getByRole("button", { name: "Delete " + marker, exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Delete this word?" })
        .getByRole("button", { name: "Delete word", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: marker, exact: true }),
      ).toHaveCount(0);
      await mobile.reload();
      await mobile.getByLabel("Search library").fill(marker);
      await expect(
        mobile.getByRole("heading", { name: marker, exact: true }),
      ).toHaveCount(0);
      const deleted = await fetch(new URL(path, url), { headers: headers() });
      expect(await deleted.json()).toEqual([]);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Your words belong to you." }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Your words belong to you." }),
      ).toBeVisible();
    } finally {
      await mobileContext.close();
      if (token)
        await fetch(new URL("/rest/v1/words?word=eq." + marker, url), {
          method: "DELETE",
          headers: headers(),
        });
    }
  });
  test("two confirmed accounts: persist, search, review, and isolate data", async ({
    browser,
  }) => {
    test.skip(
      process.env.RUN_TWO_ACCOUNT_TESTS !== "1" ||
        !emailA ||
        !passwordA ||
        !emailB ||
        !passwordB,
      "Two confirmed test accounts are required",
    );
    test.setTimeout(90000);
    const contextA = await browser.newContext(),
      contextB = await browser.newContext();
    const a = await contextA.newPage(),
      b = await contextB.newPage();
    const marker = "wordbook-test-" + Date.now();
    let rowId: string | undefined;
    let tokenA: string | undefined;
    const headers = (token: string) => ({
      apikey: key!,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    });
    async function token(page: Page) {
      return page.evaluate(() => {
        const storageKey = Object.keys(localStorage).find(
          (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
        );
        return storageKey
          ? (JSON.parse(localStorage.getItem(storageKey)!)
              .access_token as string)
          : "";
      });
    }
    try {
      await signIn(a, emailA!, passwordA!);
      tokenA = await token(a);
      await a.goto("/add");
      await a.getByLabel("Word or phrase").fill(marker);
      await a
        .getByLabel("Meaning", { exact: true })
        .fill("Live integration test meaning");
      await a.getByRole("button", { name: "Add to my library" }).click();
      await expect(a.getByRole("status")).toContainText("Word saved");
      const own = await fetch(
        new URL("/rest/v1/words?word=eq." + marker + "&select=*", url),
        { headers: headers(tokenA!) },
      );
      expect(own.status).toBe(200);
      const rows = await own.json();
      expect(rows).toHaveLength(1);
      rowId = rows[0].id;
      await a.goto("/library");
      await a.reload();
      await a.getByLabel("Search library").fill(marker);
      await expect(
        a.getByRole("heading", { name: marker, exact: true }),
      ).toBeVisible();
      await a.getByLabel("Search library").fill(marker + "-missing");
      await expect(a.getByText("No matching words.")).toBeVisible();
      await signIn(b, emailB!, passwordB!);
      await b.getByLabel("Search library").fill(marker);
      await expect(
        b.getByRole("heading", { name: marker, exact: true }),
      ).toHaveCount(0);
      const tokenB = await token(b);
      const rowPath = "/rest/v1/words?id=eq." + rowId;
      for (const method of ["GET", "PATCH", "DELETE"]) {
        const response = await fetch(new URL(rowPath, url), {
          method,
          headers: { ...headers(tokenB), Prefer: "return=representation" },
          body:
            method === "PATCH"
              ? JSON.stringify({ meaning: "Unauthorized change" })
              : undefined,
        });
        expect(response.status).toBeLessThan(300);
        expect(await response.json()).toEqual([]);
      }
      const forged = await fetch(new URL("/rest/v1/words", url), {
        method: "POST",
        headers: headers(tokenB),
        body: JSON.stringify({
          word: marker,
          meaning: "Unauthorized insert",
          user_id: rows[0].user_id,
        }),
      });
      expect(forged.status).toBe(403);
      const anonymous = await fetch(new URL(rowPath, url), {
        headers: { apikey: key! },
      });
      expect(anonymous.status).toBe(200);
      expect(await anonymous.json()).toEqual([]);
      await a.goto("/review");
      // Review the newly-created card, which is first in created_at descending order.
      await expect(
        a
          .locator(".review-card")
          .getByRole("heading", { name: marker, exact: true }),
      ).toBeVisible();
      await a.getByRole("button", { name: "Reveal meaning" }).click();
      await expect(
        a.locator(".review-card").getByText("Live integration test meaning"),
      ).toBeVisible();
      await a.getByRole("button", { name: "Got it" }).click();
      const reviewed = await fetch(new URL(rowPath, url), {
        headers: headers(tokenA!),
      });
      const updated = await reviewed.json();
      expect(updated[0].interval_days).toBe(1);
      expect(Date.parse(updated[0].due_at)).toBeGreaterThan(Date.now());
      await a.goto("/library");
      await a.getByLabel("Search library").fill(marker);
      await a
        .getByRole("button", { name: "Delete " + marker, exact: true })
        .click();
      await a
        .getByRole("dialog", { name: "Delete this word?" })
        .getByRole("button", { name: "Delete word", exact: true })
        .click();
      await expect(
        a.getByRole("heading", { name: marker, exact: true }),
      ).toHaveCount(0);
      const deleted = await fetch(new URL(rowPath, url), {
        headers: headers(tokenA!),
      });
      expect(await deleted.json()).toEqual([]);
      await a.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        a.getByRole("heading", { name: "Your words belong to you." }),
      ).toBeVisible();
    } finally {
      if (tokenA)
        await fetch(new URL("/rest/v1/words?word=eq." + marker, url), {
          method: "DELETE",
          headers: headers(tokenA),
        });
      await contextA.close();
      await contextB.close();
    }
  });
});
