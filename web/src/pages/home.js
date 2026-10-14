import { notificationButton } from "../components/booking-notifications.js";
import { escapeHTML as safe } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  const { state } = app;
  const rootId = "home-page";

  let mounted = false;
  let floorRoom = state.room || "main";

  const root = () => document.getElementById(rootId);

  const CLOSED = new Set([
    "Завершено", "Отменено", "Отменено гостем",
    "Не пришёл", "Отказано"
  ]);

  const CANCELLED = new Set([
    "Отменено", "Отменено гостем", "Отказано"
  ]);

  const confirmed = status =>
    String(status || "").startsWith("Подтвержд");

  const waiting = status =>
    !confirmed(status) &&
    !["Пришёл", "Пришел", "Занят"].includes(status) &&
    !CLOSED.has(status);

  function roomIds() {
    return Object.keys(app.floor.positions || {});
  }

  function roomLabel(id) {
    return state.rooms?.[id] || id;
  }

  function reservationRoom(reservation) {
    return reservation.room || "main";
  }

  function isCancelled(status) {
    return CANCELLED.has(status);
  }

  function isWaiting(status) {
    return waiting(status);
  }

  function isActive(reservation) {
    return !CANCELLED.has(reservation.status);
  }

  function guestName(reservation) {
    return (
      reservation.guestName ||
      reservation.name ||
      reservation.guest ||
      [reservation.first, reservation.last].filter(Boolean).join(" ") ||
      reservation.phone ||
      "—"
    );
  }

  function guestCount(reservation) {
    return Number(reservation.guests || reservation.party || 0) || 0;
  }

  function tableLabel(reservation) {
    if (reservation.table === null || reservation.table === undefined || reservation.table === "") {
      return "—";
    }
    return String(reservation.table);
  }

  function timeLabel(reservation) {
    return reservation.time || "—";
  }

  function todayReservations() {
    return (state.reservations || []).filter(
      reservation => reservation.date === state.date
    );
  }

  function sortedReservations(list) {
    return [...list].sort((a, b) =>
      String(a.time || "").localeCompare(String(b.time || ""), "ru", {
        numeric: true,
      })
    );
  }

  function statsData() {
    const allToday = todayReservations();
    const active = allToday.filter(isActive);
    const guests = active.reduce(
      (sum, reservation) => sum + guestCount(reservation),
      0
    );

    const totalTables = roomIds().reduce(
      (sum, room) => sum + (app.floor.positions?.[room]?.length || 0),
      0
    );

    const occupied = new Set(
      active
        .filter(reservation => tableLabel(reservation) !== "—")
        .map(
          reservation =>
            `${reservationRoom(reservation)}:${tableLabel(reservation)}`
        )
    ).size;

    const freeTables = Math.max(0, totalTables - occupied);
    const waitingCount = active.filter(
      reservation => isWaiting(reservation.status)
    ).length;

    return [
      {
        title: "Бронирований",
        value: active.length,
        note: "на выбранную дату",
        cls: "bookings",
      },
      {
        title: "Гостей",
        value: guests,
        note: "всего гостей по броням",
        cls: "guests",
      },
      {
        title: "Свободно",
        value: freeTables,
        note: `столов из ${totalTables} (без активных броней)`,
        cls: "free",
      },
      {
        title: "Ожидаются",
        value: waitingCount,
        note: "броней ожидают прибытия",
        cls: "waiting",
      },
    ];
  }


  function renderStats() {
    const icons = {
      bookings: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
      guests: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      free: '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M7 16v5M17 16v5M3 9h18"/>',
      waiting: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    };

    return `
      <div class="home-stats">
        ${statsData().map(card => `
          <div class="home-stat home-stat-${safe(card.cls)}">
            <div class="home-stat-label">
              <span>
                <svg viewBox="0 0 24 24"
                  width="20" height="20" fill="none"
                  stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round"
                  aria-hidden="true">
                  ${icons[card.cls]}
                </svg>
              </span>
              ${safe(card.title)}
            </div>
            <strong>${safe(String(card.value))}</strong>
            <small>${safe(card.note)}</small>
          </div>
        `).join("")}
      </div>
    `;
  }


  function renderDailyPlan() {
    const records = sortedReservations(todayReservations());

    const guestWord = n =>
      n % 10 === 1 && n % 100 !== 11
        ? "гость"
        : [2, 3, 4].includes(n % 10) &&
          ![12, 13, 14].includes(n % 100)
          ? "гостя"
          : "гостей";

    const displayStatus = status =>
      status || "Ожидается";

    const badge = status => `
      <span class="home-status ${statusClass(status)}">
        ${safe(displayStatus(status))}
      </span>
    `;

    return `
      <section class="home-panel home-schedule home-daily-panel">
        <div class="home-panel-heading">
          <h2>План на день</h2>
          <span>${safe(formatShortDate(state.date))}</span>
        </div>

        <div class="home-timeline">
          ${records.map(r => `
            <div class="home-event">
              <time>${safe(timeLabel(r))}</time>
              <span class="home-dot ${statusClass(r.status)}"></span>
              <button
                type="button"
                data-home-booking="${safe(String(r.id))}"
                class="home-event-card"
              >
                <span class="home-event-head">
                  <strong>${safe(guestName(r))}</strong>
                  ${badge(r.status)}
                </span>
                <small>
                  ${guestCount(r)} ${guestWord(guestCount(r))}
                  · ${safe(
                    tableLabel(r) === "—"
                      ? "Без стола"
                      : "Стол " + tableLabel(r)
                  )}
                </small>
              </button>
            </div>
          `).join("") ||
            '<p class="home-no-events">На выбранную дату бронирований нет</p>'}
        </div>
      </section>
    `;
  }

  function renderFloorPanel() {
    const rooms = roomIds();

    if (!rooms.length) {
      return `
        <section class="home-floor-panel">
          <div class="home-panel-header">
            <h2>План зала</h2>
          </div>
          <div class="home-floor-empty">План зала ещё не настроен.</div>
        </section>
      `;
    }

    if (!rooms.includes(floorRoom)) {
      floorRoom = rooms[0];
    }

    return `
      <section class="home-floor-panel">
        <div class="home-panel-header home-floor-header">
          <h2>План зала</h2>
          <div class="home-floor-tabs">
            ${rooms.map(id => `
              <button
                type="button"
                data-floor-room="${safe(id)}"
                class="${id === floorRoom ? "active" : ""}"
              >
                ${safe(roomLabel(id))}
              </button>
            `).join("")}
          </div>
        </div>

        <div class="home-floor-viewport">
          <div class="home-floor-stage">
            <div class="floor-canvas home-floor-canvas"></div>
          </div>
        </div>
      </section>
    `;
  }

  function renderLayout() {
    const page = root();
    if (!page) return;

    const toolbar = document.querySelector(".top-actions");
    const topbar = document.querySelector(".topbar");

    if (toolbar && topbar && toolbar.parentElement !== topbar) {
      topbar.appendChild(toolbar);
    }

    page.innerHTML = `
      <div class="home-header">
        <h1>Главная</h1>
        <div class="home-actions">
          ${notificationButton(app, "home-notifications")}
          <label class="home-date" title="Выбрать дату">
            <input
              id="home-date"
              type="date"
              value="${safe(state.date)}"
              aria-label="Дата бронирований"
            >
          </label>
          <button class="home-new" id="home-new">＋ Новая бронь</button>
        </div>
      </div>

      ${renderStats()}

      <div class="home-main-grid">
        ${renderFloorPanel()}
        ${renderDailyPlan()}
      </div>
    `;

    const actions = page.querySelector(".home-actions");
    if (toolbar && actions) {
      actions.insertBefore(toolbar, actions.firstChild);
    }
  }

  function renderFloor() {
    const page = root();
    if (!page) return;

    const canvas = page.querySelector(".home-floor-canvas");
    const viewport = page.querySelector(".home-floor-viewport");
    const stage = page.querySelector(".home-floor-stage");

    if (!canvas || !viewport || !stage || !roomIds().length) return;

    const room = floorRoom;
    const items = app.floor.positions?.[room] || [];

    const width = Math.max(
      700,
      ...items.map(item => Number(item[1] || 0) + 120)
    );
    const height = Math.max(
      520,
      ...items.map(item => Number(item[2] || 0) + 120)
    );

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.innerHTML = app.floor.mapMarkup(room);

    const background = storage.read("mio-ru-backgrounds-v1", {})[room];
    canvas.style.backgroundImage = background ? `url("${background}")` : "";
    canvas.style.backgroundSize = "cover";
    canvas.style.backgroundPosition = "center";
    canvas.style.backgroundColor = "#f5f7fa";

    app.floor.bindMapTables(canvas, index => {
      app.floor.openTable(index, room);
    });

    const availableWidth = Math.max(100, viewport.clientWidth - 20);
    const availableHeight = Math.max(100, viewport.clientHeight - 20);

    const scale = Math.min(
      1,
      availableWidth / width,
      availableHeight / height
    );

    stage.style.width = `${width * scale}px`;
    stage.style.height = `${height * scale}px`;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = "top left";
  }

  function bindEvents() {
    const page = root();
    if (!page) return;

    page.querySelector("#home-new")?.addEventListener("click", () => {
      app.bookingModal(false);
    });

    page.querySelector("#home-date")?.addEventListener("change", event => {
      if (!event.target.value) return;
      state.date = event.target.value;
      app.save();
      paint();
    });

    page.querySelectorAll("[data-home-booking]").forEach(button => {
      button.addEventListener("click", () => {
        const record = state.reservations.find(
          item => String(item.id) === button.dataset.homeBooking
        );
        if (record) app.bookingModal(false, null, record.id);
      });
    });

    page.querySelectorAll("[data-floor-room]").forEach(button => {
      button.addEventListener("click", () => {
        floorRoom = button.dataset.floorRoom || floorRoom;
        state.room = floorRoom;
        app.save();
        paint();
      });
    });
  }

  function paint() {
    if (!mounted || !root()) return;
    renderLayout();
    bindEvents();
    renderFloor();
  }

  function mount() {
    mounted = true;

    document.querySelector("#routeFallback")?.remove();
    document.querySelector("#overview-view")?.remove();
    document.querySelector("#setup-page")?.remove();
    document.querySelector(".content").style.display = "none";
    document.querySelector(".topbar").style.display = "none";

    root()?.remove();

    const page = document.createElement("section");
    page.id = rootId;
    document.querySelector(".workspace").appendChild(page);

    window.addEventListener("resize", paint);
    paint();
  }

  function unmount() {
    mounted = false;
    window.removeEventListener("resize", paint);

    const toolbar = document.querySelector("#home-page .top-actions");
    const topbar = document.querySelector(".topbar");
    if (toolbar && topbar) topbar.appendChild(toolbar);

    root()?.remove();
    document.querySelector(".topbar").style.display = "";
    document.querySelector(".content").style.display = "";
  }

  return { mount, unmount, refresh: paint };
}

function formatDateTitle(value) {
  if (!value) return "выбранную дату";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;

  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const weekdays = [
    "воскресенье", "понедельник", "вторник", "среду",
    "четверг", "пятницу", "субботу",
  ];

  const date = new Date(year, month - 1, day);
  const weekday = weekdays[date.getDay()] || "";
  return `${weekday}, ${day} ${months[month - 1]} ${year} г.`;
}


function statusClass(status) {
  const value = String(status || "");

  if (["Отменено", "Отменено гостем", "Отказано"].includes(value))
    return "cancelled";

  if (value === "Завершено")
    return "finished";

  if (["Пришёл", "Пришел", "Занят"].includes(value))
    return "seated";

  if (value.startsWith("Подтвержд"))
    return "confirmed";

  return "pending";
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(date);
}

