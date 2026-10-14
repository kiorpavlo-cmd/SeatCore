import { reservationGuestTags } from "../../services/guest-tags.js";
import { escapeHTML as esc } from "../../lib/dom.js";
import { minutes } from "../../services/reservations.js";
import { SEATED } from "../../services/reservation-queries.js";
import { readResources, readGuests } from "../../services/repositories.js";
const LABELS = {
  none: "Без подписи",
  upcoming: "Все ожидаемые",
  upcomingCovers: "Ожидаемые и гости",
  covers: "Гости",
  shift: "Ожидаемые в смене",
  shiftCovers: "В смене и гости",
  id: "ID бронирования",
  next: "Следующее бронирование",
  nextCovers: "Следующее и гости",
  server: "Официант",
  elapsed: "Прошло времени",
  remaining: "Осталось времени",
  capacity: "Вместимость стола",
  abbreviated: "Инициалы гостя",
  guest: "Имя гостя",
  tags: "Теги бронирования",
  guestTags: "Теги гостя",
  status: "Статус",
};
export function tableLabel(
  mode,
  { bookings, server, capacity, time, shifts = [] },
) {
  const active = bookings.find(
    (r) =>
      minutes(time) >= minutes(r.time) &&
      minutes(time) < minutes(r.time) + (Number(r.duration) || 90),
  );
  const upcoming = bookings
    .filter(
      (r) => minutes(r.time) >= minutes(time) && !SEATED.includes(r.status),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const row =
    active || upcoming[0] || bookings.find((r) => SEATED.includes(r.status));
  const shift = shifts.find((s) => time >= s.start && time < s.end);
  const inShift = upcoming.filter(
    (r) => shift && r.time >= shift.start && r.time < shift.end,
  );
  const covers = (list) => list.reduce((n, r) => n + Number(r.guests || 0), 0);
  switch (mode) {
    case "upcoming":
      return upcoming.length ? String(upcoming.length) : "";
    case "upcomingCovers":
      return upcoming.length
        ? `${upcoming.length} · ${covers(upcoming)} гостей`
        : "";
    case "shift":
      return inShift.length ? String(inShift.length) : "";
    case "shiftCovers":
      return inShift.length
        ? `${inShift.length} · ${covers(inShift)} гостей`
        : "";
    case "covers":
      return row ? String(row.guests) : "";
    case "id":
      return row ? String(row.id) : "";
    case "next":
      return upcoming[0]?.time || "";
    case "nextCovers":
      return upcoming[0] ? `${upcoming[0].time} · ${upcoming[0].guests}` : "";
    case "server":
      return server?.name || "";
    case "elapsed":
      return active
        ? `${Math.max(0, minutes(time) - minutes(active.time))} мин`
        : "";
    case "remaining":
      return active
        ? `${Math.max(0, minutes(active.time) + (Number(active.duration) || 90) - minutes(time))} мин`
        : "";
    case "capacity":
      return capacity ? String(capacity) : "";
    case "guest":
      return row?.name || "";
    case "abbreviated":
      return (
        row?.name
          ?.split(/\s+/)
          .map((n) => n[0] + ".")
          .join(" ") || ""
      );
    case "guestTags":
      return row ? reservationGuestTags(row, readGuests()).join(", ") : "";
    case "tags":
      return row?.tags || "";
    case "status":
      return row?.status || "";
    default:
      return "";
  }
}
export function openTableLabels(app) {
  const settings = app.state.tableLabels || {
    size: "small",
    top: "upcoming",
    bottom: "none",
    middle: "status",
  };
  const dialog = app.floor.dialog(
    "Подписи столов",
    `<label>Размер подписи<select id="label-size">${[
      ["large", "Крупный"],
      ["small", "Маленький"],
      ["tiny", "Очень маленький"],
    ]
      .map(
        ([value, name]) =>
          `<option value="${value}" ${settings.size === value ? "selected" : ""}>${name}</option>`,
      )
      .join("")}</select></label>${[
      ["top", "Верхняя подпись"],
      ["bottom", "Нижняя подпись"],
      ["middle", "Средняя подпись"],
    ]
      .map(
        ([key, name]) =>
          `<label class="settings-field">${name}<select id="label-${key}">${Object.entries(
            LABELS,
          )
            .map(
              ([value, title]) =>
                `<option value="${value}" ${settings[key] === value ? "selected" : ""}>${esc(title)}</option>`,
            )
            .join("")}</select></label>`,
      )
      .join("")}`,
    '<button class="green" id="apply-labels">Применить подписи</button>',
  );
  dialog.querySelector(".booking-dialog")
    .classList.add("mio-table-labels-dialog");
  dialog.querySelector("#apply-labels").onclick = () => {
    app.state.tableLabels = Object.fromEntries(
      ["size", "top", "bottom", "middle"].map((key) => [
        key,
        dialog.querySelector(`#label-${key}`).value,
      ]),
    );
    app.save();
    app.floor.closeDialog();
    app.render();
  };
}
export const labelShifts = () => readResources().shifts || [];
