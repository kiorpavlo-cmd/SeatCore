import { describe, it, expect } from "vitest";
import {
  filterReservations,
  groupReservations,
} from "../../src/services/reservation-queries.js";
const rows = [
  {
    id: 1,
    name: "Анна",
    time: "19:00",
    guests: 2,
    room: "main",
    status: "За столом",
  },
  {
    id: 2,
    name: "Борис",
    time: "21:00",
    guests: 4,
    room: "terrace",
    status: "Отменено",
  },
  {
    id: 3,
    name: "Вера",
    time: "20:00",
    guests: 3,
    room: "terrace",
    status: "Подтверждено",
    source: "Сайт",
  },
];
describe("Общие фильтры представлений", () => {
  it("показывает только посаженных гостей", () =>
    expect(filterReservations(rows, { seated: true }).map((x) => x.id)).toEqual(
      [1],
    ));
  it("не показывает отмены среди ожидаемых", () =>
    expect(filterReservations(rows, { coming: true }).map((x) => x.id)).toEqual(
      [3],
    ));
  it("фильтрует онлайн-лист ожидания", () =>
    expect(
      filterReservations(rows, { waitlistType: "Онлайн" }).map((x) => x.id),
    ).toEqual([3]));
  it("применяет выбранную смену к временным представлениям", () =>
    expect(
      filterReservations(rows, {
        shift: "early",
        shifts: [{ id: "early", start: "18:00", end: "20:00" }],
      }).map((x) => x.id),
    ).toEqual([1]));
  it("группирует по названиям дополнительных залов", () =>
    expect(
      groupReservations(rows, 6, { main: "Зал", terrace: "Терраса" }).map(
        (x) => [x.name, x.records.length],
      ),
    ).toEqual([
      ["Зал", 1],
      ["Терраса", 2],
    ]));
  it("различает циклы обслуживания", () =>
    expect(groupReservations(rows, 7).map((x) => x.name)).toEqual([
      "В обслуживании",
      "Завершены",
      "Ожидаются",
    ]));
});
