export function reservationTables(record) {
  const values = Array.isArray(record?.tables)
    ? record.tables
    : record?.table == null || record.table === ""
      ? []
      : [record.table];

  return [...new Set(
    values.map(String).filter((value) => value.trim())
  )];
}

const CLOSED = [
  "Отменено",
  "Отменено гостем",
  "Не пришёл",
  "Отказано",
  "Завершено",
];
export const minutes = (value) => {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
};
const stamp = (date, time) =>
  Date.parse(date + "T00:00:00Z") + minutes(time) * 60000;
export function validateReservation(
  record,
  existing = [],
  blocks = [],
  tableBlocks = [],
) {
  if (!record.name?.trim()) return "Укажите имя гостя";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    Number.isNaN(Date.parse(record.date)) ||
    new Date(record.date + "T00:00:00Z").toISOString().slice(0, 10) !==
      record.date
  )
    return "Укажите корректную дату";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time))
    return "Укажите корректное время";
  if (!Number.isInteger(record.guests) || record.guests < 1)
    return "Количество гостей должно быть положительным целым числом";
  if (
    !Number.isFinite(record.duration) ||
    record.duration < 15 ||
    record.duration > 1440
  )
    return "Длительность должна быть от 15 минут до 24 часов";
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email))
    return "Укажите корректную электронную почту";
  if (record.waitlist || CLOSED.includes(record.status)) return null;
  const room = record.room || "main",
    start = stamp(record.date, record.time),
    end = start + record.duration * 60000;
  const selectedTables = reservationTables(record);
  if (selectedTables.length) {
    if (selectedTables.some((table) => tableBlocks.includes(room + ":" + table)))
      return "Выбранный стол заблокирован";
    const overlap = existing.some(
      (r) =>
        r.id !== record.id &&
        (r.room || "main") === room &&
        reservationTables(r).some((table) => selectedTables.includes(table)) &&
        !CLOSED.includes(r.status) &&
        start < stamp(r.date, r.time) + (r.duration || 90) * 60000 &&
        end > stamp(r.date, r.time),
    );
    if (overlap)
      return "Стол уже занят в выбранное время. Выберите другой стол или время";
  }
  for (const b of blocks) {
    const from = b.start || b.startDate + "T" + b.startTime,
      until = b.end || b.endDate + "T" + b.endTime;
    if (
      b.scope === "Выбранные столы" &&
      (!selectedTables.some((table) => b.tables?.map(String).includes(table)))
    )
      continue;
    const source =
      record.source === "Сайт"
        ? "Онлайн"
        : record.source === "Меню"
          ? "Меню"
          : "В ресторане";
    if (
      b.sources?.length &&
      !b.sources.includes(source) &&
      !b.sources.includes(record.source)
    )
      continue;
    if (b.repeat === "Повторять") {
      if (record.date < from.slice(0, 10) || record.date > until.slice(0, 10))
        continue;
      if (
        b.days?.length &&
        !b.days.includes(new Date(record.date + "T12:00:00").getDay())
      )
        continue;
      const fromMinutes = minutes(from.slice(11, 16)),
        untilMinutes = minutes(until.slice(11, 16));
      const localStart = minutes(record.time),
        localEnd = localStart + record.duration;
      if (localStart < untilMinutes && localEnd > fromMinutes)
        return "На выбранное время установлено ограничение бронирований";
    } else if (
      start < stamp(until.slice(0, 10), until.slice(11, 16)) &&
      end > stamp(from.slice(0, 10), from.slice(11, 16))
    )
      return "На выбранное время установлено ограничение бронирований";
  }
  return null;
}
