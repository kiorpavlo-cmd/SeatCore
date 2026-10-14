import { validateReservation } from "../../contracts/reservations.js";
import { AppError } from "../domain/errors.js";

const FIELD_KEYS = [
  "first",
  "last",
  "phone",
  "email",
  "notes",
  "birthday",
  "anniversary",
  "gender",
  "loyalty",
];
const LANGUAGES = new Set(["ru", "en", "uk", "lt"]);
const MODES = new Set(["auto", "area", "table"]);
const STATUS = new Set(["required", "optional", "hidden"]);
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};
const clean = (value, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const safeColor = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
function restaurantTimeZone(data) {
  const requested = data.account?.profile?.timezone || "Europe/Vilnius";
  try {
    new Intl.DateTimeFormat("en", { timeZone: requested });
    return requested;
  } catch {
    return "Europe/Vilnius";
  }
}

export function publicWidgetConfig(data, id) {
  const widget = data.resources?.widgetConfigs?.find(
    (row) => String(row.id) === String(id),
  );
  if (!widget || widget.published !== true)
    throw new AppError(404, "WIDGET_NOT_FOUND", "Виджет не найден");
  const fields = {};
  for (const key of FIELD_KEYS) {
    const field = widget.fields?.[key] || {};
    fields[key] = {
      label: clean(field.label || key, 80),
      status: STATUS.has(field.status)
        ? field.status
        : key === "first"
          ? "required"
          : "optional",
    };
  }
  fields.first.status = "required";
  const profile = data.account?.profile || {};
  const days = clamp(widget.days, 1, 730, 90);
  const rooms = Object.entries(data.app?.rooms || {}).map(([roomId, name]) => ({
    id: roomId,
    name: clean(name, 120),
  }));
  let redirect = "";
  try {
    const url = new URL(widget.redirect);
    if (url.protocol === "https:" && !url.username && !url.password)
      redirect = url.href;
  } catch {}
  return {
    id: String(widget.id),
    name: clean(widget.name || "Бронирование", 80),
    language: LANGUAGES.has(widget.language) ? widget.language : "ru",
    days,
    dateBounds: widgetDateBounds(data, { days }),
    maxGuests: clamp(widget.maxGuests, 1, 100, 8),
    waitlist: ["smart", "always", "disabled"].includes(widget.waitlist)
      ? widget.waitlist
      : "disabled",
    tableMode: MODES.has(widget.tableMode) ? widget.tableMode : "auto",
    fields,
    labels: {
      guests: clean(widget.guestsText || "Гости", 50),
      date: clean(widget.dateText || "Дата", 50),
      time: clean(widget.timeText || "Время", 80),
      button: clean(widget.buttonText || "Забронировать", 80),
      unavailable: clean(
        widget.unavailable || "Сейчас нет свободного времени.",
        300,
      ),
    },
    redirect,
    style: {
      primary: safeColor(widget.primary, "#115cf5"),
      text: safeColor(widget.text, "#172033"),
      background: safeColor(widget.background, "#ffffff"),
      pageBackground: safeColor(widget.pageBackground, "#f5f7fa"),
      slot: safeColor(widget.slot, "#f0f4ff"),
      font: ["Arial", "Verdana", "Georgia", "Tahoma"].includes(widget.font)
        ? widget.font
        : "Arial",
      timeFormat: widget.timeFormat === "12" ? "12" : "24",
      branding: widget.branding !== false,
    },
    restaurant: {
      name: clean(profile.name || "Ресторан", 120),
      phone: clean(profile.phone || "", 40),
    },
    rooms,
  };
}

function validDate(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date
  );
}

export function widgetDateBounds(data, widget) {
  const timeZone = restaurantTimeZone(data);
  let today;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    today = `${value.year}-${value.month}-${value.day}`;
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + widget.days);
  return { today, lastDate: end.toISOString().slice(0, 10) };
}

function validateDateRange(data, widget, date) {
  const { today, lastDate } = widgetDateBounds(data, widget);
  if (!validDate(date) || date < today || date > lastDate)
    throw new AppError(
      422,
      "DATE_UNAVAILABLE",
      "Выберите дату в доступном диапазоне",
    );
}

