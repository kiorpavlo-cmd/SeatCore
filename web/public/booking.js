const root = document.querySelector("#booking-root");
const params = new URLSearchParams(location.search);
const widgetId = params.get("widget");
const copy = {
  ru: {
    title: "Забронируйте столик",
    subtitle: "Будем рады видеть вас в гостях",
    room: "Зал",
    table: "Стол",
    time: "Выберите время",
    waitlist: "Записаться в лист ожидания",
    unavailable: "Это время занято. Можно оставить заявку в лист ожидания.",
    empty: "На эту дату нет доступного времени.",
    guestData: "Данные гостя",
    submit: "Продолжить",
    confirm: "Отправить бронирование",
    success: "Заявка отправлена ресторану.",
    waiting: "Вы добавлены в лист ожидания. Ресторан свяжется с вами.",
    back: "← Изменить дату и время",
    error: "Не удалось загрузить данные. Попробуйте обновить страницу.",
    missing: "Ссылка на виджет некорректна или виджет снят с публикации.",
    name: "Имя",
    date: "Дата",
    guests: "Гости",
    retry: "Повторить",
  },
  en: {
    title: "Book a table",
    subtitle: "We look forward to seeing you",
    room: "Area",
    table: "Table",
    time: "Choose a time",
    waitlist: "Join the waitlist",
    unavailable: "This time is full. You can join the waitlist.",
    empty: "No times are available for this date.",
    guestData: "Guest details",
    submit: "Continue",
    confirm: "Send booking",
    success: "Your request has been sent to the restaurant.",
    waiting: "You joined the waitlist. The restaurant will contact you.",
    back: "← Change date and time",
    error: "Could not load data. Please refresh the page.",
    missing: "This widget link is invalid or unpublished.",
    name: "Name",
    date: "Date",
    guests: "Guests",
    retry: "Try again",
  },
  uk: {
    title: "Забронюйте столик",
    subtitle: "Будемо раді бачити вас",
    room: "Зал",
    table: "Стіл",
    time: "Оберіть час",
    waitlist: "Записатися до списку очікування",
    unavailable: "Цей час зайнятий. Можна залишити заявку в списку очікування.",
    empty: "На цю дату немає вільного часу.",
    guestData: "Дані гостя",
    submit: "Продовжити",
    confirm: "Надіслати бронювання",
    success: "Заявку надіслано ресторану.",
    waiting: "Вас додано до списку очікування. Ресторан зв’яжеться з вами.",
    back: "← Змінити дату й час",
    error: "Не вдалося завантажити дані. Спробуйте оновити сторінку.",
    missing: "Посилання на віджет неправильне або віджет знято з публікації.",
    name: "Ім’я",
    date: "Дата",
    guests: "Гості",
    retry: "Спробувати ще раз",
  },
  lt: {
    title: "Rezervuokite staliuką",
    subtitle: "Lauksime jūsų atvykstant",
    room: "Salė",
    table: "Stalas",
    time: "Pasirinkite laiką",
    waitlist: "Įtraukti į laukiančiųjų sąrašą",
    unavailable:
      "Šis laikas užimtas. Galite užsiregistruoti į laukiančiųjų sąrašą.",
    empty: "Šią dieną laisvų laikų nėra.",
    guestData: "Svečio duomenys",
    submit: "Tęsti",
    confirm: "Siųsti rezervaciją",
    success: "Prašymas išsiųstas restoranui.",
    waiting: "Įtraukėme jus į laukiančiųjų sąrašą. Restoranas susisieks.",
    back: "← Keisti datą ir laiką",
    error: "Nepavyko įkelti duomenų. Atnaujinkite puslapį.",
    missing: "Nuoroda neteisinga arba valdiklis nepublikuotas.",
    name: "Vardas",
    date: "Data",
    guests: "Svečiai",
    retry: "Bandyti dar kartą",
  },
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
let widget;
let date;
let guests = 2;
let room = "";
let table = "";
let selectedTime = "";
let slots = [];
let waitlistIntent = false;
let step = "booking";

function words() {
  return copy[widget?.language] || copy.ru;
}
function baseUrl() {
  return `/api/public/widgets/${encodeURIComponent(widgetId)}`;
}
async function request(path = "", options = {}) {
  const response = await fetch(baseUrl() + path, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || words().error);
  return payload;
}
function label(key, fallback) {
  return widget.labels?.[key] || fallback;
}
function roomChoices() {
  return `<option value="">${esc(words().room)}</option>${(widget.rooms || []).map((item) => `<option value="${esc(item.id)}" ${room === item.id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
}
function timeLabel(value) {
  if (widget.style.timeFormat !== "12") return value;
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}
function powered() {
  return widget.style.branding
    ? '<p class="booking-powered">Работает на <strong>SeatCore</strong></p>'
    : "";
}
function fieldControl(key, field) {
  const type =
    key === "phone"
      ? "tel"
      : key === "email"
        ? "email"
        : ["birthday", "anniversary"].includes(key)
          ? "date"
          : "text";
  const required = field.status === "required" ? "required" : "";
  const name = key === "first" ? words().name : field.label;
  const labelText = `${esc(field.label || name)}${required ? " *" : ""}`;
  if (key === "notes")
    return `<label class="booking-field">${labelText}<textarea name="${key}" maxlength="1000"></textarea></label>`;
  return `<label class="booking-field">${labelText}<input name="${key}" type="${type}" maxlength="${key === "email" ? 254 : 120}" ${required}></label>`;
}
function slotMarkup() {
  if (!slots.length)
    return `<p class="booking-empty">${esc(label("unavailable", words().empty))}</p>`;
  return `<div class="booking-slots">${slots
    .map((slot) => {
      const unavailable = !slot.available;
      const disabled = unavailable && widget.waitlist === "disabled";
      const status = unavailable ? words().unavailable : slot.time;
      return `<button class="booking-time${unavailable ? " unavailable" : ""}" type="button" data-time="${esc(slot.time)}" style="--booking-slot:${esc(widget.style.slot)}" aria-label="${esc(timeLabel(slot.time))}: ${esc(status)}" aria-pressed="${selectedTime === slot.time}" ${disabled ? "disabled" : ""}>${esc(timeLabel(slot.time))}</button>`;
    })
    .join("")}</div>`;
}
function frame(content) {
  root.innerHTML = `<article class="booking-card"><p class="booking-brand">${esc(widget.restaurant.name)}</p>${content}${powered()}</article>`;
  const card = root.querySelector(".booking-card");
  card.style.setProperty("--booking-primary", widget.style.primary);
  card.style.color = widget.style.text;
  card.style.background = widget.style.background;
  card.style.fontFamily = widget.style.font;
  document.body.style.background = widget.style.pageBackground;
}
function renderBooking(message = "") {
  const roomField =
    widget.tableMode === "auto"
      ? ""
      : `<label class="booking-field">${esc(words().room)}<select name="room" required>${roomChoices()}</select></label>`;
  const tableField =
    widget.tableMode === "table"
      ? `<label class="booking-field">${esc(words().table)}<select name="table" required><option value="">${esc(words().table)}</option>${(
          window.availability?.tables || []
        )
          .filter((item) => !room || item.room === room)
          .map(
            (item) =>
              `<option value="${esc(item.number)}" ${table === item.number ? "selected" : ""}>${esc(item.number)}</option>`,
          )
          .join("")}</select></label>`
      : "";
  const waitlistOption =
    widget.waitlist === "always"
      ? `<label class="booking-field"><span><input type="checkbox" name="waitlist" ${waitlistIntent ? "checked" : ""}> ${esc(words().waitlist)}</span></label>`
      : "";
  const error = message
    ? `<p class="booking-message error" role="alert">${esc(message)}</p>`
    : "";
  const buttonText =
    selectedTime &&
    slots.find((slot) => slot.time === selectedTime && !slot.available) &&
    widget.waitlist === "smart"
      ? words().waitlist
      : label("button", words().submit);
  frame(
    `<h1>${esc(words().title)}</h1><p class="booking-subtitle">${esc(words().subtitle)}</p>${error}<div class="booking-grid"><label class="booking-field">${esc(label("guests", words().guests))}<select name="guests">${Array.from({ length: widget.maxGuests }, (_, index) => `<option value="${index + 1}" ${guests === index + 1 ? "selected" : ""}>${index + 1}</option>`).join("")}</select></label><label class="booking-field">${esc(label("date", words().date))}<input name="date" type="date" value="${esc(date)}" min="${esc(widget.dateBounds.today)}" max="${esc(widget.dateBounds.lastDate)}" required></label>${roomField}${tableField}</div><h2 class="booking-section-title">${esc(label("time", words().time))}</h2>${slotMarkup()}${waitlistOption}<button class="booking-submit" type="button" data-action="continue" ${selectedTime ? "" : "disabled"}>${esc(buttonText)}</button>`,
  );
}
function renderGuestForm(message = "") {
  const visible = Object.entries(widget.fields).filter(
    ([, field]) => field.status !== "hidden",
  );
  const error = message
    ? `<p class="booking-message error" role="alert">${esc(message)}</p>`
    : "";
  frame(
    `<h1>${esc(words().guestData)}</h1><p class="booking-subtitle">${esc(date)} · ${esc(timeLabel(selectedTime))} · ${guests} ${esc(label("guests", words().guests).toLowerCase())}</p>${error}<form id="guest-form">${visible.map(([key, field]) => fieldControl(key, field)).join("")}<label class="booking-honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><button class="booking-submit" type="submit">${esc(label("button", words().confirm))}</button></form><button class="booking-back" type="button" data-action="back">${esc(words().back)}</button>`,
  );
}
function renderResult(waiting) {
  frame(
    `<h1>${esc(waiting ? words().waitlist : words().success)}</h1><p class="booking-message success" role="status">${esc(waiting ? words().waiting : words().success)}</p>`,
  );
}
function renderDemo() {
  document.documentElement.lang = "ru";
  document.body.style.background = "#f5f7fa";
  root.innerHTML = `<article class="booking-card"><p class="booking-brand">SeatCore</p><p class="booking-message booking-demo-note" role="note"><strong>Демо-режим.</strong> Эта форма показывает внешний вид виджета. Бронирования здесь не отправляются и не сохраняются.</p><h1>Забронируйте столик</h1><p class="booking-subtitle">Будем рады видеть вас в гостях</p><div class="booking-grid"><label class="booking-field">Гости<select aria-label="Гости"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label class="booking-field">Дата<input type="date" aria-label="Дата"></label></div><h2 class="booking-section-title">Выберите время</h2><div class="booking-slots">${["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"].map((time) => `<button class="booking-time" type="button" aria-pressed="${time === "19:00"}">${time}</button>`).join("")}</div><button class="booking-submit" type="button" disabled>Отправка бронирования отключена</button><p class="booking-powered">Работает на <strong>SeatCore</strong></p></article>`;
}
async function loadAvailability(preserveTable = false) {
  selectedTime = "";
  if (!preserveTable) table = "";
  slots = [];
  window.availability = { tables: [] };
  renderBooking();
  const query = new URLSearchParams({ date, guests: String(guests) });
  if (room) query.set("room", room);
  if (table) query.set("table", table);
  const result = await request(`/availability?${query}`);
  slots = result.slots || [];
  window.availability = result;
  if (!room && widget.tableMode !== "auto" && result.rooms.length === 1)
    room = result.rooms[0].id;
  renderBooking();
}
async function start() {
  if (!widgetId) throw new Error(words().missing);
  const result = await request();
  widget = result.widget;
  document.documentElement.lang = widget.language;
  date = widget.dateBounds.today;
  guests = Math.min(2, widget.maxGuests);
  await loadAvailability();
}
root.addEventListener("change", async (event) => {
  if (!widget || step !== "booking") return;
  const target = event.target;
  try {
    if (target.name === "date") date = target.value;
    else if (target.name === "guests") guests = Number(target.value);
    else if (target.name === "room") room = target.value;
    else if (target.name === "table") table = target.value;
    else if (target.name === "waitlist") waitlistIntent = target.checked;
    if (["date", "guests", "room"].includes(target.name))
      await loadAvailability();
    else if (target.name === "table") await loadAvailability(true);
  } catch (error) {
    renderBooking(error.message || words().error);
  }
});
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !widget) return;
  if (button.dataset.time) {
    selectedTime = button.dataset.time;
    renderBooking();
    return;
  }
  if (button.dataset.action === "back") {
    step = "booking";
    renderBooking();
    return;
  }
  if (button.dataset.action === "continue") {
    if (!selectedTime) return;
    step = "guest";
    renderGuestForm();
  }
});
root.addEventListener("submit", async (event) => {
  if (event.target.id !== "guest-form") return;
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const fields = Object.fromEntries(new FormData(form).entries());
  const requestedWaitlist = widget.waitlist === "always" && waitlistIntent;
  const slot = slots.find((item) => item.time === selectedTime);
  const isWaitlist =
    requestedWaitlist ||
    (widget.waitlist !== "disabled" && slot && !slot.available);
  const payload = {
    mutationId: crypto.randomUUID(),
    date,
    time: selectedTime,
    guests,
    room,
    table,
    fields,
    waitlist: Boolean(isWaitlist),
    website: fields.website || "",
  };
  try {
    const result = await request("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    step = "result";
    renderResult(Boolean(result.booking?.waitlist) || Boolean(isWaitlist));
    if (widget.redirect)
      setTimeout(() => location.assign(widget.redirect), 1800);
  } catch (error) {
    step = "guest";
    renderGuestForm(error.message || words().error);
    for (const [name, value] of Object.entries(fields)) {
      const input = root.querySelector(`[name="${name}"]`);
      if (input) input.value = String(value);
    }
  }
});

if (location.hostname.endsWith(".github.io")) {
  renderDemo();
} else {
  start().catch((error) => {
    root.innerHTML = `<section class="booking-card"><p class="booking-message error" role="alert">${esc(error.message || copy.ru.error)}</p><button class="booking-submit" type="button" onclick="location.reload()">${esc(copy.ru.retry)}</button></section>`;
  });
}
