import { installBookingNotifications } from "../components/booking-notifications.js";
import { openTableLabels } from "../features/floor/labels.js";
import { initializePersistence } from "../services/persistence.js";
import { installPersistenceStatus } from "../components/persistence-status.js";
import { fitFloorCanvas } from "../features/floor/viewport.js";
import { readFields } from "../services/repositories.js";
import { installDialogAccessibility } from "../components/dialog-accessibility.js";
import "../styles/index.css";
import { shell } from "../components/shell.js";
import { $, $$, escapeHTML as esc } from "../lib/dom.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
import { createStore } from "../services/store.js";
import { toast } from "../components/toast.js";
import { hidePop, showMenu } from "../components/popover.js";
import { closeModal } from "../components/modal.js";
import { createCalendar } from "../components/calendar.js";
import { createNavigation } from "../components/navigation.js";
import { createPanel } from "../features/reservations/panel.js";
import { createFilters } from "../features/reservations/filters.js";
import { createServers } from "../features/servers/servers.js";
import { createFloor } from "../features/floor/model.js";
import { createEditor } from "../features/floor/editor.js";
import { createReservationForm } from "../features/reservations/form.js";
import { createRouter } from "../routes/router.js";
import { createTopbarActions as createToolbar } from "../components/topbar-actions.js";
import { can } from "../services/access.js";
$("#app").innerHTML = shell;
installDialogAccessibility();
await initializePersistence();
const store = createStore(),
  state = store.state;
let router, openBooking;
let previousRecords = JSON.stringify({
  reservations: state.reservations,
  waitlist: state.waitlist,
});
function persist() {
  if (!store.save()) return false;
  const current = JSON.stringify({
    reservations: state.reservations,
    waitlist: state.waitlist,
  });
  if (current !== previousRecords) {
    const data = storage.read(STORAGE_KEYS.resources, {});
    data.audit = Array.isArray(data.audit) ? data.audit : [];
    data.audit.push({
      date: new Date().toISOString(),
      name: "Бронирования",
      action: "Изменение бронирований или листа ожидания",
    });
    data.audit = data.audit.slice(-500);
    storage.write(STORAGE_KEYS.resources, data);
    previousRecords = current;
  }
  return true;
}
const app = {
  state,
  save: persist,
  render,
  bookingModal: (...args) => openBooking(...args),
  hidePop,
  showMenu,
  closeModal,
  navigate: (path) => router.navigate(path),
  getFields: (scope) => readFields().filter((x) => x.scope === scope),
};
const floor = createFloor({ ...app, openReservation: app.bookingModal });
app.floor = floor;
app.openEditor = () => {
  if (can("admin")) editor();
  else toast("Недостаточно прав для изменения плана зала");
};
openBooking = createReservationForm({ ...app, getFields: app.getFields });
const editor = createEditor({ ...app, floor });
const serverModal = createServers(app);
app.showFilter = createFilters(app);
const panel = createPanel({ ...app, serverModal });
const calendar = createCalendar(app);

