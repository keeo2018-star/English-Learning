import { test, expect } from "@playwright/test";
import {
  mockCloud,
  cloudUrl,
  cloudOrigin,
  sampleWord,
  session,
} from "./helpers/cloud";

test.describe("production UX regressions (mocked service)", () => {
  test.skip(!cloudUrl, "Requires a cloud-configured build");
  test("mobile users can sign out and signed-out state survives reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockCloud(page, (r) => r.fulfill({ json: [] }));
    await page.goto("/library");
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your words belong to you." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your words belong to you." }),
    ).toBeVisible();
  });
  test("long words, emails, and review content fit a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await mockCloud(page, (r) =>
      r.fulfill({
        json: [
          {
            ...sampleWord,
            word: "a".repeat(120),
            meaning: "b".repeat(500),
            example: "c".repeat(500),
          },
        ],
      }),
    );
    for (const path of ["/library", "/review", "/add"]) {
      await page.goto(path);
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeAttached();
      if (path === "/review")
        await page.getByRole("button", { name: "Reveal meaning" }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  });
  test("loading and failed reads never claim the library is empty; retry works", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let fail = true;
    await mockCloud(page, async (r) => {
      await gate;
      await r.fulfill(
        fail
          ? { status: 403, json: { message: "Service unavailable" } }
          : { json: [sampleWord] },
      );
    });
    await page.goto("/library");
    await expect(page.getByText("Loading your library…")).toBeVisible();
    release();
    await expect(page.getByRole("status")).toContainText("Service unavailable");
    await expect(
      page.getByRole("heading", { name: "Your next discovery starts here." }),
    ).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toBeVisible();
  });
  test("failed saves keep the input and allow a successful retry", async ({
    page,
  }) => {
    let fail = true;
    await mockCloud(page, async (r) => {
      if (r.request().method() === "POST")
        return r.fulfill(
          fail
            ? {
                status: 403,
                json: { message: "Saving is temporarily unavailable" },
              }
            : { json: { ...sampleWord, word: "retry-word" } },
        );
      await r.fulfill({ json: [] });
    });
    await page.goto("/add");
    await page.getByLabel("Word or phrase").fill("retry-word");
    await page.getByLabel("Meaning", { exact: true }).fill("Retry meaning");
    await page.getByRole("button", { name: "Add to my library" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Saving is temporarily unavailable",
    );
    await expect(page.getByLabel("Word or phrase")).toHaveValue("retry-word");
    fail = false;
    await page.getByRole("button", { name: "Add to my library" }).click();
    await expect(page.getByRole("status")).toContainText("Word saved");
  });
  test("sign-in accepts existing accounts with six-character passwords", async ({
    page,
  }) => {
    await mockCloud(page, (r) => r.fulfill({ json: [] }), false);
    await page.goto("/auth");
    await page.getByLabel("Email", { exact: true }).fill("signin@example.com");
    await page.getByLabel("Password", { exact: true }).fill("sixsix");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
  });
  test("expired sessions refresh before private data loads", async ({
    page,
  }) => {
    let refreshes = 0;
    page.on("request", (r) => {
      if (r.url().includes("/auth/v1/token?grant_type=refresh_token"))
        refreshes++;
    });
    await mockCloud(page, (r) => r.fulfill({ json: [sampleWord] }), true, {
      ...session(),
      expires_at: Math.floor(Date.now() / 1000) - 60,
    });
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toBeVisible();
    expect(refreshes).toBeGreaterThan(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toBeVisible();
  });
  test("a late review response cannot restore data after another tab signs out", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await mockCloud(page, async (r) => {
      if (r.request().method() === "PATCH") {
        await gate;
        return r.fulfill({ json: { id: sampleWord.id } });
      }
      return r.fulfill({ json: [sampleWord] });
    });
    await page.goto("/review");
    await page.getByRole("button", { name: "Reveal meaning" }).click();
    const pending = page.waitForRequest(
      (r) =>
        r.url().startsWith(cloudOrigin + "/rest/v1/words") &&
        r.method() === "PATCH",
    );
    await page.getByRole("button", { name: "Got it" }).click();
    await pending;
    await page.evaluate(
      (key) => {
        localStorage.removeItem(key);
        const c = new BroadcastChannel(key);
        c.postMessage({ event: "SIGNED_OUT", session: null });
        c.close();
      },
      "sb-" + new URL(cloudUrl!).hostname.split(".")[0] + "-auth-token",
    );
    await expect(
      page.getByRole("heading", { name: "Your words belong to you." }),
    ).toBeVisible();
    const completed = page.waitForResponse(
      (r) =>
        r.url().startsWith(cloudOrigin + "/rest/v1/words") &&
        r.request().method() === "PATCH",
    );
    release();
    await completed;
    await expect(
      page.getByRole("link", { name: "02 Review 0", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your words belong to you." }),
    ).toBeVisible();
  });
  test("empty library and review show useful next actions", async ({
    page,
  }) => {
    await mockCloud(page, (r) => r.fulfill({ json: [] }));
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Your next discovery starts here." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a word" })).toBeVisible();
    await page.goto("/review");
    await expect(
      page.getByRole("heading", { name: "Make room for your first word." }),
    ).toBeVisible();
  });
});
