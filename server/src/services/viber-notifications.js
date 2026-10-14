import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { json, readJson } from "../http/respond.js";

const CANCELLED = new Set(["Отменено", "Отменено гостем"]);
export const VIBER_TEMPLATE_FIELDS = {
  accepted: ["name", "restaurant", "date", "time", "guests"],
  cancelled: ["name", "restaurant", "date", "time", "phone"],
};
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
export function normalizeViberPhone(value) {
  if (typeof value !== "string" || /[^\d+().\s-]/.test(value)) return null;
  let phone = value.trim().replace(/[().\s-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}
export function viberNotificationTransition(previous, next) {
  if (!next || next.walkIn || next.notify === false) return null;
  if (next.status === "Подтверждено" && previous?.status !== "Подтверждено")
    return "accepted";
  if (CANCELLED.has(next.status) && !CANCELLED.has(previous?.status))
    return "cancelled";
  return null;
}
function providerStatus(status) {
  if (status?.groupId === 3 && status.id === 5) return "delivered";
  if ([2, 4, 5].includes(status?.groupId)) return "failed";
  if ([1, 3].includes(status?.groupId)) return "accepted";
  return "unknown";
}

export class ViberNotifications {
  constructor(store, options = {}) {
    this.store = store;
    this.db = store.db;
    this.fetch = options.fetcher || globalThis.fetch;
    this.now = options.now || Date.now;
    this.baseUrl = (
      options.baseUrl ??
      process.env.INFOBIP_BASE_URL ??
      ""
    ).replace(/\/$/, "");
    this.apiKey = options.apiKey ?? process.env.INFOBIP_API_KEY ?? "";
    this.sender = options.sender ?? process.env.VIBER_INFOBIP_SENDER ?? "";
    this.templates = {
      accepted:
        options.acceptedTemplate ??
        process.env.VIBER_INFOBIP_ACCEPTED_TEMPLATE ??
        "",
      cancelled:
        options.cancelledTemplate ??
        process.env.VIBER_INFOBIP_CANCELLED_TEMPLATE ??
        "",
    };
    this.language =
      options.language ?? process.env.VIBER_INFOBIP_LANGUAGE ?? "ru";
    this.key = createHash("sha256")
      .update(this.baseUrl + ":" + this.sender)
      .digest("hex");
    this.running = false;
    this.timer = null;
    this.flight = null;
    this.db
      .prepare(
        "INSERT OR IGNORE INTO viber_business_settings(config_key) VALUES(?)",
      )
      .run(this.key);
    this.db
      .prepare(
        "UPDATE viber_business_notifications SET status='unknown',error='Отправка прервана перезапуском. Обновите статус перед повтором' WHERE config_key=? AND status='sending'",
      )
      .run(this.key);
  }
  configurationStatus() {
    const missing = [];
    try {
      const url = new URL(this.baseUrl);
      if (
        url.protocol !== "https:" ||
        !/^(?:[a-z0-9-]+\.)?api\.infobip\.com$/i.test(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        missing.push("INFOBIP_BASE_URL");
    } catch {
      missing.push("INFOBIP_BASE_URL");
    }
    if (!this.apiKey.trim()) missing.push("INFOBIP_API_KEY");
    if (!this.sender.trim() || this.sender.length > 100)
      missing.push("VIBER_INFOBIP_SENDER");
    if (!this.templates.accepted)
      missing.push("VIBER_INFOBIP_ACCEPTED_TEMPLATE");
    if (!this.templates.cancelled)
      missing.push("VIBER_INFOBIP_CANCELLED_TEMPLATE");
    if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(this.language))
      missing.push("VIBER_INFOBIP_LANGUAGE");
    return { configured: !missing.length, missing };
  }
  settings() {
    return this.db
      .prepare("SELECT * FROM viber_business_settings WHERE config_key=?")
      .get(this.key);
  }
  status() {
    return {
      ...this.configurationStatus(),
      provider: "Infobip",
      channel: "Viber Business Messages",
      enabled: Boolean(this.settings().enabled),
      sender: this.sender,
      language: this.language,
      acceptedTemplate: this.templates.accepted,
      cancelledTemplate: this.templates.cancelled,
    };
  }
  configured() {
    if (!this.configurationStatus().configured)
      fail(
        503,
        "VIBER_BUSINESS_NOT_CONFIGURED",
        "Настройте Viber Business Messages через Infobip на сервере",
      );
  }
  async request(path, { method = "GET", body } = {}) {
    this.configured();
    let response;
    try {
      response = await this.fetch(this.baseUrl + path, {
        method,
        redirect: "error",
        headers: {
          Authorization: "App " + this.apiKey,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      fail(502, "INFOBIP_UNAVAILABLE", "Не удалось получить ответ Infobip");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new AppError(
        response.status === 401 || response.status === 403 ? 403 : 502,
        "INFOBIP_REJECTED",
        response.status === 401 || response.status === 403
          ? "Infobip отклонил доступ. Проверьте API-ключ и его права"
          : "Infobip отклонил запрос. Проверьте отправителя и шаблон",
      );
      error.confirmedRejection = [400, 401, 403, 404, 422].includes(
        response.status,
      );
      throw error;
    }
    if (!data)
      fail(
        502,
        "INFOBIP_INVALID_RESPONSE",
        "Infobip вернул некорректный ответ",
      );
    return data;
  }
  async verifyTemplates() {
    this.configured();
    for (const [kind, id] of Object.entries(this.templates)) {
      const data = await this.request(
        `/viber/1/senders/${encodeURIComponent(this.sender)}/templates/${encodeURIComponent(id)}`,
      );
      if (data.status !== "APPROVED")
        fail(
          400,
          "VIBER_TEMPLATE_NOT_APPROVED",
          `Шаблон ${kind === "accepted" ? "подтверждения" : "отмены"} ещё не одобрен Viber`,
        );
      const body = data.body?.find((row) => row.language === this.language);
      const names = new Set((data.params || []).map((row) => row.name));
      if (
        !body ||
        names.size !== VIBER_TEMPLATE_FIELDS[kind].length ||
        VIBER_TEMPLATE_FIELDS[kind].some((key) => !names.has(key))
      )
        fail(
          400,
          "VIBER_TEMPLATE_FIELDS",
          `Язык или параметры шаблона ${kind === "accepted" ? "подтверждения" : "отмены"} не соответствуют настройкам Mio!`,
        );
    }
    return { verified: true };
  }
  async setEnabled(enabled) {
    if (typeof enabled !== "boolean")
      fail(400, "INVALID_SETTINGS", "Укажите состояние уведомлений");
    if (enabled) await this.verifyTemplates();
    this.db
      .prepare(
        "UPDATE viber_business_settings SET enabled=? WHERE config_key=?",
      )
      .run(Number(enabled), this.key);
    return this.status();
  }
  enqueue(current, next, { revision, migration }) {
    if (migration || !this.settings().enabled) return;
    const before = new Map(
      current.app.reservations.map((row) => [String(row.id), row]),
    );
    for (const booking of next.app.reservations) {
      const kind = viberNotificationTransition(
        before.get(String(booking.id)),
        booking,
      );
      if (!kind) continue;
      this.db
        .prepare(
          "UPDATE viber_business_notifications SET status='superseded',error='Статус брони изменился до отправки' WHERE config_key=? AND reservation_id=? AND status IN ('queued','skipped','failed')",
        )
        .run(this.key, String(booking.id));
      this.db
        .prepare(
          "INSERT INTO viber_business_notifications(id,config_key,reservation_id,kind,revision,status,created_at) VALUES(?,?,?,?,?,'queued',?)",
        )
        .run(
          randomUUID(),
          this.key,
          String(booking.id),
          kind,
          revision,
          this.now(),
        );
    }
  }
  currentBooking(id) {
    return this.store
      .read()
      .app.reservations.find((row) => String(row.id) === String(id));
  }
  isCurrent(row, booking) {
    return (
      booking &&
      booking.notify !== false &&
      !booking.walkIn &&
      (row.kind === "accepted"
        ? booking.status === "Подтверждено"
        : CANCELLED.has(booking.status))
    );
  }
  parameters(kind, booking) {
    const profile = this.store.read().account.profile;
    const values = {
      name: booking.name,
      restaurant: profile.name || "ресторан",
      date: booking.date.split("-").reverse().join("."),
      time: booking.time,
      guests: String(booking.guests),
      phone: profile.phone || "",
    };
    return Object.fromEntries(
      VIBER_TEMPLATE_FIELDS[kind].map((key) => [
        key,
        String(values[key] ?? ""),
      ]),
    );
  }
  payload(row, booking, phone) {
    return {
      messages: [
        {
          sender: this.sender,
          destinations: [{ to: phone.slice(1), messageId: row.id }],
          content: {
            type: "TEMPLATE",
            templateId: this.templates[row.kind],
            language: this.language,
            parameters: this.parameters(row.kind, booking),
          },
        },
      ],
    };
  }
  async processQueue() {
    if (
      this.flight ||
      !this.settings().enabled ||
      !this.configurationStatus().configured
    )
      return;
    this.flight = this.drain();
    try {
      await this.flight;
    } finally {
      this.flight = null;
    }
  }
  async drain() {
    const rows = this.db
      .prepare(
        "SELECT * FROM viber_business_notifications WHERE config_key=? AND status='queued' ORDER BY created_at LIMIT 50",
      )
      .all(this.key);
    for (const row of rows) {
      if (!this.settings().enabled) return;
      const booking = this.currentBooking(row.reservation_id);
      if (!this.isCurrent(row, booking)) {
        this.db
          .prepare(
            "UPDATE viber_business_notifications SET status='superseded',error='Уведомление больше не актуально' WHERE id=?",
          )
          .run(row.id);
        continue;
      }
      const phone = normalizeViberPhone(booking.phone);
      if (!phone) {
        this.db
          .prepare(
            "UPDATE viber_business_notifications SET status='skipped',error='Укажите телефон с кодом страны, например +370…' WHERE id=?",
          )
          .run(row.id);
        continue;
      }
      const claimed = this.db
        .prepare(
          "UPDATE viber_business_notifications SET status='sending',phone=?,error='',attempted_at=? WHERE id=? AND status='queued'",
        )
        .run(phone, this.now(), row.id);
      if (!claimed.changes) continue;
      try {
        const data = await this.request("/viber/2/messages", {
          method: "POST",
          body: this.payload(row, booking, phone),
        });
        const result = data.messages?.find(
          (message) => message.messageId === row.id,
        );
        if (
          !result ||
          (result.destination && result.destination !== phone.slice(1))
        )
          fail(
            502,
            "INFOBIP_INVALID_RESPONSE",
            "Не удалось подтвердить отправку уведомления",
          );
        const status = providerStatus(result.status);
        this.db
          .prepare(
            "UPDATE viber_business_notifications SET status=?,provider_id=?,error=? WHERE id=?",
          )
          .run(
            status,
            row.id,
            status === "failed"
              ? "Infobip: " + String(result.status?.name || "REJECTED")
              : status === "unknown"
                ? "Статус отправки не подтверждён"
                : "",
            row.id,
          );
      } catch (error) {
        this.db
          .prepare(
            "UPDATE viber_business_notifications SET status=?,error=? WHERE id=?",
          )
          .run(
            error.confirmedRejection ? "failed" : "unknown",
            error.confirmedRejection
              ? error.message
              : "Ответ об отправке не получен. Обновите статус; автоматического повтора не будет",
            row.id,
          );
      }
    }
  }
  reservationStatus(id) {
    const booking = this.currentBooking(id);
    if (!booking) fail(404, "NOT_FOUND", "Бронирование не найдено");
    return {
      enabled: Boolean(this.settings().enabled),
      configured: this.configurationStatus().configured,
      phone: normalizeViberPhone(booking.phone),
      notifications: this.db
        .prepare(
          "SELECT id,kind,status,phone,error,created_at FROM viber_business_notifications WHERE config_key=? AND reservation_id=? ORDER BY created_at DESC LIMIT 10",
        )
        .all(this.key, String(id)),
    };
  }
  async refreshReport(id) {
    if (typeof id !== "string" || !id || id.length > 128)
      fail(400, "INVALID_ID", "Укажите уведомление");
    const row = this.db
      .prepare(
        "SELECT * FROM viber_business_notifications WHERE config_key=? AND id=?",
      )
      .get(this.key, id);
    if (!row) fail(404, "NOT_FOUND", "Уведомление не найдено");
    if (!["accepted", "unknown"].includes(row.status))
      return { status: row.status };
    const data = await this.request(
      "/viber/2/logs?" + new URLSearchParams({ messageId: id, limit: "10" }),
    );
    if (!Array.isArray(data.results))
      fail(
        502,
        "INFOBIP_INVALID_RESPONSE",
        "Не удалось прочитать журнал доставки",
      );
    const result = data.results.find(
      (record) =>
        record.messageId === id &&
        (!(record.to || record.destination) ||
          (record.to || record.destination) === row.phone.slice(1)),
    );
    if (result) {
      const status = providerStatus(result.status);
      this.db
        .prepare(
          "UPDATE viber_business_notifications SET status=?,provider_id=?,error=? WHERE id=?",
        )
        .run(
          status,
          id,
          status === "failed"
            ? "Infobip: " + String(result.status?.name || "NOT_DELIVERED")
            : "",
          id,
        );
    }
    return { status: result ? providerStatus(result.status) : row.status };
  }
  retry(id) {
    if (typeof id !== "string" || !id || id.length > 128)
      fail(400, "INVALID_ID", "Укажите уведомление");
    const row = this.db
      .prepare(
        "SELECT * FROM viber_business_notifications WHERE config_key=? AND id=?",
      )
      .get(this.key, id);
    if (!row) fail(404, "NOT_FOUND", "Уведомление не найдено");
    if (!["failed", "skipped"].includes(row.status))
      fail(
        409,
        "VIBER_RETRY_UNSAFE",
        "Повтор разрешён только после подтверждённой ошибки или исправления телефона",
      );
    if (!this.isCurrent(row, this.currentBooking(row.reservation_id)))
      fail(
        409,
        "VIBER_OUTDATED",
        "Статус брони изменился. Уведомление больше не актуально",
      );
    if (!normalizeViberPhone(this.currentBooking(row.reservation_id)?.phone))
      fail(
        400,
        "VIBER_INVALID_PHONE",
        "Сначала исправьте и сохраните телефон гостя",
      );
    // Keep the retry receipt and its replacement queue row atomic.
    return this.store.transaction(() => {
      const changed = this.db
        .prepare(
          "UPDATE viber_business_notifications SET status='retried' WHERE id=? AND status IN ('failed','skipped')",
        )
        .run(id);
      if (!changed.changes)
        fail(409, "VIBER_RETRY_UNSAFE", "Для уведомления уже назначен повтор");
      const nextId = randomUUID();
      this.db
        .prepare(
          "INSERT INTO viber_business_notifications(id,config_key,reservation_id,kind,revision,status,created_at) VALUES(?,?,?,?,?,'queued',?)",
        )
        .run(
          nextId,
          this.key,
          row.reservation_id,
          row.kind,
          row.revision,
          this.now(),
        );
      return { queued: true, id: nextId };
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      try {
        await this.processQueue();
      } catch {}
      if (this.running) this.timer = setTimeout(tick, 3000);
    };
    tick();
  }
  async stop() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.flight) await this.flight;
  }
}
export async function routeViberNotifications(request, response, url, service) {
  const action = url.pathname.slice("/api/v1/viber-notifications/".length),
    method = request.method;
  if (action === "status" && method === "GET")
    return json(response, 200, service.status());
  if (action === "verify" && method === "POST") {
    await readJson(request, 8192);
    return json(response, 200, await service.verifyTemplates());
  }
  if (action === "settings" && method === "POST")
    return json(
      response,
      200,
      await service.setEnabled((await readJson(request, 8192))?.enabled),
    );
  if (action === "reservation" && method === "GET")
    return json(
      response,
      200,
      service.reservationStatus(url.searchParams.get("id")),
    );
  if (action === "refresh" && method === "POST")
    return json(
      response,
      200,
      await service.refreshReport((await readJson(request, 8192))?.id),
    );
  if (action === "retry" && method === "POST")
    return json(
      response,
      200,
      service.retry((await readJson(request, 8192))?.id),
    );
  fail(404, "NOT_FOUND", "Маршрут уведомлений Viber не найден");
}
