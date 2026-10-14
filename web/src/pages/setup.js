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

  const servicesKey = "mio.setup.services.completed";
  const servicesDone = () => read(servicesKey, false) === true;

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
    [
      "Интеграция с сервисами",
      "Подключите необходимые сервисы",
      "integrations/Сервисы",
      servicesDone,
      true,
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
    const done = tasks.filter((task) => task[3]()).length;

    const rows = tasks.map(([name, description, route, check, manual]) => {
      const completed = check();
      const mark = `<span class="setup-check ${completed ? "done" : ""}">${completed ? "✓" : ""}</span>`;
      const detail = `<div><strong>${esc(name)}</strong><small>${esc(description)}</small></div>`;

      if (manual) {
        return `
          <div class="setup-task setup-task--service">
            <button type="button"
                    class="setup-service-toggle"
                    data-toggle-services
                    aria-pressed="${completed}"
                    aria-label="${completed ? "Снять отметку" : "Отметить выполненным"}">
              ${mark}
            </button>
            <button type="button"
                    class="setup-service-link"
                    data-setup-route="${esc(route)}">
              ${detail}<span>›</span>
            </button>
          </div>`;
      }

      return `<button class="setup-task" data-setup-route="${esc(route)}">${mark}${detail}<span>›</span></button>`;
    }).join("");

    $("#setup-page").innerHTML = `
      <header class="page-titlebar">ПЕРВОНАЧАЛЬНАЯ НАСТРОЙКА</header>
      <div class="operations-scroll">
        <h1>Настроим всё необходимое!</h1>
        <p>${done} из ${tasks.length} шагов выполнено</p>
        <progress max="${tasks.length}" value="${done}"></progress>
        <div class="setup-tasks">${rows}</div>
      </div>`;

    $("#setup-page")
      .querySelectorAll("[data-setup-route]")
      .forEach((button) => {
        button.onclick = () => app.navigate(button.dataset.setupRoute);
      });

    $("#setup-page")
      .querySelector("[data-toggle-services]")
      ?.addEventListener("click", () => {
        storage.write(servicesKey, !servicesDone());
        render();
      });
  }

  return {
    mount,
    unmount() {
      $("#setup-page")?.remove();
    },
  };
}
