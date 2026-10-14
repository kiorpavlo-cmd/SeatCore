import {
  ROLES as roles,
  PERMISSION_DEFINITIONS as definitions,
} from "../../../server/contracts/permissions.js";
import { escapeHTML } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  "use strict";
  const STORAGE_KEY = "mio-ru-permissions-v1";
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
          Изменения сохраняются на сервере. Роли и индивидуальные разрешения проверяются при каждом действии. Владелец сохраняет полный доступ.
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
