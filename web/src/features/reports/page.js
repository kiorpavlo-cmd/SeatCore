import { $, escapeHTML as esc } from "../../lib/dom.js";

import { toCSV, download } from "../../services/csv.js";
import { can } from "../../services/access.js";
import { createApi } from "../../services/api.js";
import { toast } from "../../components/toast.js";

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
    const collection =
      label.includes("гост") || label.includes("Лояльность")
        ? "guests"
        : label.includes("отзыв")
          ? "reviews"
          : label === "Журнал действий" || label === "Отчёт об использовании"
            ? "audit"
            : label.includes("ожидания")
              ? "waitlist"
              : "reservations";
    const exportPermission = ["guests", "reviews"].includes(collection)
      ? "download_crm"
      : "download_reservations";
    chrome(
      `<div class="page-toolbar"><input id="report-search" placeholder="Поиск" value="${esc(query)}"><strong>${filtered.length} записей</strong></div>${table(filtered, keys)}`,
      `<button class="outline-green" id="report-export" ${can(exportPermission) ? "" : 'disabled title="Нет права на экспорт"'}>Экспорт CSV</button>`,
    );
    $("#report-search").oninput = (e) => {
      ctx.query = e.target.value;
      report();
      $("#report-search").focus();
    };
    $("#report-export").onclick = async () => {
      try {
        const { records } = await createApi().request(
          "/v1/exports/" + collection,
        );
        const exported = records
          .map((row) =>
            collection === "guests" ? { ...row, name: guestName(row) } : row,
          )
          .filter((row) =>
            JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
          );
        download(
          "report.csv",
          toCSV(
            exported,
            keys.map((x) => x[0]),
          ),
          "text/csv;charset=utf-8",
        );
      } catch (error) {
        toast(error.message);
      }
    };
  }
  return { report };
}
