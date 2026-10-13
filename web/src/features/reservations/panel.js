import {
  filterReservations,
  groupReservations,
  totalGuests,
} from "../../services/reservation-queries.js";
import { readResources, readGuests } from "../../services/repositories.js";
import { $, $$, escapeHTML as esc } from "../../lib/dom.js";

export function createPanel({
  state,
  save,
  render,
  showFilter,
  showMenu,
  bookingModal,
  serverModal,
}) {
  function renderPanel() {
    const body = $("#panelContent"),
      foot = $("#panelBottom");
    if (state.tab === "servers") {
      body.innerHTML = `<div class="server-sort">Сортировка официантов
  <select><option>Имя (А → Я)</option><option>Имя (Я → А)</option></select></div>
  <div class="section-label">ОФИЦИАНТЫ НА СМЕНЕ <span>${state.servers.filter((x) => x.on).length}</span></div>
  ${state.servers
    .filter((x) => x.on)
    .sort(
      (a, b) =>
        (state.serverSort === "desc" ? -1 : 1) *
        a.name.localeCompare(b.name, "ru"),
    )
    .map(
      (s) => `<div class="server-card">
    <div class="server-info" data-server="${s.id}" style="cursor:pointer">
      <div class="server-name"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</div>
      <small>столов ${(s.tables || []).length} &nbsp; бронирований ${state.reservations.filter((r) => r.date === state.date && (r.employee === s.name || (s.tables || []).includes((r.room || "main") + ":" + r.table))).length} &nbsp; гостей ${state.reservations.filter((r) => r.date === state.date && r.employee === s.name).reduce((n, r) => n + Number(r.guests), 0)}</small>
    </div><button class="assign" data-assign="${s.id}">Назначить</button></div>`,
    )
    .join("")}`;
      foot.innerHTML =
        '<div class="bottom-buttons"><button class="green" id="addServer">＋ Новый официант</button><button class="outline-green" id="unassignAll">Снять назначения</button></div>';
      $$(".server-info").forEach(
        (el) => (el.onclick = () => serverModal(Number(el.dataset.server))),
      );
      $$(".assign").forEach(
        (el) => (el.onclick = () => serverModal(Number(el.dataset.assign))),
      );
      $("#addServer").onclick = () => serverModal(null);
      $("#unassignAll").onclick = () => {
        state.servers.forEach((s) => (s.tables = []));
        save();
        render();
      };
      $(".server-sort select").value =
        state.serverSort === "desc" ? "Имя (Я → А)" : "Имя (А → Я)";
      $(".server-sort select").onchange = (e) => {
        state.serverSort = e.target.selectedIndex === 1 ? "desc" : "asc";
        save();
        render();
      };
      return;
    }
    const isWait = state.tab === "waitlist";
    const entries = isWait
      ? state.waitlist
      : state.reservations.filter((x) => x.date === state.date);
    const filters = state.filters || {};
    const filtered = filterReservations(entries, {
      query: state.search,
      seated: state.seated,
      coming: state.coming,
      filters,
      shift: state.shift || "",
      shifts: readResources().shifts || [],
      guests: readGuests(),
      waitlistType: isWait ? state.waitlistType : "",
    });
    const groups = groupReservations(
      filtered,
      filters.group,
      state.rooms,
      readResources().shifts || [],
    );
    body.innerHTML = `
  <div class="search-line"><div class="search"><span>⌕</span><input id="search" placeholder="Поиск" value="${esc(state.search)}"></div><button class="filter-btn" id="showFilter">☰</button></div>
  <div class="chips">${
    isWait
      ? `
    ${["Без записи", "Онлайн", "Подтверждены"].map((type) => `<button class="chip ${state.waitlistType === type ? "active" : ""}" data-waitlist-filter="${type}">${type}</button>`).join("")}`
      : `
    <button class="chip ${state.seated ? "active" : ""}" id="seated">За столом</button>
    <button class="chip ${state.coming ? "active" : ""}" id="coming">Ожидаются</button>
    `
  }
    <select id="panel-shift" aria-label="Смена"><option value="">Все смены</option>${(readResources().shifts || []).map((s) => `<option value="${esc(s.id)}" ${state.shift === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
    <div class="stats"><span>⚒<br>${filtered.length}</span><span>♟<br>${filtered.reduce((n, x) => n + Number(x.guests), 0)}</span></div>
  </div>
  ${
    filtered.length
      ? `<div class="group-head">${isWait ? "Лист ожидания" : "Бронирования"} ⌃</div>
  ${groups
    .map(
      (
        group,
      ) => `<button class="group-head pink" style="width:100%;text-align:left" data-group="${esc(group.name)}">${esc(group.name)} · ${group.records.length} бронирований · ${totalGuests(group.records)} гостей ${state.collapsedGroups?.[group.name] ? "⌄" : "⌃"}</button>
  ${
    state.collapsedGroups?.[group.name]
      ? ""
      : group.records
          .map(
            (
              x,
            ) => `<div role="button" tabindex="0" class="reservation-card ${state.cardType === "compact" ? "compact-card" : ""}" data-booking="${esc(x.id)}">
  <div class="res-time">${esc(x.time || "—")}</div><div class="res-detail"><strong>${esc(x.name)}</strong><small>♟ ${x.guests}　▦ ${esc(x.table || "—")}</small></div>
  ${state.cardType === "timer" ? `<span class="reservation-timer">${Math.floor((x.duration || 90) / 60)} ч ${(x.duration || 90) % 60} мин</span>` : ""}<div class="res-check">✓</div></div>`,
          )
          .join("")
  }`,
    )
    .join("")}`
      : `<div class="empty"><strong>${isWait ? "Нет записей в листе ожидания" : entries.length ? "Ничего не найдено" : "Нет бронирований"}</strong>
   ${!isWait && entries.length ? '<p>Измените или очистите фильтр</p><button class="outline-green" id="modify">Изменить фильтр</button><br><button class="link-green" id="clear">Очистить фильтры</button>' : ""}
  </div>`
  }`;
    foot.innerHTML = isWait
      ? '<button class="outline-green full" id="addWait">◷ Добавить в лист ожидания</button>'
      : `<div class="walkin"><div class="walkin-head">Быстрая посадка <span>⌄</span></div><div class="walkin-numbers">${Array.from({ length: 20 }, (_, i) => `<button data-guests="${i + 1}">${i + 1}</button>`).join("")}</div></div>`;
    $("#panel-shift").onchange = (e) => {
      state.shift = e.target.value;
      save();
      render();
    };
    $("#search").oninput = (e) => {
      state.search = e.target.value;
      save();
      renderPanel();
      $("#search").focus();
      $("#search").setSelectionRange(state.search.length, state.search.length);
    };
    $$("[data-waitlist-filter]").forEach(
      (b) =>
        (b.onclick = () => {
          state.waitlistType =
            state.waitlistType === b.dataset.waitlistFilter
              ? ""
              : b.dataset.waitlistFilter;
          save();
          renderPanel();
        }),
    );
    $$("[data-group]").forEach(
      (b) =>
        (b.onclick = () => {
          state.collapsedGroups = state.collapsedGroups || {};
          state.collapsedGroups[b.dataset.group] =
            !state.collapsedGroups[b.dataset.group];
          save();
          renderPanel();
        }),
    );
    $$("[data-booking]").forEach(
      (b) =>
        (b.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            b.click();
          }
        }),
    );
    $("#showFilter").onclick = (e) => showFilter(e.currentTarget);
    if ($("#modify")) $("#modify").onclick = () => showFilter($("#showFilter"));
    if ($("#clear"))
      $("#clear").onclick = () => {
        state.search = "";
        state.seated = false;
        state.coming = false;
        state.shift = "";
        state.filters = {};
        save();
        render();
      };
    if ($("#seated"))
      $("#seated").onclick = () => {
        state.seated = !state.seated;
        save();
        render();
      };
    if ($("#coming"))
      $("#coming").onclick = () => {
        state.coming = !state.coming;
        save();
        render();
      };
    document
      .querySelector(".walkin-head")
      ?.addEventListener("click", () =>
        document.querySelector(".walkin-numbers")?.classList.toggle("hidden"),
      );

    if ($("#addWait")) $("#addWait").onclick = () => bookingModal(true);
    $$("[data-guests]").forEach(
      (e) =>
        (e.onclick = () =>
          bookingModal(false, +e.dataset.guests, null, { walkIn: true })),
    );
    $$("[data-booking]").forEach(
      (e) =>
        (e.onclick = () =>
          bookingModal(
            isWait,
            null,
            entries.find((x) => String(x.id) === e.dataset.booking)?.id,
          )),
    );
  }
  return renderPanel;
}
