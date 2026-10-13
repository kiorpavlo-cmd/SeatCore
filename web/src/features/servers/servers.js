import { $, $$, escapeHTML as esc } from "../../lib/dom.js";

import { colors } from "../../config/defaults.js";
import { openModal, closeModal } from "../../components/modal.js";
export function createServers({ state, save, render, floor }) {
  function serverModal(id) {
    const s = state.servers.find((x) => x.id === id);
    openModal(
      s ? "Данные официанта" : "Новый официант",
      `
 <div class="flex-between"><label>Имя</label>${s ? '<button id="deleteServer" style="color:#bc0000">Удалить официанта?</button>' : ""}</div>
 <input class="field" id="serverName" value="${esc(s?.name || "")}" placeholder="Имя">
 <div class="flex-between"><label>Доступен на смене</label><input id="serverShift" type="checkbox" class="toggle" ${s?.on !== false ? "checked" : ""}></div>
 <p>Цвет официанта</p>
 <div class="colors">${colors.map((c) => `<button class="color-button ${s?.color === c ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}</div>
 <p>Назначенные цвета</p><div class="colors">${["#2d495a", "#ffda97", "#36d4cb"].map((c) => `<span class="dot" style="background:${c};width:32px;height:32px"></span>`).join("")}</div>
 <button class="outline-green full" id="assignTables">Назначить столы</button>`,
      () => {
        const name = $("#serverName").value.trim();
        if (!name) return alert("Укажите имя");
        const color = $(".color-button.selected")?.dataset.color || colors[0];
        const on = $("#serverShift").checked;
        if (s) {
          s.name = name;
          s.color = color;
          s.on = on;
        } else state.servers.push({ id: Date.now(), name, color, on });
        save();
        closeModal();
        render();
      },
    );
    $$(".color-button").forEach(
      (b) =>
        (b.onclick = () => {
          $$(".color-button").forEach((x) => x.classList.remove("selected"));
          b.classList.add("selected");
        }),
    );
    $("#assignTables").onclick = () => {
      if (!s) return alert("Сначала сохраните официанта");
      const choices = Object.entries(floor.positions).flatMap(
        ([room, tables]) =>
          tables.map(([num]) => [
            room + ":" + num,
            (room === "main" ? "Основной зал" : "Терраса") + " · " + num,
          ]),
      );
      openModal(
        "Назначение столов: " + s.name,
        choices
          .map(
            ([key, label]) =>
              `<label class="assignment-option"><input type="checkbox" data-assignment="${esc(key)}" ${(s.tables || []).includes(key) ? "checked" : ""}>${esc(label)}</label>`,
          )
          .join(""),
        () => {
          const selected = $$("[data-assignment]:checked").map(
            (x) => x.dataset.assignment,
          );
          state.servers.forEach((server) => {
            if (server.id !== s.id)
              server.tables = (server.tables || []).filter(
                (key) => !selected.includes(key),
              );
          });
          s.tables = selected;
          save();
          closeModal();
          render();
        },
      );
    };
    if (s)
      $("#deleteServer").onclick = () => {
        if (confirm("Удалить официанта?")) {
          state.servers = state.servers.filter((x) => x.id !== id);
          save();
          closeModal();
          render();
        }
      };
  }
  return serverModal;
}
