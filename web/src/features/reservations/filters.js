import { $, $$, escapeHTML as esc } from "../../lib/dom.js";

import { readResources, readGuests } from "../../services/repositories.js";
import { popAt, hidePop } from "../../components/popover.js";
export function createFilters({ state, save, render }) {
  function showFilter(anchor, configuration = false, pending = null) {
    const choices = [
      "Цикл → Смена",
      "Цикл → Статус",
      "Цикл → Зал",
      "Смена → Статус",
      "Смена",
      "Статус",
      "Зал",
      "Цикл",
      "Без группировки",
    ];
    const statuses = [
      "Не подтверждено",
      "Подтверждено гостем",
      "Подтверждено",
      "Нет ответа",
      "Гость опаздывает",
      "Оставлено сообщение",
      "Опоздание",
      "Неверный номер",
      "Прибыл",
      "Частично прибыл",
      "Частично посажены",
      "За столом",
      "Закуска",
      "Основное блюдо",
      "Десерт",
      "Счёт выдан",
      "Уборка требуется",
      "Уборка выполняется",
      "Отказано",
      "Не пришёл",
      "Отменено",
      "Отменено гостем",
      "Завершено",
    ];
    const draft = structuredClone(
      pending ||
        state.filters || {
          group: 0,
          sort: 0,
          statuses: [],
          rooms: [],
          employees: [],
          types: [],
        },
    );
    function checks(title, key, values) {
      return `<h4>${title}</h4><div class="filter-grid">${values.map(([value, label]) => `<label class="filter-check"><input type="checkbox" data-filter="${key}" value="${esc(value)}" ${(draft[key] || []).includes(value) ? "checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
    }
    popAt(
      anchor,
      `<div class="filter-panel">
 <div class="bottom-buttons filter-tabs"><button class="chip ${configuration ? "" : "active"}" id="sortTab">Сортировка и фильтры</button><button class="chip ${configuration ? "active" : ""}" id="configTab">Настройки</button></div>
 <div class="filter-scroll">${
   configuration
     ? `
 <h4>Вид карточки бронирования</h4>${[
   ["compact", "Компактный"],
   ["detail", "Подробный"],
   ["timer", "Подробный с таймером"],
 ]
   .map(
     ([id, label]) =>
       `<label class="card-choice"><input type="radio" name="cardType" value="${id}" ${(state.cardType || "detail") === id ? "checked" : ""}> ${label}<div class="card-preview"><b>18:30　Имя гостя</b><small>2 гостя · Стол 1${id === "timer" ? " · 1 ч 30 мин" : ""}</small></div></label>`,
   )
   .join("")}
 <h4>Параметры бронирований</h4><label class="filter-check"><input type="checkbox" id="resetStartTime" ${state.resetStartTime ? "checked" : ""}> Менять время начала на текущее при посадке</label>`
     : `
 <h4>Группировать по</h4><div class="filter-grid">${choices.map((n, i) => `<button class="chip ${i === (draft.group || 0) ? "active" : ""}" data-group="${i}">${n}</button>`).join("")}</div>
 <h4>Сортировать по</h4><label><input type="checkbox" id="sortDescending" ${draft.descending ? "checked" : ""}> По убыванию</label><div class="filter-grid">${["Время", "Дата создания", "Имя", "Гости"].map((n, i) => `<button class="chip ${i === (draft.sort || 0) ? "active" : ""}" data-sort="${i}">▲ ${n}</button>`).join("")}</div>
 <div class="flex-between"><h4>Фильтровать по</h4><button class="link-green" id="resetFilters">Очистить</button></div>
 ${checks(
   "Статус",
   "statuses",
   statuses.map((x) => [x, x]),
 )}
 ${checks(
   "Тип бронирования",
   "types",
   ["Онлайн", "В ресторане", "Без бронирования"].map((x) => [x, x]),
 )}
 ${checks(
   "Смены",
   "shifts",
   (readResources().shifts || []).map((s) => [String(s.id), s.name]),
 )}
 ${checks("Залы", "rooms", Object.entries(state.rooms))}
 ${checks(
   "Теги бронирования",
   "tags",
   [
     ...new Set(
       state.reservations.flatMap((r) =>
         String(r.tags || "")
           .split(",")
           .map((t) => t.trim())
           .filter(Boolean),
       ),
     ),
   ].map((t) => [t, t]),
 )}
 ${checks(
   "Теги гостя",
   "guestTags",
   readGuests().tags.map((t) => [t.name, t.name]),
 )}
 ${checks(
   "Источники",
   "sources",
   [
     ...new Set([
       "В ресторане",
       "Телефон",
       "Сайт",
       "Instagram",
       "Facebook",
       "WhatsApp",
       ...state.reservations.map((r) => r.source).filter(Boolean),
     ]),
   ].map((t) => [t, t]),
 )}
 ${checks(
   "Сотрудник",
   "employees",
   state.servers.map((x) => [x.name, x.name]),
 )}`
 }</div>
 <div class="filter-footer"><button class="green full" id="applyFilter">Применить ${configuration ? "настройки" : "изменения"}</button></div></div>`,
    );
    $$("[data-group]").forEach(
      (x) =>
        (x.onclick = () => {
          draft.group = +x.dataset.group;
          $$("[data-group]").forEach((y) =>
            y.classList.toggle("active", y === x),
          );
        }),
    );
    $$("[data-sort]").forEach(
      (x) =>
        (x.onclick = () => {
          draft.sort = +x.dataset.sort;
          $$("[data-sort]").forEach((y) =>
            y.classList.toggle("active", y === x),
          );
        }),
    );
    $("#resetFilters")?.addEventListener("click", () =>
      $$("[data-filter]").forEach((x) => (x.checked = false)),
    );
    $("#applyFilter").onclick = () => {
      if (configuration) {
        state.cardType = $('input[name="cardType"]:checked').value;
        state.resetStartTime = $("#resetStartTime").checked;
      } else {
        for (const key of [
          "statuses",
          "rooms",
          "employees",
          "types",
          "shifts",
          "sources",
          "tags",
          "guestTags",
        ])
          draft[key] = $$(`[data-filter="${key}"]:checked`).map((x) => x.value);
        draft.descending = $("#sortDescending").checked;
        state.filters = draft;
      }
      save();
      hidePop();
      render();
    };
    function capture() {
      if (!configuration) {
        for (const key of [
          "statuses",
          "rooms",
          "employees",
          "types",
          "shifts",
          "sources",
          "tags",
          "guestTags",
        ])
          draft[key] = $$(`[data-filter="${key}"]:checked`).map((x) => x.value);
        draft.descending = $("#sortDescending").checked;
      }
      return draft;
    }
    $("#configTab").onclick = () => showFilter(anchor, true, capture());
    $("#sortTab").onclick = () => showFilter(anchor, false, capture());
  }
  return showFilter;
}
