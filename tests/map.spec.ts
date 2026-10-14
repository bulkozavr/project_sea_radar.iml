import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");
});

test("renders three vessels", async ({ page }) => {
  await expect(page.locator("[data-vessel-id]")).toHaveCount(3);
});

test("clicking a vessel opens its card", async ({ page }) => {
  const vessel = page.locator("[data-vessel-id]").first();
  const vesselId = await vessel.getAttribute("data-vessel-id");

  expect(vesselId).not.toBeNull();
  await vessel.click();
  await expect(page.getByRole("heading", { name: vesselId!, exact: true })).toBeVisible();
});

test("clicking the same vessel again keeps its card open", async ({ page }) => {
  const vessel = page.locator("[data-vessel-id]").first();
  const vesselId = await vessel.getAttribute("data-vessel-id");

  expect(vesselId).not.toBeNull();
  await vessel.click();
  const cardHeading = page.getByRole("heading", { name: vesselId!, exact: true });
  await expect(cardHeading).toBeVisible();

  await vessel.click();
  await expect(cardHeading).toBeVisible();
});
