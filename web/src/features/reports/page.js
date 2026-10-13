import { $, escapeHTML as esc } from "../../lib/dom.js";

import { toCSV, download } from "../../services/csv.js";

export function createReportsPage(app, ctx) {
  function report() {
    const { label, query, repository, guestData, guestName, chrome, table } =
      ctx;
    const data = repository();
    let rows, keys;
    if (label === "Журнал действий" || label === "Отчёт об использовании") {
      rows = data.audit || [];
      keys = [
        ["date", "Дата"],
        ["name", "Раздел"],
        ["action", "Действие"],
      ];
    } else if (label.includes("гост") || label.includes("Лояльность")) {
      rows = guestData().guests.map((g) => ({ ...g, name: guestName(g) }));
      keys = [
        ["name", "Гость"],
        ["phone", "Телефон"],
        ["email", "Почта"],
      ];
    } else if (label.includes("платеж") || label === "Заказы POS") {
      rows =
        label === "Заказы POS" ? data.posOrders || [] : data.payments || [];
      keys = [
        ["name", "Номер"],
        ["date", "Дата"],
        ["amount", "Сумма"],
        ["currency", "Валюта"],
        ["status", "Статус"],
      ];
    } else if (label.includes("ваучер")) {
      rows = data.vouchers || [];
      keys = [
        ["name", "Код"],
        ["amount", "Номинал"],
        ["status", "Статус"],
      ];
    } else if (label.includes("отзыв")) {
      rows = data.reviews || [];
      keys = [
        ["name", "Гость"],
        ["rating", "Оценка"],
        ["body", "Отзыв"],
      ];
    } else {
      rows = label.includes("ожидания")
        ? app.state.waitlist
        : app.state.reservations;
      keys = [
        ["date", "Дата"],
        ["time", "Время"],
        ["name", "Гость"],
        ["guests", "Гостей"],
        ["table", "Стол"],
        ["status", "Статус"],
      ];
    }
    const filtered = rows.filter((x) =>
      JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
    );
    chrome(
      `<div class="page-toolbar"><input id="report-search" placeholder="Поиск" value="${esc(query)}"><strong>${filtered.length} записей</strong></div>${table(filtered, keys)}`,
      '<button class="outline-green" id="report-export">Экспорт CSV</button>',
    );
    $("#report-search").oninput = (e) => {
      ctx.query = e.target.value;
      report();
      $("#report-search").focus();
    };
    $("#report-export").onclick = () =>
      download(
        "report.csv",
        toCSV(
          filtered,
          keys.map((x) => x[0]),
        ),
        "text/csv;charset=utf-8",
      );
  }
  return { report };
}
