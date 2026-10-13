import { escapeHTML as esc } from "../../lib/dom.js";
import { storage } from "../../services/storage.js";
import { closeModal } from "../../components/modal.js";
import { SEATED } from "../../services/reservation-queries.js";
import { validateReservation } from "../../services/reservations.js";
export function createReservationForm({
  state,
  save,
  render,
  floor,
  getFields,
}) {
  const { mapMarkup, closeBooking } = floor;
  const editingPositions = floor.positions;
  let bookingRoom = "main";
  function openReservation(wait = false, guests = 2, id = null, defaults = {}) {
    closeBooking();
    closeModal();
    const entry = (wait ? state.waitlist : state.reservations).find(
      (r) => r.id === id,
    );
    const selected =
      entry?.table ?? defaults.table ?? state.selectedTable ?? null;
    bookingRoom = entry?.room || defaults.room || state.room;
    let selectedTable = selected;
    let people = entry?.guests || guests || 2;
    const now = new Date();
    let minutes = entry?.duration || 90,
      clock =
        entry?.time ||
        defaults.time ||
        `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;
    let visitDate = entry?.date || state.date;
    const screen = document.createElement("div");
    screen.id = "bookingScreen";
    document.body.append(screen);
    function update() {
      screen.innerHTML = `<div class="booking-header">${entry ? "Изменить бронирование" : "Новое бронирование"}
    <button type="button" id="bookingMinimize" aria-label="Свернуть">−</button><button id="bookingClose">×</button></div>
   <div class="booking-content">
   <div class="booking-form"><div class="booking-form-scroll">
   <div class="booking-fields">
    <div class="booking-label">♟ Гость</div>
    <div class="booking-guest-grid">
     <input aria-label="Телефон" id="bookingPhone" placeholder="+370 · Телефон">
     <input aria-label="Электронная почта" type="email" id="bookingEmail" placeholder="Электронная почта">
     <input aria-label="Имя гостя" id="bookingFirst" placeholder="Имя" value="${esc(entry?.name?.split(" ")[0] || "")}">
     <input aria-label="Фамилия" id="bookingLast" placeholder="Фамилия" value="${esc(entry?.name?.split(" ").slice(1).join(" ") || "")}">
    </div></div>
    <div class="booking-row">Без бронирования
    <input id="bookingWalk" type="checkbox"></div>
    <div class="booking-row">Лист ожидания
    <input id="bookingWait" type="checkbox" ${wait ? "checked" : ""}></div>
    <div class="booking-row"><span class="row-name">▣ Дата</span>
      <input class="row-value" type="date" id="bookingDate" value="${visitDate}"></div>
    <div class="booking-row"><span class="row-name">◷ Время</span>
      <input class="row-value" type="time" id="bookingTime" value="${clock}" style="border:0;min-width:0">
      <button class="booking-step" id="timeMinus">−</button><button class="booking-step" id="timePlus">＋</button></div>
    <div class="booking-row"><span class="row-name">Предпочтения</span>
      <select class="row-value" id="bookingPreference" style="border:0"><option>Выберите предпочтение</option><option>Основной зал</option><option>Летняя терраса</option></select></div>
    <div class="booking-row"><span class="row-name">♟ Гости</span>
      <strong class="row-value" id="bookingPeople">${people}</strong>
      <button class="booking-step" id="peopleMinus">−</button><button class="booking-step" id="peoplePlus">＋</button></div>
    <div class="booking-row"><span class="row-name">◷ Длительность</span>
      <strong class="row-value" id="bookingDuration">${Math.floor(minutes / 60)} ч ${minutes % 60} мин</strong>
      <button class="booking-step" id="durationMinus">−</button><button class="booking-step" id="durationPlus">＋</button></div>
    <div class="booking-row"><span class="row-name">▦ Стол</span><span class="row-value" id="bookingTableText">${selectedTable ?? "Не выбран"}</span></div>
    <div class="booking-row"><label class="row-name" for="bookingStatus">Статус</label><select class="row-value" id="bookingStatus">${["Не подтверждено", "Подтверждено гостем", "Подтверждено", "Нет ответа", "Гость опаздывает", "Оставлено сообщение", "Опоздание", "Неверный номер", "Прибыл", "Частично прибыл", "Частично посажены", "За столом", "Закуска", "Основное блюдо", "Десерт", "Счёт выдан", "Уборка требуется", "Уборка выполняется", "Отказано", "Не пришёл", "Отменено", "Отменено гостем", "Завершено"].map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
    <div class="booking-row"><label for="bookingNotify">Запросить уведомление (требуется сервис отправки)</label><input id="bookingNotify" type="checkbox" checked></div>
    <details class="booking-detail"><summary>Чат команды <span>Личные сообщения</span></summary><textarea id="bookingChat" placeholder="Сообщение команде"></textarea></details>
    <details class="booking-detail"><summary>Теги <span>Выберите теги</span></summary><input id="bookingTags" placeholder="Теги через запятую"></details>
    <div class="booking-row"><label class="row-name" for="bookingEmployee">Сотрудник</label><select id="bookingEmployee" class="row-value"><option value="">Кто принял бронь</option>${state.servers.map((x) => `<option>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="booking-row"><label class="row-name" for="bookingSource">Источник</label><select id="bookingSource" class="row-value">${["В ресторане", "Телефон", "Сайт", "Instagram", "Facebook", "WhatsApp", "Другое"].map((x) => `<option>${x}</option>`).join("")}</select></div>
    <details class="booking-detail"><summary>Поля <span>Дополнительные сведения</span></summary><div id="bookingCustomFields"></div></details>
    <details class="booking-detail"><summary>Заметки <span>Особые пожелания</span></summary><textarea id="bookingNotes" placeholder="Заметки к бронированию"></textarea></details>
   </div><div class="booking-footer">${entry ? '<button class="danger" id="deleteBooking">Удалить бронирование</button>' : ""}<button class="green" id="bookingCreate">${entry ? "Сохранить бронирование" : "Создать бронирование"}</button></div></div>
   <div class="booking-plan-area"><div class="booking-plan-header">
     ▦ Стол <div class="booking-selected" id="bookingSelected">${selectedTable ?? "Не выбран"} <span style="margin-left:12px;cursor:pointer" id="bookingClear">×</span></div>
   </div><div class="booking-room-header">
${Object.keys(editingPositions)
  .map(
    (key) =>
      `<button data-booking-room="${esc(key)}" class="${bookingRoom === key ? "active" : ""}">${esc(state.rooms[key] || key)}</button>`,
  )
  .join("")}
     <span style="margin-left:auto;padding:12px">▦ Подписи столов</span>
   </div><div class="booking-map"><div id="bookingMap" class="booking-map-inner"></div></div></div></div>`;
      document.querySelector("#bookingMap").innerHTML = mapMarkup(bookingRoom);
      document
        .querySelectorAll("#bookingMap [data-table-index]")
        .forEach((el) => {
          const idx = +el.dataset.tableIndex;
          el.classList.toggle(
            "chosen",
            String(editingPositions[bookingRoom][idx][0]) ===
              String(selectedTable),
          );
          el.onclick = () => {
            selectedTable = editingPositions[bookingRoom][idx][0];
            document.querySelector("#bookingSelected").firstChild.textContent =
              selectedTable + " ";
            document.querySelector("#bookingTableText").textContent =
              selectedTable;
            document
              .querySelectorAll("#bookingMap [data-table-index]")
              .forEach((x) => x.classList.remove("chosen"));
            el.classList.add("chosen");
          };
        });
      document.querySelector("#bookingClose").onclick = closeBooking;
      screen.querySelector("#deleteBooking")?.addEventListener("click", () => {
        if (!confirm("Удалить бронирование?")) return;
        state.reservations = state.reservations.filter(
          (x) => x.id !== entry.id,
        );
        state.waitlist = state.waitlist.filter((x) => x.id !== entry.id);
        save();
        closeBooking();
        render();
      });
      document.querySelector("#bookingClear").onclick = () => {
        snapshot();
        selectedTable = null;
        update();
      };
      document.querySelector("#bookingMinimize").onclick = () => {
        screen.classList.add("minimized");
        document.querySelector(".booking-header").onclick = () => {
          screen.classList.remove("minimized");
          document.querySelector(".booking-header").onclick = null;
        };
      };
      document.querySelectorAll("[data-booking-room]").forEach(
        (b) =>
          (b.onclick = () => {
            snapshot();
            bookingRoom = b.dataset.bookingRoom;
            selectedTable = null;
            update();
          }),
      );
      document.querySelector("#peopleMinus").onclick = () => {
        people = Math.max(1, people - 1);
        document.querySelector("#bookingPeople").textContent = people;
      };
      document.querySelector("#peoplePlus").onclick = () => {
        people = Math.min(999, people + 1);
        document.querySelector("#bookingPeople").textContent = people;
      };
      function adjustDuration(delta) {
        minutes = Math.min(1440, Math.max(15, minutes + delta));
        document.querySelector("#bookingDuration").textContent =
          `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
      }
      document.querySelector("#durationMinus").onclick = () =>
        adjustDuration(-15);
      document.querySelector("#durationPlus").onclick = () =>
        adjustDuration(15);
      function adjustTime(delta) {
        const input = document.querySelector("#bookingTime");
        let [h, m] = input.value.split(":").map(Number);
        let total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
        input.value = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
      document.querySelector("#timeMinus").onclick = () => adjustTime(-15);
      document.querySelector("#timePlus").onclick = () => adjustTime(15);
      document.querySelector("#bookingCreate").onclick = () => {
        const name = [
          document.querySelector("#bookingFirst").value.trim(),
          document.querySelector("#bookingLast").value.trim(),
        ]
          .filter(Boolean)
          .join(" ");
        if (!name) return alert("Укажите имя гостя");
        if (
          selectedTable !== null &&
          floor.blocked.includes(bookingRoom + ":" + selectedTable)
        )
          return alert("Выбранный стол заблокирован.");
        const isWait = document.querySelector("#bookingWait").checked;
        const record = {
          ...entry,
          createdAt: entry?.createdAt || new Date().toISOString(),
          id: entry?.id || crypto.randomUUID(),
          name,
          guests: people,
          date: document.querySelector("#bookingDate").value,
          time: document.querySelector("#bookingTime").value,
          table: selectedTable == null ? "" : String(selectedTable),
          room: bookingRoom,
          duration: minutes,
          phone: document.querySelector("#bookingPhone").value,
          email: document.querySelector("#bookingEmail").value,
          status: document.querySelector("#bookingStatus").value,
          walkIn: document.querySelector("#bookingWalk").checked,
          notify: document.querySelector("#bookingNotify").checked,
          notes: document.querySelector("#bookingNotes").value,
          tags: document.querySelector("#bookingTags").value,
          employee: document.querySelector("#bookingEmployee").value,
          preference: document.querySelector("#bookingPreference").value,
          source: document.querySelector("#bookingSource").value,
          teamChat: document.querySelector("#bookingChat").value,
          fields: Object.fromEntries(
            [...screen.querySelectorAll("[data-reservation-field]")].map(
              (el) => [
                el.dataset.reservationField,
                el.type === "checkbox" ? el.checked : el.value,
              ],
            ),
          ),
        };
        if (
          state.resetStartTime &&
          SEATED.includes(record.status) &&
          !SEATED.includes(entry?.status)
        ) {
          const current = new Date();
          record.time = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;
        }
        const error = validateReservation(
          { ...record, waitlist: isWait },
          state.reservations,
          storage.read("eatapp-ru-time-blocks-v1", []),
          floor.blocked,
        );
        if (error) return alert(error);
        const previous = {
          reservations: [...state.reservations],
          waitlist: [...state.waitlist],
        };
        if (entry) {
          state.reservations = state.reservations.filter(
            (x) => x.id !== entry.id,
          );
          state.waitlist = state.waitlist.filter((x) => x.id !== entry.id);
        }
        (isWait ? state.waitlist : state.reservations).push(record);
        if (!save()) {
          state.reservations = previous.reservations;
          state.waitlist = previous.waitlist;
          return;
        }
        closeBooking();
        render();
      };
    }
    const controlIds = [
      "bookingPhone",
      "bookingEmail",
      "bookingFirst",
      "bookingLast",
      "bookingDate",
      "bookingTime",
      "bookingWalk",
      "bookingWait",
      "bookingPreference",
      "bookingStatus",
      "bookingNotify",
      "bookingChat",
      "bookingTags",
      "bookingEmployee",
      "bookingSource",
      "bookingNotes",
    ];
    let draft = {
      bookingPhone: entry?.phone || "",
      bookingEmail: entry?.email || "",
      bookingFirst: entry?.name?.split(" ")[0] || "",
      bookingLast: entry?.name?.split(" ").slice(1).join(" ") || "",
      bookingPreference: entry?.preference || "Выберите предпочтение",
      bookingWalk: entry?.walkIn ?? defaults.walkIn ?? false,
      bookingStatus:
        entry?.status || (defaults.walkIn ? "За столом" : "Не подтверждено"),
      bookingNotes: entry?.notes || "",
      bookingTags: entry?.tags || "",
      bookingEmployee: entry?.employee || "",
      bookingSource: entry?.source || "В ресторане",
      bookingChat: entry?.teamChat || "",
      bookingNotify: entry?.notify ?? true,
    };
    let customDraft = entry?.fields || {};
    function snapshot() {
      controlIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) draft[id] = el.type === "checkbox" ? el.checked : el.value;
      });
      customDraft = Object.fromEntries(
        [...screen.querySelectorAll("[data-reservation-field]")].map((el) => [
          el.dataset.reservationField,
          el.type === "checkbox" ? el.checked : el.value,
        ]),
      );
    }
    const paint = update;
    update = function () {
      paint();
      const fields = (getFields("reservation") || []).filter(
        (f) => f.active !== false,
      );
      document.getElementById("bookingCustomFields").innerHTML = fields.length
        ? fields
            .map(
              (f) =>
                `<label>${esc(f.name || f.label || "Поле")}${f.type === "multiple" ? `<select data-reservation-field="${esc(f.id)}"><option value="">Выберите вариант</option>${(f.options || []).map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : `<input data-reservation-field="${esc(f.id)}" type="${f.type === "boolean" ? "checkbox" : f.type === "tickets" || f.type === "items" ? "number" : "text"}">`}</label>`,
            )
            .join("")
        : "<p>Дополнительные поля можно добавить в разделе «Гости → Пользовательские поля».</p>";
      controlIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el && draft[id] !== undefined) {
          if (el.type === "checkbox") el.checked = draft[id];
          else el.value = draft[id];
        }
      });
      screen.querySelectorAll("[data-reservation-field]").forEach((el) => {
        if (el.type === "checkbox")
          el.checked = !!customDraft[el.dataset.reservationField];
        else el.value = customDraft[el.dataset.reservationField] ?? "";
      });
    };
    update();
  }
  return openReservation;
}
