import { mountReservationViber } from "../viber/notifications.js";
import { escapeHTML as esc } from "../../lib/dom.js";
import { storage } from "../../services/storage.js";
import { closeModal } from "../../components/modal.js";
import { SEATED } from "../../services/reservation-queries.js";
import {
  validateReservation,
  reservationTables,
} from "../../services/reservations.js";
import { can, currentUser } from "../../services/access.js";
import { createApi } from "../../services/api.js";
import { toast } from "../../components/toast.js";
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
    if (!id && (!can("manage_reservations") || !currentUser()?.taker)) {
      toast("Недостаточно прав для создания бронирования");
      return;
    }
    closeBooking();
    closeModal();
    const entry = (wait ? state.waitlist : state.reservations).find(
      (r) => r.id === id,
    );
    let selectedTables = reservationTables(
      entry || {
        tables: defaults.tables,
        table: defaults.table ?? state.selectedTable,
      },
    );
    bookingRoom = entry?.room || defaults.room || state.room;
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
    async function confirmPin() {
      if (!currentUser()?.requirePin) return true;
      try {
        await createApi().request("/auth/verify-pin", {
          method: "POST",
          body: { pin: screen.querySelector("#bookingPin").value },
        });
        screen.querySelector("#bookingPin").value = "";
        return true;
      } catch (error) {
        toast(error.message);
        return false;
      }
    }
    function tableChips() {
      if (!selectedTables.length) return "Не выбран";

      return selectedTables
        .map(
          (table, index) =>
            `<button type="button" class="booking-table-chip"
          data-remove-table="${index}"
          title="Удалить стол ${esc(table)}">
          ${esc(table)} <span aria-hidden="true">×</span>
        </button>`,
        )
        .join("");
    }

    function update() {
      screen.innerHTML = `<div class="booking-header">${entry ? "Изменить бронирование" : "Новое бронирование"}
    <button id="bookingClose">×</button></div>
   <div class="booking-content">
   <div class="booking-form"><div class="booking-form-scroll">
   <div class="booking-fields">
    <div class="booking-label"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg> Гость</div>
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
    <div class="booking-row"><span class="row-name"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg> Дата</span>
      <input class="row-value" type="date" id="bookingDate" value="${visitDate}"></div>
    <div class="booking-row"><span class="row-name"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/></svg> Время</span>
      <input class="row-value" type="time" id="bookingTime" value="${clock}" style="border:0;min-width:0">
      <button class="booking-step" id="timeMinus">−</button><button class="booking-step" id="timePlus">＋</button></div>
    <div class="booking-row"><span class="row-name">Предпочтения</span>
      <select class="row-value" id="bookingPreference" style="border:0"><option>Выберите предпочтение</option><option>Основной зал</option><option>Летняя терраса</option></select></div>
    <div class="booking-row"><span class="row-name"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg> Гости</span>
      <strong class="row-value" id="bookingPeople">${people}</strong>
      <button class="booking-step" id="peopleMinus">−</button><button class="booking-step" id="peoplePlus">＋</button></div>
    <div class="booking-row"><span class="row-name"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2h4M12 14l3-3M12 8v4"/><circle cx="12" cy="14" r="8"/></svg> Длительность</span>
      <strong class="row-value" id="bookingDuration">${Math.floor(minutes / 60)} ч ${minutes % 60} мин</strong>
      <button class="booking-step" id="durationMinus">−</button><button class="booking-step" id="durationPlus">＋</button></div>
    <div class="booking-row"><span class="row-name"><svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Стол</span><span class="row-value" id="bookingTableText">${selectedTables.length ? selectedTables.join(", ") : "Не выбран"}</span></div>
    <div class="booking-row"><label class="row-name" for="bookingStatus">Статус</label><select class="row-value" id="bookingStatus">${["Не подтверждено", "Подтверждено гостем", "Подтверждено", "Нет ответа", "Гость опаздывает", "Оставлено сообщение", "Опоздание", "Неверный номер", "Прибыл", "Частично прибыл", "Частично посажены", "За столом", "Закуска", "Основное блюдо", "Десерт", "Счёт выдан", "Уборка требуется", "Уборка выполняется", "Отказано", "Не пришёл", "Отменено", "Отменено гостем", "Завершено"].map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
    <div class="booking-row"><label for="bookingNotify">Уведомлять гостя в Viber</label><input id="bookingNotify" type="checkbox" checked></div>
    ${entry ? "<div data-booking-viber></div>" : '<p class="booking-viber-note">Уведомление Viber отправляется на телефон гостя после подтверждения или отмены брони.</p>'}
    <details class="booking-detail"><summary>Чат команды <span>Личные сообщения</span></summary><textarea id="bookingChat" placeholder="Сообщение команде"></textarea></details>
    <details class="booking-detail"><summary>Теги <span>Выберите теги</span></summary><input id="bookingTags" placeholder="Теги через запятую"></details>
    <div class="booking-row"><label class="row-name" for="bookingEmployee">Сотрудник</label><select id="bookingEmployee" class="row-value"><option value="">Кто принял бронь</option>${state.servers.map((x) => `<option>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="booking-row"><label class="row-name" for="bookingSource">Источник</label><select id="bookingSource" class="row-value">${["В ресторане", "Телефон", "Сайт", "Instagram", "Facebook", "WhatsApp", "Другое"].map((x) => `<option>${x}</option>`).join("")}</select></div>
    <details class="booking-detail"><summary>Поля <span>Дополнительные сведения</span></summary><div id="bookingCustomFields"></div></details>
    <details class="booking-detail"><summary>Заметки <span>Особые пожелания</span></summary><textarea id="bookingNotes" placeholder="Заметки к бронированию"></textarea></details>
    ${currentUser()?.requirePin ? '<label class="booking-row">PIN сотрудника <input id="bookingPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN сотрудника"></label>' : ""}
   </div><div class="booking-footer">${entry ? '<button class="danger" id="deleteBooking">Удалить бронирование</button>' : ""}<button class="green" id="bookingCreate">${entry ? "Сохранить бронирование" : "Создать бронирование"}</button></div></div>
   <div class="booking-plan-area"><div class="booking-plan-header">
     <svg class="booking-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Стол <div class="booking-selected" id="bookingSelected">${tableChips()}</div>
   </div><div class="booking-room-header">
${Object.keys(editingPositions)
  .map(
    (key) =>
      `<button data-booking-room="${esc(key)}" class="${bookingRoom === key ? "active" : ""}">${esc(state.rooms[key] || key)}</button>`,
  )
  .join("")}
     
   </div><div class="booking-map"><div id="bookingMap" class="booking-map-inner"></div></div></div></div>`;
      document.querySelector("#bookingMap").innerHTML = mapMarkup(bookingRoom);
      document
        .querySelectorAll("#bookingMap [data-table-index]")
        .forEach((el) => {
          const idx = +el.dataset.tableIndex;
          el.classList.toggle(
            "chosen",
            selectedTables.includes(
              String(editingPositions[bookingRoom][idx][0]),
            ),
          );
          el.onclick = () => {
            snapshot();
            const table = String(editingPositions[bookingRoom][idx][0]);

            selectedTables = selectedTables.includes(table)
              ? selectedTables.filter((value) => value !== table)
              : [...selectedTables, table];

            update();
          };
        });
      document.querySelector("#bookingClose").onclick = closeBooking;
      screen
        .querySelector("#deleteBooking")
        ?.addEventListener("click", async () => {
          if (!confirm("Удалить бронирование?")) return;
          if (!(await confirmPin())) return;
          state.reservations = state.reservations.filter(
            (x) => x.id !== entry.id,
          );
          state.waitlist = state.waitlist.filter((x) => x.id !== entry.id);
          save();
          closeBooking();
          render();
        });
      screen.querySelectorAll("[data-remove-table]").forEach((button) => {
        button.onclick = () => {
          snapshot();
          selectedTables.splice(Number(button.dataset.removeTable), 1);
          update();
        };
      });
      document.querySelectorAll("[data-booking-room]").forEach(
        (b) =>
          (b.onclick = () => {
            snapshot();
            bookingRoom = b.dataset.bookingRoom;
            selectedTables = [];
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
      document.querySelector("#bookingCreate").onclick = async () => {
        const name = [
          document.querySelector("#bookingFirst").value.trim(),
          document.querySelector("#bookingLast").value.trim(),
        ]
          .filter(Boolean)
          .join(" ");
        if (!name) return alert("Укажите имя гостя");
        if (
          selectedTables.some((table) =>
            floor.blocked.includes(bookingRoom + ":" + table),
          )
        )
          return alert("Выбранный стол заблокирован.");
        const isWait = document.querySelector("#bookingWait").checked;
        let record = {
          ...entry,
          createdAt: entry?.createdAt || new Date().toISOString(),
          id: entry?.id || crypto.randomUUID(),
          name,
          guests: people,
          date: document.querySelector("#bookingDate").value,
          time: document.querySelector("#bookingTime").value,
          table: selectedTables[0] || "",
          tables: [...selectedTables],
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
          currentUser()?.taker !== false &&
          SEATED.includes(record.status) &&
          !SEATED.includes(entry?.status)
        ) {
          const current = new Date();
          record.time = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;
        }
        if (entry && currentUser()?.taker === false)
          record = { ...entry, status: record.status };
        const error = validateReservation(
          { ...record, waitlist: isWait },
          state.reservations,
          storage.read("mio-ru-time-blocks-v1", []),
          floor.blocked,
        );
        if (error) return alert(error);
        if (!(await confirmPin())) return;
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
      const user = currentUser(),
        editable =
          can("manage_reservations") &&
          (user?.taker || (user?.server && entry));
      screen.querySelector("#bookingCreate").disabled = !editable;
      const deletion = screen.querySelector("#deleteBooking");
      if (deletion)
        deletion.disabled =
          !can("manage_reservations") ||
          !user?.taker ||
          (user?.role !== "owner" &&
            user?.permissions.disable_reservation_deletion);
      if (!user?.taker) {
        screen
          .querySelectorAll(
            "input,select,textarea,.booking-step,[data-table-index],[data-remove-table],[data-booking-room]",
          )
          .forEach((el) => {
            if (el.id !== "bookingPin" && el.id !== "bookingStatus")
              el.disabled = true;
          });
        const status = screen.querySelector("#bookingStatus");
        status.disabled = !editable;
        for (const option of status.options)
          option.disabled = ![
            "Прибыл",
            "Частично прибыл",
            "Частично посажены",
            "За столом",
            "Закуска",
            "Основное блюдо",
            "Десерт",
            "Счёт выдан",
            "Уборка требуется",
            "Уборка выполняется",
            "Завершено",
          ].includes(option.value);
      }
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
      if (entry)
        mountReservationViber(
          screen.querySelector("[data-booking-viber]"),
          entry.id,
        );
    };
    update();
  }
  return openReservation;
}
