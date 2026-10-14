import { describe, it, expect } from "vitest";
import { filterReservations } from "../../src/services/reservation-queries.js";
import { tableLabel } from "../../src/features/floor/labels.js";
import { availableTables } from "../../src/services/view-availability.js";
import { validateFloorImport } from "../../src/features/floor/import-validator.js";
const rows = [
  {
    id: 1,
    name: "Анна",
    phone: "37060000000",
    email: "anna@test.example",
    room: "main",
    table: "1",
    time: "08:15",
    date: "2026-10-13",
    duration: 45,
    guests: 2,
    status: "Подтверждено",
    tags: "VIP",
    source: "Телефон",
    createdAt: "2026-10-10T12:00:00Z",
  },
  {
    id: 2,
    name: "Борис",
    room: "terrace",
    table: "1",
    time: "19:00",
    date: "2026-10-13",
    duration: 120,
    guests: 4,
    status: "За столом",
    createdAt: "2026-10-11T12:00:00Z",
  },
];
describe("Регрессии раздела View", () => {
  it("находит гостя по телефону и почте", () => {
    expect(filterReservations(rows, { query: "370600" })).toHaveLength(1);
    expect(filterReservations(rows, { query: "anna@" })).toHaveLength(1);
  });
  it("сортирует даты создания ISO в обратном порядке", () =>
    expect(
      filterReservations(rows, { filters: { sort: 1, descending: true } }).map(
        (r) => r.id,
      ),
    ).toEqual([2, 1]));
  it("совместно применяет теги, источник и смену", () =>
    expect(
      filterReservations(rows, {
        filters: { tags: ["VIP"], sources: ["Телефон"], shifts: ["am"] },
        shifts: [{ id: "am", start: "00:00", end: "12:00" }],
      }).map((r) => r.id),
    ).toEqual([1]));
  it("вычисляет доступность с учётом длительности и разных залов", () => {
    const options = {
      positions: {
        main: [["1", 0, 0, "side", 4]],
        terrace: [["1", 0, 0, "side", 4]],
      },
      reservations: rows,
      date: "2026-10-13",
      time: "08:30",
      guests: 2,
      duration: 30,
    };
    expect(availableTables(options).map((t) => t.room)).toEqual(["terrace"]);
    expect(availableTables({ ...options, time: "09:00" })).toHaveLength(2);
  });
  it("исключает блокировки и не выдумывает неизвестную вместимость", () =>
    expect(
      availableTables({
        positions: {
          main: [
            ["1", 0, 0, "side", 4],
            ["2", 0, 0],
          ],
        },
        reservations: [],
        blocked: ["main:1"],
        date: "2026-10-13",
        time: "08:30",
      }),
    ).toEqual([]));
  it("рассчитывает таймер и подписи следующей брони", () => {
    const context = { bookings: rows.slice(0, 1), time: "08:30" };
    expect(tableLabel("remaining", context)).toBe("30 мин");
    expect(tableLabel("elapsed", context)).toBe("15 мин");
    expect(tableLabel("nextCovers", { ...context, time: "08:00" })).toBe(
      "08:15 · 2",
    );
  });
  it("импортирует дополнительные залы и метаданные названий", () =>
    expect(
      validateFloorImport({
        positions: { custom: [["A", 12, 40, "round", 3]] },
        rooms: { custom: "Зал" },
      }).rooms.custom,
    ).toBe("Зал"));
  it("отклоняет дубликаты и неверные координаты до изменения плана", () => {
    expect(() =>
      validateFloorImport({
        main: [
          ["1", 0, 0],
          ["1", 1, 1],
        ],
      }),
    ).toThrow(/Повторяющиеся/);
    expect(() => validateFloorImport({ main: [["1", -1, 0]] })).toThrow(
      /Некорректный/,
    );
  });
});

it("фильтрует теги из связанного профиля гостя", () =>
  expect(
    filterReservations(rows, {
      filters: { guestTags: ["Постоянный"] },
      guests: {
        guests: [{ id: "g1", phone: "+370 600 00 000", tagIds: ["t1"] }],
        tags: [{ id: "t1", name: "Постоянный" }],
      },
    }).map((r) => r.id),
  ).toEqual([1]));