function reservationDuration(data, guests) {
  const option = (data.resources?.seating || [])
    .filter((row) => {
      const min = Number(row.min) || 1;
      const max = Number(row.max) || 1000;
      const duration = Number(row.duration);
      return (
        guests >= min && guests <= max && duration >= 15 && duration <= 1440
      );
    })
    .sort((a, b) => (Number(a.max) || 1000) - (Number(b.max) || 1000))[0];
  return option ? Number(option.duration) : 90;
}

function timesFor(data, date, duration) {
  const shifts = (data.resources?.shifts || [])
    .filter(
      (shift) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end) &&
        shift.start < shift.end,
    )
    .map((shift) => ({ ...shift, capacity: Number(shift.capacity) || 0 }));
  const ranges = shifts.length
    ? shifts
    : [{ start: "12:00", end: "22:00", capacity: 0 }];
  const times = new Map();
  for (const shift of ranges) {
    const [startHour, startMinute] = shift.start.split(":").map(Number);
    const [endHour, endMinute] = shift.end.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const first = Math.ceil(start / 15) * 15;
    for (let minute = first; minute + duration <= end; minute += 15) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      if (!times.has(time) || (shift.capacity && !times.get(time).capacity))
        times.set(time, shift);
    }
  }
  const { today } = widgetDateBounds(data, { days: 730 });
  if (date === today) {
    const now = new Intl.DateTimeFormat("en-GB", {
      timeZone: restaurantTimeZone(data),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    const minuteNow = Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5));
    for (const time of times.keys()) {
      const [hour, minute] = time.split(":").map(Number);
      if (hour * 60 + minute <= minuteNow) times.delete(time);
    }
  }
  return times;
}

function floorTables(data, guests, roomFilter, tableFilter) {
  const result = [];
  const blocked = new Set(data.blocked || []);
  for (const [room, rows] of Object.entries(data.floor || {})) {
    if (roomFilter && roomFilter !== "all" && roomFilter !== room) continue;
    for (const row of rows || []) {
      if (!Array.isArray(row) || row[0] == null) continue;
      const number = String(row[0]);
      const capacity = Number(row[4]) || 4;
      const minCapacity = Number(row[5]?.minCapacity) || 1;
      if (row[5]?.online === false || capacity < guests || minCapacity > guests)
        continue;
      if (tableFilter && tableFilter !== number) continue;
      if (blocked.has(`${room}:${number}`)) continue;
      result.push({ room, table: number, capacity });
    }
  }
  return result.sort(
    (a, b) =>
      a.capacity - b.capacity ||
      a.table.localeCompare(b.table, undefined, { numeric: true }),
  );
}

function atShiftCapacity(data, date, time, guests, shift) {
  if (!shift?.capacity) return false;
  const used = (data.app?.reservations || [])
    .filter(
      (row) =>
        row.date === date &&
        row.time >= shift.start &&
        row.time < shift.end &&
        ![
          "Отменено",
          "Отменено гостем",
          "Не пришёл",
          "Отказано",
          "Завершено",
        ].includes(row.status),
    )
    .reduce((total, row) => total + (Number(row.guests) || 0), 0);
  return used + guests > shift.capacity;
}

export function availableWidgetSlots(
  data,
  widget,
  { date, guests, room, table },
) {
  validateDateRange(data, widget, date);
  const guestCount = clamp(guests, 1, widget.maxGuests, 2);
  const duration = reservationDuration(data, guestCount);
  const times = timesFor(data, date, duration);
  const shifts = data.resources?.shifts || [];
  return [...times.entries()].map(([time, shift]) => {
    const shiftLimit = atShiftCapacity(data, date, time, guestCount, shift);
    const candidates = shiftLimit
      ? []
      : floorTables(data, guestCount, room, table).filter(
          (candidate) =>
            !validateReservation(
              {
                id: "__availability__",
                name: "Доступность",
                date,
                time,
                guests: guestCount,
                duration,
                room: candidate.room,
                table: candidate.table,
                source: "Сайт",
                status: "Не подтверждено",
              },
              data.app?.reservations || [],
              data.blocks || [],
              data.blocked || [],
            ),
        );
    return { time, available: candidates.length > 0, candidates };
  });
}

