import { readFields } from "../services/repositories.js";
import { $, escapeHTML as esc } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  "use strict";
  const KEY = "eatapp-ru-stage10-v1";
  const TYPE_NAMES = {
    text: "Текстовое поле",
    boolean: "Да / Нет",
    tickets: "Счётчик билетов",
    items: "Счётчик предметов",
    multiple: "Множественный выбор",
  };
  let records = readFields();
  let scope = "reservation";
  let search = "";
  let editingId = null;

  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    "field_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const save = () => storage.setItem(KEY, JSON.stringify(records));
  const root = () => $("#customField-root");

  function mount() {
    const element = document.createElement("section");
    element.id = "customField-root";
    document.querySelector(".workspace").append(element);
    document.querySelector(".content").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    return true;
  }
  function close() {
    closeModal();
    root()?.remove();
  }
  function open() {
    records = readFields();
    if (mount()) render();
  }
  function filteredRecords() {
    return records.filter(
      (item) =>
        item.scope === scope &&
        (item.label.toLowerCase().includes(search.toLowerCase()) ||
          item.variable.toLowerCase().includes(search.toLowerCase())),
    );
  }
  function render() {
    if (!root()) return;

    const list = filteredRecords();

    root().innerHTML = `
      <header class="customField-header">ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ</header>

      <div class="customField-layout">
        <aside class="customField-menu">
          <button data-scope="reservation"
            class="${scope === "reservation" ? "active" : ""}">
            Поля бронирований
          </button>
          <button data-scope="guest"
            class="${scope === "guest" ? "active" : ""}">
            Поля гостей
          </button>
        </aside>

        <section class="customField-content">
          <h2>Управление дополнительными полями</h2>
          <p class="customField-muted">
            ${
              scope === "reservation"
                ? "Настройка дополнительных полей бронирований"
                : "Настройка дополнительных полей гостей"
            }
          </p>

          <div class="customField-toolbar">
            <button class="customField-primary" data-action="create">
              Новое поле
            </button>
            <input id="customField-search"
              placeholder="Поиск по названию или переменной"
              value="${esc(search)}">
          </div>

          <div class="customField-table-wrap">
            <table class="customField-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Переменная</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map(
                          (item) => `
                  <tr>
                    <td><strong>${esc(item.label)}</strong></td>
                    <td><code>${esc(item.variable)}</code></td>
                    <td>${esc(TYPE_NAMES[item.type] || item.type)}</td>
                    <td>
                      <span class="customField-status ${item.active ? "on" : "off"}">
                        ${item.active ? "Активно" : "Отключено"}
                      </span>
                    </td>
                    <td>
                      <button class="customField-link"
                        data-edit="${esc(item.id)}">
                        Изменить
                      </button>
                    </td>
                  </tr>
                `,
                        )
                        .join("")
                    : `
                  <tr>
                    <td colspan="5" class="customField-empty">
                      Нет дополнительных полей
                    </td>
                  </tr>
                `
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    bindPage();
  }
  function closeModal() {
    $("#customField-overlay")?.remove();
  }
  function getRecord() {
    return records.find((item) => item.id === editingId);
  }
  function readOptions(element) {
    return String(element?.value || "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  function showOptions(type) {
    const options = $("#customField-options-wrap");
    const label = $("#customField-options-label");

    if (!options || !label) return;

    const needsOptions = ["multiple", "tickets", "items"].includes(type);

    options.hidden = !needsOptions;

    label.textContent =
      type === "multiple"
        ? "Варианты ответа (по одному в строке)"
        : "Названия доступных вариантов (по одному в строке)";
  }
  function fieldModal(id = null) {
    editingId = id;

    const item = getRecord();

    closeModal();

    const overlay = document.createElement("div");
    overlay.id = "customField-overlay";

    overlay.innerHTML = `
      <div class="customField-dialog" role="dialog"
        aria-modal="true"
        aria-label="Редактирование дополнительного поля">

        <div class="customField-dialog-head">
          <h2>${item ? "Изменить поле" : "Создать новое поле"}</h2>
          <button data-close aria-label="Закрыть">×</button>
        </div>

        <form id="customField-form">
          <label for="customField-label">Название поля</label>
          <input id="customField-label" name="label" required
            maxlength="120"
            value="${esc(item?.label || "")}">

          <label for="customField-variable">
            Переменная для сообщений и автоматизации
          </label>
          <input id="customField-variable" name="variable" required
            maxlength="100"
            placeholder="например: guest_preference"
            pattern="[A-Za-z][A-Za-z0-9_]*"
            value="${esc(item?.variable || "")}">
          <small>
            Только латинские буквы, цифры и _. Первый символ — буква.
          </small>

          <label for="customField-type">Тип поля</label>
          <select id="customField-type" name="type">
            ${Object.entries(TYPE_NAMES)
              .map(
                ([key, name]) => `
              <option value="${key}"
                ${item?.type === key ? "selected" : ""}>
                ${name}
              </option>
            `,
              )
              .join("")}
          </select>

          <div id="customField-options-wrap" hidden>
            <label id="customField-options-label"
              for="customField-options">Варианты</label>
            <textarea id="customField-options" rows="4"
              placeholder="Первый вариант&#10;Второй вариант">${esc(
                (item?.options || []).join("\n"),
              )}</textarea>
          </div>

          <label class="customField-checkbox">
            <input id="customField-active" type="checkbox"
              ${item?.active !== false ? "checked" : ""}>
            Поле активно
          </label>

          <div class="customField-modal-footer">
            ${
              item
                ? `
              <button type="button" class="customField-danger"
                data-delete>Удалить поле</button>
            `
                : "<span></span>"
            }

            <div>
              <button type="button" class="customField-secondary"
                data-close>Отмена</button>
              <button type="submit" class="customField-primary">
                ${item ? "Сохранить изменения" : "Создать поле"}
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form = $("#customField-form", overlay);
    const type = $("#customField-type", overlay);

    showOptions(type.value);

    type.addEventListener("change", () => showOptions(type.value));

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-close]")) {
        closeModal();
      }

      if (event.target.closest("[data-delete]")) {
        if (!confirm("Удалить это поле без возможности восстановления?"))
          return;

        records = records.filter((x) => x.id !== editingId);
        save();
        editingId = null;
        closeModal();
        render();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const label = $("#customField-label").value.trim();
      const variable = $("#customField-variable").value.trim();
      const fieldType = type.value;
      const active = $("#customField-active").checked;

      if (!label || !/^[A-Za-z][A-Za-z0-9_]*$/.test(variable)) {
        alert("Проверьте название и переменную.");
        return;
      }

      const duplicate = records.some(
        (x) =>
          x.id !== editingId &&
          x.variable.toLowerCase() === variable.toLowerCase() &&
          x.scope === scope,
      );

      if (duplicate) {
        alert("Поле с такой переменной уже существует.");
        return;
      }

      const options = ["multiple", "tickets", "items"].includes(fieldType)
        ? readOptions($("#customField-options"))
        : [];

      if (fieldType === "multiple" && options.length < 2) {
        alert("Для множественного выбора нужно минимум два варианта.");
        return;
      }

      if (
        options.length !== new Set(options.map((x) => x.toLowerCase())).size
      ) {
        alert("Варианты не должны повторяться.");
        return;
      }

      const record = {
        id: editingId || uid(),
        scope: item?.scope || scope,
        label,
        variable,
        type: fieldType,
        options,
        active,
        createdAt: item?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (item) {
        Object.assign(item, record);
      } else {
        records.push(record);
      }

      save();
      editingId = null;
      closeModal();
      render();
    });

    $("#customField-label", overlay)?.focus();
  }
  function bindPage() {
    const page = root();

    page.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-scope]");

      if (tab) {
        scope = tab.dataset.scope;
        search = "";
        render();
        return;
      }

      if (event.target.closest('[data-action="create"]')) {
        fieldModal();
        return;
      }

      const edit = event.target.closest("[data-edit]");

      if (edit) fieldModal(edit.dataset.edit);
    });

    const input = $("#customField-search", page);

    input?.addEventListener("input", (event) => {
      search = event.target.value;
      const position = event.target.selectionStart;
      render();

      const next = $("#customField-search");
      next.focus();
      next.setSelectionRange(position, position);
    });
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && $("#customField-overlay")) {
        event.stopImmediatePropagation();
        closeModal();
      }
    },
    true,
  );
  return {
    mount: open,
    unmount: close,
    getFields: (requestedScope) =>
      records
        .filter((x) => x.scope === requestedScope)
        .map((x) => structuredClone(x)),
  };
}
