import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { json, readJson } from "../http/respond.js";

const BASE = "https://chatapi.viber.com/pa";

function token() {
  return process.env.VIBER_BOT_TOKEN?.trim() || "";
}

async function callViber(endpoint, payload) {
  if (!token()) {
    throw new AppError(
      503, "VIBER_NOT_CONFIGURED", "Viber Bot Token не настроен"
    );
  }

  const response = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Viber-Auth-Token": token(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.status !== 0) {
    throw new AppError(
      502, "VIBER_API_ERROR",
      `Viber API: ${data?.status_message || response.status}`
    );
  }

  return data;
}

export async function routeViber(request, response, url) {
  if (url.pathname === "/api/v1/viber/status" &&
      request.method === "GET") {
    if (!token()) {
      json(response, 200, { configured: false, connected: false });
      return;
    }

    try {
      const data = await callViber("get_account_info", {});
      json(response, 200, {
        configured: true,
        connected: true,
        name: data.name || "Viber",
        webhook: data.webhook || "",
      });
    } catch {
      json(response, 200, { configured: true, connected: false });
    }
    return;
  }

  if (url.pathname === "/api/v1/viber/connect" &&
      request.method === "POST") {
    const body = await readJson(request);
    let address;

    try {
      address = new URL(body.url);
    } catch {
      throw new AppError(400, "INVALID_URL", "Некорректный адрес");
    }

    if (
      address.protocol !== "https:" ||
      !address.hostname.includes(".") ||
      address.username ||
      address.password ||
      address.search ||
      address.hash ||
      address.pathname !== "/api/v1/viber/webhook"
    ) {
      throw new AppError(
        400, "INVALID_URL",
        "Укажите публичный HTTPS-адрес webhook"
      );
    }

    await callViber("set_webhook", {
      url: address.href,
      event_types: [
        "message", "subscribed", "unsubscribed",
        "delivered", "failed"
      ],
      send_name: false,
      send_photo: false,
    });

    json(response, 200, {
      connected: true,
      webhook: address.href,
    });
    return;
  }

  throw new AppError(404, "NOT_FOUND", "Viber API-маршрут не найден");
}

export async function handleViberWebhook(request, response) {
  if (!token()) {
    throw new AppError(503, "VIBER_DISABLED", "Viber не настроен");
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 65536) {
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Слишком большой запрос");
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);

  const signature =
    request.headers["x-viber-content-signature"] || "";

  const expected = createHmac("sha256", token())
    .update(body)
    .digest();

  const actual = /^[0-9a-f]{64}$/i.test(signature)
    ? Buffer.from(signature, "hex")
    : Buffer.alloc(0);

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new AppError(
      403, "INVALID_SIGNATURE", "Недействительная подпись Viber"
    );
  }

  let event;

  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_JSON", "Некорректный JSON");
  }

  if (!event || typeof event.event !== "string") {
    throw new AppError(400, "INVALID_EVENT", "Некорректное событие");
  }

  // Events are authenticated but not yet persisted.
  json(response, 200, { status: "ok" });
}
