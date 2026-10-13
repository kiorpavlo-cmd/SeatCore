import { readGuests, readResources } from "../services/repositories.js";
import { createDataPage } from "../features/data/page.js";
import { createReportsPage } from "../features/reports/page.js";
import { createResourcesPage } from "../features/resources/page.js";
import { $, escapeHTML as esc } from "../lib/dom.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
import { resources, externalRoutes } from "../config/resources.js";
import { download } from "../services/csv.js";
import { toast } from "../components/toast.js";

export function createPage(app) {
  let section,
    label,
    query = "";
  const root = () => $("#operations-page");
  const repository = readResources;
  const guestData = readGuests;
  const guestName = (g) => [g.first, g.last].filter(Boolean).join(" ");
  function mount(params) {
    ({ section, label } = params);
    query = "";
    $(".content").style.display = "none";
    $(".topbar").style.display = "none";
    const node = document.createElement("section");
    node.id = "operations-page";
    $(".workspace").append(node);
    render();
  }
  function unmount() {
    root()?.remove();
    $("#operation-modal")?.remove();
  }
  function table(rows, keys) {
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${keys.map(([key, title]) => `<th>${esc(title)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map(([key]) => `<td>${esc(row[key])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${keys.length}" class="data-empty">Нет записей</td></tr>`}</tbody></table></div>`;
  }
  function chrome(body, actions = "") {
    root().innerHTML = `<header class="page-titlebar">${esc(label || "Поддержка")}</header><div class="operations-scroll"><div class="page-heading"><h1>${esc(label || "Поддержка")}</h1>${actions}</div>${body}</div>`;
  }
  function render() {
    if (!root()) return;
    if (resources[label]) return resource();
    if (section === "reports" || label === "Журнал действий") return report();
    if (label === "Календарь") return calendar();
    if (label === "Блокировка часов") return blockList();
    if (label === "Лист ожидания") {
      app.state.tab = "waitlist";
      app.save();
      app.navigate("view/План зала");
      return;
    }
    if (label === "Импорт гостей" || label === "Импорт бронирований")
      return importPage();
    if (label === "Очистка базы данных") return cleanup();
    if (label === "Импорт плана зала") return floorImport();
    if (label === "Ссылки на чат WhatsApp") return links();
    if (label === "Настройки принтера") {
      chrome(
        "<p>Распечатайте текущий план или список бронирований средствами браузера.</p>",
        '<button id="print" class="green">Печать</button>',
      );
      $("#print").onclick = () => window.print();
      return;
    }
    if (externalRoutes.has(label)) return connection();
    return settings();
  }

  function calendar() {
    const month = app.state.date.slice(0, 7),
      [year, m] = month.split("-").map(Number),
      count = new Date(year, m, 0).getDate();
    chrome(
      `<div class="page-toolbar"><label>Месяц <input id="calendar-month" type="month" value="${month}"></label></div><div class="availability-grid">${Array.from(
        { length: count },
        (_, i) => {
          const date = month + "-" + String(i + 1).padStart(2, "0"),
            bookings = app.state.reservations.filter((r) => r.date === date);
          return `<button class="calendar-day" data-date="${date}"><strong>${i + 1}</strong><span>${bookings.length} бронирований</span><small>${bookings.reduce((n, r) => n + r.guests, 0)} гостей</small></button>`;
        },
      ).join("")}</div>`,
    );
    $("#calendar-month").onchange = (e) => {
      if (!e.target.value) return;
      app.state.date = e.target.value + "-01";
      app.save();
      calendar();
    };
    root()
      .querySelectorAll("[data-date]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            app.state.date = b.dataset.date;
            app.save();
            app.render();
            app.navigate("view/Список");
          }),
      );
  }
  function blockList() {
    const rows = storage.read(STORAGE_KEYS.blocks, []);
    chrome(
      table(
        rows.map((x) => ({
          ...x,
          tables: x.tables?.join(", ") || "Все столы",
        })),
        [
          ["start", "Начало"],
          ["end", "Окончание"],
          ["tables", "Столы"],
        ],
      ) +
        rows
          .map(
            (x) =>
              `<button class="danger" data-remove-block="${x.id}">Снять ограничение ${esc(x.start)}</button>`,
          )
          .join(""),
      '<button id="add-block" class="green">＋ Ограничение</button>',
    );
    $("#add-block").onclick = (e) => app.toolbar.blockHours(e.currentTarget);
    root()
      .querySelectorAll("[data-remove-block]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            storage.write(
              STORAGE_KEYS.blocks,
              rows.filter((x) => String(x.id) !== b.dataset.removeBlock),
            );
            render();
          }),
      );
  }

  function links() {
    chrome(
      '<label class="settings-field">Телефон<input id="whatsapp-phone" placeholder="37060000000"></label><label class="settings-field">Текст<textarea id="whatsapp-text"></textarea></label><p><a id="whatsapp-link" target="_blank" rel="noopener noreferrer">Ссылка</a></p>',
    );
    function update() {
      const phone = $("#whatsapp-phone").value.replace(/\D/g, "");
      const link = $("#whatsapp-link");
      link.href =
        "https://wa.me/" +
        phone +
        "?text=" +
        encodeURIComponent($("#whatsapp-text").value);
      link.textContent = phone ? link.href : "Введите телефон";
    }
    $("#whatsapp-phone").oninput = update;
    $("#whatsapp-text").oninput = update;
    update();
  }
  function connection() {
    chrome(
      `<div class="connection-card"><h2>${esc(label)}</h2><p>Требуется серверный сервис и авторизованное подключение провайдера. В исходном проекте подключения нет.</p><p>Платежи, отправка сообщений и работа внешних сервисов недоступны в локальной версии.</p><button class="outline-green" id="connection-back">Профиль ресторана</button></div>`,
    );
    $("#connection-back").onclick = () =>
      app.navigate("account/Профиль ресторана");
  }
  function settings() {
    const support = {
      email: "support@eatapp.example",
      phone: "+1 202-555-0147",
      hours: "Пн–Пт, 09:00–18:00 (UTC)",
      languages: "Русский, English",
    };

    chrome(`
      <div class="settings-card">
        <h2>Техническая поддержка</h2>
        <p>Если у вас возникли вопросы или проблемы
        при работе с EatApp, свяжитесь с поддержкой.</p>

        <h3>Электронная почта</h3>
        <p>${esc(support.email)}</p>
        <button class="outline-green" id="copy-support-email">
          Копировать email
        </button>

        <h3>Телефон</h3>
        <p>${esc(support.phone)}</p>
        <button class="outline-green" id="copy-support-phone">
          Копировать телефон
        </button>

        <h3>Часы работы</h3>
        <p>${esc(support.hours)}</p>

        <h3>Языки поддержки</h3>
        <p>${esc(support.languages)}</p>

        <p style="color:#888;font-size:13px;margin-top:24px">
          Демонстрационные контактные данные.
          Реальная служба поддержки пока не подключена.
        </p>
      </div>
    `);

    $("#copy-support-email").onclick = async () => {
      try {
        await globalThis.navigator.clipboard.writeText(support.email);
        toast("Email скопирован");
      } catch {
        toast("Не удалось скопировать email");
      }
    };

    $("#copy-support-phone").onclick = async () => {
      try {
        await globalThis.navigator.clipboard.writeText(support.phone);
        toast("Телефон скопирован");
      } catch {
        toast("Не удалось скопировать телефон");
      }
    };
  }

  const { log, resource, edit } = createResourcesPage(app, {
    get label() {
      return label;
    },
    get section() {
      return section;
    },
    get query() {
      return query;
    },
    set query(value) {
      query = value;
    },
    root,
    chrome,
    repository,
    guestData,
    render,
  });
  const { report } = createReportsPage(app, {
    get label() {
      return label;
    },
    get query() {
      return query;
    },
    set query(value) {
      query = value;
    },
    repository,
    guestData,
    guestName,
    chrome,
    table,
  });
  const { importPage, cleanup, floorImport } = createDataPage(app, {
    get label() {
      return label;
    },
    root,
    chrome,
    table,
    guestData,
    guestName,
    log,
    render,
  });
  return { mount, unmount, refresh: render };
}
