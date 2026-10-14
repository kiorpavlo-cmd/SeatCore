import { reservationTables } from "../../services/reservations.js";
import { deleteFloorRoom } from "./rooms.js";
import { tableContent } from "./table-renderer.js";
import { escapeHTML as esc } from "../../lib/dom.js";
import { storage } from "../../services/storage.js";
import { PLAN_WIDTH, PLAN_HEIGHT, tableGeometry, shapeGeometry, geometryStyle, moveGeometry, resizeGeometry, rotateGeometry, nextTableName, roomScene, sceneMarkup } from "./geometry.js";

export function createEditor({ state, render, floor, hidePop }) {
  return function openEditor() {
    floor.closeBooking(); hidePop();
    let positions = structuredClone(floor.positions);
    let rooms = structuredClone(state.rooms);
    let bookings = structuredClone(state.reservations);
    let waitlist = structuredClone(state.waitlist || []);
    let servers = structuredClone(state.servers || []);
    let blocked = structuredClone(floor.blocked);
    let scenes = Object.fromEntries(Object.keys(positions).map(room => [room, structuredClone(roomScene(storage.read("mio-ru-resources-v1", {}), room))]));
    let backgrounds = storage.read("mio-ru-backgrounds-v1", {});
    let room = state.room, zoom = 1, activeTab = "tables", selected = null, gesture = null;
    let showUnassigned = state.showUnassigned !== false, dirty = false, saving = false;
    let allTablesSelected = false;
    const selectedTables = new Set();
    let showGrid = true;
    let snapGrid = true;
    let snapObjects = true;
    const GRID_STEP = 13;
    const history = [], future = [];
    const root = document.createElement("div");
    root.id = "floorEditor"; root.className = "floor-editor rich-floor-editor";
    root.tabIndex = -1; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Редактор плана зала");
    document.body.append(root);
    const current = () => selected ? selected.kind === "table" ? positions[room][selected.index] : scenes[room][selected.index] : null;
    const geometry = () => selected?.kind === "table" ? tableGeometry(current()) : shapeGeometry(current());
    function snapshot() { return structuredClone({ positions, rooms, scenes, backgrounds, bookings, waitlist, servers, blocked, showUnassigned, room }); }
    function remember() { history.push(snapshot()); if (history.length > 60) history.shift(); future.length = 0; dirty = true; }
    function restore(s) { ({positions,rooms,scenes,backgrounds,bookings,waitlist,servers,blocked,showUnassigned,room}=s); if(!positions[room])room=Object.keys(positions)[0]; selected=null; selectedTables.clear(); allTablesSelected=false; dirty=true; paint(); }
    function feedback(message) { root.querySelector("#editorFeedback").textContent = message; }
    function setGeometry(g) {
      const object=current(); if (!object) return;
      if(selected.kind === "table") { object[1]=g.x; object[2]=g.y; object[5]={...(object[5] || {}),width:g.width,height:g.height,rotation:g.rotation}; }
      else Object.assign(object,g);
      const target = root.querySelector(selected.kind === "table" ? `[data-table-index="${selected.index}"]` : `[data-shape-index="${selected.index}"]`);
      if(target) target.style.cssText=geometryStyle(g)+(selected.kind === "shape" ? `background:${object.type === "tree" ? "transparent" : object.color || "#dfe1f5"};` : "");
      drawSelection();
    }

    function requestRoomDeletion() {
      const remaining = Object.keys(positions).filter(key => key !== room);
      if (!remaining.length) {
        floor.dialog("Удалить зал", "Чтобы удалить последний зал, сначала добавьте другой.", '<button id="editorRoomCancel">Закрыть</button>');
        document.querySelector("#editorRoomCancel").onclick = floor.closeDialog;
        return;
      }
      const affected = [...bookings, ...waitlist].filter(record => (record.room || "main") === room).length;
      floor.dialog("Удалить зал «" + (rooms[room] || room) + "»?",
        `<p>Зал, его столы и оформление будут удалены после сохранения плана.</p>${affected ? `<p>Бронирований и записей в листе ожидания: ${affected}. Они сохранятся и будут перенесены в выбранный зал без назначенного стола.</p>` : '<p>В этом зале нет бронирований и записей в листе ожидания.</p>'}<label>${affected ? 'Перенести бронирования в' : 'После удаления открыть'}<select id="editorRoomDestination">${remaining.map(key => `<option value="${esc(key)}">${esc(rooms[key] || key)}</option>`).join('')}</select></label><p>До сохранения удаление можно отменить кнопкой ↶.</p>`,
        '<button id="editorRoomCancel">Отмена</button><button class="booking-danger" id="editorDeleteRoomConfirm">Удалить зал</button>');
      document.querySelector("#editorRoomCancel").onclick = floor.closeDialog;
      document.querySelector("#editorDeleteRoomConfirm").onclick = () => {
        const target = document.querySelector("#editorRoomDestination").value;
        remember();
        const next = deleteFloorRoom(snapshot(), room, target);
        ({positions, rooms, scenes, backgrounds, bookings, waitlist, servers, blocked, room} = next);
        selected = null; floor.closeDialog(); paint();
      };
    }

    function objectPreview(type) {
      if (type === "side" || type === "round") {
        return `<span class="editor-preview-object editor-preview-${type}">${tableContent(type, "1", 1, 4)}</span>`;
      }
      return `<span class="editor-preview-object editor-preview-${type}"></span>`;
    }

    function tableMarkup() {
      return positions[room].map((t, i) => `
        <button class="table-object ${esc(t[3] || "side")} ${selectedTables.has(i) ? "editor-multi-selected" : ""}"
          data-table-index="${i}"
          aria-label="Стол ${esc(t[0])}"
          style="${geometryStyle(tableGeometry(t))}">
          ${tableContent(t[3] || "side", t[0], t[5]?.minCapacity || 1, t[4] || 4)}
        </button>
      `).join("");
    }

    function refreshTableSelection() {
      allTablesSelected =
        selectedTables.size === positions[room].length &&
        selectedTables.size > 0;

      root.querySelectorAll(
        "#editorFloor [data-table-index]"
      ).forEach(el => {
        const index = Number(el.dataset.tableIndex);
        el.classList.toggle(
          "editor-multi-selected",
          selectedTables.has(index)
        );
      });
    }

    function selectAllTables() {
      selectedTables.clear();

      positions[room].forEach((_, index) => {
        selectedTables.add(index);
      });

      selected = null;
      drawSelection();
      paintSettings();
      refreshTableSelection();
    }

    function clearMultiSelection() {
      selectedTables.clear();
      allTablesSelected = false;
      refreshTableSelection();
    }

    function toggleTableSelection(index) {
      if (selectedTables.has(index)) {
        selectedTables.delete(index);
      } else {
        selectedTables.add(index);
      }

      selected = null;
      drawSelection();
      paintSettings();
      refreshTableSelection();
    }

    function moveSelectedTables(originals, dx, dy) {
      if (!originals.length) return;

      // Keep the whole group inside the floor boundaries.
      const minDx = Math.max(
        ...originals.map(item => -item.g.x)
      );
      const maxDx = Math.min(
        ...originals.map(item =>
          PLAN_WIDTH - item.g.width - item.g.x
        )
      );
      const minDy = Math.max(
        ...originals.map(item => -item.g.y)
      );
      const maxDy = Math.min(
        ...originals.map(item =>
          PLAN_HEIGHT - item.g.height - item.g.y
        )
      );

      dx = Math.max(minDx, Math.min(maxDx, dx));
      dy = Math.max(minDy, Math.min(maxDy, dy));

      if (snapGrid) {
        const first = originals[0].g;

        dx = Math.max(minDx, Math.min(
          maxDx,
          Math.round((first.x + dx) / GRID_STEP) *
            GRID_STEP - first.x
        ));

        dy = Math.max(minDy, Math.min(
          maxDy,
          Math.round((first.y + dy) / GRID_STEP) *
            GRID_STEP - first.y
        ));
      }

      for (const item of originals) {
        const g = moveGeometry(item.g, dx, dy);
        const table = positions[room][item.index];

        table[1] = g.x;
        table[2] = g.y;

        const el = root.querySelector(
          `#editorFloor [data-table-index="${item.index}"]`
        );

        if (el) el.style.cssText = geometryStyle(g);
      }
    }

    function deleteSelectedTables() {
      if (!selectedTables.size) return;

      const indexes = [...selectedTables]
        .sort((a, b) => b - a);

      const names = indexes.map(index =>
        String(positions[room][index][0])
      );

      const assigned = [...bookings, ...waitlist]
        .some(record =>
          (record.room || "main") === room &&
          reservationTables(record).some(table =>
            names.includes(table)
          )
        );

      const message =
        `Удалить выбранные столы (${names.length})?` +
        (assigned
          ? "\nНазначения этих столов будут сняты. Бронирования сохранятся."
          : "");

      if (!window.confirm(message)) return;

      remember();

      for (const index of indexes) {
        positions[room].splice(index, 1);
      }

      for (const list of [bookings, waitlist]) {
        for (const record of list) {
          if ((record.room || "main") !== room) continue;

          const before = reservationTables(record);
          if (!before.some(table => names.includes(table))) continue;

          record.tables = before.filter(
            table => !names.includes(table)
          );
          record.table = record.tables[0] || "";
        }
      }

      selectedTables.clear();
      allTablesSelected = false;
      selected = null;
      paint();
    }

    function paint() {
      const canvas=root.querySelector("#editorCanvas"); const scroll = canvas ? [canvas.scrollLeft, canvas.scrollTop] : [0,0];
      const tables=positions[room];
      const min=tables.reduce((sum,t)=>sum+(t[5]?.minCapacity || 1),0), max=tables.reduce((sum,t)=>sum+(t[4] || 4),0), online=tables.reduce((sum,t)=>sum+(t[5]?.online === false ? 0 : t[4] || 4),0);
      root.innerHTML=`<div class="floor-editor-top"><span>${tables.length} столов · ${min}–${max} гостей · Онлайн: ${online}</span><span>${dirty ? "Есть несохранённые изменения" : "План зала"}</span></div>
      <div class="floor-editor-body"><aside class="floor-editor-sidebar"><div class="editor-pad"><button id="editorExit">‹ Выход</button><div class="editor-tab-switch"><button id="editorTables" class="chip ${activeTab === "tables" ? "active" : ""}">Столы</button><button id="editorBackgrounds" class="chip ${activeTab === "background" ? "active" : ""}">Фигуры и фон</button></div>
      <h3>${activeTab === "tables" ? "Столы" : "Фигуры"}</h3><p class="editor-hint">Перетащите объект на план или нажмите, чтобы добавить.</p><div class="editor-palette">${(activeTab === "tables" ? [["side","▢","Стол"],["round","◯","Круглый стол"]] : [["rect","▰","Прямоугольник"],["circle","●","Круг"],["tree","","Дерево"]]).map(([type,icon,label])=>`<button data-palette="${type}" class="editor-palette-item" aria-label="Добавить: ${label}">${objectPreview(type)}<small>${label}</small></button>`).join("")}</div></div>
      <div id="editorTableSettings" class="editor-pad"></div><div class="editor-pad"><h3>Фоновое изображение</h3><p class="editor-hint">PNG, JPEG или WebP до 2 МБ · 1200×900</p><input type="file" accept="image/png,image/jpeg,image/webp" id="editorImage">${backgrounds[room] ? '<button id="editorRemoveImage">Убрать изображение</button>' : ""}</div>
      <div class="editor-pad"><label class="editor-toggle"><span>Показывать неназначенные бронирования</span><input id="showUnassigned" type="checkbox" ${showUnassigned ? "checked" : ""}></label></div></aside>
      <div class="floor-editor-map-wrap"><div class="floor-editor-tabs"><button class="outline-green" id="editorAddRoom">＋ Добавить зал</button><div class="floor-editor-rooms">${Object.keys(positions).map(key=>`<button class="${key === room ? "active" : ""}" data-editor-room="${esc(key)}">${esc(rooms[key] || key)}</button>`).join("")}</div><button id="editorRoomSettings" aria-label="Настройки зала" title="Настройки зала">⋮</button><button class="green" id="editorSave" ${saving ? "disabled" : ""}>${saving ? "Сохранение…" : "Сохранить"}</button></div>
      <div class="editor-helpbar"><span class="editor-alignment-controls">
          <label><input id="editorShowGrid" type="checkbox" ${showGrid ? "checked" : ""}> Сетка</label>
          <label><input id="editorSnapGrid" type="checkbox" ${snapGrid ? "checked" : ""}> Привязка</label>
          <label><input id="editorSnapObjects" type="checkbox" ${snapObjects ? "checked" : ""}> Направляющие</label>
          <span>Shift + поворот: 15°</span>
        </span><button id="editorUndo" ${history.length ? "" : "disabled"} title="Отменить действие">↶</button><button id="editorRedo" ${future.length ? "" : "disabled"} title="Повторить действие">↷</button><span id="editorZoomLabel">${Math.round(zoom*100)}%</span></div>
      <div class="floor-editor-canvas" id="editorCanvas"><div class="editor-stage" style="width:${PLAN_WIDTH*zoom}px;height:${PLAN_HEIGHT*zoom}px"><div id="editorFloor" class="floor-editor-floor ${showGrid ? "" : "editor-grid-hidden"}" style="width:${PLAN_WIDTH}px;height:${PLAN_HEIGHT}px;transform:scale(${zoom});${backgrounds[room] ? `background-image:url('${backgrounds[room]}');background-size:100% 100%;` : ""}">${sceneMarkup(scenes[room],true)}${tableMarkup()}<div id="editorGuides"></div><div id="editorSelection"></div></div></div></div>
      <div class="editor-zoom-tools"><button id="zoomIn" title="Увеличить">＋</button><button id="zoomOut" title="Уменьшить">−</button><button id="zoomReset" title="Масштаб 100%">100%</button><button id="zoomFit" title="Вписать план">⛶</button></div><div id="editorFeedback" role="status" class="editor-feedback"></div></div></div>`;
      const nextCanvas=root.querySelector("#editorCanvas"); nextCanvas.scrollLeft=scroll[0];nextCanvas.scrollTop=scroll[1];
      drawSelection(); paintSettings();
      root.querySelector("#editorImage").onchange=event=>{
        const file=event.target.files[0]; if(!file)return;
        if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>2*1024*1024) return feedback("Выберите PNG, JPEG или WebP до 2 МБ.");
        const uploadRoom=room; const reader=new FileReader(); reader.onload=()=>{if(!root.isConnected)return;remember();backgrounds[uploadRoom]=reader.result;paint();};reader.readAsDataURL(file);
      };
    }
    function drawSelection() {
      const layer=root.querySelector("#editorSelection"); if(!layer)return; layer.innerHTML="";
      if(!current())return;
      const g=geometry(), isTable=selected.kind === "table", shape=isTable ? current()[3] : current().type;
      layer.innerHTML=`<div class="editor-selection-frame" style="${geometryStyle(g)}">${["nw","n","ne","e","se","s","sw","w"].map(h=>`<button class="editor-resize-handle handle-${h}" data-handle="${h}" aria-label="Изменить размер ${h}"></button>`).join("")}<button class="editor-rotate-handle" data-handle="rotate" aria-label="Повернуть объект">↻</button></div>
      <div class="editor-object-actions" style="left:${Math.max(4,Math.min(PLAN_WIDTH-240,g.x))}px;top:${Math.max(4,g.y-52)}px">${(isTable || shape !== "tree") ? `<button type="button" class="${shape !== "round" && shape !== "circle" ? "is-active" : ""}" data-object-action="square" title="Прямоугольная форма" aria-label="Прямоугольная форма"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button><button type="button" class="${shape === "round" || shape === "circle" ? "is-active" : ""}" data-object-action="round" title="Круглая форма" aria-label="Круглая форма"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg></button>` : ""}<button type="button" data-object-action="duplicate" title="Дублировать" aria-label="Дублировать"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button><button type="button" data-object-action="delete" title="Удалить" aria-label="Удалить"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14"/><path d="M10 10v6M14 10v6"/></svg></button></div>`;
    }
    function paintSettings() {
      const settings=root.querySelector("#editorTableSettings"); const object=current();
      if(!object){settings.innerHTML='<p class="editor-hint">Выберите объект на плане, чтобы настроить его.</p>';return;}
      const table=selected.kind === "table", g=geometry();
      settings.innerHTML=`<h3>${table ? "Настройки стола" : "Настройки фигуры"}</h3><label>Название<input id="objectName" maxlength="60" value="${esc(table ? object[0] : object.name || "")}"></label>
      ${table ? `<label>Минимум гостей<div class="editor-stepper"><button data-step="min:-1">−</button><input id="tableMinCapacity" type="number" min="1" max="999" value="${object[5]?.minCapacity || 1}"><button data-step="min:1">＋</button></div></label><label>Максимум гостей<div class="editor-stepper"><button data-step="max:-1">−</button><input id="tableCapacity" type="number" min="1" max="999" value="${object[4] || 4}"><button data-step="max:1">＋</button></div></label><label class="editor-toggle"><span>Доступен онлайн</span><input id="tableOnline" type="checkbox" ${object[5]?.online === false ? "" : "checked"}></label>` : `<label>Цвет<input id="shapeColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(object.color || "") ? object.color : "#dfe1f5"}" ${object.type === "tree" ? "disabled" : ""}></label>`}
      <div class="editor-dimensions"><label>Ширина<input id="objectWidth" type="number" min="24" max="1000" value="${Math.round(g.width)}"></label><label>Высота<input id="objectHeight" type="number" min="24" max="800" value="${Math.round(g.height)}"></label></div><label>Поворот, °<input id="objectRotation" type="number" min="-180" max="180" value="${Math.round(g.rotation)}"></label><p class="editor-hint">Углы рамки меняют размер. Ручка ↻ поворачивает объект.</p>`;
      settings.querySelector("#objectName").onchange=e=>{
        const name=e.target.value.trim();
        if(table && (!name || positions[room].some((t,i)=>i!==selected.index && String(t[0])===name))){e.target.value=object[0];return feedback("Название стола должно быть непустым и уникальным в зале.");}
        remember();if(table){const old=String(object[0]);object[0]=name;for(const list of [bookings,waitlist])for(const r of list)if((r.room || "main")===room && reservationTables(r).includes(old)){
          r.tables=reservationTables(r).map(t=>t===old?name:t);
          r.table=r.tables[0]||"";
        }}else object.name=name;paint();
      };
      for(const [id,property,min,max] of [["objectWidth","width",24,1000],["objectHeight","height",24,800],["objectRotation","rotation",-180,180]])settings.querySelector(`#${id}`).onchange=e=>{
        const value=Number(e.target.value);if(!Number.isFinite(value)||value<min||value>max){e.target.value=Math.round(g[property]);return;}remember();setGeometry(moveGeometry({...geometry(),[property]:value},0,0));paint();
      };
      if(table){settings.querySelector("#tableMinCapacity").onchange=e=>capacity("min",Number(e.target.value));settings.querySelector("#tableCapacity").onchange=e=>capacity("max",Number(e.target.value));settings.querySelector("#tableOnline").onchange=e=>{remember();object[5]={...(object[5]||{}),online:e.target.checked};paint();};}
      else settings.querySelector("#shapeColor").onchange=e=>{remember();object.color=e.target.value;paint();};
    }
    function capacity(kind,value){if(!Number.isInteger(value)||value<1||value>999){paintSettings();return;}remember();const table=current(),meta=table[5]||{};if(kind==="min"){meta.minCapacity=value;table[4]=Math.max(value,table[4]||4);}else{table[4]=value;meta.minCapacity=Math.min(value,meta.minCapacity||1);}table[5]=meta;paint();}
    function addObject(type,x,y) {
      remember();
      if(["side","round"].includes(type)){const name=nextTableName(positions[room]);positions[room].push([name,x,y,type,4,{minCapacity:1,online:true}]);selected={kind:"table",index:positions[room].length-1};}
      else {scenes[room].push({id:crypto.randomUUID(),type,x,y,width:type==="tree"?48:70,height:type==="rect"?50:70,rotation:0,name:"",color:type==="circle"?"#cbe8b2":"#b2bce9"});selected={kind:"shape",index:scenes[room].length-1};}
      setGeometry(moveGeometry(geometry(),0,0));paint();
    }
    function objectAction(action) {
      if(!current())return;
      const object=current(), table=selected.kind === "table";
      if(action==="delete") {
        const name=table?object[0]:object.name || "фигуру";
        const assigned=table && [...bookings,...waitlist].some(r=>(r.room||"main")===room && reservationTables(r).includes(String(name)));
        floor.dialog(`Удалить ${table ? "стол " : ""}${name}?`,assigned ? "Стол будет удалён из назначенных бронирований. Сами бронирования останутся." : "Объект будет удалён из плана. Действие можно отменить до выхода из редактора.",'<button id="editorDeleteCancel">Отмена</button><button class="booking-danger" id="editorDeleteConfirm">Удалить</button>');
        document.querySelector("#editorDeleteCancel").onclick=floor.closeDialog;
        document.querySelector("#editorDeleteConfirm").onclick=()=>{remember();if(table){positions[room].splice(selected.index,1);for(const list of [bookings,waitlist])for(const r of list)if((r.room||"main")===room && reservationTables(r).includes(String(name))){
          r.tables=reservationTables(r).filter(t=>t!==String(name));
          r.table=r.tables[0]||"";
        }}else scenes[room].splice(selected.index,1);selected=null;floor.closeDialog();paint();};return;
      }
      remember();
      if(action==="duplicate"){const copy=structuredClone(object);if(table){copy[0]=nextTableName(positions[room]);positions[room].push(copy);selected.index=positions[room].length-1;}else{copy.id=crypto.randomUUID();scenes[room].push(copy);selected.index=scenes[room].length-1;}setGeometry(moveGeometry(geometry(),30,30));}
      else {if(table)object[3]=action==="round"?"round":"side";else object.type=action==="round"?"circle":"rect";}
      paint();
    }

    function visualBounds(g) {
      const angle = (g.rotation || 0) * Math.PI / 180;
      const w = Math.abs(g.width * Math.cos(angle)) +
                Math.abs(g.height * Math.sin(angle));
      const h = Math.abs(g.width * Math.sin(angle)) +
                Math.abs(g.height * Math.cos(angle));

      return {
        left: g.x + (g.width - w) / 2,
        right: g.x + (g.width + w) / 2,
        centerX: g.x + g.width / 2,
        top: g.y + (g.height - h) / 2,
        bottom: g.y + (g.height + h) / 2,
        centerY: g.y + g.height / 2
      };
    }

    function referenceObjects() {
      const refs = [];

      positions[room].forEach((table, index) => {
        if (selected?.kind === "table" && selected.index === index) return;
        refs.push({
          bounds: visualBounds(tableGeometry(table)),
          label: "Стол " + String(table[0])
        });
      });

      (scenes[room] || []).forEach((shape, index) => {
        if (selected?.kind === "shape" && selected.index === index) return;
        refs.push({
          bounds: visualBounds(shapeGeometry(shape)),
          label: shape.name || "Фигура"
        });
      });

      return refs;
    }

    function clearGuides() {
      const layer = root.querySelector("#editorGuides");
      if (layer) layer.replaceChildren();
    }

    function showGuides(matches) {
      const layer = root.querySelector("#editorGuides");
      if (!layer) return;
      layer.replaceChildren();

      for (const match of matches) {
        const line = document.createElement("div");
        line.className = "editor-smart-guide " +
          (match.axis === "x" ? "vertical" : "horizontal");

        if (match.axis === "x") {
          line.style.left = match.value + "px";
        } else {
          line.style.top = match.value + "px";
        }

        const label = document.createElement("span");
        label.className = "editor-smart-guide-label";
        label.textContent = match.label;

        line.append(label);
        layer.append(line);
      }
    }

    function alignGeometry(g) {
      const threshold = 6 / zoom;
      const bounds = visualBounds(g);
      const refs = snapObjects ? referenceObjects() : [];
      const matches = [];

      function axisMatch(axis, ownKeys, referenceKeys) {
        let best = null;

        if (snapObjects) {
          for (const ref of refs) {
            for (const own of ownKeys) {
              for (const target of referenceKeys) {
                const delta = ref.bounds[target] - bounds[own];
                if (Math.abs(delta) > threshold) continue;

                if (!best || Math.abs(delta) < Math.abs(best.delta)) {
                  best = {
                    delta,
                    value: ref.bounds[target],
                    label: ref.label,
                    axis,
                    isObject: true
                  };
                }
              }
            }
          }
        }

        // Grid fallback if no nearby object alignment.
        if (!best && snapGrid) {
          const coordinate = axis === "x" ? g.x : g.y;
          const nearest = Math.round(coordinate / GRID_STEP) * GRID_STEP;
          best = {
            delta: nearest - coordinate,
            isObject: false
          };
        }

        return best;
      }

      const x = axisMatch(
        "x",
        ["left", "centerX", "right"],
        ["left", "centerX", "right"]
      );

      const y = axisMatch(
        "y",
        ["top", "centerY", "bottom"],
        ["top", "centerY", "bottom"]
      );

      if (x) g.x += x.delta;
      if (y) g.y += y.delta;

      const result = moveGeometry(g, 0, 0);

      if (x?.isObject && Math.abs(result.x - g.x) < 0.01) {
        matches.push(x);
      }
      if (y?.isObject && Math.abs(result.y - g.y) < 0.01) {
        matches.push(y);
      }

      // If snapping was clamped to a boundary, do not show
      // an inaccurate alignment guide.
      showGuides(matches);
      return result;
    }

    function world(e) {const r=root.querySelector("#editorFloor").getBoundingClientRect();return {x:(e.clientX-r.left)/zoom,y:(e.clientY-r.top)/zoom};}
    root.onpointerdown=e=>{
      if(e.button!==0 || saving || e.target.closest("input,select,label"))return;
      const palette=e.target.closest("[data-palette]"), handle=e.target.closest("[data-handle]"), object=e.target.closest("[data-table-index],[data-shape-index]"), canvas=root.querySelector("#editorCanvas");
      if(!palette && !handle && !object && (!canvas.contains(e.target) || e.target.closest("button")))return;
      e.preventDefault();
      if(palette)gesture={type:"create",palette:palette.dataset.palette,x:e.clientX,y:e.clientY};
      else if(handle){gesture={type:handle.dataset.handle === "rotate" ? "rotate" : "resize",handle:handle.dataset.handle,original:geometry(),start:world(e),x:e.clientX,y:e.clientY};}
      else if(object){
        const table = object.hasAttribute("data-table-index");
        const index = Number(
          table ? object.dataset.tableIndex : object.dataset.shapeIndex
        );

        if (table && e.shiftKey) {
          toggleTableSelection(index);
          return;
        }

        if (table && selectedTables.has(index)) {
          selected = null;
          drawSelection();
          paintSettings();

          const originals = [...selectedTables].map(i => ({
            index: i,
            g: tableGeometry(positions[room][i])
          }));

          gesture = {
            type: "group-move",
            originals,
            start: world(e),
            x: e.clientX,
            y: e.clientY
          };
        } else {
          clearMultiSelection();

          selected = {
            kind: table ? "table" : "shape",
            index
          };

          drawSelection();
          paintSettings();

          gesture = {
            type: "move",
            original: geometry(),
            start: world(e),
            x: e.clientX,
            y: e.clientY
          };
        }
      }
      else {clearMultiSelection();selected=null;drawSelection();paintSettings();gesture={type:"pan",x:e.clientX,y:e.clientY,left:canvas.scrollLeft,top:canvas.scrollTop};canvas.classList.add("panning");}
      gesture.pointerId=e.pointerId;root.setPointerCapture(e.pointerId);
    };
    root.onpointermove=e=>{
      if(!gesture || gesture.pointerId!==e.pointerId)return;
      const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(Math.hypot(dx,dy)<3 && !gesture.moved)return;
      if(!gesture.moved){gesture.moved=true;if(["move","resize","rotate","group-move"].includes(gesture.type)){remember();gesture.recorded=true;}}
      if(gesture.type==="create"){let ghost=root.querySelector("#editorDragGhost");if(!ghost){ghost=document.createElement("div");ghost.id="editorDragGhost";ghost.className="editor-drag-ghost";ghost.innerHTML=objectPreview(gesture.palette);ghost.classList.add("editor-preview-container");root.append(ghost);}ghost.style.left=e.clientX-25+"px";ghost.style.top=e.clientY-25+"px";}
      else if(gesture.type==="pan"){
          const canvas = root.querySelector("#editorCanvas");
          canvas.scrollLeft = gesture.left - dx;
          canvas.scrollTop = gesture.top - dy;
        }
        else if(gesture.type==="group-move"){
          const p = world(e);
          let dx = p.x - gesture.start.x;
          let dy = p.y - gesture.start.y;

          // Shift temporarily disables grid snapping.
          if(e.shiftKey) {
            const was = snapGrid;
            snapGrid = false;
            moveSelectedTables(gesture.originals, dx, dy);
            snapGrid = was;
          } else {
            moveSelectedTables(gesture.originals, dx, dy);
          }

          clearGuides();
        }
      else {
          const p = world(e);
          const start = gesture.start;

          let g = gesture.type === "move"
            ? moveGeometry(gesture.original, p.x-start.x, p.y-start.y)
            : gesture.type === "resize"
              ? resizeGeometry(gesture.original, gesture.handle, p.x-start.x, p.y-start.y)
              : rotateGeometry(gesture.original, start, p);

          if (gesture.type === "move") {
            if (e.shiftKey) {
              clearGuides();
            } else {
              g = alignGeometry(g);
            }
          } else {
            clearGuides();
            if (gesture.type === "rotate" && e.shiftKey) {
              g.rotation = Math.round(g.rotation / 15) * 15;
            }
          }

          setGeometry(g);
        }
    };
    function finishGesture(e,cancel=false){
      if(!gesture || gesture.pointerId!==e.pointerId)return;
      const ended=gesture;gesture=null;clearGuides();root.querySelector("#editorDragGhost")?.remove();root.querySelector("#editorCanvas")?.classList.remove("panning");
      if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);
      if(cancel && ended.recorded){
          if(ended.type==="group-move"){
            for(const item of ended.originals){
              const table=positions[room][item.index];
              table[1]=item.g.x;
              table[2]=item.g.y;
            }
            history.pop();
            paint();
          }else{
            setGeometry(ended.original);
            history.pop();
            paint();
          }
          return;
        }
      if(!cancel && ended.type==="create"){const rect=root.querySelector("#editorCanvas").getBoundingClientRect();const inside=e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom;
        if(inside){const p=world(e);addObject(
            ended.palette,
            Math.max(0, snapGrid ? Math.round((p.x-25)/GRID_STEP)*GRID_STEP : p.x-25),
            Math.max(0, snapGrid ? Math.round((p.y-25)/GRID_STEP)*GRID_STEP : p.y-25)
          );}
        else if(!ended.moved){const canvas=root.querySelector("#editorCanvas"),r=canvas.getBoundingClientRect(),p=world({clientX:r.left+Math.min(r.width/2,250),clientY:r.top+Math.min(r.height/2,250)});addObject(ended.palette,p.x,p.y);}
      }else if(ended.moved && ended.type!=="pan")paint();
    }
    root.onpointerup=e=>finishGesture(e);root.onpointercancel=e=>finishGesture(e,true);root.onlostpointercapture=e=>finishGesture(e,true);
    root.onclick=async e=>{
      const button=e.target.closest("button");if(!button || button.dataset.palette || button.dataset.handle || button.hasAttribute("data-table-index") || button.hasAttribute("data-shape-index"))return;
      const id=button.id;
      if(button.dataset.objectAction)return objectAction(button.dataset.objectAction);
      if(button.dataset.step){const [kind,delta]=button.dataset.step.split(":");return capacity(kind,(kind==="min"?current()[5]?.minCapacity||1:current()[4]||4)+Number(delta));}
      if(button.dataset.editorRoom){room=button.dataset.editorRoom;selectedTables.clear();allTablesSelected=false;selected=null;paint();return;}
      if(id==="editorExit"){
        if(dirty){floor.dialog("Выйти из редактора?","Несохранённые изменения плана будут отменены.",'<button id="editorStay">Продолжить редактирование</button><button id="editorDiscard">Отменить изменения</button>');document.querySelector("#editorStay").onclick=floor.closeDialog;document.querySelector("#editorDiscard").onclick=()=>{floor.closeDialog();root.remove();render();};}
        else {root.remove();render();}return;
      }
      if(id==="editorTables" || id==="editorBackgrounds"){activeTab=id==="editorTables"?"tables":"background";selected=null;paint();}
      else if(id==="editorUndo" && history.length){future.push(snapshot());restore(history.pop());}
      else if(id==="editorRedo" && future.length){history.push(snapshot());restore(future.pop());}
      else if(id==="editorRemoveImage"){remember();delete backgrounds[room];paint();}
      else if(id==="editorAddRoom" || id==="editorRoomSettings"){
        floor.dialog(id==="editorAddRoom"?"Добавить зал":"Настройки зала",`<label>Название<input id="editorRoomName" maxlength="80" value="${id==="editorAddRoom"?"":esc(rooms[room]||room)}"></label><p id="editorRoomError" role="alert"></p>`,(id==="editorRoomSettings"?'<button class="booking-danger" id="editorDeleteRoom">Удалить зал</button>':'')+'<button id="editorRoomCancel">Отмена</button><button class="green" id="editorRoomConfirm">Сохранить</button>');document.querySelector("#editorRoomCancel").onclick=floor.closeDialog;
        document.querySelector("#editorDeleteRoom")?.addEventListener("click", requestRoomDeletion);
        document.querySelector("#editorRoomConfirm").onclick=()=>{const name=document.querySelector("#editorRoomName").value.trim();if(!name || Object.entries(rooms).some(([key,value])=>value===name && (id==="editorAddRoom"||key!==room))){document.querySelector("#editorRoomError").textContent="Укажите уникальное название зала.";return;}remember();if(id==="editorAddRoom"){room="room-"+crypto.randomUUID();positions[room]=[];scenes[room]=[];}rooms[room]=name;selected=null;floor.closeDialog();paint();};
      }
      else if(["zoomIn","zoomOut","zoomReset","zoomFit"].includes(id)){
        if(id==="zoomFit"){const c=root.querySelector("#editorCanvas");zoom=Math.max(.25,Math.min(2,(c.clientWidth-24)/PLAN_WIDTH,(c.clientHeight-24)/PLAN_HEIGHT));}
        else zoom=id==="zoomReset"?1:Math.max(.25,Math.min(2,zoom+(id==="zoomIn"?.1:-.1)));paint();
      }
      else if(id==="editorSave"){
        saving=true;paint();
        const resources=storage.read("mio-ru-resources-v1",{});resources.floorScenes=Object.keys(scenes).map(key=>({id:key,room:key,objects:scenes[key]}));
        const before={positions:structuredClone(floor.positions),rooms:state.rooms,reservations:state.reservations,waitlist:state.waitlist,servers:state.servers,room:state.room,blocked:[...floor.blocked],showUnassigned:state.showUnassigned};
        Object.keys(floor.positions).forEach(key=>delete floor.positions[key]);Object.assign(floor.positions,positions);state.rooms=rooms;state.reservations=bookings;state.waitlist=waitlist;state.servers=servers;state.room=room;state.showUnassigned=showUnassigned;
        const wrote=[storage.write("mio-ru-backgrounds-v1",backgrounds),storage.write("mio-ru-resources-v1",resources),storage.write("mio-ru-demo-v1",state),floor.persistPositions(),floor.setBlocked(blocked)];
        try{if(wrote.some(ok=>!ok))throw new Error("Не удалось записать план.");await storage.flush();if(storage.persistence.status==="error")throw new Error("Нет связи с сервером. План остался в черновике; повторите сохранение.");root.remove();render();}
        catch(error){Object.keys(floor.positions).forEach(key=>delete floor.positions[key]);Object.assign(floor.positions,before.positions);state.rooms=before.rooms;state.reservations=before.reservations;state.waitlist=before.waitlist;state.servers=before.servers;state.room=before.room;state.showUnassigned=before.showUnassigned;floor.setBlocked(before.blocked);saving=false;paint();feedback(error.message);}
      }
    };
    root.onchange=e=>{
        if(e.target.id==="showUnassigned"){
          remember();
          showUnassigned=e.target.checked;
        }
        if(e.target.id==="editorShowGrid"){
          showGrid=e.target.checked;
          root.querySelector("#editorFloor")
            ?.classList.toggle("editor-grid-hidden", !showGrid);
        }
        if(e.target.id==="editorSnapGrid"){
          snapGrid=e.target.checked;
          clearGuides();
        }
        if(e.target.id==="editorSnapObjects"){
          snapObjects=e.target.checked;
          clearGuides();
        }
      };
    root.onkeydown=e=>{
      if(e.target.closest("input,textarea,select"))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="a" && !e.altKey){
          e.preventDefault();
          selectAllTables();
        }
        else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();root.querySelector(e.shiftKey?"#editorRedo":"#editorUndo").click();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d" && current()){e.preventDefault();objectAction("duplicate");}
      else if((e.key==="Delete"||e.key==="Backspace")&&selectedTables.size){
          e.preventDefault();
          deleteSelectedTables();
        }
        else if((e.key==="Delete"||e.key==="Backspace")&&current()){
          e.preventDefault();
          objectAction("delete");
        }
      else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)&&current()){e.preventDefault();remember();const d=e.shiftKey?13:1;setGeometry(moveGeometry(geometry(),e.key==="ArrowLeft"?-d:e.key==="ArrowRight"?d:0,e.key==="ArrowUp"?-d:e.key==="ArrowDown"?d:0));paint();}
      else if(e.key==="Escape"){clearMultiSelection();selected=null;drawSelection();paintSettings();}
    };
    paint();root.focus();
  };
}
