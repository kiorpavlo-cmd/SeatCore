import { createApi } from "../../services/api.js";
import { escapeHTML as esc } from "../../lib/dom.js";
const request = (...args) =>
  createApi(globalThis.fetch, "/api", { timeoutMs: 30000 }).request(...args);
export const viberBusinessLabel = (status) =>
  !status.configured
    ? "Требуется настройка Infobip"
    : status.enabled
      ? "Уведомления включены"
      : "Уведомления выключены";
export const notificationLabels = {
  queued: "В очереди",
  sending: "Отправляется",
  accepted: "Принято Infobip — ожидаем доставку",
  delivered: "Доставлено гостю",
  failed: "Ошибка отправки",
  skipped: "Проверьте телефон",
  unknown: "Отправка не подтверждена",
  superseded: "Статус брони изменился",
  retried: "Назначен повтор",
};

export function mountViberConnection(root, { onStatus = () => {} } = {}) {
  let alive = true,
    status;
  root.innerHTML = `<p data-viber-status role="status">Проверяем настройки…</p><p class="viber-error" role="alert"></p><div data-viber-body></div>`;
  const body = root.querySelector("[data-viber-body]"),
    error = root.querySelector(".viber-error");
  function render() {
    root.querySelector("[data-viber-status]").textContent =
      viberBusinessLabel(status);
    body.innerHTML = `<p>Гость получает сообщение в Viber на телефон, указанный в брони.</p><ul><li>Подтверждение — после статуса «Подтверждено».</li><li>Отмена — после «Отменено» или «Отменено гостем».</li></ul><p>В форме брони должна быть включена галочка «Уведомлять гостя в Viber».</p>${!status.configured ? `<div class="viber-setup-note"><strong>Подготовлено подключение через Infobip</strong><p>Нужны аккаунт Infobip, одобренный отправитель Viber и два шаблона: подтверждение и отмена.</p><p>Инструкция для настройки: server/docs/VIBER.md.</p><a href="https://www.infobip.com/docs/viber/business-messages/message-templates/transactional" target="_blank" rel="noopener noreferrer">Настройка шаблонов в Infobip</a></div>` : `<p>Отправитель: <strong>${esc(status.sender)}</strong></p><p>Язык шаблонов: ${esc(status.language)}</p><div class="viber-actions"><button type="button" class="outline-green" data-viber-verify>Проверить подключение и шаблоны</button><button type="button" class="mio-service-button" data-viber-toggle>${status.enabled ? "Выключить уведомления" : "Включить уведомления"}</button></div>`}<div class="viber-template-preview"><h3>Подтверждение бронирования</h3><p>Здравствуйте, Анна!<br>Ваше бронирование в ресторане подтверждено.<br>Дата: 14.10.2026, время: 19:00. Гостей: 2.<br>До встречи!</p><h3>Отмена бронирования</h3><p>Здравствуйте, Анна!<br>Ваше бронирование на 14.10.2026 в 19:00 отменено.<br>Если это ошибка, свяжитесь с рестораном.</p><small>Примеры. Гость получает текст одобренного шаблона Infobip с данными своей брони.</small></div>`;
    body
      .querySelector("[data-viber-verify]")
      ?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        error.textContent = "";
        try {
          await request("/v1/viber-notifications/verify", {
            method: "POST",
            body: {},
          });
          if (alive)
            root.querySelector("[data-viber-status]").textContent =
              "Доступ проверен, оба шаблона одобрены";
        } catch (issue) {
          if (alive) error.textContent = issue.message;
        } finally {
          if (alive) button.disabled = false;
        }
      });
    body
      .querySelector("[data-viber-toggle]")
      ?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        error.textContent = "";
        try {
          const result = await request("/v1/viber-notifications/settings", {
            method: "POST",
            body: { enabled: !status.enabled },
          });
          if (alive) {
            status = result;
            onStatus(status);
            render();
          }
        } catch (issue) {
          if (alive) error.textContent = issue.message;
        } finally {
          if (alive && button.isConnected) button.disabled = false;
        }
      });
  }
  request("/v1/viber-notifications/status")
    .then((data) => {
      if (alive) {
        status = data;
        onStatus(status);
        render();
      }
    })
    .catch((issue) => {
      if (alive) error.textContent = issue.message;
    });
  return () => {
    alive = false;
  };
}

export function mountReservationViber(root, id) {
  let alive = true;
  root.innerHTML = `<h4>Уведомления Viber</h4><p class="viber-error" role="alert"></p><div data-viber-reservation-status>Загружаем…</div><button type="button" class="outline-green" data-viber-reload>Обновить</button>`;
  const error = root.querySelector(".viber-error"),
    body = root.querySelector("[data-viber-reservation-status]");
  async function load() {
    try {
      const data = await request(
        "/v1/viber-notifications/reservation?id=" + encodeURIComponent(id),
      );
      if (!alive || !root.isConnected) return;
      body.innerHTML = `<p>${!data.configured ? "Подключение Infobip ещё не настроено" : !data.enabled ? "Автоматические уведомления выключены" : data.phone ? "Телефон получателя: " + esc(data.phone) : "Введите телефон с кодом страны, например +370…"}</p>${data.notifications.map((row) => `<div class="viber-delivery"><strong>${row.kind === "accepted" ? "Подтверждение" : "Отмена"}</strong><span>${esc(notificationLabels[row.status] || row.status)}</span>${row.error ? `<small>${esc(row.error)}</small>` : ""}${["accepted", "unknown"].includes(row.status) ? `<button type="button" class="outline-green" data-viber-report="${esc(row.id)}">Проверить доставку</button>` : ""}${["failed", "skipped"].includes(row.status) ? `<button type="button" class="outline-green" data-viber-retry="${esc(row.id)}">Повторить после исправления</button>` : ""}</div>`).join("") || "<p>Уведомлений по этой брони пока нет.</p>"}`;
    } catch (issue) {
      if (alive && root.isConnected) {
        body.textContent = "";
        error.textContent = issue.message;
      }
    }
  }
  root.querySelector("[data-viber-reload]").onclick = () => {
    error.textContent = "";
    load();
  };
  root.addEventListener("click", async (event) => {
    const button = event.target.closest(
      "[data-viber-report],[data-viber-retry]",
    );
    if (!button) return;
    button.disabled = true;
    error.textContent = "";
    try {
      await request(
        "/v1/viber-notifications/" +
          (button.dataset.viberReport ? "refresh" : "retry"),
        {
          method: "POST",
          body: { id: button.dataset.viberReport || button.dataset.viberRetry },
        },
      );
      await load();
    } catch (issue) {
      if (alive && root.isConnected) error.textContent = issue.message;
    } finally {
      if (alive && button.isConnected) button.disabled = false;
    }
  });
  load();
  return () => {
    alive = false;
  };
}
