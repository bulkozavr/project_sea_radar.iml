import { expect, test } from "@playwright/test";

const SNAPSHOT_URL = "**/api/snapshot";
const BASE_TIME = "2026-01-01T00:00:00.000Z";

function fieldValue(page: import("@playwright/test").Page, label: string) {
  return page.locator("section.vessel-card dt").filter({ hasText: label }).locator("xpath=following-sibling::dd[1]");
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(BASE_TIME) });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");
});

test("demo movement updates marker position and selected card after several ticks", async ({ page }) => {
  const vessel = page.locator('[data-vessel-id="demo-1"]');
  const coordinates = await fieldValue(page, "Координаты");

  await vessel.click();
  await expect(coordinates).toHaveText("51.00000, 1.45000");

  await page.clock.runFor(6_000);

  await expect(vessel).toHaveCount(1);
  await expect(coordinates).toHaveText("51.06000, 1.59000");
});

test("demo vessel stops at route end and card shows final speed, course, and time", async ({ page }) => {
  const vessel = page.locator('[data-vessel-id="demo-1"]');
  await vessel.click();

  await page.clock.runFor(20_000);

  await expect(vessel).toHaveCount(1);
  const coordinates = fieldValue(page, "Координаты");
  const speed = fieldValue(page, "Скорость");
  const course = fieldValue(page, "Курс");
  const timestamp = fieldValue(page, "Время");
  await expect(coordinates).toHaveText("51.14000, 1.79000");
  await expect(speed).toHaveText("0 уз");
  await expect(course).not.toHaveText("Нет данных");
  await expect(course).toHaveText(/^\d+°$/);
  await expect(timestamp).toHaveText(/^\d{2}:\d{2}:\d{2} UTC$/);
  const finalCourse = await course.textContent();
  const finalTimestamp = await timestamp.textContent();

  await page.clock.runFor(10_000);

  await expect(coordinates).toHaveText("51.14000, 1.79000");
  await expect(speed).toHaveText("0 уз");
  await expect(course).toHaveText(finalCourse!);
  await expect(timestamp).toHaveText(finalTimestamp!);
});

test("snapshot error removes vessels and shows literal error messages", async ({ page }) => {
  await page.route(SNAPSHOT_URL, (route) => route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({
      ok: false,
      attemptedAt: "2026-01-01T00:00:01.000Z",
      error: { code: "provider_error", message: "Тестовая ошибка" },
    }),
  }));

  await page.getByRole("button", { name: "Загрузить настоящие позиции" }).click();

  await expect(page.locator("[data-vessel-id]")).toHaveCount(0);
  await expect(page.locator(".source-label")).toHaveText("Данных на карте нет");
  await expect(page.locator(".source-message")).toContainText("Не удалось получить данные: Тестовая ошибка");
});

test("empty snapshot shows literal zero count and empty message", async ({ page }) => {
  await page.route(SNAPSHOT_URL, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      vessels: [],
      collectedAt: "2026-01-01T00:00:01.000Z",
      windowSeconds: 15,
      count: 0,
      truncated: false,
      reason: "window_elapsed",
    }),
  }));

  await page.getByRole("button", { name: "Загрузить настоящие позиции" }).click();

  await expect(page.locator("[data-vessel-id]")).toHaveCount(0);
  await expect(page.locator(".source-label")).toContainText("судов: 0");
  await expect(page.locator(".source-message")).toHaveText("За время сбора позиции не получены");
});

test("snapshot vessel without speed or course shows missing data and neutral icon", async ({ page }) => {
  await page.route(SNAPSHOT_URL, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      vessels: [{
        id: "555000111",
        name: "SYNTHETIC TEST VESSEL",
        lat: 51.01,
        lon: 1.46,
        speedKnots: null,
        courseDeg: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        source: "aisstream",
      }],
      collectedAt: "2026-01-01T00:00:01.000Z",
      windowSeconds: 15,
      count: 1,
      truncated: false,
      reason: "window_elapsed",
    }),
  }));

  await page.getByRole("button", { name: "Загрузить настоящие позиции" }).click();
  const vessel = page.locator('[data-vessel-id="555000111"]');
  await expect(vessel).toHaveAttribute("data-icon", "neutral");
  await vessel.click();

  await expect(fieldValue(page, "Скорость")).toHaveText("Нет данных");
  await expect(fieldValue(page, "Курс")).toHaveText("Нет данных");
});
