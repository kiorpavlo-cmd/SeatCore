import { $, escapeHTML as esc } from "../lib/dom.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
export function createPage(app) {
  const read = (key, fallback) => storage.read(key, fallback);

  const nonempty = (value) =>
    typeof value === "string" && value.trim().length > 0;

  const hasRecords = (value) =>
    Array.isArray(value) && value.length > 0;

  const hasTables = (value) => {
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some((room) =>
      Array.isArray(room) && room.length > 0
    );
  };

  const tasks = [
    [
      "Профиль ресторана",
      "Укажите название и контакты",
      "account/Профиль ресторана",
      () => {
        const p = read(STORAGE_KEYS.account, {}).profile || {};
        return [
          "name",
          "phone",
          "email",
          "timezone",
          "notificationEmails",
          "notificationPhones",
        ].every((key) => nonempty(p[key]));
      },
    ],
    [
      "План зала",
      "Добавьте столы",
      "view/План зала",
      () => hasTables(read(STORAGE_KEYS.floor, {})),
    ],
    [
      "Пользователи",
      "Добавьте сотрудников",
      "account/Пользователи",
      () => hasRecords(read(STORAGE_KEYS.account, {}).users),
    ],
    [
      "Смены",
      "Настройте время обслуживания",
      "availability/Смены",
      () => hasRecords(read(STORAGE_KEYS.resources, {}).shifts),
    ],
    [
      "Гости",
      "Добавьте или импортируйте гостей",
      "guests/Список гостей",
      () => hasRecords(read(STORAGE_KEYS.guests, {}).guests),
    ],
    [
      "Шаблоны сообщений",
      "Подготовьте тексты для гостей",
      "messaging/Библиотека сообщений",
      () => hasRecords(read(STORAGE_KEYS.resources, {}).templates),
    ],
    [
      "Пользовательские поля",
      "Настройте дополнительные сведения",
      "guests/Пользовательские поля",
      () => hasRecords(read(STORAGE_KEYS.fields, [])),
    ],
  ];

  function mount() {
    $(".content").style.display = "none";
    $(".topbar").style.display = "none";
    const el = document.createElement("section");
    el.id = "setup-page";
    $(".workspace").append(el);
    render();
  }
  function render() {
    const done = tasks.filter((x) => x[3]()).length;
    $("#setup-page").innerHTML =
      `<header class="page-titlebar">ПЕРВОНАЧАЛЬНАЯ НАСТРОЙКА</header><div class="operations-scroll"><h1>Настроим всё необходимое!</h1><p>${done} из ${tasks.length} шагов выполнено</p><progress max="${tasks.length}" value="${done}"></progress><div class="setup-tasks">${tasks.map(([name, description, route, check]) => `<button class="setup-task" data-setup-route="${esc(route)}"><span class="setup-check ${check() ? "done" : ""}">${check() ? "✓" : ""}</span><div><strong>${name}</strong><small>${description}</small></div><span>›</span></button>`).join("")}</div></div>`;
    $("#setup-page")
      .querySelectorAll("[data-setup-route]")
      .forEach((b) => (b.onclick = () => app.navigate(b.dataset.setupRoute)));
  }
  return {
    mount,
    unmount() {
      $("#setup-page")?.remove();
    },
  };
}
