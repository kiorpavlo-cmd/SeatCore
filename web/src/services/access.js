import { storage } from "./storage.js";
export function currentUser() {
  if (import.meta.env?.VITE_DEMO_MODE === "true")
    return { role: "owner", permissions: {} };
  return storage.persistence.access || null;
}
export function can(permission) {
  const user = currentUser();
  return user?.role === "owner" || user?.permissions?.[permission] === true;
}
export function routePermission(section, label) {
  if (section === "account") {
    if (label === "Права доступа") return "manage_permissions";
    if (label === "Пользователи") return "restaurant_users";
    if (label === "Журнал действий") return "advanced_reports";
    return "admin";
  }
  if (section === "setup") return "admin";
  if (section === "reports")
    return label.includes("гост") || label.includes("Лояльность")
      ? "manage_crm"
      : "advanced_reports";
  if (section === "integrations")
    return label.includes("Navi") || label.includes("чат-бот")
      ? "navi"
      : "admin";
  if (section === "marketing") return "crm_messages";
  if (section === "messaging")
    return label === "Библиотека сообщений"
      ? "message_templates"
      : "crm_messages";
  if (section === "guests") {
    if (label.includes("Импорт")) return "import";
    if (label === "Очистка базы данных") return "merge_guests";
    if (label === "Теги") return "tags";
    if (label === "Пользовательские поля") return "admin";
    if (label.includes("отзыв") || label.includes("репутац"))
      return "manage_crm";
    return "manage_guests";
  }
  if (section === "availability") {
    if (label === "Блокировка часов") return "closing_period";
    if (["Смены", "Варианты рассадки", "Объединение столов"].includes(label))
      return "shifts";
  }
  return null;
}
