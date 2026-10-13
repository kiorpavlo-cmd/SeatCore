import { escapeHTML } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  "use strict";
  const STORAGE_KEY = "mio-ru-permissions-v1";
  const roles = [
    "Сотрудник",
    "Кол-центр",
    "Руководитель кол-центра",
    "Менеджер",
    "Групповой менеджер",
  ];
  const definitions = [
    [
      "delete_profiles",
      "Удаление профилей гостей",
      "Безвозвратное удаление профилей гостей",
      "00011",
    ],

    [
      "view_shared",
      "Просмотр общих гостей группы",
      "Просмотр общих гостей других ресторанов группы",
      "00010",
    ],

    [
      "segments",
      "Создание сегментов нескольких ресторанов",
      "Создание сегментов гостей для маркетинговых рассылок",
      "10000",
    ],

    [
      "manage_permissions",
      "Управление правами доступа",
      "Изменение разрешений для ролей",
      "10011",
    ],

    ["import", "Импорт гостей и бронирований", "Импорт данных из CSV", "11111"],

    [
      "navi",
      "Доступ к Navi",
      "Открытие и использование помощника Navi",
      "00111",
    ],

    [
      "manage_guests",
      "Управление гостями",
      "Создание и изменение профилей гостей",
      "11111",
    ],

    [
      "manage_reservations",
      "Управление бронированиями",
      "Создание и изменение бронирований",
      "11111",
    ],

    [
      "merge_guests",
      "Объединение гостей",
      "Объединение повторяющихся профилей",
      "11111",
    ],

    [
      "reservation_taker",
      "Обязательное указание сотрудника при создании",
      "При создании бронирования необходимо указать принявшего его сотрудника",
      "10000",
    ],

    [
      "reservation_editor",
      "Обязательное указание сотрудника при изменении",
      "При редактировании необходимо указать сотрудника",
      "10000",
    ],

    [
      "invoices",
      "Управление счетами",
      "Просмотр и управление счетами",
      "11111",
    ],

    [
      "restaurant_users",
      "Управление пользователями ресторана",
      "Создание профилей новых сотрудников",
      "11111",
    ],

    [
      "admin",
      "Управление административной панелью",
      "Доступ к административным настройкам",
      "11111",
    ],

    [
      "disable_reservation_deletion",
      "Запрет удаления бронирований",
      "Ограничение удаления бронирований, созданных внутри ресторана",
      "10000",
    ],

    [
      "closing_period",
      "Управление блокировкой времени",
      "Блокировка и разблокировка интервалов бронирования",
      "11111",
    ],

    [
      "crm_tagging",
      "Массовое присвоение тегов CRM",
      "Массовое добавление тегов гостям",
      "11111",
    ],

    [
      "tags",
      "Управление тегами",
      "Создание и изменение тегов гостей и бронирований",
      "11111",
    ],

    [
      "crm_messages",
      "Управление CRM-рассылками",
      "Создание маркетинговых сообщений",
      "11111",
    ],

    [
      "message_templates",
      "Управление шаблонами сообщений",
      "Создание и изменение шаблонов SMS и электронной почты",
      "11111",
    ],

    [
      "advanced_reports",
      "Расширенные отчёты",
      "Просмотр полного набора отчётов",
      "11111",
    ],

    [
      "download_reservations",
      "Скачивание отчётов по бронированиям",
      "Экспорт отчётов по бронированиям",
      "11111",
    ],

    ["manage_crm", "Управление CRM", "Просмотр отчётов по гостям", "11111"],

    [
      "download_crm",
      "Скачивание данных CRM",
      "Экспорт отчётов по гостям",
      "11111",
    ],

    [
      "shifts",
      "Управление сменами онлайн-бронирования",
      "Создание и изменение интервалов доступности",
      "11111",
    ],

    [
      "day_notes",
      "Управление заметками дня",
      "Создание и изменение ежедневных заметок",
      "11111",
    ],
  ];
  const defaults = {};
  for (const [id, , , flags] of definitions) {
    defaults[id] = {
      roles: flags.split("").map((x) => x === "1"),
      overrides: [],
    };
  }
  let stored = {};
  try {
    stored = JSON.parse(storage.getItem(STORAGE_KEY)) || {};
  } catch (_) {}
  const permissions = {};
  for (const [id] of definitions) {
    const source = stored[id] || {};
    permissions[id] = {
      roles:
        Array.isArray(source.roles) && source.roles.length === 5
          ? source.roles.map(Boolean)
          : [...defaults[id].roles],
      overrides: Array.isArray(source.overrides)
        ? source.overrides.filter((x) => x && typeof x.email === "string")
        : [],
    };
  }
  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(permissions));
  }
  let current = null;
  let term = "";

  function root() {
    return document.getElementById("permissions-page");
  }
  function showPage(page) {
    current = page;
    term = "";

    document.getElementById("routeFallback")?.remove();
    document.getElementById("overview-view")?.remove();
    document.getElementById("setup-page")?.remove();
    document.getElementById("account-page")?.remove();
    root()?.remove();

    const content = document.querySelector(".content");
    const topbar = document.querySelector(".topbar");

    if (content) content.style.display = "none";
    if (topbar) topbar.style.display = "none";

    const workspace = document.querySelector(".workspace");

    if (!workspace) {
      alert("Не найден контейнер .workspace");
      return;
    }

    const node = document.createElement("section");
    node.id = "permissions-page";
    workspace.appendChild(node);

    render();
  }
  function leavePage() {
    if (!root()) return;

    root().remove();
    current = null;

    const content = document.querySelector(".content");
    const topbar = document.querySelector(".topbar");

    if (topbar) topbar.style.display = "";

    if (
      content &&
      !document.getElementById("overview-view") &&
      !document.getElementById("setup-page") &&
      !document.getElementById("account-page")
    ) {
      content.style.display = "";
    }
  }

  function permissionCard(definition) {
    const [id, title, description] = definition;
    const item = permissions[id];

    return `
      <article class="permissions-card"
               data-card="${id}"
               data-search="${escapeHTML((title + " " + description).toLowerCase())}">

        <div class="permissions-card-title">${escapeHTML(title)}</div>
        <div class="permissions-card-description">
          ${escapeHTML(description)}
        </div>

        <div class="permissions-roles">
          ${roles
            .map(
              (role, index) => `
            <label class="permissions-role">
              <span>${escapeHTML(role)}</span>
              <input type="checkbox"
                     data-permission="${id}"
                     data-role="${index}"
                     ${item.roles[index] ? "checked" : ""}>
            </label>
          `,
            )
            .join("")}
        </div>

        <div class="permissions-override">
          <div class="permissions-override-label">
            Дополнительно разрешено в этом ресторане
          </div>

          <div class="permissions-override-list" data-overrides="${id}">
            ${renderOverrides(id)}
          </div>

          <div class="permissions-override-controls">
            <input type="email"
                   data-override-email="${id}"
                   placeholder="Введите адрес электронной почты">

            <button class="permissions-green"
                    data-add-override="${id}">
              Добавить
            </button>
          </div>
        </div>
      </article>
    `;
  }
  function renderOverrides(id) {
    const items = permissions[id].overrides;

    if (!items.length) {
      return `<div class="permissions-override-empty">
        Индивидуальные разрешения отсутствуют.
      </div>`;
    }

    return items
      .map(
        (item, index) => `
      <div class="permissions-override-item">
        <strong>${escapeHTML(item.email)}</strong>
        <select data-override-value="${id}"
                data-override-index="${index}">
          <option value="allow"
                  ${item.value !== "deny" ? "selected" : ""}>
            Разрешено
          </option>
          <option value="deny"
                  ${item.value === "deny" ? "selected" : ""}>
            Запрещено
          </option>
        </select>

        <button data-remove-override="${id}"
                data-remove-index="${index}">
          Удалить
        </button>
      </div>
    `,
      )
      .join("");
  }
  function renderPermissions() {
    return `
      <div class="permissions-header">ПРАВА ДОСТУПА</div>

      <div class="permissions-scroll" id="permissions-scroll">
        <h2>Пользователи и права доступа</h2>

        <p class="permissions-description">
          Выберите разрешения и настройки для пользователей
        </p>

        <label class="permissions-search">
          <span>⌕</span>
          <input id="permissions-search"
                 placeholder="Поиск по названию разрешения">
        </label>

        <div class="permissions-notice">
          Изменения автоматически сохраняются в этом браузере.
          Разрешения сохраняются как настройки приложения. Проверка доступа требует серверной авторизации.
        </div>

        <div class="permissions-section-heading">
          <span>Разрешения</span>
          <span id="permissions-count"></span>
        </div>

        <div id="permissions-cards">
          ${definitions.map(permissionCard).join("")}
        </div>

        <div id="permissions-empty" class="permissions-table-empty"
             hidden>
          Ничего не найдено
        </div>

        <div class="permissions-bottom">
          <button class="permissions-to-top" id="permissions-top"
                  title="Наверх">
            ↑
          </button>
        </div>
      </div>
    `;
  }
  function filterCards() {
    const cards = [...root().querySelectorAll("[data-card]")];
    let visible = 0;

    for (const card of cards) {
      const found = card.dataset.search.includes(term.toLowerCase().trim());

      card.hidden = !found;

      if (found) visible++;
    }

    root().querySelector("#permissions-count").textContent =
      visible + " из " + definitions.length;

    root().querySelector("#permissions-empty").hidden = visible !== 0;
  }
  function refreshOverrides(id) {
    const node = root().querySelector(`[data-overrides="${id}"]`);

    if (node) node.innerHTML = renderOverrides(id);
  }
  function render() {
    if (!root()) return;

    root().innerHTML = renderPermissions();
    root()
      .querySelector("#permissions-search")
      .addEventListener("input", (event) => {
        term = event.target.value;
        filterCards();
      });

    root().onchange = (event) => {
      const checkbox = event.target.closest("[data-permission][data-role]");

      if (checkbox) {
        const id = checkbox.dataset.permission;
        const index = Number(checkbox.dataset.role);

        permissions[id].roles[index] = checkbox.checked;
        persist();
        return;
      }

      const select = event.target.closest("[data-override-value]");

      if (select) {
        const id = select.dataset.overrideValue;
        const index = Number(select.dataset.overrideIndex);

        if (permissions[id].overrides[index]) {
          permissions[id].overrides[index].value = select.value;
          persist();
        }
      }
    };

    root().onclick = (event) => {
      const add = event.target.closest("[data-add-override]");

      if (add) {
        const id = add.dataset.addOverride;
        const input = root().querySelector(`[data-override-email="${id}"]`);

        const email = input.value.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          alert("Укажите корректную электронную почту.");
          input.focus();
          return;
        }

        const existing = permissions[id].overrides.some(
          (entry) => entry.email.toLowerCase() === email,
        );

        if (existing) {
          alert("Этот адрес уже добавлен.");
          return;
        }

        permissions[id].overrides.push({
          email,
          value: "allow",
        });

        persist();
        refreshOverrides(id);
        input.value = "";
        return;
      }

      const remove = event.target.closest("[data-remove-override]");

      if (remove) {
        const id = remove.dataset.removeOverride;
        const index = Number(remove.dataset.removeIndex);

        permissions[id].overrides.splice(index, 1);
        persist();
        refreshOverrides(id);
        return;
      }

      if (event.target.closest("#permissions-top")) {
        root()
          .querySelector("#permissions-scroll")
          .scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    filterCards();
  }
  return { mount: () => showPage("permissions"), unmount: leavePage };
}
