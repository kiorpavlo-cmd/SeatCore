import { $, escapeHTML as esc, uid } from "../../lib/dom.js";
import { storage, STORAGE_KEYS } from "../../services/storage.js";
import { resources } from "../../config/resources.js";
import { toCSV, download } from "../../services/csv.js";

import { toast } from "../../components/toast.js";
export function createResourcesPage(app, ctx) {
  function log(action) {
    const {
      label,
      section,
      query,
      root,
      chrome,
      repository,
      guestData,
      render,
    } = ctx;
    const data = repository();
    data.audit = data.audit || [];
    data.audit.push({ date: new Date().toISOString(), name: label, action });
    data.audit = data.audit.slice(-500);
    storage.write(STORAGE_KEYS.resources, data);
  }
  function resource() {
    const {
      label,
      section,
      query,
      root,
      chrome,
      repository,
      guestData,
      render,
    } = ctx;
    const schema = resources[label],
      data = repository(),
      all = data[schema.id] || [],
      rows = all.filter((x) =>
        JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
      );
    chrome(
      `${section === "messaging" || label === "Рассылки и кампании" ? '<p class="notice">Сохраняются шаблоны и черновики. Отправка требует подключения сервиса сообщений.</p>' : ""}<div class="page-toolbar"><input id="resource-search" placeholder="Поиск по названию" value="${esc(query)}"><span>${rows.length} записей</span><button class="outline-green" id="resource-export">Экспорт CSV</button></div><div class="resource-list">${
        rows
          .map(
            (x) =>
              `<article class="resource-row"><div><strong>${esc(x.name)}</strong><small>${schema.fields
                .slice(1)
                .map((f) => esc(x[f.key]))
                .filter(Boolean)
                .join(
                  " · ",
                )}</small>${schema.id === "segments" ? `<small>Гостей: ${guestData().guests.filter((g) => (!x.query || JSON.stringify(g).toLowerCase().includes(x.query.toLowerCase())) && (x.consent !== "Только с согласием" || g.marketing)).length}</small>` : ""}</div><button data-edit="${esc(x.id)}" class="outline-green">Изменить</button><button data-delete="${esc(x.id)}" class="danger">Удалить</button></article>`,
          )
          .join("") ||
        '<div class="data-empty">Нет записей. Создайте первую запись.</div>'
      }</div>`,
      '<button class="green" id="resource-add">＋ Добавить</button>',
    );
    $("#resource-search").oninput = (e) => {
      ctx.query = e.target.value;
      const cursor = e.target.selectionStart;
      resource();
      $("#resource-search").focus();
      $("#resource-search").setSelectionRange(cursor, cursor);
    };
    $("#resource-add").onclick = () => edit(schema);
    $("#resource-export").onclick = () =>
      download(schema.id + ".csv", toCSV(rows), "text/csv;charset=utf-8");
    root()
      .querySelectorAll("[data-edit]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            edit(
              schema,
              all.find((x) => x.id === b.dataset.edit),
            )),
      );
    root()
      .querySelectorAll("[data-delete]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            if (!confirm("Удалить запись?")) return;
            data[schema.id] = all.filter((x) => x.id !== b.dataset.delete);
            storage.write(STORAGE_KEYS.resources, data);
            log("Удаление");
            render();
          }),
      );
  }
  function edit(schema, item = {}) {
    const {
      label,
      section,
      query,
      root,
      chrome,
      repository,
      guestData,
      render,
    } = ctx;
    const modal = document.createElement("div");
    modal.id = "operation-modal";
    modal.className = "operation-overlay";
    modal.innerHTML = `<form class="operation-dialog"><div class="flex-between"><h2>${item.id ? "Изменить" : "Новая запись"}</h2><button type="button" id="operation-close" aria-label="Закрыть">×</button></div>${schema.fields.map((f) => `<label>${esc(f.label)}${f.options ? `<select name="${f.key}">${f.options.map((x) => `<option ${item[f.key] === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : f.type === "textarea" ? `<textarea name="${f.key}">${esc(item[f.key])}</textarea>` : `<input name="${f.key}" type="${f.type || "text"}" ${f.required ? "required" : ""} ${f.type === "number" ? 'min="0" step="any"' : ""} value="${esc(item[f.key] ?? "")}">`}</label>`).join("")}<p id="operation-error" role="alert"></p><button class="green">Сохранить</button></form>`;
    document.body.append(modal);
    $("#operation-close").onclick = () => modal.remove();
    modal.querySelector("input")?.focus();
    modal.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const entry = {
        ...item,
        id: item.id || uid(),
        ...Object.fromEntries(new FormData(e.target)),
      };
      for (const f of schema.fields) {
        if (f.type === "number" && entry[f.key] !== "")
          entry[f.key] = Number(entry[f.key]);
        if (f.required && !String(entry[f.key] ?? "").trim()) return;
      }
      if (schema.id === "shifts" && entry.start >= entry.end) {
        $("#operation-error").textContent =
          "Окончание смены должно быть позже начала";
        return;
      }
      if (
        schema.id === "reviews" &&
        (!Number.isInteger(entry.rating) ||
          entry.rating < 1 ||
          entry.rating > 5)
      ) {
        $("#operation-error").textContent = "Оценка должна быть от 1 до 5";
        return;
      }
      if (schema.id === "seating" && Number(entry.max) < Number(entry.min)) {
        $("#operation-error").textContent =
          "Максимум гостей не может быть меньше минимума";
        return;
      }
      if (schema.id === "discounts" && Number(entry.percent) > 100) {
        $("#operation-error").textContent = "Скидка не может превышать 100%";
        return;
      }
      const data = repository(),
        rows = data[schema.id] || [];
      data[schema.id] = item.id
        ? rows.map((x) => (x.id === item.id ? entry : x))
        : [...rows, entry];
      if (!storage.write(STORAGE_KEYS.resources, data)) return;
      log(item.id ? "Изменение" : "Создание");
      modal.remove();
      render();
      toast(
        storage.persistence.mode === "server"
          ? "Сохраняем на сервере…"
          : "Сохранено",
      );
    };
  }
  return { log, resource, edit };
}
