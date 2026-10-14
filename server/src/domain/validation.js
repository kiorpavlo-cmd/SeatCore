import { validateReservation } from "../../contracts/reservations.js";
import { COLLECTIONS } from "../../contracts/storage.js";
import { invalid } from "./errors.js";
import { ROLES, PERMISSION_IDS } from "../../contracts/permissions.js";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
function list(value, label) {
  if (!Array.isArray(value) || value.length > 50000)
    invalid("Неверный список: " + label);
}
function records(value, label) {
  list(value, label);
  const ids = new Set();
  for (const row of value) {
    if (
      !object(row) ||
      !["string", "number"].includes(typeof row.id) ||
      !String(row.id).trim() ||
      String(row.id).length > 128
    )
      invalid("Не указан идентификатор: " + label);
    const id = String(row.id);
    if (ids.has(id)) invalid("Повторяющийся идентификатор: " + label);
    ids.add(id);
  }
}
function dictionary(value, label) {
  if (!object(value)) invalid("Неверный объект: " + label);
  if (
    Object.keys(value).some((key) =>
      ["__proto__", "constructor", "prototype"].includes(key),
    )
  )
    invalid("Недопустимый ключ: " + label);
}
export function validateState(state, previous, changed) {
  for (const name of changed)
    if (!COLLECTIONS.includes(name)) invalid("Неизвестная коллекция: " + name);
  dictionary(state.app, "Бронирования");
  dictionary(state.app.rooms, "Залы");
  for (const name of Object.values(state.app.rooms))
    if (typeof name !== "string" || !name.trim())
      invalid("Укажите название зала");
  records(state.app.reservations, "Бронирования");
  records(state.app.waitlist, "Лист ожидания");
  records(state.app.servers, "Официанты");
  for (const server of state.app.servers)
    if (typeof server.name !== "string" || !server.name.trim())
      invalid("Укажите имя официанта");
  list(state.blocked, "Заблокированные столы");
  if (state.blocked.some((x) => typeof x !== "string"))
    invalid("Неверная блокировка стола");
  list(state.blocks, "Ограничения");
  for (const block of state.blocks) {
    if (
      !object(block) ||
      typeof block.start !== "string" ||
      typeof block.end !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(block.start) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(block.end) ||
      Number.isNaN(Date.parse(block.start)) ||
      Number.isNaN(Date.parse(block.end)) ||
      block.start >= block.end
    )
      invalid("Неверные даты ограничения");
    if (
      !Array.isArray(block.days) ||
      block.days.some((x) => !Number.isInteger(x) || x < 0 || x > 6)
    )
      invalid("Неверные дни повторения");
    if (!Array.isArray(block.sources) || !Array.isArray(block.tables))
      invalid("Неверные источники или столы ограничения");
    if (
      block.repeat === "Повторять" &&
      block.start.slice(11) >= block.end.slice(11)
    )
      invalid("Повторяющееся ограничение должно завершаться в тот же день");
  }
  dictionary(state.floor, "План залов");
  for (const [room, tables] of Object.entries(state.floor)) {
    list(tables, "Столы " + room);
    for (const row of tables)
      if (
        !Array.isArray(row) ||
        row[0] == null ||
        !String(row[0]).trim() ||
        !Number.isFinite(row[1]) ||
        !Number.isFinite(row[2]) ||
        row[1] < 0 ||
        row[2] < 0 ||
        (row[3] && !["side", "long", "wide", "round"].includes(row[3]))
      )
        invalid("Неверный стол в зале " + room);
  }
  for (const [bucket, isWait] of [
    ["reservations", false],
    ["waitlist", true],
  ])
    for (const record of state.app[bucket]) {
      if (
        typeof record.name !== "string" ||
        (record.email != null && typeof record.email !== "string")
      )
        invalid("Неверные данные гостя");
      const normalized = {
        ...record,
        duration: record.duration ?? 90,
        guests: Number(record.guests),
        room: record.room || "main",
        waitlist: isWait,
      };
      const prior = previous.app[bucket].find(
        (row) => String(row.id) === String(record.id),
      );
      const edited = !prior || JSON.stringify(prior) !== JSON.stringify(record);
      const error = validateReservation(
        normalized,
        state.app.reservations.map((row) => ({
          ...row,
          duration: row.duration ?? 90,
        })),
        edited ? state.blocks : [],
        edited ? state.blocked : [],
      );
      if (error) invalid(error, { id: record.id });
    }
  dictionary(state.guests, "Гости");
  for (const key of ["guests", "tags", "categories"])
    records(state.guests[key], key);
  for (const guest of state.guests.guests)
    if (typeof guest.first !== "string" || !guest.first.trim())
      invalid("Укажите имя гостя");
  list(state.fields, "Пользовательские поля");
  const variables = new Set();
  for (const field of state.fields) {
    if (
      !object(field) ||
      !["guest", "reservation"].includes(field.scope) ||
      typeof field.label !== "string" ||
      !field.label.trim() ||
      typeof field.variable !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.variable) ||
      !["text", "boolean", "tickets", "items", "multiple"].includes(field.type)
    )
      invalid("Неверное пользовательское поле");
    const key = field.scope + ":" + field.variable.toLowerCase();
    if (variables.has(key)) invalid("Повторяющаяся переменная поля");
    variables.add(key);
    if (
      field.type === "multiple" &&
      (!Array.isArray(field.options) ||
        field.options.length < 2 ||
        field.options.some((x) => typeof x !== "string") ||
        new Set(field.options.map((x) => x.toLowerCase())).size !==
          field.options.length)
    )
      invalid("Неверные варианты пользовательского поля");
  }
  dictionary(state.account, "Аккаунт");
  dictionary(state.account.profile, "Профиль");
  records(state.account.users, "Пользователи");
  const emails = new Set();
  for (const user of state.account.users) {
    if (
      typeof user.email !== "string" ||
      user.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
    )
      invalid("Неверная электронная почта пользователя");
    const email = user.email.toLowerCase();
    if (emails.has(email)) invalid("Почта пользователя уже используется");
    emails.add(email);
    if (user.pin && !/^\d{4}$/.test(user.pin))
      invalid("PIN должен содержать 4 цифры");
  }
  dictionary(state.permissions, "Настройки прав");
  if (changed.includes("permissions"))
    for (const [key, value] of Object.entries(state.permissions)) {
      if (
        !PERMISSION_IDS.includes(key) ||
        !object(value) ||
        !Array.isArray(value.roles) ||
        value.roles.length !== ROLES.length ||
        value.roles.some((flag) => typeof flag !== "boolean") ||
        !Array.isArray(value.overrides) ||
        value.overrides.some(
          (row) =>
            !object(row) ||
            typeof row.email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) ||
            !["allow", "deny"].includes(row.value),
        )
      )
        invalid("Неверные настройки разрешения: " + key);
    }
  dictionary(state.notes, "Заметки");
  for (const note of Object.values(state.notes))
    if (typeof note !== "string") invalid("Заметка должна содержать текст");
  dictionary(state.resources, "Справочники");
  for (const [name, rows] of Object.entries(state.resources)) {
    if (name === "audit") continue;
    records(rows, name);
    for (const row of rows) {
      if (
        name === "shifts" &&
        (typeof row.start !== "string" ||
          typeof row.end !== "string" ||
          row.start >= row.end)
      )
        invalid("Неверное время смены");
      if (
        name === "reviews" &&
        (!Number.isInteger(row.rating) || row.rating < 1 || row.rating > 5)
      )
        invalid("Оценка должна быть от 1 до 5");
      if (name === "seating" && Number(row.max) < Number(row.min))
        invalid("Неверные границы рассадки");
      if (
        name === "discounts" &&
        (Number(row.percent) < 0 || Number(row.percent) > 100)
      )
        invalid("Скидка должна быть от 0 до 100%");
    }
  }
  dictionary(state.backgrounds, "Фоны");
  for (const value of Object.values(state.backgrounds))
    if (
      typeof value !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ||
      value.length > 3 * 1024 * 1024
    )
      invalid("Неверное фоновое изображение");
}
