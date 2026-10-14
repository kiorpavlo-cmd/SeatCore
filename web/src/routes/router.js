import { toast } from "../components/toast.js";
import { storage, STORAGE_KEYS } from "../services/storage.js";
import { can, routePermission } from "../services/access.js";
const removedSections = new Set([
  "Телефон",
  "Универсальный виджет",
  "QR-коды универсального виджета",
  "Отслеживание источников",
  "Ссылки на чат WhatsApp",
  "Сегменты гостей",
  "Скидки за предоплату",
  "Программа лояльности",
  "Ваучеры",
  "События и пакеты",
  "Заказы",
  "Предоплата",
  "Отчёты по платежам",
  "Заказы POS",
  "Отчёты по ваучерам",
  "Импорт плана зала",
  "Консьержи",
  "Банковская карта",
  "Сводка платежей",
  "Дополнительные услуги",
  "Покупка принтера чеков",
  "Маркетплейс",
  "Оплата за столом (Spades)",
  "Настройки принтера",
  "Поток гостей",
  "Временная шкала",
  "Оборот столов",
]);

const loaders = {
  home: () => import("../pages/home.js"),
  overview: () => import("../pages/overview.js"),
  account: () => import("../pages/account.js"),
  guests: () => import("../pages/guests.js"),
  permissions: () => import("../pages/permissions.js"),
  "custom-fields": () => import("../pages/custom-fields.js"),
  setup: () => import("../pages/setup.js"),
  operations: () => import("../pages/operations.js"),
  services: () => import("../pages/services.js"),
  widget: () => import("../pages/widget.js"),
  "google-reviews": () => import("../pages/google-reviews.js"),
};
const overview = ["Сетка", "Список"];
export function createRouter(app, navigation) {
  let current = null,
    revision = 0;
  let acceptedHash = location.hash || "#home";
  const cache = new Map();
  async function load(key) {
    if (!cache.has(key))
      cache.set(
        key,
        loaders[key]().then((m) => m.createPage(app)),
      );
    return cache.get(key);
  }
  async function route() {
    const requestedHash = location.hash || "#home";

    if (current && requestedHash !== acceptedHash) {
      const event = new Event("mio:before-route-change", {
        cancelable: true,
      });

      if (!document.dispatchEvent(event)) {
        window.history.replaceState(
          window.history.state,
          "",
          location.pathname + location.search + acceptedHash,
        );
        return;
      }
    }
    // Require a completed restaurant profile throughout MIO!
    const requiredRestaurantFields = [
      "name",
      "phone",
      "email",
      "timezone",
      "notificationEmails",
      "notificationPhones",
      "confirmation",
      "terms",
    ];

    const accountData = storage.read(STORAGE_KEYS.account, {});
    const profile = accountData?.profile || {};

    const missingRestaurantFields = requiredRestaurantFields.filter(
      (key) => !String(profile[key] ?? "").trim(),
    );

    const profilePath = "account/Профиль ресторана";
    let requestedPath = "";

    try {
      requestedPath = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      requestedPath = "";
    }

    if (
      missingRestaurantFields.length > 0 &&
      can("admin") &&
      requestedPath !== profilePath
    ) {
      const targetHash = "#" + encodeURI(profilePath);

      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + targetHash,
      );

      return route();
    }

    const token = ++revision;
    let path;
    try {
      path = decodeURIComponent(location.hash.slice(1)) || "home";
    } catch {
      path = "home";
    }
    const [section, ...rest] = path.split("/"),
      label = rest.join("/");
    const requiredPermission = routePermission(section, label);
    if (requiredPermission && !can(requiredPermission)) {
      toast("Недостаточно прав для открытия этого раздела");
      location.hash = "#home";
      return;
    }
    let key,
      param = label;

    if (removedSections.has(label)) {
      location.hash = "#home";
      return;
    }
    if (section === "home") key = "home";
    else if (section === "view" && overview.includes(label)) key = "overview";
    else if (
      section === "guests" &&
      ["Список гостей", "Теги"].includes(label)
    ) {
      key = "guests";
      param = label === "Теги" ? "tags" : "guests";
    } else if (section === "guests" && label === "Онлайн-отзывы")
      key = "google-reviews";
    else if (section === "guests" && label === "Пользовательские поля")
      key = "custom-fields";
    else if (
      section === "account" &&
      ["Профиль ресторана", "Пользователи"].includes(label)
    ) {
      key = "account";
      param = label === "Пользователи" ? "users" : "profile";
    } else if (section === "account" && label === "Права доступа")
      key = "permissions";
    else if (section === "integrations" && label === "Сервисы")
      key = "services";
    else if (section === "integrations" && label === "Виджет бронирования")
      key = "widget";
    else if (section === "setup") key = "setup";
    else if (!(section === "view" && label === "План зала")) {
      key = "operations";
      param = { section, label };
    }
    try {
      const page = key ? await load(key) : null;
      if (token !== revision) return;
      current?.unmount?.();
      current = null;
      app.hidePop();
      app.closeModal();
      document
        .querySelectorAll(
          "#home-page,#routeFallback,#overview-view,#setup-page,#account-page,#permissions-page,#guest-root,#customField-root,#operations-page,#services-page,#widget-page,#google-reviews-page",
        )
        .forEach((x) => x.remove());
      document.querySelector(".content").style.display = "";
      document.querySelector(".topbar").style.display = "";
      navigation.select(section, key === "widget" ? "Сервисы" : label);
      if (page) {
        current = page;
        page.mount(param);
      } else app.render();
      acceptedHash = requestedHash;
      document.title =
        (section === "home"
          ? "Главная"
          : label || (section === "setup" ? "Настройка" : "Поддержка")) +
        " — Mio!";
    } catch (error) {
      toast("Не удалось открыть страницу. Повторите попытку");
      console.error(error);
    }
  }
  return {
    reload() {
      return route();
    },
    start() {
      window.addEventListener("hashchange", route);
      route();
    },
    navigate(path) {
      const hash = "#" + encodeURI(path);
      if (location.hash === hash) route();
      else location.hash = hash;
    },
    refresh() {
      current?.refresh?.();
    },
  };
}
