import { escapeHTML as safe } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createTopbarActions(app) {
  const { state } = app;
  ("use strict");
  const KEY_BLOCKS = "mio-ru-time-blocks-v1";
  const KEY_NOTES = "mio-ru-daily-notes-v1";
  const read = (key, fallback) => storage.read(key, fallback);
  let blocks = read(KEY_BLOCKS, []);
  let notes = read(KEY_NOTES, {});
  const today = () => state.date;

  const dayLabel = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  let tableNumbers = [];
  let pop = null;
  function close() {
    pop?.remove();
    pop = null;
  }
  function position(anchor) {
    if (!pop) return;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left =
      Math.max(10, Math.min(window.innerWidth - w - 10, r.right - w)) + "px";
    pop.style.top =
      Math.max(10, Math.min(window.innerHeight - h - 10, r.bottom + 5)) + "px";
  }
  function create(anchor, cls, html) {
    close();
    pop = document.createElement("div");
    pop.className = "toolbar-pop " + cls;
    pop.innerHTML = html;
    document.body.appendChild(pop);
    position(anchor);
    return pop;
  }
  function choiceButtons(values, selected, multi = false) {
    return values
      .map((v) => {
        const active = multi ? selected.includes(v) : selected === v;
        return `<button type="button" class="toolbar-chip ${active ? "on" : ""}"
    data-toolbar-value="${safe(v)}">${safe(v)}</button>`;
      })
      .join("");
  }
  function blockHours(anchor) {
    blocks = storage.read(KEY_BLOCKS, []);
    tableNumbers = [
      ...new Set(
        Object.values(app.floor.positions)
          .flat()
          .map((x) => String(x[0])),
      ),
    ];
    const form = {
      scope: "Весь ресторан",
      sources: ["В ресторане"],
      duration: "Произвольно",
      repeat: "Однократно",
      days: [1, 2, 3, 4, 5, 6, 0],
      tables: [],
      startDate: today(),
      endDate: today(),
    };
    const sourceValues = ["Онлайн", "В ресторане", "Меню"];
    const durationValues = [
      "1 час",
      "1,5 часа",
      "2 часа",
      "3 часа",
      "Весь день",
      "Произвольно",
    ];

    const html = `
 <h3>Блокировка времени</h3>
 <div class="toolbar-group">
  <div class="toolbar-group-title">Что заблокировать?</div>
  <div class="toolbar-chips" id="toolbarScope">
   ${choiceButtons(["Весь ресторан", "Выбранные столы"], form.scope)}
  </div>
  <div id="toolbarTables" hidden>
   <div class="toolbar-small">Выберите столы</div>
   <div class="toolbar-table-grid">
    ${tableNumbers
      .map(
        (n) => `<button type="button"
     data-toolbar-table="${safe(n)}">${safe(n)}</button>`,
      )
      .join("")}
   </div>
  </div>
 </div>
 <div class="toolbar-group">
  <div class="toolbar-group-title">Заблокировать бронирования из</div>
  <div class="toolbar-chips" id="toolbarSources">
   ${choiceButtons(sourceValues, form.sources, true)}
  </div>
 </div>
 <div class="toolbar-group">
  <div class="toolbar-group-title">Продолжительность блокировки</div>
  <div class="toolbar-chips" id="toolbarDuration">
   ${choiceButtons(durationValues, form.duration)}
  </div>
 </div>
 <hr class="toolbar-divider">
 <div class="toolbar-group">
  <div class="toolbar-group-title">Однократно или регулярно?</div>
  <div class="toolbar-chips" id="toolbarRepeat">
   ${choiceButtons(["Однократно", "Повторять"], form.repeat)}
  </div>
  <div id="toolbarRepeatDays" hidden>
   <div class="toolbar-small">Дни повторения</div>
   <div class="toolbar-repeat-days">
    ${dayLabel
      .map(
        (v, i) => `<button type="button"
     class="on" data-toolbar-day="${i}">${v}</button>`,
      )
      .join("")}
   </div>
  </div>
 </div>
 <div class="toolbar-fields">
  <div class="toolbar-field"><label>Дата начала</label>
   <input type="date" id="toolbarStartDate" value="${form.startDate}"></div>
  <div class="toolbar-field"><label>Время начала</label>
   <input type="time" id="toolbarStartTime" value="12:00"></div>
  <div class="toolbar-field"><label>Дата окончания</label>
   <input type="date" id="toolbarEndDate" value="${form.endDate}"></div>
  <div class="toolbar-field"><label>Время окончания</label>
   <input type="time" id="toolbarEndTime" value="13:00"></div>
 </div>
 <button class="toolbar-save" id="toolbarSubmit">Заблокировать время</button>
 <div class="toolbar-small">Ограничения проверяются при сохранении бронирования.</div>`;

    const panel = create(anchor, "toolbar-block", html);

    function single(group, field) {
      panel
        .querySelectorAll("#" + group + " [data-toolbar-value]")
        .forEach((b) => {
          b.onclick = () => {
            form[field] = b.dataset.toolbarValue;
            panel
              .querySelectorAll("#" + group + " button")
              .forEach((x) => x.classList.remove("on"));
            b.classList.add("on");
            panel.querySelector("#toolbarTables").hidden =
              form.scope !== "Выбранные столы";
            panel.querySelector("#toolbarRepeatDays").hidden =
              form.repeat !== "Повторять";
            syncDuration();
          };
        });
    }

    function syncDuration() {
      const minutes = {
        "1 час": 60,
        "1,5 часа": 90,
        "2 часа": 120,
        "3 часа": 180,
      }[form.duration];
      const start = panel.querySelector("#toolbarStartTime").value;
      if (form.duration === "Весь день") {
        panel.querySelector("#toolbarStartTime").value = "00:00";
        panel.querySelector("#toolbarEndTime").value = "23:59";
      } else if (minutes && start) {
        const [h, m] = start.split(":").map(Number);
        const total = (h * 60 + m + minutes) % 1440;
        panel.querySelector("#toolbarEndTime").value =
          String(Math.floor(total / 60)).padStart(2, "0") +
          ":" +
          String(total % 60).padStart(2, "0");
      }
    }
    single("toolbarScope", "scope");
    single("toolbarDuration", "duration");
    single("toolbarRepeat", "repeat");

    panel.querySelectorAll("#toolbarSources button").forEach((b) => {
      b.onclick = () => {
        const value = b.dataset.toolbarValue;
        form.sources = form.sources.includes(value)
          ? form.sources.filter((x) => x !== value)
          : [...form.sources, value];
        b.classList.toggle("on", form.sources.includes(value));
      };
    });
    panel.querySelectorAll("[data-toolbar-table]").forEach((b) => {
      b.onclick = () => {
        const value = b.dataset.toolbarTable;
        form.tables = form.tables.includes(value)
          ? form.tables.filter((x) => x !== value)
          : [...form.tables, value];
        b.classList.toggle("on", form.tables.includes(value));
      };
    });
    panel.querySelectorAll("[data-toolbar-day]").forEach((b) => {
      b.onclick = () => {
        const value = Number(b.dataset.toolbarDay);
        form.days = form.days.includes(value)
          ? form.days.filter((x) => x !== value)
          : [...form.days, value];
        b.classList.toggle("on", form.days.includes(value));
      };
    });

    panel.querySelector("#toolbarSubmit").onclick = () => {
      const startDate = panel.querySelector("#toolbarStartDate").value;
      const endDate = panel.querySelector("#toolbarEndDate").value;
      const startTime = panel.querySelector("#toolbarStartTime").value;
      const endTime = panel.querySelector("#toolbarEndTime").value;

      if (!startDate || !endDate || !startTime || !endTime)
        return alert("Укажите даты и время.");

      if (form.sources.length === 0)
        return alert("Выберите хотя бы один источник бронирований.");

      if (form.scope === "Выбранные столы" && form.tables.length === 0)
        return alert("Выберите столы.");

      if (form.repeat === "Повторять" && form.days.length === 0)
        return alert("Выберите дни повторения.");

      if (startDate + "T" + startTime >= endDate + "T" + endTime)
        return alert("Дата окончания должна быть позже даты начала.");

      blocks.push({
        id: Date.now(),
        scope: form.scope,
        sources: [...form.sources],
        duration: form.duration,
        repeat: form.repeat,
        days: [...form.days],
        tables: [...form.tables],
        start: startDate + "T" + startTime,
        end: endDate + "T" + endTime,
      });

      storage.setItem(KEY_BLOCKS, JSON.stringify(blocks));
      close();
      alert(
        storage.persistence.mode === "server"
          ? "Ограничение отправлено на сохранение."
          : "Блокировка сохранена локально.",
      );
    };
  }

  function dailyComment(anchor) {
    const date = today();
    notes = storage.read(KEY_NOTES, {});

    const existing = pop?.classList.contains("toolbar-daily-comment");

    if (existing && pop?.dataset.date === date) {
      close();
      return;
    }

    const dialog = create(
      anchor,
      "toolbar-daily-comment",
      `<div class="mio-day-comment-heading">
        <h3>Комментарий на день</h3>
        <button type="button" data-close-comment
          aria-label="Закрыть">×</button>
      </div>
      <div class="mio-day-comment-date">${safe(
        date.split("-").reverse().join(".")
      )}</div>
      <textarea id="mioDayComment"
        aria-label="Комментарий на выбранный день"
        placeholder="Введите комментарий для этого дня..."
        rows="6">${safe(notes[date] || "")}</textarea>
      <div class="mio-day-comment-status"
        role="status">Сохраняется автоматически</div>`
    );

    dialog.dataset.date = date;

    const input = dialog.querySelector("#mioDayComment");
    const status = dialog.querySelector(".mio-day-comment-status");

    input.addEventListener("input", () => {
      const current = storage.read(KEY_NOTES, {});
      const updated = current && typeof current === "object" &&
        !Array.isArray(current) ? { ...current } : {};

      if (input.value.trim()) {
        updated[date] = input.value;
      } else {
        delete updated[date];
      }

      const result = storage.setItem(
        KEY_NOTES,
        JSON.stringify(updated)
      );

      notes = updated;

      status.textContent = result === false
        ? "Не удалось сохранить комментарий"
        : "Изменения отправлены на сохранение";
    });

    dialog.querySelector("[data-close-comment]").onclick = close;
    input.focus();
  }

  function bind() {
    const actions = document.querySelector(".top-actions");
    if (!actions) return;

    const block = actions.querySelector('[title="Ограничения"]');
    const list = actions.querySelector('[title="Список"]');

    if (block)
      block.onclick = (e) => {
        e.stopPropagation();
        blockHours(block);
      };
    if (list)
      list.onclick = (e) => {
        e.stopPropagation();
        dailyComment(list);
      };

    document.addEventListener("pointerdown", (e) => {
      if (
        pop &&
        !pop.contains(e.target) &&
        !e.target.closest('.top-actions [title="Ограничения"]') &&
        !e.target.closest('.top-actions [title="Список"]')
      )
        close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    window.addEventListener("resize", close);
  }
  bind();
  return { close, blockHours, dailyComment };
}
