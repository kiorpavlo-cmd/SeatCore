import { escapeHTML as esc } from "../../lib/dom.js";
import { storage } from "../../services/storage.js";
export function createEditor({ state, render, floor, hidePop }) {
  const { closeBooking, persistPositions, mapMarkup, dialog, closeDialog } =
    floor;
  const editingPositions = floor.positions;
  let editorRoom = "main",
    editorZoom = 1;
  function openEditor() {
    closeBooking();
    hidePop();
    editorRoom = state.room;
    const beforePositions = structuredClone(editingPositions);
    const beforeRooms = structuredClone(state.rooms);
    let showUnassigned = state.showUnassigned !== false;
    let activeTab = "tables";
    const backgrounds = storage.read("eatapp-ru-backgrounds-v1", {});
    const root = document.createElement("div");
    root.id = "floorEditor";
    root.className = "floor-editor";
    document.body.append(root);
    function paint() {
      const tables = editingPositions[editorRoom];
      root.innerHTML = `<div class="floor-editor-top">
   ${tables.length} столов　•　Управление схемой зала</div>
   <div class="floor-editor-body">
   <div class="floor-editor-sidebar">
    <div class="editor-pad" style="text-align:left"><button id="editorExit">‹ Выход</button>
    <div class="bottom-buttons" style="margin-top:20px"><button class="chip ${activeTab === "tables" ? "active" : ""}" id="editorTables">Столы</button><button class="chip ${activeTab === "background" ? "active" : ""}" id="editorBackgrounds">Фон</button></div>
    <h3 style="text-align:center">Настройка столов</h3>
    <p style="text-align:center;color:#888">Перетаскивайте столы на плане</p>
    <div style="display:flex;justify-content:center">
    <button id="editorAddSquare" class="booking-choice">□<br>Стол</button>
    <button id="editorAddRound" class="booking-choice">◯<br>Круглый</button></div></div>
    <div class="editor-pad" id="editorBackgroundPanel" ${activeTab === "background" ? "" : "hidden"}><h3>Фоновое изображение</h3>
     <p>Рекомендуемый размер 1200×900 (4:3)</p>
     <input type="file" accept="image/*" id="editorImage"></div>
    <div class="editor-pad" style="text-align:left">
     <label><input id="showUnassigned" type="checkbox" ${showUnassigned ? "checked" : ""}> Показывать неназначенные бронирования</label>
     <div id="editorTableSettings"></div></div>
   </div>
   <div class="floor-editor-map-wrap">
    <div class="floor-editor-tabs">
     <button class="outline-green" id="editorAddRoom">＋ Добавить зал</button>
${Object.keys(editingPositions)
  .map(
    (key) =>
      `<button class="${editorRoom === key ? "active" : ""}" data-editor-room="${esc(key)}">${esc(state.rooms[key] || key)}</button>`,
  )
  .join("")}
     <button class="green" id="editorSave" style="margin-left:auto">Сохранить зал</button>
    </div>
    <div class="floor-editor-canvas" id="editorCanvas">
     <div id="editorFloor" class="floor-editor-floor"></div>
     <div class="booking-toolbox">
       <button id="zoomIn">⊕</button><button id="zoomOut">⊖</button>
       <button id="zoomReset">↺</button><button id="zoomFit">⛶</button>
     </div>
    </div>
   </div></div>`;
      const floor = root.querySelector("#editorFloor");
      floor.innerHTML = mapMarkup(editorRoom);
      const background = backgrounds[editorRoom];
      if (background) {
        floor.style.backgroundImage = `url("${background}")`;
        floor.style.backgroundSize = "cover";
      }
      floor.style.transform = `scale(${editorZoom})`;
      floor.style.transformOrigin = "top left";
      let active = null;
      floor.querySelectorAll("[data-table-index]").forEach((el) => {
        el.onclick = () => {
          const table =
            editingPositions[editorRoom][Number(el.dataset.tableIndex)];
          const settings = root.querySelector("#editorTableSettings");
          settings.innerHTML = `<h3>Стол ${esc(table[0])}</h3><label>Вместимость<input id="tableCapacity" type="number" min="1" max="999" value="${table[4] || ""}" placeholder="Не задана"></label>`;
          settings.querySelector("#tableCapacity").oninput = (e) => {
            const value = Number(e.target.value);
            if (!Number.isInteger(value) || value < 1 || value > 999) {
              e.target.value = table[4] || "";
              return;
            }
            table[4] = value;
          };
        };
        el.onpointerdown = (e) => {
          if (e.button !== 0) return;
          const idx = +el.dataset.tableIndex;
          const originalX = editingPositions[editorRoom][idx][1];
          const originalY = editingPositions[editorRoom][idx][2];
          active = {
            idx,
            x: e.clientX,
            y: e.clientY,
            originalX,
            originalY,
            pointerId: e.pointerId,
          };
          el.setPointerCapture(e.pointerId);
        };
        el.onpointermove = (e) => {
          if (!active || active.pointerId !== e.pointerId) return;
          const x = Math.max(
            0,
            Math.round(
              (active.originalX + (e.clientX - active.x) / editorZoom) / 13,
            ) * 13,
          );
          const y = Math.max(
            0,
            Math.round(
              (active.originalY + (e.clientY - active.y) / editorZoom) / 13,
            ) * 13,
          );
          editingPositions[editorRoom][active.idx][1] = x;
          editingPositions[editorRoom][active.idx][2] = y;
          el.style.left = x + "px";
          el.style.top = y + "px";
        };
        el.onpointerup = () => {
          active = null;
        };
        el.oncontextmenu = (e) => {
          e.preventDefault();
          const idx = +el.dataset.tableIndex;
          if (
            confirm(
              "Удалить стол " + editingPositions[editorRoom][idx][0] + "?",
            )
          ) {
            editingPositions[editorRoom].splice(idx, 1);
            paint();
          }
        };
      });
      root.querySelector("#editorExit").onclick = () => {
        for (const key of Object.keys(editingPositions))
          delete editingPositions[key];
        Object.assign(editingPositions, beforePositions);
        state.rooms = beforeRooms;
        root.remove();
        render();
      };
      root.querySelector("#editorSave").onclick = () => {
        state.showUnassigned = root.querySelector("#showUnassigned").checked;
        storage.write("eatapp-ru-backgrounds-v1", backgrounds);
        persistPositions();
        storage.write("eatapp-ru-demo-v1", state);
        root.remove();
        render();
      };
      root.querySelectorAll("[data-editor-room]").forEach(
        (b) =>
          (b.onclick = () => {
            editorRoom = b.dataset.editorRoom;
            paint();
          }),
      );
      root.querySelector("#editorAddSquare").onclick = () => addTable("side");
      root.querySelector("#editorAddRound").onclick = () => addTable("round");
      root.querySelector("#editorTables").onclick = () => {
        activeTab = "tables";
        paint();
      };
      root.querySelector("#editorBackgrounds").onclick = () => {
        activeTab = "background";
        paint();
      };
      root.querySelector("#showUnassigned").onchange = (e) => {
        showUnassigned = e.target.checked;
      };
      root.querySelector("#editorAddRoom").onclick = () => {
        const name = prompt("Название нового зала:")?.trim();
        if (!name) return;
        if (Object.values(state.rooms).includes(name))
          return alert("Зал с таким названием уже существует");
        const key = "room-" + crypto.randomUUID();
        state.rooms[key] = name;
        editingPositions[key] = [];
        editorRoom = key;
        paint();
      };
      root.querySelector("#zoomIn").onclick = () => zoom(0.1);
      root.querySelector("#zoomOut").onclick = () => zoom(-0.1);
      root.querySelector("#zoomReset").onclick = () => {
        editorZoom = 1;
        paint();
      };
      root.querySelector("#zoomFit").onclick = () => {
        const canvas = root.querySelector("#editorCanvas");
        const width = Math.max(700, ...tables.map((t) => t[1] + 100));
        const height = Math.max(610, ...tables.map((t) => t[2] + 100));
        editorZoom = Math.max(
          0.25,
          Math.min(
            2,
            (canvas.clientWidth - 20) / width,
            (canvas.clientHeight - 20) / height,
          ),
        );
        paint();
      };
      root.querySelector("#editorImage").onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
          f.size > 2 * 1024 * 1024
        )
          return alert("Выберите PNG, JPEG или WebP до 2 МБ");
        const reader = new FileReader();
        reader.onload = () => {
          backgrounds[editorRoom] = reader.result;
          {
            floor.style.backgroundImage = `url("${reader.result}")`;
            floor.style.backgroundSize = "cover";
          }
        };
        reader.readAsDataURL(f);
      };
    }
    function zoom(v) {
      editorZoom = Math.max(0.5, Math.min(2, editorZoom + v));
      paint();
    }
    function addTable(shape) {
      const raw = prompt("Номер нового стола:");
      if (!raw) return;
      if (editingPositions[editorRoom].some((x) => String(x[0]) === raw))
        return alert("Стол с таким номером уже существует");
      editingPositions[editorRoom].push([raw, 300, 200, shape]);
      paint();
    }
    paint();
  }
  return openEditor;
}
