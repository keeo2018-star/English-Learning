import { test, expect } from "@playwright/test";
import { mockCloud, cloudUrl, sampleWord } from "./helpers/cloud";
test.describe("shared app design", () => {
  test.skip(
    !cloudUrl,
    "Requires a cloud-configured build for controlled fixtures",
  );
  for (const width of [320, 390, 768, 1440])
    test(`existing routes fit ${width}px and share navigation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockCloud(page, (r) =>
        r.fulfill({
          json: [
            sampleWord,
            {
              ...sampleWord,
              id: "33333333-3333-4333-8333-333333333333",
              word: "eloquent",
              meaning: "Fluent, clear expression",
              interval_days: 3,
            },
            {
              ...sampleWord,
              id: "44444444-4444-4444-8444-444444444444",
              word: "resilient",
              meaning: "Able to recover after difficulty",
              interval_days: 12,
            },
          ],
        }),
      );
      for (const route of [
        "/add",
        "/library",
        "/library?view=new",
        "/library?view=learning",
        "/review",
        "/auth",
        "/auth/reset",
      ]) {
        await page.goto(route);
        const nav = page.getByRole("navigation", { name: "Main navigation" });
        await expect(nav).toBeVisible();
        if (route.startsWith("/library"))
          await expect(
            nav.getByRole("link", { name: "Library", exact: true }),
          ).toHaveAttribute("aria-current", "page");
        if (route === "/review")
          await expect(
            nav.getByRole("link", { name: "Review", exact: true }),
          ).toHaveAttribute("aria-current", "page");
        if (route === "/auth")
          await expect(
            nav.getByRole("link", { name: "Profile", exact: true }),
          ).toHaveAttribute("aria-current", "page");
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (route === "/add")
          await expect(
            page.getByRole("button", { name: "Add to my library" }),
          ).toBeVisible();
        if (route === "/library")
          await expect(
            page.getByRole("heading", { name: "serendipity", exact: true }),
          ).toBeVisible();
        if (route === "/review")
          await expect(
            page.getByRole("button", { name: "Reveal meaning", exact: true }),
          ).toBeVisible();
        if (route === "/auth")
          await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        if (route === "/auth/reset")
          await expect(page.getByLabel("New password")).toBeVisible();
        if ((width === 390 || width === 1440) && !route.includes("?"))
          await page.screenshot({
            animations: "disabled",
            path: `/tmp/wordbook-${route.replaceAll("/", "-")}-${width}.png`,
            fullPage: true,
          });
      }
    });
  test("styled delete confirmation supports cancel, Escape, focus, and confirmed deletion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    let deletes = 0;
    await mockCloud(page, (r) => {
      if (r.request().method() === "DELETE") {
        deletes++;
        return r.fulfill({ json: { id: sampleWord.id } });
      }
      return r.fulfill({ json: [sampleWord] });
    });
    await page.goto("/library");
    const trigger = page.getByRole("button", {
      name: "Delete serendipity",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Delete this word?" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: "/tmp/wordbook-delete-320.png",
      fullPage: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Keep word", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(deletes).toBe(0);
    await trigger.click();
    await dialog
      .getByRole("button", { name: "Keep word", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(deletes).toBe(0);
    await trigger.click();
    await dialog
      .getByRole("button", { name: "Delete word", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toHaveCount(0);
    expect(deletes).toBe(1);
    await expect(page.getByLabel("Search library")).toBeFocused();
  });
  test("auth modes, reset, and not-found use the shared brand and controls", async ({
    page,
  }) => {
    await mockCloud(page, (r) => r.fulfill({ json: [] }), false);
    await page.goto("/auth");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Start your wordbook." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Reset your password." }),
    ).toBeVisible();
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "A word out of place." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to Home", exact: false }),
    ).toBeVisible();
  });
});
