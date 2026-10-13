import { escapeHTML as esc } from "../lib/dom.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
import { readResources } from "../services/repositories.js";
import { download } from "../services/csv.js";
import { toast } from "../components/toast.js";
export function validateFloorImport(value) {
  const positions = value?.positions || value;
  if (
    !positions ||
    typeof positions !== "object" ||
    Array.isArray(positions) ||
    !Object.keys(positions).length
  )
    throw new Error("Схема должна содержать хотя бы один зал");
  for (const [key, tables] of Object.entries(positions)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !Array.isArray(tables)
    )
      throw new Error("Некорректный зал");
    if (
      tables.some(
        (t) =>
          !Array.isArray(t) ||
          t[0] == null ||
          !String(t[0]).trim() ||
          !Number.isFinite(t[1]) ||
          !Number.isFinite(t[2]) ||
          t[1] < 0 ||
          t[2] < 0 ||
          (t[3] && !["side", "round", "long", "wide"].includes(t[3])) ||
          (t[4] != null && (!Number.isInteger(t[4]) || t[4] < 1)),
      )
    )
      throw new Error("Некорректный стол в зале " + key);
    if (new Set(tables.map((t) => String(t[0]))).size !== tables.length)
      throw new Error("Повторяющиеся номера столов в зале " + key);
  }
  const rooms = value.positions ? value.rooms || {} : {};
  if (
    typeof rooms !== "object" ||
    Array.isArray(rooms) ||
    Object.values(rooms).some(
      (name) => typeof name !== "string" || !name.trim(),
    )
  )
    throw new Error("Некорректные названия залов");
  return { positions, rooms };
}
export function createPage(app) {
  let root,
    prepared = null,
    selection = 0;
  function history() {
    const rows = readResources().floorImports || [];
    app.floor.dialog(
      "Последние импорты",
      rows.length
        ? rows
            .slice()
            .reverse()
            .map(
              (r) =>
                `<p><strong>${esc(r.name)}</strong><br>${esc(r.date)} · ${esc(r.room)} · ${esc(r.kind)}</p>`,
            )
            .join("")
        : "Планы зала ещё не импортировались.",
      '<button id="history-close" class="outline-green">Закрыть</button>',
    );
    document.querySelector("#history-close").onclick = app.floor.closeDialog;
  }
  async function prepare(file) {
    const token = ++selection;
    prepared = null;
    root.querySelector("#floor-commit").disabled = true;
    root.querySelector("#floor-error").textContent = "";
    root.querySelector("#floor-preview").innerHTML = "";
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        if (file.size > 1024 * 1024)
          throw new Error("Максимальный размер JSON — 1 МБ");
        const result = validateFloorImport(JSON.parse(await file.text()));
        if (token !== selection || !root) return;
        prepared = { kind: "JSON", name: file.name, ...result };
        root.querySelector("#floor-preview").innerHTML =
          `<h3>Предпросмотр</h3>${Object.entries(result.positions)
            .map(
              ([key, tables]) =>
                `<p>${esc(result.rooms[key] || app.state.rooms[key] || key)}: ${tables.length} столов</p>`,
            )
            .join(
              "",
            )}<p>Импорт заменит только перечисленные залы. Остальные залы сохранятся.</p>`;
      } else {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
          throw new Error(
            "Выберите PNG, JPEG, WebP или JSON. Распознавание PDF требует подключения сервиса импорта.",
          );
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Максимальный размер изображения — 2 МБ");
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
          reader.readAsDataURL(file);
        });
        const image = new globalThis.Image();
        image.src = data;
        try {
          await image.decode();
        } catch {
          throw new Error(
            "Не удалось прочитать изображение. Выберите корректный PNG, JPEG или WebP.",
          );
        }
        if (token !== selection || !root) return;
        prepared = { kind: "Изображение", name: file.name, data };
        root.querySelector("#floor-preview").innerHTML =
          `<img class="overview-upload-preview" src="${data}" alt="Предпросмотр плана зала"><p>Будет создан новый зал с этим фоном. Добавьте столы в редакторе плана.</p>`;
      }
      root.querySelector("#floor-commit").disabled = false;
    } catch (error) {
      if (root && token === selection)
        root.querySelector("#floor-error").textContent = error.message;
    }
  }
  function mount() {
    document.querySelector(".content").style.display = "none";
    root = document.createElement("section");
    root.id = "overview-view";
    root.innerHTML = `<div class="overview-body"><div class="overview-import"><div class="flex-between"><h2>Импорт плана зала</h2><button class="outline-green" id="floor-history">Последние импорты</button></div><p>Загрузите схему JSON или изображение плана. Автоматическое распознавание столов пока не подключено.</p><input id="floor-file" type="file" accept=".json,image/png,image/jpeg,image/webp" hidden><button class="overview-drop" id="floor-drop">Перетащите файл сюда или выберите файл<br>PNG, JPEG, WebP до 2 МБ · JSON до 1 МБ</button><label class="settings-field">Название нового зала (для изображения)<input id="floor-room-name" type="text" placeholder="Название зала"></label><div id="floor-preview"></div><p id="floor-error" role="alert"></p><div class="bottom-buttons"><button class="green" id="floor-commit" disabled>Импортировать</button><button class="outline-green" id="floor-export">Экспорт плана</button></div></div></div>`;
    document.querySelector(".workspace").append(root);
    root.querySelector("#floor-file").onchange = (e) =>
      prepare(e.target.files[0]);
    const drop = root.querySelector("#floor-drop");
    drop.onclick = () => root.querySelector("#floor-file").click();
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    };
    drop.ondragleave = () => drop.classList.remove("drag");
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      prepare(e.dataTransfer.files[0]);
    };
    root.querySelector("#floor-history").onclick = history;
    root.querySelector("#floor-export").onclick = () =>
      download(
        "floor-plan.json",
        JSON.stringify(
          { positions: app.floor.positions, rooms: app.state.rooms },
          null,
          2,
        ),
      );
    root.querySelector("#floor-commit").onclick = () => {
      if (!prepared) return;
      const snapshot = {
        positions: structuredClone(app.floor.positions),
        rooms: structuredClone(app.state.rooms),
      };
      download("floor-before-import.json", JSON.stringify(snapshot, null, 2));
      let room = app.state.room;
      if (prepared.kind === "JSON") {
        Object.assign(app.floor.positions, prepared.positions);
        for (const key of Object.keys(prepared.positions))
          app.state.rooms[key] =
            String(prepared.rooms[key] || app.state.rooms[key] || key).trim() ||
            key;
        room = Object.keys(prepared.positions)[0];
      } else {
        const name =
          root.querySelector("#floor-room-name").value.trim() ||
          prepared.name.replace(/\.[^.]+$/, "");
        room = "room-" + crypto.randomUUID();
        app.state.rooms[room] = name;
        app.floor.positions[room] = [];
        const backgrounds = storage.read("mio-ru-backgrounds-v1", {});
        backgrounds[room] = prepared.data;
        storage.write("mio-ru-backgrounds-v1", backgrounds);
      }
      app.state.room = room;
      app.floor.persistPositions();
      app.save();
      const data = readResources();
      data.floorImports = [
        ...(data.floorImports || []),
        {
          id: crypto.randomUUID(),
          name: prepared.name,
          date: new Date().toISOString(),
          room: app.state.rooms[room],
          kind: prepared.kind,
        },
      ].slice(-50);
      storage.write(STORAGE_KEYS.resources, data);
      const isImage = prepared.kind !== "JSON";
      prepared = null;
      toast("План импортирован");
      app.navigate("view/План зала");
      app.render();
      if (isImage) app.openEditor();
    };
  }
  return {
    mount,
    unmount() {
      selection++;
      root?.remove();
      root = null;
      prepared = null;
      app.floor.closeDialog();
    },
    refresh() {},
  };
}