function render() {
  $("#currentDate").textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(state.date + "T12:00:00"));
  $("#reserveCount").textContent = state.reservations.filter(
    (r) => r.date === state.date,
  ).length;
  $("#waitCount").textContent = state.waitlist.length;
  $$(".tab").forEach((x) =>
    x.classList.toggle("selected", x.dataset.tab === state.tab),
  );
  $$(".room").forEach((x) =>
    x.classList.toggle("active", x.dataset.room === state.room),
  );
  const roomTabs = $(".room-tabs");
  roomTabs.innerHTML = Object.keys(floor.positions)
    .map(
      (key) =>
        `<button data-room="${esc(key)}" class="room ${state.room === key ? "active" : ""}">${esc(state.rooms[key] || key)}</button>`,
    )
    .join("");
  roomTabs.querySelectorAll("[data-room]").forEach(
    (b) =>
      (b.onclick = () => {
        state.room = b.dataset.room;
        app.save();
        render();
      }),
  );
  panel();
  floor.render();
  fitFloor();
  $("#timeLabel").textContent = state.floorTime || "Сейчас";
  router?.refresh();
  app.notifications?.refresh();
}
function switchDate(delta) {
  const d = new Date(state.date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  state.date = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  app.save();
  render();
}
$$(".tab").forEach(
  (b) =>
    (b.onclick = () => {
      state.tab = b.dataset.tab;
      state.search = "";
      app.save();
      render();
    }),
);
$$(".room").forEach(
  (b) =>
    (b.onclick = () => {
      state.room = b.dataset.room;
      app.save();
      render();
    }),
);
$("#previousDay").onclick = () => switchDate(-1);
$("#nextDay").onclick = () => switchDate(1);
$("#currentDate").onclick = (e) => calendar(e.currentTarget);
$("#calendarButton").onclick = (e) => calendar(e.currentTarget);
$("#timeButton").onclick = (e) =>
  showMenu(
    e.currentTarget,
    [
      "Сейчас",
      ...Array.from(
        { length: 96 },
        (_, i) =>
          `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
      ),
    ],
    (v) => {
      state.floorTime = v;
      app.save();
      $("#timeLabel").textContent = v;
      floor.render();
    },
  );
$("#floorOptions").onclick = (e) =>
  showMenu(e.currentTarget, ["Подписи столов", "Редактировать план"], (v) => {
    if (v === "Редактировать план") app.openEditor();
    else openTableLabels(app);
  });

const fitFloor = () => fitFloorCanvas($("#floorCanvas"), $("#floor"));
$("#fitFloor").onclick = fitFloor;
window.addEventListener("resize", fitFloor);
$("#overlay").onclick = (e) => {
  if (e.target.id === "overlay") closeModal();
};
if (state.sidebarCompact) $(".sidebar").classList.add("compact");
$("#collapseSide").onclick = () => {
  state.sidebarCompact = $(".sidebar").classList.toggle("compact");
  app.save();
  navigation.closeMenu();
  fitFloor();
  $("#collapseSide").setAttribute(
    "aria-expanded",
    String(!state.sidebarCompact),
  );
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hidePop();
    closeModal();
    floor.closeDialog();
    $("#bookingScreen")?.remove();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (
    !e.target.closest(
      "#popover,#calendarButton,#currentDate,#showFilter,#timeButton,#floorOptions,[data-table],[data-table-index],#overview-filter,[data-order-filter]",
    )
  )
    hidePop();
});
document.addEventListener("storage:error", (event) =>
  toast(
    storage.persistence.mode === "server" &&
      storage.persistence.status === "error"
      ? event.detail.message
      : "Не удалось сохранить данные. Проверьте свободное место и настройки браузера; экспортируйте резервную копию.",
  ),
);
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEYS.app) {
    store.reload();
    render();
  }
});
const navigation = createNavigation(app.navigate);
router = createRouter(app, navigation);
app.toolbar = createToolbar(app);
app.notifications = installBookingNotifications(app);
$('.top-actions [title="Печать"]').onclick = () => window.print();
$("#mio-sidebar-search").onclick = () => {
  navigation.openSearch();
};
$(".logout button").onclick = async () => {
  if (
    storage.persistence?.status === "saving" ||
    storage.persistence?.status === "error"
  ) {
    toast("Сначала завершите сохранение данных.");
    return;
  }

  const button = $(".logout button");
  button.disabled = true;

  try {
    const response = await window.fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) throw new Error("Не удалось выйти");

    const keys = new Set([
      ...Object.values(STORAGE_KEYS),
      "mio-server-connected-v1",
      "mio-browser-before-server-v1",
      "mio-server-unsaved-v1",
    ]);

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("mio-") || key.startsWith("mio_")) {
        keys.add(key);
      }
    }

    for (const key of keys) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }

    window.location.replace("/");
  } catch {
    button.disabled = false;
    toast("Не удалось завершить выход или очистить данные.");
  }
};
installPersistenceStatus(storage);
document.addEventListener("persistence:update", (event) => {
  store.reload();
  floor.reload();
  render();
  if (event.detail.reload) router.reload();
});
render();
router.start();
