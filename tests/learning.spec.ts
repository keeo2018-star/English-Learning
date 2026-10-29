import { test, expect } from "@playwright/test";
test.skip(
  !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  "Demo tests require a demo build",
);
test("collect, persist, search, review, and delete a word in local demo", async ({
  page,
}) => {
  await page.goto("/add");
  await expect(page.getByText("Demo mode ·")).toBeVisible();
  await page.getByLabel("Word or phrase").fill("serendipity");
  await page
    .getByLabel("Meaning", { exact: true })
    .fill("A happy discovery by chance");
  await page
    .getByLabel("Example sentence")
    .fill("Finding this book was serendipity.");
  await page.getByRole("button", { name: "Add to my library" }).click();
  await expect(page.getByRole("status")).toContainText("Word saved");
  await page.getByRole("link", { name: "03 Library" }).click();
  await expect(
    page.getByRole("heading", { name: "serendipity" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "serendipity" }),
  ).toBeVisible();
  await page.getByLabel("Search library").fill("unmatched");
  await expect(page.getByText("No matching words.")).toBeVisible();
  await page.getByLabel("Search library").fill("happy");
  await expect(
    page.getByRole("heading", { name: "serendipity" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /02 Review/ }).click();
  await expect(
    page.locator(".review-card").getByText("A happy discovery by chance"),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Reveal meaning" }).click();
  await expect(
    page.locator(".review-card").getByText("A happy discovery by chance"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "03 Library" }).click();
  await page
    .getByRole("button", { name: "Edit serendipity", exact: true })
    .click();
  await page
    .locator("form.edit-form")
    .getByRole("textbox", { name: "Meaning", exact: true })
    .fill("A fortunate discovery");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Word updated");
  await page.reload();
  await expect(
    page.getByText("A fortunate discovery", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete serendipity" }).click();
  await expect(page.getByText("0 words collected")).toBeVisible();
});
test("empty review and unconfigured account are usable", async ({ page }) => {
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { name: "Make room for your first word." }),
  ).toBeVisible();
  await page.goto("/auth");
  await expect(
    page.getByText("Cloud accounts aren’t configured yet."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore the local demo" }).click();
  await expect(page.getByLabel("Word or phrase")).toBeVisible();
});
test("mobile navigation and form fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/add");
  await expect(page.getByLabel("Word or phrase")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "03 Library" }).click();
  await expect(
    page.getByRole("heading", { name: "Your growing vocabulary." }),
  ).toBeVisible();
});
