import { escapeHTML as esc } from "../lib/dom.js";
import { readResources } from "../services/repositories.js";
import { createResourcesPage } from "../features/resources/page.js";
import { resources } from "../config/resources.js";
import { popAt, hidePop } from "../components/popover.js";
const categories = [
  ["contactless", "Бесконтактные"],
  ["preorder", "Предзаказы"],
  ["pickup", "Самовывоз"],
  ["delivery", "Доставка"],
];
const statuses = [
  "Не подтверждён",
  "Подтверждён",
  "Готов",
  "Выдан",
  "Отменён",
  "Отказано",
  "Завершён",
];
const payments = ["Не оплачен", "Частично оплачен", "Оплачен"];
export function createPage(app) {
  let root;
  const options = Object.fromEntries(
    categories.map(([key]) => [
      key,
      {
        query: "",
        statuses: [],
        payments: [],
        sort: "time",
        group: false,
        desc: false,
      },
    ]),
  );
  const schema = {
    id: "orders",
    fields: [
      ...resources.Заказы.fields.filter((f) => f.key !== "status"),
      { key: "time", label: "Время", type: "time" },
      {
        key: "category",
        label: "Тип заказа",
        options: categories.map(([, name]) => name),
      },
      { key: "status", label: "Статус", options: statuses },
      { key: "paymentStatus", label: "Оплата", options: payments },
      { key: "notes", label: "Комментарий", type: "textarea" },
    ],
  };
  const { edit } = createResourcesPage(app, {
    label: "Заказы",
    section: "view",
    query: "",
    root: () => root,
    chrome: () => {},
    repository: readResources,
    guestData: () => ({ guests: [] }),
    render,
  });
  function category(row) {
    return (
      categories.find(
        ([key, name]) => row.category === key || row.category === name,
      )?.[0] || "contactless"
    );
  }
  function orderStatus(row) {
    return (
      { Новый: "Не подтверждён", Готовится: "Подтверждён" }[row.status] ||
      row.status ||
      "Не подтверждён"
    );
  }
  function render() {
    if (!root) return;
    const all = readResources().orders || [];
    root.innerHTML = `<div class="overview-orders">${categories
      .map(([key, name]) => {
        const filter = options[key];
        const rows = all
          .filter(
            (r) =>
              (!r.date || r.date === app.state.date) &&
              category(r) === key &&
              [r.name, r.guest, r.table, r.notes]
                .join(" ")
                .toLowerCase()
                .includes(filter.query.toLowerCase()) &&
              (!filter.statuses.length ||
                filter.statuses.includes(orderStatus(r))) &&
              (!filter.payments.length ||
                filter.payments.includes(r.paymentStatus || "Не оплачен")),
          )
          .sort(
            (a, b) =>
              (filter.desc ? -1 : 1) *
              (filter.sort === "amount"
                ? Number(a.amount || 0) - Number(b.amount || 0)
                : String(a[filter.sort] || a.time || "").localeCompare(
                    String(b[filter.sort] || b.time || ""),
                    "ru",
                  )),
          );
        const groups = filter.group
          ? [...new Set(rows.map(orderStatus))].map((status) => ({
              name: status,
              rows: rows.filter((r) => orderStatus(r) === status),
            }))
          : [{ name: "", rows }];
        return `<section class="overview-order-col"><header class="overview-order-head"><strong>${name}</strong> <span>${rows.length}</span><button class="outline-green" data-add-order="${key}" aria-label="Добавить: ${name}">＋</button></header><div class="order-toolbar"><input data-order-search="${key}" aria-label="Поиск: ${name}" placeholder="Поиск заказов" value="${esc(filter.query)}"><button data-order-filter="${key}" aria-label="Фильтры: ${name}">☰</button><select data-order-sort="${key}" aria-label="Сортировка: ${name}">${[
          ["time", "Время начала"],
          ["name", "Название"],
          ["amount", "Сумма"],
        ]
          .map(
            ([v, n]) =>
              `<option value="${v}" ${filter.sort === v ? "selected" : ""}>${n}</option>`,
          )
          .join(
            "",
          )}</select><button data-order-desc="${key}" aria-label="Направление сортировки: ${name}">${filter.desc ? "↓" : "↑"}</button><button data-order-group="${key}" aria-pressed="${filter.group}">Группировать по статусу</button></div><div class="order-scroll">${groups.map((g) => `${g.name ? `<h3 class="order-group">${esc(g.name)}</h3>` : ""}${g.rows.map((r) => `<button class="order-card" data-edit-order="${esc(r.id)}"><strong>${esc(r.name)}</strong><span>${esc(r.time || "—")} · ${esc(r.guest || "Гость не указан")}</span><span>${esc(orderStatus(r))} · ${esc(r.paymentStatus || "Не оплачен")}</span><span>${Number(r.amount || 0).toFixed(2)} € · Стол ${esc(r.table || "—")}</span><small>${esc(r.notes || "")}</small></button>`).join("")}`).join("") || '<div class="overview-order-empty">Нет заказов</div>'}</div></section>`;
      })
      .join("")}</div>`;
    root.querySelectorAll("[data-order-search]").forEach(
      (input) =>
        (input.oninput = () => {
          const key = input.dataset.orderSearch,
            cursor = input.selectionStart;
          options[key].query = input.value;
          render();
          const next = root.querySelector(`[data-order-search="${key}"]`);
          next.focus();
          next.setSelectionRange(cursor, cursor);
        }),
    );
    root.querySelectorAll("[data-order-sort]").forEach(
      (input) =>
        (input.onchange = () => {
          options[input.dataset.orderSort].sort = input.value;
          render();
        }),
    );
    root.querySelectorAll("[data-order-desc]").forEach(
      (b) =>
        (b.onclick = () => {
          options[b.dataset.orderDesc].desc =
            !options[b.dataset.orderDesc].desc;
          render();
        }),
    );
    root.querySelectorAll("[data-order-group]").forEach(
      (b) =>
        (b.onclick = () => {
          options[b.dataset.orderGroup].group =
            !options[b.dataset.orderGroup].group;
          render();
        }),
    );
    root.querySelectorAll("[data-add-order]").forEach(
      (b) =>
        (b.onclick = () =>
          edit(schema, {
            date: app.state.date,
            category: categories.find(([key]) => key === b.dataset.addOrder)[1],
            status: statuses[0],
            paymentStatus: payments[0],
          })),
    );
    root.querySelectorAll("[data-edit-order]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = all.find((r) => String(r.id) === b.dataset.editOrder);
          edit(schema, {
            ...row,
            status: orderStatus(row),
            category: categories.find(([key]) => key === category(row))[1],
          });
        }),
    );
    root.querySelectorAll("[data-order-filter]").forEach(
      (b) =>
        (b.onclick = () => {
          const filter = options[b.dataset.orderFilter];
          popAt(
            b,
            `<div class="filter-panel"><h3>Статус заказа</h3>${statuses.map((s) => `<label class="filter-check"><input type="checkbox" data-order-status value="${esc(s)}" ${filter.statuses.includes(s) ? "checked" : ""}>${s}</label>`).join("")}<h3>Статус оплаты</h3>${payments.map((s) => `<label class="filter-check"><input type="checkbox" data-order-payment value="${s}" ${filter.payments.includes(s) ? "checked" : ""}>${s}</label>`).join("")}<button id="order-clear" class="link-green">Очистить фильтры</button><button id="order-apply" class="green full">Применить изменения</button></div>`,
          );
          document.querySelector("#order-clear").onclick = () =>
            document
              .querySelectorAll("#popover input")
              .forEach((x) => (x.checked = false));
          document.querySelector("#order-apply").onclick = () => {
            filter.statuses = [
              ...document.querySelectorAll("[data-order-status]:checked"),
            ].map((x) => x.value);
            filter.payments = [
              ...document.querySelectorAll("[data-order-payment]:checked"),
            ].map((x) => x.value);
            hidePop();
            render();
          };
        }),
    );
  }
  return {
    mount() {
      document.querySelector(".content").style.display = "none";
      root = document.createElement("section");
      root.id = "overview-view";
      document.querySelector(".workspace").append(root);
      render();
    },
    unmount() {
      root?.remove();
      root = null;
      document.querySelector("#operation-modal")?.remove();
    },
    refresh: render,
  };
}
