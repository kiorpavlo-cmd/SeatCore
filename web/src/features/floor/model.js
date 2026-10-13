import { tableLabel, labelShifts } from "./labels.js";
import { SEATED } from "../../services/reservation-queries.js";
import { normalizeFloor } from "../../services/repositories.js";
import { $, escapeHTML as esc } from "../../lib/dom.js";
import { storage } from "../../services/storage.js";
import { tablePositions } from "../../config/defaults.js";
export function createFloor({ state, save, render, openReservation }) {
  const terraceTables = [
    ["26 SUM", 112, 125],
    ["25 SUM", 198, 125],
    ["27 SUM", 112, 208],
    ["24 SUM", 198, 208],
    ["28 SUM", 112, 312],
    ["29 SUM", 112, 396],
    ["31 SUM", 198, 396],
    ["30 SUM", 112, 479],
    ["32 SUM", 198, 479],
  ];
  const originalTables = tablePositions.map((a) => a.slice());

  let editingPositions = normalizeFloor(
    storage.read("mio-stage2-positions", null),
    { main: originalTables, terrace: terraceTables },
  );
  let blocked = storage.read("mio-stage2-blocked", []);
  if (!Array.isArray(blocked)) blocked = [];
  function persistPositions() {
    storage.setItem(
      "mio-stage2-positions",
      JSON.stringify(editingPositions),
    );
  }
  function decorateTables(arr, room) {
    const now = new Date(),
      time =
        state.floorTime && state.floorTime !== "Сейчас"
          ? state.floorTime
          : String(now.getHours()).padStart(2, "0") +
            ":" +
            String(now.getMinutes()).padStart(2, "0");
    const minute = (t) => {
      const [h, m] = String(t).split(":").map(Number);
      return h * 60 + m;
    };
    return arr
      .map(([num, x, y, shape, capacity], i) => {
        const key = room + ":" + num;
        const bookings = state.reservations.filter(
          (r) =>
            r.date === state.date &&
            (r.room || "main") === room &&
            String(r.table) === String(num) &&
            ![
              "Отменено",
              "Отменено гостем",
              "Не пришёл",
              "Отказано",
              "Завершено",
            ].includes(r.status),
        );
        const occupied = bookings.some(
          (r) =>
            SEATED.includes(r.status) ||
            (minute(time) >= minute(r.time) &&
              minute(time) < minute(r.time) + (r.duration || 90)),
        );
        const server = state.servers.find(
          (s) => s.on && (s.tables || []).includes(key),
        );
        const settings = state.tableLabels || {};
        const context = {
          bookings,
          server,
          capacity,
          time,
          shifts: labelShifts(),
        };
        const labels = ["top", "middle", "bottom"]
          .map((key) => {
            const text = tableLabel(settings[key], context);
            return text
              ? `<span class="table-label table-label-${key} label-${esc(settings.size || "small")}">${esc(text)}</span>`
              : "";
          })
          .join("");
        return `<button class="table-object ${shape || "side"} ${blocked.includes(key) ? "blocked-table" : ""} ${occupied ? "occupied-table" : bookings.length ? "reserved-table" : ""} ${state.selectedTable === num ? "chosen" : ""}"
 aria-label="${esc(num)}" title="Стол ${esc(num)}${bookings.length ? ": " + bookings.map((r) => esc(r.time) + " " + esc(r.name)).join(", ") : ""}" data-table-index="${i}" style="left:${x}px;top:${y}px;${server ? "border-color:" + esc(server.color) : ""}"><span>${esc(num)}</span>${labels}</button>`;
      })
      .join("");
  }
  function mainDecor() {
    let s = `<div class="decor" style="left:28px;top:66px;width:25px;height:72px"></div>
 <div class="decor label" style="left:85px;top:66px;width:290px;height:26px">ВИТРИНА</div>
 <div class="decor" style="left:540px;top:66px;width:134px;height:26px"></div>
 <div class="decor" style="left:28px;top:170px;width:25px;height:323px"></div>
 <div class="decor label" style="left:477px;top:185px;width:33px;height:126px">БАР</div>
 <div class="decor" style="left:355px;top:282px;width:154px;height:33px"></div>`;
    for (let i = 0; i < 7; i++)
      s += `<span class="plant" style="left:9px;top:${91 + i * 49}px">🌳</span>`;
    return s;
  }
  function terraceDecor() {
    return `<div class="decor" style="left:27px;top:30px;width:49px;height:515px"></div>
 <div class="decor label" style="left:65px;top:54px;width:225px;height:49px">ВИННЫЙ МАГАЗИН</div>
 <div class="decor" style="left:323px;top:38px;width:305px;height:270px"></div>
 <div class="decor" style="left:323px;top:396px;width:295px;height:140px"></div>`;
  }
  function mapMarkup(room) {
    return (
      (room === "main"
        ? mainDecor()
        : room === "terrace"
          ? terraceDecor()
          : "") + decorateTables(editingPositions[room] || [], room)
    );
  }
  function bindMapTables(container, callback) {
    container.querySelectorAll("[data-table-index]").forEach((el) => {
      el.onclick = () => callback(Number(el.dataset.tableIndex));
    });
  }
  function closeBooking() {
    document.querySelector("#bookingScreen")?.remove();
    document.querySelector("#tableDialog")?.remove();
  }
  function closeDialog() {
    document.querySelector("#tableDialog")?.remove();
  }
  function dialog(title, content, actions) {
    closeDialog();
    const el = document.createElement("div");
    el.id = "tableDialog";
    el.className = "booking-modal";
    el.innerHTML = `<div class="booking-dialog"><div class="booking-dialog-title">${esc(title)}
 <button id="tableDialogClose">×</button></div>
 <div class="booking-dialog-body">${content}</div>
 <div class="booking-dialog-actions">${actions}</div></div>`;
    document.body.append(el);
    document.querySelector("#tableDialogClose").onclick = closeDialog;
    return el;
  }
  function openTable(index, room = state.room) {
    const number = editingPositions[room][index][0];
    const matches = state.reservations.filter(
      (r) =>
        String(r.table) === String(number) &&
        r.date === state.date &&
        (r.room || "main") === room,
    );
    dialog(
      "Стол " + number,
      matches.length
        ? matches
            .map(
              (r) =>
                `<button class="table-reservation-link" data-table-booking="${esc(r.id)}">${esc(r.time)} — ${esc(r.name)}, гостей: ${r.guests} · ${esc(r.status || "Не подтверждено")}</button>`,
            )
            .join("")
        : "На сегодня для этого стола нет бронирований.",
      `<button class="green" id="tableBook">СОЗДАТЬ БРОНИРОВАНИЕ</button>
 <button class="booking-danger" id="tableBlock">${blocked.includes(room + ":" + number) ? "РАЗБЛОКИРОВАТЬ" : "ЗАБЛОКИРОВАТЬ"} СТОЛ</button>`,
    );
    document.querySelectorAll("[data-table-booking]").forEach(
      (b) =>
        (b.onclick = () => {
          const record = matches.find(
            (r) => String(r.id) === b.dataset.tableBooking,
          );
          closeDialog();
          openReservation(false, null, record.id);
        }),
    );
    document.querySelector("#tableBook").onclick = () => {
      closeDialog();
      state.selectedTable = number;
      openReservation(false, 2, null, {
        room,
        table: String(number),
        time: state.floorTime === "Сейчас" ? undefined : state.floorTime,
      });
    };
    document.querySelector("#tableBlock").onclick = () => {
      const key = room + ":" + number;
      blocked = blocked.includes(key)
        ? blocked.filter((x) => x !== key)
        : [...blocked, key];
      storage.setItem("mio-stage2-blocked", JSON.stringify(blocked));
      closeDialog();
      render();
    };
  }
  return {
    get positions() {
      return editingPositions;
    },
    get blocked() {
      return blocked;
    },
    mapMarkup,
    bindMapTables,
    openTable,
    persistPositions,
    closeBooking,
    closeDialog,
    dialog,
    render() {
      const el = $("#floorCanvas");
      const tables = editingPositions[state.room] || [];
      el.style.width = Math.max(700, ...tables.map((t) => t[1] + 110)) + "px";
      el.style.height = Math.max(610, ...tables.map((t) => t[2] + 110)) + "px";
      el.innerHTML = mapMarkup(state.room);
      document.querySelector("#unassignedFloor")?.remove();
      const unassigned = state.reservations.filter(
        (r) =>
          r.date === state.date &&
          !r.table &&
          ![
            "Отменено",
            "Отменено гостем",
            "Завершено",
            "Не пришёл",
            "Отказано",
          ].includes(r.status),
      );
      if (state.showUnassigned !== false && unassigned.length) {
        const list = document.createElement("div");
        list.id = "unassignedFloor";
        list.className = "unassigned-floor";
        list.innerHTML = `<strong>Без назначенного стола</strong>${unassigned.map((r) => `<button data-unassigned-booking="${esc(r.id)}">${esc(r.time)} · ${esc(r.name)} · ${r.guests} гостей</button>`).join("")}`;
        document.querySelector("#floor").append(list);
        list
          .querySelectorAll("button")
          .forEach(
            (b) =>
              (b.onclick = () =>
                openReservation(
                  false,
                  null,
                  unassigned.find(
                    (r) => String(r.id) === b.dataset.unassignedBooking,
                  ).id,
                )),
          );
      }
      const background = storage.read("mio-ru-backgrounds-v1", {})[
        state.room
      ];
      el.style.backgroundImage = background ? `url("${background}")` : "";
      el.style.backgroundSize = "cover";
      bindMapTables(el, (i) => openTable(i, state.room));
    },
  };
}