export function checkPublicBookingInput(data, widget, body) {
  const values =
    body?.fields &&
    typeof body.fields === "object" &&
    !Array.isArray(body.fields)
      ? body.fields
      : {};
  const normalized = {};
  for (const key of FIELD_KEYS) {
    if (widget.fields[key].status === "hidden") continue;
    const value = clean(
      values[key],
      key === "notes" ? 1000 : key === "email" ? 254 : 120,
    );
    if (widget.fields[key].status === "required" && !value)
      throw new AppError(
        422,
        "FIELD_REQUIRED",
        `Заполните поле «${widget.fields[key].label}»`,
      );
    if (key === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new AppError(422, "INVALID_EMAIL", "Укажите корректный Email");
    if (key === "phone" && value && !/^[+\d() .-]{5,40}$/.test(value))
      throw new AppError(422, "INVALID_PHONE", "Укажите корректный телефон");
    if (value) normalized[key] = value;
  }
  const date = clean(body.date, 10);
  validateDateRange(data, widget, date);
  const guests = Number(body.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > widget.maxGuests)
    throw new AppError(
      422,
      "INVALID_GUEST_COUNT",
      "Выберите корректное количество гостей",
    );
  const time = clean(body.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new AppError(422, "INVALID_TIME", "Выберите время из списка");
  const waitlist = body.waitlist === true;
  const room = clean(body.room || "", 128);
  const table = clean(body.table || "", 128);
  if (widget.tableMode === "area" && !room)
    throw new AppError(422, "ROOM_REQUIRED", "Выберите зал");
  if (widget.tableMode === "table" && (!room || (!table && !waitlist)))
    throw new AppError(422, "TABLE_REQUIRED", "Выберите зал и стол");
  if (waitlist && widget.waitlist === "disabled")
    throw new AppError(422, "WAITLIST_DISABLED", "Лист ожидания недоступен");
  const slots = availableWidgetSlots(data, widget, {
    date,
    guests,
    room: room || "all",
    table: table || "",
  });
  const slot = slots.find((item) => item.time === time);
  if (!slot)
    throw new AppError(422, "TIME_UNAVAILABLE", "Выберите другое время");
  if (waitlist && widget.waitlist === "smart" && slot.available)
    throw new AppError(
      422,
      "WAITLIST_NOT_NEEDED",
      "На это время ещё есть места",
    );
  if (!waitlist && !slot.available)
    throw new AppError(
      409,
      "SLOT_TAKEN",
      "Это время только что заняли. Выберите другое время или лист ожидания",
    );
  const best = slot.candidates[0];
  if (!waitlist && !best)
    throw new AppError(
      409,
      "SLOT_TAKEN",
      "Это время только что заняли. Выберите другое время",
    );
  const name = [normalized.first, normalized.last].filter(Boolean).join(" ");
  const fields = { ...normalized };
  delete fields.first;
  delete fields.last;
  return {
    waitlist,
    record: {
      name,
      date,
      time,
      guests,
      duration: reservationDuration(data, guests),
      room:
        best?.room || room || Object.keys(data.app?.rooms || {})[0] || "main",
      table: waitlist ? "" : best.table,
      tables: waitlist ? [] : [best.table],
      phone: normalized.phone || "",
      email: normalized.email || "",
      notes: normalized.notes || "",
      fields,
      source: "Сайт",
      status: "Не подтверждено",
      walkIn: false,
      notify: false,
      waitlist,
    },
  };
}

export function widgetTimesAndChoices(data, widget, query) {
  const date = clean(query.get("date"), 10);
  const guests = clamp(query.get("guests"), 1, widget.maxGuests, 2);
  const room = clean(query.get("room"), 128);
  const table = clean(query.get("table"), 128);
  const slots = availableWidgetSlots(data, widget, {
    date,
    guests,
    room: room || "all",
    table,
  });
  const rooms = Object.entries(data.app?.rooms || {}).map(([id, name]) => ({
    id,
    name: clean(name, 120),
  }));
  const tables =
    widget.tableMode === "table"
      ? floorTables(data, guests, room || "all", "").map(
          ({ room: roomId, table: number }) => ({ room: roomId, number }),
        )
      : [];
  return {
    slots: slots.map(({ time, available }) => ({ time, available })),
    rooms,
    tables,
  };
}
