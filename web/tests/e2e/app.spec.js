import { test, expect } from "@playwright/test";
const legacy = {
  date: "2026-10-13",
  room: "main",
  tab: "reservations",
  reservations: [
    {
      id: 1,
      name: "Регрессионный гость",
      date: "2026-10-13",
      time: "19:00",
      guests: 2,
      duration: 90,
      table: "1",
      room: "main",
      status: "Не подтверждено",
    },
  ],
  waitlist: [],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("eatapp-ru-demo-v1", JSON.stringify(data));
      sessionStorage.setItem("seeded", "1");
    }
  }, legacy);
});
test("сохраняет исходную бронь и показывает оба зала", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#reserveCount")).toHaveText("1");
  await expect(page.locator("#floorCanvas [data-table-index]")).toHaveCount(23);
  await page
    .getByRole("button", { name: "Летняя терраса", exact: true })
    .click();
  await expect(page.locator("#floorCanvas [data-table-index]")).toHaveCount(9);
  await page.reload();
  await expect(page.locator(".room.active")).toHaveText("Летняя терраса");
});
test("создаёт, редактирует и удаляет тестовую бронь", async ({ page }) => {
  await page.goto("/");
  await page.locator("#newReserve").click();
  await page.locator("#bookingFirst").fill("Тест E2E");
  await page.locator("#bookingTime").fill("21:00");
  await page
    .locator("#bookingMap")
    .getByRole("button", { name: "2", exact: true })
    .click();
  await page.locator("#bookingCreate").click();
  await expect(page.locator("#reserveCount")).toHaveText("2");
  await page.getByText("Тест E2E", { exact: true }).click();
  await page.locator("#bookingLast").fill("Обновлён");
  await page.locator("#bookingCreate").click();
  await expect(
    page.getByText("Тест E2E Обновлён", { exact: true }),
  ).toBeVisible();
  await page.getByText("Тест E2E Обновлён", { exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#deleteBooking").click();
  await expect(page.locator("#reserveCount")).toHaveText("1");
});
test("не создаёт пересечение столов", async ({ page }) => {
  await page.goto("/");
  await page.locator("#newReserve").click();
  await page.locator("#bookingFirst").fill("Пересечение");
  await page.locator("#bookingTime").fill("19:30");
  await page
    .locator("#bookingMap")
    .getByRole("button", { name: "1", exact: true })
    .click();
  const dialog = page.waitForEvent("dialog");
  await page.locator("#bookingCreate").click();
  const warning = await dialog;
  expect(warning.message()).toContain("занят");
  await warning.dismiss();
  await expect(page.locator("#reserveCount")).toHaveText("1");
});
test("переходы не оставляют наложенные страницы", async ({ page }) => {
  for (const [route, id] of [
    ["guests/Список гостей", "guest-root"],
    ["guests/Теги", "guest-root"],
    ["guests/Пользовательские поля", "customField-root"],
    ["account/Профиль ресторана", "account-page"],
    ["account/Пользователи", "account-page"],
    ["account/Права доступа", "permissions-page"],
    ["view/Сетка", "overview-view"],
    ["view/Временная шкала", "overview-view"],
    ["availability/Календарь", "operations-page"],
    ["setup", "setup-page"],
  ]) {
    await page.goto("/#" + encodeURI(route));
    await expect(page.locator("#" + id)).toBeVisible();
    expect(
      await page
        .locator(
          "#guest-root,#customField-root,#account-page,#permissions-page,#overview-view,#operations-page,#setup-page",
        )
        .count(),
    ).toBe(1);
  }
});
test("добавляет гостя и сохраняет после перезагрузки", async ({ page }) => {
  await page.goto("/#guests/" + encodeURIComponent("Список гостей"));
  await page.getByRole("button", { name: "ДОБАВИТЬ ГОСТЯ" }).click();
  await page.locator('#guest-new-guest [name="first"]').fill("Гость E2E");
  await page.getByRole("button", { name: "Создать гостя" }).click();
  await expect(
    page.getByRole("button", { name: "Гость E2E", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Гость E2E", exact: true }),
  ).toBeVisible();
});
test("создаёт настоящую запись смены", async ({ page }) => {
  await page.goto("/#availability/" + encodeURIComponent("Смены"));
  await page.locator("#resource-add").click();
  await page.getByLabel("Название", { exact: true }).fill("Ужин E2E");
  await page.getByLabel("Начало", { exact: true }).fill("18:00");
  await page.getByLabel("Окончание", { exact: true }).fill("23:00");
  await page
    .locator(".operation-dialog")
    .getByRole("button", { name: "Сохранить" })
    .click();
  await expect(
    page.locator(".resource-row").getByText("Ужин E2E", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".resource-row").getByText("Ужин E2E", { exact: true }),
  ).toBeVisible();
});
test("основные страницы работают на узком экране", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#newReserve")).toBeVisible();
  await page.locator("#newReserve").click();
  await expect(page.locator("#bookingCreate")).toBeVisible();
});
