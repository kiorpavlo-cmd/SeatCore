import { $ } from "../lib/dom.js";
import { createApi } from "../services/api.js";
import {
  googleStatusLabel,
  mountGoogleConnection,
} from "../features/google/panel.js";

import {
  viberBusinessLabel,
  mountViberConnection,
} from "../features/viber/notifications.js";

const items = [
  {
    id: "google",
    name: "Google",
    description:
      "Синхронизация с Google Картами, отзывами и профилем вашего заведения.",
  },
  {
    id: "viber",
    name: "Viber",
    description:
      "Уведомления о подтверждении и отмене брони по номеру телефона.",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Приём сообщений и бронирований через Telegram.",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Обработка Direct-сообщений и комментариев.",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Приём сообщений и бронирований через Facebook.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Приём сообщений и бронирований через WhatsApp.",
  },
  {
    id: "sms",
    name: "SMS",
    description: "Автоматические уведомления для гостей по SMS.",
  },
  {
    id: "email",
    name: "Email",
    description: "Email-рассылки и уведомления для гостей.",
  },
  {
    id: "widget",
    name: "Виджет бронирования",
    description: "Онлайн-бронирование столиков на вашем сайте.",
  },
  {
    id: "qr",
    name: "QR-код",
    description: "QR-код для быстрого бронирования и меню.",
  },
];

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function logoMarkup(id) {
  const brands = new Set([
    "google",
    "viber",
    "telegram",
    "instagram",
    "facebook",
    "whatsapp",
  ]);

  if (brands.has(id)) {
    return `<img
      src="/service-logos/${id}.svg"
      alt=""
      width="56"
      height="56"
      draggable="false"
    >`;
  }

  const icons = {
    sms: `<svg viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path d="M24 8C14.6 8 7 14.7 7 23
        C7 27.4 9.1 31.3 12.5 34.1
        L11 41L18.5 37.4
        C20.3 37.8 22.1 38 24 38
        C33.4 38 41 31.3 41 23
        C41 14.7 33.4 8 24 8Z"
        fill="white"/>
      <circle cx="17" cy="23" r="2" fill="#16C766"/>
      <circle cx="24" cy="23" r="2" fill="#16C766"/>
      <circle cx="31" cy="23" r="2" fill="#16C766"/>
    </svg>`,

    email: `<svg viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="12" width="34" height="25" rx="3"
        stroke="white" stroke-width="3"/>
      <path d="M9 15L24 27L39 15"
        stroke="white" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

    widget: `<svg viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="10" width="34" height="32" rx="4"
        stroke="white" stroke-width="3"/>
      <path d="M15 6V15M33 6V15M7 19H41"
        stroke="white" stroke-width="3"
        stroke-linecap="round"/>
      <path d="M15 26H18M24 26H27M33 26H36
        M15 33H18M24 33H27M33 33H36"
        stroke="white" stroke-width="3"
        stroke-linecap="round"/>
    </svg>`,

    qr: `<svg viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <g stroke="white" stroke-width="3">
        <rect x="6" y="6" width="13" height="13"/>
        <rect x="29" y="6" width="13" height="13"/>
        <rect x="6" y="29" width="13" height="13"/>
      </g>
      <g fill="white">
        <rect x="11" y="11" width="3" height="3"/>
        <rect x="34" y="11" width="3" height="3"/>
        <rect x="11" y="34" width="3" height="3"/>
        <rect x="25" y="25" width="5" height="5"/>
        <rect x="34" y="25" width="8" height="4"/>
        <rect x="25" y="34" width="4" height="8"/>
        <rect x="34" y="34" width="4" height="4"/>
        <rect x="39" y="39" width="3" height="3"/>
        <rect x="34" y="40" width="3" height="2"/>
      </g>
    </svg>`,
  };

  return icons[id] || "";
}

function serviceCard(item) {
  return `
    <article class="mio-service-card" data-service-card="${item.id}">
      <div class="mio-service-logo mio-service-logo--${item.id}" aria-hidden="true">
        ${logoMarkup(item.id)}
      </div>
      <div class="mio-service-information">
        <h2>${escapeHTML(item.name)}</h2>
        <p>${escapeHTML(item.description)}</p>
        <div class="mio-service-status">
          <span class="mio-service-dot"></span>
          Не подключено
        </div>
      </div>
      <div class="mio-service-action">
        <button class="mio-service-button"
                type="button"
                data-service="${item.id}">
          Подключить
        </button>
        <button class="mio-service-arrow"
                type="button"
                data-service="${item.id}"
                aria-label="Подробнее: ${escapeHTML(item.name)}">
          ›
        </button>
      </div>
    </article>`;
}

export function createPage(app) {
  let dialog = null;
  let cleanupGoogle = null;
  let cleanupViber = null;
  let returnFocus = null;
  const root = () => $("#services-page");

  function closeDialog() {
    cleanupViber?.();
    cleanupViber = null;
    cleanupGoogle?.();
    cleanupGoogle = null;
    dialog?.remove();
    dialog = null;
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  function updateGoogleStatus(status) {
    const card = root()?.querySelector('[data-service-card="google"]');
    if (!card) return;
    card.querySelector(".mio-service-status").lastChild.textContent =
      googleStatusLabel(status);
    card.classList.toggle(
      "google-connected",
      status.connected && status.configured,
    );
    card.querySelector(".mio-service-button").textContent = status.connected
      ? "Настроить"
      : "Подключить";
  }

  function updateViberStatus(status) {
    const card = root()?.querySelector('[data-service-card="viber"]');
    if (!card) return;
    card.querySelector(".mio-service-status").lastChild.textContent =
      viberBusinessLabel(status);
    card.classList.toggle("viber-enabled", status.configured && status.enabled);
    card.querySelector(".mio-service-button").textContent = "Настроить";
  }

  function openService(id) {
    if (id === "widget") {
      app.navigate("integrations/Виджет бронирования");
      return;
    }
    const item = items.find((service) => service.id === id);
    if (!item) return;

    closeDialog();
    returnFocus = document.activeElement;

    dialog = document.createElement("div");
    dialog.className = "mio-service-overlay";
    dialog.innerHTML = `
      <section class="mio-service-dialog"
               role="dialog"
               aria-modal="true"
               aria-labelledby="mio-service-dialog-title">
        <div class="mio-service-dialog-top">
          <h2 id="mio-service-dialog-title">${escapeHTML(item.name)}</h2>
          <button type="button"
                  class="mio-service-close"
                  aria-label="Закрыть">×</button>
        </div>
        <p>${escapeHTML(item.description)}</p>
        <div class="mio-service-notice">
          ${
            id === "google"
              ? "<div data-google-panel></div>"
              : id === "viber"
                ? "<div data-viber-panel></div>"
                : `Подключение этого сервиса пока не реализовано.`
          }
          ${["google", "viber"].includes(id) ? "" : "Для работы потребуется настройка соответствующего API."}
        </div>
        <div class="mio-service-dialog-bottom">
          <button type="button" class="mio-service-done">Закрыть</button>
        </div>
      </section>`;

    document.body.append(dialog);
    if (id === "google") {
      dialog.classList.add("mio-google-overlay");
      cleanupGoogle = mountGoogleConnection(
        dialog.querySelector("[data-google-panel]"),
        { onStatus: updateGoogleStatus },
      );
    }

    if (id === "viber") {
      dialog.classList.add("mio-viber-overlay");
      cleanupViber = mountViberConnection(
        dialog.querySelector("[data-viber-panel]"),
        { onStatus: updateViberStatus },
      );
    }

    dialog.querySelector(".mio-service-close").onclick = closeDialog;
    dialog.querySelector(".mio-service-done").onclick = closeDialog;
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog.querySelector(".mio-service-close").focus();
  }

  function mount() {
    $(".content").style.display = "none";
    $(".topbar").style.display = "none";

    const node = document.createElement("section");
    node.id = "services-page";
    node.innerHTML = `
      <header class="page-titlebar">Сервисы</header>
      <main class="mio-services-scroll">
        <h1>Сервисы</h1>
        <div class="mio-services-grid">
          ${items.map(serviceCard).join("")}
        </div>
      </main>`;

    $(".workspace").append(node);

    node.addEventListener("click", (event) => {
      const button = event.target.closest("[data-service]");
      if (button) openService(button.dataset.service);
    });
    createApi()
      .request("/v1/google/status")
      .then(updateGoogleStatus)
      .catch(() => {
        const status = root()?.querySelector(
          '[data-service-card="google"] .mio-service-status',
        );
        if (status) status.lastChild.textContent = "Не удалось проверить";
      });
    createApi()
      .request("/v1/viber-notifications/status")
      .then(updateViberStatus)
      .catch(() => {
        const status = root()?.querySelector(
          '[data-service-card="viber"] .mio-service-status',
        );
        if (status) status.lastChild.textContent = "Не удалось проверить";
      });
    const params = new window.URLSearchParams(location.search);
    const googleResult = params.get("google");
    if (googleResult) {
      params.delete("google");
      window.history.replaceState(
        null,
        "",
        location.pathname + (params.size ? "?" + params : "") + location.hash,
      );
      openService("google");
      const message = dialog.querySelector(".google-error");
      if (googleResult !== "connected")
        message.textContent =
          googleResult === "denied"
            ? "Доступ к Google не предоставлен. Можно повторить подключение."
            : "Не удалось подключить Google. Проверьте настройки сервера и повторите вход.";
    }

    document.addEventListener("keydown", onKeydown);
  }

  function onKeydown(event) {
    if (event.key === "Escape") closeDialog();
    if (event.key === "Tab" && dialog) {
      const elements = [
        ...dialog.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
        ),
      ].filter((element) => element.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  function unmount() {
    document.removeEventListener("keydown", onKeydown);
    closeDialog();
    root()?.remove();
  }

  return { mount, unmount };
}
