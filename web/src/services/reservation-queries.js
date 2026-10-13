import { reservationGuestTags } from "./guest-tags.js";
export const SEATED = [
  "За столом",
  "Частично посажены",
  "Закуска",
  "Основное блюдо",
  "Десерт",
  "Счёт выдан",
  "Уборка требуется",
  "Уборка выполняется",
];
const CLOSED = [
  "Завершено",
  "Отменено",
  "Отменено гостем",
  "Не пришёл",
  "Отказано",
];
export const totalGuests = (list) =>
  list.reduce((sum, row) => sum + (Number(row.guests) || 0), 0);
export function filterReservations(
  list,
  {
    query = "",
    seated = false,
    coming = false,
    filters = {},
    room = "all",
    waitlistType = "",
    shift = "",
    shifts = [],
    guests = { guests: [], tags: [] },
  } = {},
) {
  const chosenShift = shifts.find((x) => x.id === shift);
  return list
    .filter((row) => {
      const status = row.status || "Не подтверждено";
      return (
        [row.name, row.phone, row.email, row.table]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!(seated || coming) ||
          (seated && SEATED.includes(status)) ||
          (coming && !SEATED.includes(status) && !CLOSED.includes(status))) &&
        (!filters.statuses?.length || filters.statuses.includes(status)) &&
        (!filters.rooms?.length ||
          filters.rooms.includes(row.room || "main")) &&
        (!filters.shifts?.length ||
          shifts.some(
            (s) =>
              filters.shifts.includes(String(s.id)) &&
              row.time >= s.start &&
              row.time < s.end,
          )) &&
        (!filters.sources?.length ||
          filters.sources.includes(row.source || "В ресторане")) &&
        (!filters.tags?.length ||
          filters.tags.some((tag) =>
            String(row.tags || "")
              .split(",")
              .map((x) => x.trim())
              .includes(tag),
          )) &&
        (!filters.guestTags?.length ||
          filters.guestTags.some((tag) =>
            reservationGuestTags(row, guests).includes(tag),
          )) &&
        (!filters.employees?.length ||
          filters.employees.includes(row.employee)) &&
        (!filters.types?.length ||
          filters.types.includes(
            row.walkIn
              ? "Без бронирования"
              : row.source === "Сайт"
                ? "Онлайн"
                : "В ресторане",
          )) &&
        (room === "all" || (row.room || "main") === room) &&
        (!chosenShift ||
          (row.time >= chosenShift.start && row.time < chosenShift.end)) &&
        (!waitlistType ||
          (waitlistType === "Без записи" && row.walkIn) ||
          (waitlistType === "Онлайн" && row.source === "Сайт") ||
          (waitlistType === "Подтверждены" &&
            status.startsWith("Подтверждено")))
      );
    })
    .sort(
      (a, b) =>
        (filters.descending ? -1 : 1) *
        (filters.sort === 2
          ? a.name.localeCompare(b.name, "ru")
          : filters.sort === 3
            ? a.guests - b.guests
            : filters.sort === 1
              ? createdTime(a) - createdTime(b)
              : String(a.time || "").localeCompare(String(b.time || ""))),
    );
}
export function groupReservations(list, mode = 0, rooms = {}, shifts = []) {
  const groups = new Map();
  for (const row of list) {
    const status = row.status || "Не подтверждено";
    const cycle = CLOSED.includes(status)
      ? "Завершены"
      : SEATED.includes(status)
        ? "В обслуживании"
        : "Ожидаются";
    const shift =
      shifts.find((s) => row.time >= s.start && row.time < s.end)?.name ||
      "Без смены";
    const room = rooms[row.room || "main"] || "Основной зал";
    const keys = [
      cycle + " · " + shift,
      cycle + " · " + status,
      cycle + " · " + room,
      shift + " · " + status,
      shift,
      status,
      room,
      cycle,
      "Бронирования",
    ];
    const key = keys[mode] || keys[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([name, records]) => ({ name, records }));
}

function createdTime(row) {
  const value = row.createdAt ?? row.id;
  return Number(value) || Date.parse(value) || 0;
}
