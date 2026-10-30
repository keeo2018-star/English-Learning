import { test, expect } from "@playwright/test";
import { mockCloud, cloudUrl, sampleWord } from "./helpers/cloud";
const words = [
  sampleWord,
  {
    ...sampleWord,
    id: "33333333-3333-4333-8333-333333333333",
    word: "eloquent",
    meaning: "Fluent expression",
    interval_days: 3,
    due_at: "2099-01-01T00:00:00Z",
  },
];
test.describe("Home redesign", () => {
  test.skip(
    !cloudUrl,
    "Requires cloud-configured build for the mocked fixture",
  );
  test("uses real counts without progress bars and preserves library search", async ({
    page,
  }) => {
    await mockCloud(page, (r) => r.fulfill({ json: words }));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Make room for new words." }),
    ).toBeVisible();
    await expect(page.getByText("50% in practice")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(
      page.getByText("1 word is ready for another look."),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search your saved words" })
      .fill("eloquent");
    await page.getByRole("button", { name: "Search your library" }).click();
    await expect(page).toHaveURL(/\/library\?q=eloquent$/);
    await expect(page.getByLabel("Search library")).toHaveValue("eloquent");
    await expect(
      page.getByRole("heading", { name: "eloquent", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });
  test("collection cards open matching read-only views", async ({ page }) => {
    await mockCloud(page, (r) => r.fulfill({ json: words }));
    await page.goto("/");
    await page
      .getByRole("link", { name: "Open Fresh finds", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "eloquent", exact: true }),
    ).toHaveCount(0);
    await page.goto("/");
    await page
      .getByRole("link", { name: "Open In the making", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "eloquent", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "serendipity", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });
  for (const width of [320, 390, 768, 1440])
    test(
      "layout fits " + width + "px and navigation stays usable",
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockCloud(page, (r) => r.fulfill({ json: words }));
        await page.goto("/");
        await expect(page.getByText("50% in practice")).toBeVisible();
        await expect(page.getByRole("progressbar")).toHaveCount(0);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        const nav = page.getByRole("navigation", { name: "Main navigation" });
        for (const name of [
          "Home",
          "Dictionary",
          "Library",
          "Review",
          "Profile",
        ])
          await expect(
            nav.getByRole("link", { name, exact: true }),
          ).toBeVisible();
        await nav
          .getByRole("link", { name: "Dictionary", exact: true })
          .click();
        await expect(
          page.getByRole("searchbox", { name: "Search your saved words" }),
        ).toBeInViewport();
        await page.goto("/");
        await expect(page.getByText("50% in practice")).toBeVisible();
        await expect(page.getByRole("progressbar")).toHaveCount(0);
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `/tmp/wordbook-home-${width}.png`,
            fullPage: true,
          });
      },
    );
  test("failed reads show a retry and do not fabricate progress", async ({
    page,
  }) => {
    await mockCloud(page, (r) =>
      r.fulfill({ status: 403, json: { message: "Unavailable" } }),
    );
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText(
      "Your wordbook couldn’t be loaded",
    );
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });
});
