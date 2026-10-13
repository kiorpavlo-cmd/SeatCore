import { availableTables } from "../services/view-availability.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
import {
  filterReservations,
  totalGuests,
  groupReservations,
  SEATED,
} from "../services/reservation-queries.js";
import { readResources, readGuests } from "../services/repositories.js";
import { escapeHTML as htmlEscape } from "../lib/dom.js";

export function createPage(app) {
  const { state, bookingModal, showFilter } = app;
  ("use strict");
  let activeView = null;
  let partySize = 2;
  let searchText = "";
  let filterSeated = false;
  let filterComing = false;
  let bookedCovers = "";
  let allTimeslots = false;
  let availableCovers = "";
  let selectedRoom = "all";
  let selectedShift = "";
  const $s = (selector) => document.querySelector(selector);

  function records() {
    return filterReservations(
      state.reservations.filter((r) => r.date === state.date),
      {
        query: searchText,
        seated: filterSeated,
        coming: filterComing,
        room: selectedRoom,
        filters: state.filters || {},
        shift: selectedShift,
        shifts: readResources().shifts || [],
        guests: readGuests(),
      },
    ).filter((r) => !bookedCovers || Number(r.guests) === Number(bookedCovers));
  }
  function timeToMinutes(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }
  function clock(n) {
    const h = Math.floor(n / 60) % 24;
    return String(h).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  }
  function updateNav() {
    document
      .querySelectorAll(".nav-child")
      .forEach((x) =>
        x.classList.toggle("active", x.textContent.trim() === activeView),
      );
  }
  function toolbar(extra = "") {
    return `<div class="overview-toolbar">
 <input id="overview-search" class="overview-search"
 placeholder="⌕  Поиск" value="${htmlEscape(searchText)}">
 <button class="overview-pill" id="overview-filter" aria-label="Сортировка и фильтры">☰</button>
 <button class="overview-pill ${filterSeated ? "active" : ""}" id="overview-seated" aria-pressed="${filterSeated}">За столом</button>
 <button class="overview-pill ${filterComing ? "active" : ""}" id="overview-coming" aria-pressed="${filterComing}">Ожидаются</button>
 <select id="overview-shift" class="overview-select">
  <option value="">Все смены</option>${(readResources().shifts || []).map((s) => `<option value="${htmlEscape(s.id)}" ${selectedShift === s.id ? "selected" : ""}>${htmlEscape(s.name)}</option>`).join("")}
 </select>${extra}
 <span style="margin-left:auto;white-space:nowrap">⚒ ${records().length}　♟ ${totalGuests(records())}</span>
 </div>`;
  }
  function render() {
    const root = $s("#overview-view");
    if (!root || !activeView) return;
    let content = "";
    if (activeView === "Сетка") content = gridView();
    if (activeView === "Временная шкала") content = timelineView();
    if (activeView === "Поток гостей") content = flowView(false);
    if (activeView === "Оборот столов") content = flowView(true);
    if (activeView === "Список") content = listView();

    root.innerHTML = content;
    if (
      activeView === "Сетка" &&
      availableCovers &&
      !root.querySelector(".overview-slot")
    ) {
      root.querySelector(".overview-body").innerHTML =
        emptyView() +
        `<p style="text-align:center">Свободных столов с заданной вместимостью не найдено. Вместимость задаётся в редакторе плана зала.</p>`;
    }
    bindCommon(root);

    root.querySelectorAll("[data-overview-book]").forEach((b) => {
      b.onclick = () => {
        const id = state.reservations.find(
          (r) => String(r.id) === b.dataset.overviewBook,
        )?.id;
        if (typeof bookingModal === "function") {
          bookingModal(false, null, id);
        }
      };
    });
    root.querySelectorAll("[data-overview-add]").forEach((b) => {
      b.onclick = () => {
        bookingModal(false, partySize, null, {
          time: b.dataset.overviewAdd,
          room: b.dataset.bookRoom || state.room,
          table: b.dataset.bookTable || "",
        });
      };
    });
  }
  function bindCommon(root) {
    const shift = root.querySelector("#overview-shift");
    if (shift)
      shift.onchange = (e) => {
        selectedShift = e.target.value;
        render();
      };
    const coming = root.querySelector("#overview-coming");
    if (coming)
      coming.onclick = () => {
        filterComing = !filterComing;
        render();
      };
    const available = root.querySelector("#overview-available");
    if (available)
      available.onchange = (e) => {
        availableCovers = e.target.value;
        render();
      };
    const covers = root.querySelector("#overview-covers");
    if (covers)
      covers.onchange = (e) => {
        bookedCovers = e.target.value;
        render();
      };
    const times = root.querySelector("#overview-all-times");
    if (times)
      times.onchange = (e) => {
        allTimeslots = e.target.checked;
        render();
      };
    root.querySelectorAll("[data-clear-view]").forEach(
      (b) =>
        (b.onclick = () => {
          searchText = "";
          filterComing = false;
          filterSeated = false;
          selectedShift = "";
          selectedRoom = "all";
          bookedCovers = "";
          availableCovers = "";
          state.filters = {};
          app.save();
          render();
        }),
    );
    root
      .querySelectorAll("[data-modify-view]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            showFilter(root.querySelector("#overview-filter"))),
      );
    root.querySelectorAll("[data-view-group]").forEach(
      (b) =>
        (b.onclick = () => {
          state.collapsedGroups ||= {};
          state.collapsedGroups[b.dataset.viewGroup] =
            !state.collapsedGroups[b.dataset.viewGroup];
          app.save();
          render();
        }),
    );
    const search = root.querySelector("#overview-search");
    if (search)
      search.oninput = (e) => {
        searchText = e.target.value;
        const cursor = search.selectionStart;
        render();
        const replacement = $s("#overview-search");
        replacement?.focus();
        replacement?.setSelectionRange(cursor, cursor);
      };
    const seated = root.querySelector("#overview-seated");
    if (seated)
      seated.onclick = () => {
        filterSeated = !filterSeated;
        render();
      };
    const filter = root.querySelector("#overview-filter");
    if (filter)
      filter.onclick = () => {
        showFilter(filter);
      };
    root.querySelectorAll("[data-overview-party]").forEach((b) => {
      b.onclick = () => {
        partySize = +b.dataset.overviewParty;
        render();
      };
    });
    const room = root.querySelector("#overview-room");
    if (room)
      room.onchange = (e) => {
        selectedRoom = e.target.value;
        render();
      };
  }
  function partySelector() {
    return `<div class="overview-bottom">
 <span style="white-space:nowrap;margin-right:10px">Количество гостей:</span>
 ${Array.from(
   { length: 20 },
   (_, i) =>
     `<button class="${partySize === i + 1 ? "active" : ""}" data-overview-party="${i + 1}">${i + 1}</button>`,
 ).join("")}
 </div>`;
  }
  function gridView() {
    const list = records();
    const start = 0,
      interval = 60;
    const groups = Array.from({ length: 24 }, (_, i) => start + i * interval);
    return (
      toolbar(
        `<select id="overview-available" aria-label="Доступные места" class="overview-select"><option value="">Доступные места</option>${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}" ${Number(availableCovers) === i + 1 ? "selected" : ""}>От ${i + 1} мест</option>`).join("")}</select><select id="overview-covers" aria-label="Фильтр по количеству гостей" class="overview-select"><option value="">Любое количество гостей</option>${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}" ${Number(bookedCovers) === i + 1 ? "selected" : ""}>${i + 1} гостей</option>`).join("")}</select><label><input id="overview-all-times" type="checkbox" ${allTimeslots ? "checked" : ""}> Все интервалы</label>`,
      ) +
      `<div class="overview-body"><div class="overview-grid-columns">
 ${groups
   .map((hour) => {
     const entries = list.filter(
       (r) =>
         timeToMinutes(r.time) >= hour && timeToMinutes(r.time) < hour + 60,
     );
     if (!allTimeslots && !availableCovers && !entries.length) return "";
     return `<div class="overview-split-hour">
  <div class="overview-hour-head">${clock(hour)}</div>
  <div class="overview-hour-sub">День　 ⚒ ${entries.length}　♟ ${totalGuests(entries)}</div>
  ${Array.from({ length: 4 }, (_, i) => {
    const t = hour + i * 15;
    const slot = entries.filter(
      (r) => timeToMinutes(r.time) >= t && timeToMinutes(r.time) < t + 15,
    );
    const available = availableTables({
      positions: app.floor.positions,
      reservations: state.reservations,
      date: state.date,
      time: clock(t),
      guests: Number(availableCovers) || partySize,
      blocks: storage.read(STORAGE_KEYS.blocks, []),
      blocked: app.floor.blocked,
    });
    if (availableCovers && !available.length) return "";
    const free = available.reduce((n, row) => n + row.capacity, 0);
    const chosen = available[0];
    return `<div class="overview-slot">
    <div class="overview-slot-time">${clock(t)}</div>
    <div class="overview-slot-content">
     ${slot.map(card).join("")}
     ${allTimeslots || availableCovers || slot.length ? `<button class="overview-add" aria-label="Бронировать на ${clock(t)}" data-overview-add="${clock(t)}" ${chosen ? `data-book-room="${htmlEscape(chosen.room)}" data-book-table="${htmlEscape(chosen.table)}"` : ""}>⊕</button>${free ? `<small>${free} доступных мест</small>` : ""}` : ""}
    </div></div>`;
  }).join("")}
 </div>`;
   })
   .join("")}
 </div>${!list.length && !allTimeslots && !availableCovers ? emptyView() : ""}</div>${partySelector()}`
    );
  }
  function card(r) {
    return `<button class="overview-book-card ${state.cardType === "compact" ? "compact-card" : ""}" data-overview-book="${htmlEscape(r.id)}">
 <strong>${htmlEscape(r.name)}</strong>
 <small>♟ ${r.guests}　▦ ${htmlEscape(r.table || "—")} · ${htmlEscape(r.status || "Не подтверждено")}</small>
 ${state.cardType === "timer" ? `<small>${Number(r.duration) || 90} мин</small>` : ""}
 </button>`;
  }
  function emptyView() {
    return `<div class="empty overview-empty"><h2>Нет бронирований для отображения</h2><p>Выберите другую дату или измените фильтры.</p><button class="outline-green" data-modify-view>Изменить фильтр</button> <button class="link-green" data-clear-view>Очистить фильтры</button></div>`;
  }
  function roomSelector() {
    return `<select id="overview-room" class="overview-select" aria-label="Зал"><option value="all">Все залы</option>${Object.entries(
      state.rooms,
    )
      .map(
        ([key, name]) =>
          `<option value="${htmlEscape(key)}" ${selectedRoom === key ? "selected" : ""}>${htmlEscape(name)}</option>`,
      )
      .join("")}</select>`;
  }
  function timelineView() {
    const list = records();
    const rows = Object.entries(app.floor.positions)
      .filter(([room]) => selectedRoom === "all" || selectedRoom === room)
      .flatMap(([room, tables]) =>
        tables.map((t) => ({ room, table: String(t[0]) })),
      );
    for (const record of list) {
      const room = record.room || "main",
        table = String(record.table || "");
      if (
        table &&
        !rows.some((row) => row.room === room && row.table === table)
      )
        rows.push({ room, table });
    }
    const labels = Array.from({ length: 24 }, (_, i) => i * 60);
    const tracks = [{ room: "all", table: "", name: "Без стола" }, ...rows];
    return (
      toolbar(roomSelector()) +
      `<div class="overview-body"><div style="width:max-content;min-width:100%"><div class="overview-time-rail"><div class="overview-rail-label">Стол / зал</div><div class="overview-timeline" style="height:60px;min-width:1920px">${labels.map((t, i) => `<span style="position:absolute;left:${i * 80}px;top:20px">${clock(t)}</span>`).join("")}</div></div>${tracks
        .map(
          (row) =>
            `<div class="overview-track-row"><div class="overview-track-name"><strong>${htmlEscape(row.name || row.table)}</strong><small>${htmlEscape(state.rooms[row.room] || "")}</small></div><div class="overview-track" style="min-width:1920px">${list
              .filter((r) =>
                row.table
                  ? String(r.table) === row.table &&
                    (r.room || "main") === row.room
                  : !r.table,
              )
              .map(
                (r) =>
                  `<button class="overview-track-book" title="${htmlEscape(r.name)} · ${htmlEscape(r.time)} · ${Number(r.duration) || 90} мин" style="left:${(timeToMinutes(r.time) / 60) * 80}px;width:${Math.max(20, (Math.min(Number(r.duration) || 90, 1440 - timeToMinutes(r.time)) / 60) * 80)}px" data-overview-book="${htmlEscape(r.id)}">${htmlEscape(r.name)}</button>`,
              )
              .join("")}</div></div>`,
        )
        .join("")}</div>${!list.length ? emptyView() : ""}</div>`
    );
  }
  function flowView(turns) {
    const list = records();
    const start = 0;
    const slots = Array.from({ length: 96 }, (_, i) => start + i * 15);
    const cells = slots.map((t) => {
      const items = list.filter(
        (r) => timeToMinutes(r.time) >= t && timeToMinutes(r.time) < t + 15,
      );
      return { time: t, items };
    });
    const stats = `
 <div class="overview-summary">
 <span>Всего гостей　<strong>${totalGuests(list)}</strong></span>
 <span>Ожидаются　<strong>${list.filter((r) => !SEATED.includes(r.status) && !["Завершено", "Отменено", "Отменено гостем", "Не пришёл", "Отказано"].includes(r.status)).length}</strong></span>
 <span>За столом　<strong>${list.filter((r) => SEATED.includes(r.status)).length}</strong></span>
 <span>Завершены　<strong>${list.filter((r) => r.status === "Завершено").length}</strong></span>
 <span>Без бронирования　<strong>${list.filter((r) => r.walkIn).length}</strong></span>
 <span>Неявки　<strong>${list.filter((r) => r.status === "Не пришёл").length}</strong></span>
 <span>Отмены　<strong>${list.filter((r) => ["Отменено", "Отменено гостем"].includes(r.status)).length}</strong></span>
 </div>`;
    return (
      toolbar(roomSelector()) +
      (list.length
        ? `<div class="overview-body"><table class="overview-flow-table" style="min-width:7680px">
 <thead><tr><th>◷</th>${cells.map((c) => `<th>${clock(c.time)}</th>`).join("")}</tr></thead>
 <tbody>
 <tr><td>⚒</td>${cells.map((c) => `<td>${c.items.length}</td>`).join("")}</tr>
 <tr><td>♟</td>${cells.map((c) => `<td>${totalGuests(c.items)}</td>`).join("")}</tr>
 <tr><td></td>${cells
   .map(
     (c) => `<td style="vertical-align:top;height:350px">
 ${c.items.map((r) => `<button class="overview-flow-card" data-overview-book="${r.id}">${turns ? htmlEscape(r.table || "Без стола") : r.guests}<small>${htmlEscape(r.time)} · ${Number(r.duration) || 90} мин</small></button>`).join("")}
 </td>`,
   )
   .join("")}</tr>
 </tbody></table></div>`
        : `<div class="overview-body">${emptyView()}</div>`) +
      stats
    );
  }
  function listView() {
    const list = records();
    const groups = groupReservations(
      list,
      state.filters?.group,
      state.rooms,
      readResources().shifts || [],
    );
    return (
      toolbar() +
      `<div class="overview-body"><div class="overview-list-head">Бронирования ${list.length} · ${totalGuests(list)} гостей</div>${groups.map((group) => `<button class="overview-list-group" data-view-group="${htmlEscape(group.name)}">${htmlEscape(group.name)} · ${group.records.length} бронирований · ${totalGuests(group.records)} гостей ${state.collapsedGroups?.[group.name] ? "⌄" : "⌃"}</button>${state.collapsedGroups?.[group.name] ? "" : group.records.map((r) => `<button class="overview-list-entry ${state.cardType === "compact" ? "compact-card" : ""}" data-overview-book="${htmlEscape(r.id)}"><div><strong>${htmlEscape(r.time)}</strong>${state.cardType === "timer" ? `<small>${Number(r.duration) || 90} мин</small>` : ""}</div><div><strong>${htmlEscape(r.name)}</strong><small>${r.guests} гостей · Стол ${htmlEscape(r.table || "—")} · ${htmlEscape(state.rooms[r.room || "main"])}</small></div><div>${htmlEscape(r.status || "Не подтверждено")}</div><div><small>${htmlEscape(r.notes || "Нет заметок к бронированию")}</small><small>${htmlEscape(r.tags || "")}</small></div></button>`).join("")}`).join("") || emptyView()}</div>`
    );
  }
  function show(name) {
    activeView = name;
    document.querySelector("#routeFallback")?.remove();
    document.querySelector("#overview-view")?.remove();
    const content = $s(".content");
    if (content) content.style.display = "none";
    const root = document.createElement("section");
    root.id = "overview-view";
    $s(".workspace").appendChild(root);
    updateNav();
    render();
  }
  function leave() {
    activeView = null;
    $s("#overview-view")?.remove();
    const content = $s(".content");
    if (content) content.style.display = "";
  }
  window.addEventListener("storage", (e) => {
    if (e.key === "mio-ru-demo-v1" && activeView) {
      try {
        Object.assign(state, JSON.parse(e.newValue) || {});
      } catch {}
      render();
    }
  });
  return { mount: show, unmount: leave, refresh: render };
}
