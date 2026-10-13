import { toast } from "../components/toast.js";
const loaders = {
  home: () => import("../pages/home.js"),
  "floor-import": () => import("../pages/floor-import.js"),
  orders: () => import("../pages/orders.js"),
  overview: () => import("../pages/overview.js"),
  account: () => import("../pages/account.js"),
  guests: () => import("../pages/guests.js"),
  permissions: () => import("../pages/permissions.js"),
  "custom-fields": () => import("../pages/custom-fields.js"),
  setup: () => import("../pages/setup.js"),
  operations: () => import("../pages/operations.js"),
};
const overview = [
  "Сетка",
  "Временная шкала",
  "Поток гостей",
  "Оборот столов",
  "Список",
];
export function createRouter(app, navigation) {
  let current = null,
    revision = 0;
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
    const token = ++revision;
    let path;
    try {
      path = decodeURIComponent(location.hash.slice(1)) || "home";
    } catch {
      path = "home";
    }
    const [section, ...rest] = path.split("/"),
      label = rest.join("/");
    let key,
      param = label;
    if (section === "home") key = "home";
    else if (section === "view" && label === "Импорт плана зала")
      key = "floor-import";
    else if (section === "view" && label === "Заказы") key = "orders";
    else if (section === "view" && overview.includes(label)) key = "overview";
    else if (
      section === "guests" &&
      ["Список гостей", "Теги"].includes(label)
    ) {
      key = "guests";
      param = label === "Теги" ? "tags" : "guests";
    } else if (section === "guests" && label === "Пользовательские поля")
      key = "custom-fields";
    else if (
      section === "account" &&
      ["Профиль ресторана", "Пользователи"].includes(label)
    ) {
      key = "account";
      param = label === "Пользователи" ? "users" : "profile";
    } else if (section === "account" && label === "Права доступа")
      key = "permissions";
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
          "#home-page,#routeFallback,#overview-view,#setup-page,#account-page,#permissions-page,#guest-root,#customField-root,#operations-page",
        )
        .forEach((x) => x.remove());
      document.querySelector(".content").style.display = "";
      document.querySelector(".topbar").style.display = "";
      navigation.select(section, label);
      document.querySelector("#home-link")?.classList.toggle("active", section === "home");
      if (page) {
        current = page;
        page.mount(param);
      } else app.render();
      document.title =
        (section === "home" ? "Главная" : label || (section === "setup" ? "Настройка" : "Поддержка")) +
        " — Eat App";
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
