import { $, escapeHTML as esc, uid } from "../../lib/dom.js";
import { storage, STORAGE_KEYS } from "../../services/storage.js";

import { parseCSV, download } from "../../services/csv.js";
import { validateReservation } from "../../services/reservations.js";
import { toast } from "../../components/toast.js";
export function createDataPage(app, ctx) {
  function importPage() {
    const { label, root, chrome, table, guestData, guestName, log, render } =
      ctx;
    const guest = label === "Импорт гостей",
      example = guest
        ? "first,last,phone,email"
        : "name,date,time,guests,table,room,duration";
    chrome(
      `<p>UTF-8 CSV с заголовками: ${example}. Все записи проверяются до сохранения.</p><input id="import-csv" type="file" accept=".csv,text/csv"><div id="import-preview"></div><p id="import-error" role="alert"></p><button id="commit-import" class="green" disabled>Импортировать</button>`,
    );
    let prepared = [];
    $("#import-csv").onchange = async (e) => {
      prepared = [];
      $("#commit-import").disabled = true;
      $("#import-error").textContent = "";
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Максимальный размер — 5 МБ");
        const rows = parseCSV(await file.text());
        if (!rows.length || rows.length > 10000)
          throw new Error("Допустимо от 1 до 10 000 записей");
        for (const [i, x] of rows.entries()) {
          if (guest) {
            if (!x.first?.trim())
              throw new Error("Строка " + (i + 2) + ": требуется first");
            if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))
              throw new Error("Неверная почта");
            prepared.push({ ...x, id: uid(), tagIds: [], reservations: [] });
          } else {
            const record = {
              ...x,
              id: uid(),
              guests: Number(x.guests),
              duration: Number(x.duration) || 90,
              room: x.room || "main",
              status: x.status || "Не подтверждено",
            };
            const error = validateReservation(
              record,
              [...app.state.reservations, ...prepared],
              storage.read(STORAGE_KEYS.blocks, []),
              app.floor.blocked,
            );
            if (error) throw new Error("Строка " + (i + 2) + ": " + error);
            prepared.push(record);
          }
        }
        $("#import-preview").innerHTML = table(
          prepared.slice(0, 20),
          guest
            ? [
                ["first", "Имя"],
                ["last", "Фамилия"],
                ["email", "Почта"],
              ]
            : [
                ["name", "Гость"],
                ["date", "Дата"],
                ["time", "Время"],
              ],
        );
        $("#commit-import").textContent =
          "Импортировать " + prepared.length + " записей";
        $("#commit-import").disabled = false;
      } catch (error) {
        prepared = [];
        $("#import-error").textContent = error.message;
      }
    };
    $("#commit-import").onclick = () => {
      if (!prepared.length) return;
      if (guest) {
        const data = guestData();
        data.guests.push(...prepared);
        if (!storage.write(STORAGE_KEYS.guests, data)) return;
      } else {
        app.state.reservations.push(...prepared);
        if (!app.save()) return;
      }
      log("Импорт " + prepared.length + " записей");
      toast("Импорт завершён");
      prepared = [];
      render();
    };
  }
  function cleanup() {
    const { label, root, chrome, table, guestData, guestName, log, render } =
      ctx;
    const data = guestData(),
      groups = new Map();
    for (const guest of data.guests) {
      const key =
        guest.email?.trim().toLowerCase() || guest.phone?.replace(/\D/g, "");
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(guest);
    }
    const duplicates = [...groups.values()].filter((x) => x.length > 1);
    chrome(
      `<p>Совпадения по почте или телефону. Сохраняются теги, заметки и история. Перед объединением скачивается резервная копия.</p>${duplicates.map((group) => `<article class="resource-row"><span>${group.map(guestName).map(esc).join(", ")}</span><button class="outline-green" data-merge="${esc(group[0].id)}">Объединить ${group.length} профиля</button></article>`).join("") || '<div class="data-empty">Дубликаты не найдены</div>'}`,
    );
    root()
      .querySelectorAll("[data-merge]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const group = duplicates.find((x) => x[0].id === b.dataset.merge);
            if (!confirm("Объединить профили?")) return;
            download("guests-before-merge.json", JSON.stringify(data, null, 2));
            const target = group[0];
            target.tagIds = [...new Set(group.flatMap((x) => x.tagIds || []))];
            target.notes = group
              .map((x) => x.notes)
              .filter(Boolean)
              .join("\n");
            target.reservations = group.flatMap((x) => x.reservations || []);
            for (const x of group)
              for (const [key, value] of Object.entries(x))
                if (!target[key] && value) target[key] = value;
            data.guests = data.guests.filter(
              (x) => x === target || !group.includes(x),
            );
            storage.write(STORAGE_KEYS.guests, data);
            render();
          }),
      );
  }
  function floorImport() {
    const { label, root, chrome, table, guestData, guestName, log, render } =
      ctx;
    chrome(
      '<p>JSON-схема с залами main и terrace. Стол: [номер, x, y, форма]. Формы: side, round, wide, long.</p><input id="floor-json" type="file" accept=".json"><p id="floor-error" role="alert"></p>',
      '<button class="outline-green" id="floor-export">Экспорт плана</button>',
    );
    $("#floor-export").onclick = () =>
      download("floor-plan.json", JSON.stringify(app.floor.positions, null, 2));
    $("#floor-json").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) throw new Error("Максимум 1 МБ");
        const data = JSON.parse(await file.text());
        for (const room of ["main", "terrace"]) {
          if (
            !Array.isArray(data[room]) ||
            data[room].some(
              (x) =>
                !Array.isArray(x) ||
                !x[0] ||
                !Number.isFinite(x[1]) ||
                !Number.isFinite(x[2]) ||
                x[1] < 0 ||
                x[2] < 0 ||
                (x[3] && !["side", "round", "long", "wide"].includes(x[3])),
            )
          )
            throw new Error("Некорректная схема " + room);
          if (
            new Set(data[room].map((x) => String(x[0]))).size !==
            data[room].length
          )
            throw new Error("Повторяющиеся столы");
        }
        download(
          "floor-before-import.json",
          JSON.stringify(app.floor.positions, null, 2),
        );
        Object.assign(app.floor.positions, data);
        app.floor.persistPositions();
        toast("План импортирован");
        app.navigate("view/План зала");
        app.render();
      } catch (error) {
        $("#floor-error").textContent = error.message;
      }
    };
  }
  return { importPage, cleanup, floorImport };
}
