import { describe, it, expect } from "vitest";
import { validateReservation } from "../../src/services/reservations.js";
const booking = {
  id: "new",
  name: "Анна",
  date: "2026-10-13",
  time: "19:00",
  guests: 2,
  duration: 90,
  table: "1",
  room: "main",
  source: "В ресторане",
};
describe("Сохранение бронирований", () => {
  it("принимает корректную бронь", () =>
    expect(validateReservation(booking)).toBeNull());
  it.each([
    { name: "" },
    { date: "2026-02-30" },
    { time: "25:30" },
    { guests: 0 },
    { guests: 1.5 },
    { duration: NaN },
    { email: "invalid" },
  ])("отклоняет некорректный ввод %j", (value) =>
    expect(validateReservation({ ...booking, ...value })).toBeTruthy(),
  );
  it("запрещает пересекающиеся брони одного стола", () =>
    expect(
      validateReservation(booking, [{ ...booking, id: "old", time: "18:45" }]),
    ).toMatch(/занят/));
  it("разрешает смену брони на границе интервала", () =>
    expect(
      validateReservation(booking, [{ ...booking, id: "old", time: "17:30" }]),
    ).toBeNull());
  it("разрешает редактирование собственной брони", () =>
    expect(validateReservation(booking, [booking])).toBeNull());
  it("различает одноимённые столы разных залов", () =>
    expect(
      validateReservation(booking, [
        { ...booking, id: "old", room: "terrace" },
      ]),
    ).toBeNull());
  it("не учитывает отменённые брони", () =>
    expect(
      validateReservation(booking, [
        { ...booking, id: "old", status: "Отменено" },
      ]),
    ).toBeNull());
  it("проверяет переход через полночь", () =>
    expect(
      validateReservation({ ...booking, date: "2026-10-14", time: "00:15" }, [
        { ...booking, id: "old", time: "23:30", duration: 90 },
      ]),
    ).toMatch(/занят/));
  it("учитывает блокировку стола", () =>
    expect(validateReservation(booking, [], [], ["main:1"])).toMatch(
      /заблокирован/,
    ));
  it("лист ожидания не занимает стол", () =>
    expect(
      validateReservation({ ...booking, waitlist: true }, [
        { ...booking, id: "old" },
      ]),
    ).toBeNull());
});
describe("Существующие ограничения времени", () => {
  const block = {
    scope: "Весь ресторан",
    sources: ["В ресторане"],
    start: "2026-10-13T18:00",
    end: "2026-10-13T21:00",
    repeat: "Однократно",
  };
  it("применяет исходный формат start/end", () =>
    expect(validateReservation(booking, [], [block])).toMatch(/ограничение/));
  it("применяет ограничение и без выбранного стола", () =>
    expect(validateReservation({ ...booking, table: "" }, [], [block])).toMatch(
      /ограничение/,
    ));
  it("не применяет ограничение другого источника", () =>
    expect(
      validateReservation({ ...booking, source: "Сайт" }, [], [block]),
    ).toBeNull());
  it("применяет ограничения только выбранных столов", () =>
    expect(
      validateReservation(
        booking,
        [],
        [{ ...block, scope: "Выбранные столы", tables: ["2"] }],
      ),
    ).toBeNull());
  it("учитывает день недели повторения", () =>
    expect(
      validateReservation(
        booking,
        [],
        [{ ...block, repeat: "Повторять", days: [1] }],
      ),
    ).toBeNull());
  it("применяет повторение по вторникам", () =>
    expect(
      validateReservation(
        booking,
        [],
        [{ ...block, repeat: "Повторять", days: [2] }],
      ),
    ).toMatch(/ограничение/));
});
