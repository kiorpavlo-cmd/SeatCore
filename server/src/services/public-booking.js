import { AppError } from "../domain/errors.js";
import { json, readJson } from "../http/respond.js";
import { widgetTimesAndChoices } from "./public-booking-domain.js";

const limits = new Map();
let nextSweep = 0;

function allowRequest(key, maximum, period) {
  const now = Date.now();
  if (now >= nextSweep) {
    for (const [name, value] of limits)
      if (value.until <= now) limits.delete(name);
    nextSweep = now + 60_000;
  }
  const current = limits.get(key);
  if (!current || current.until <= now) {
    limits.set(key, { count: 1, until: now + period });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

function rateLimit(request, route) {
  const ip = request.socket.remoteAddress || "unknown";
  const isBooking = route === "bookings";
  if (
    !allowRequest(
      `${route}:${ip}`,
      isBooking ? 12 : 90,
      isBooking ? 10 * 60_000 : 60_000,
    )
  )
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Слишком много запросов. Попробуйте позже",
    );
}

export async function routePublicBooking(request, response, url, state) {
  const match =
    /^\/api\/public\/widgets\/([^/]+)(?:\/(availability|bookings))?$/.exec(
      url.pathname,
    );
  if (!match) throw new AppError(404, "NOT_FOUND", "Маршрут не найден");
  const [, encodedId, endpoint] = match;
  let widgetId;
  try {
    widgetId = decodeURIComponent(encodedId);
  } catch {
    throw new AppError(404, "WIDGET_NOT_FOUND", "Виджет не найден");
  }
  if (!widgetId || widgetId.length > 128)
    throw new AppError(404, "WIDGET_NOT_FOUND", "Виджет не найден");
  const method = request.method;
  if (!endpoint && method === "GET") {
    rateLimit(request, "config");
    json(response, 200, { widget: state.publicWidget(widgetId) });
    return;
  }
  if (endpoint === "availability" && method === "GET") {
    rateLimit(request, "availability");
    const widget = state.publicWidget(widgetId);
    json(
      response,
      200,
      widgetTimesAndChoices(state.publicWidgetData(), widget, url.searchParams),
    );
    return;
  }
  if (endpoint === "bookings" && method === "POST") {
    rateLimit(request, "bookings");
    const body = await readJson(request, 32 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new AppError(400, "INVALID_REQUEST", "Неверный запрос");
    if (typeof body.website === "string" && body.website.trim()) {
      json(response, 201, { accepted: true });
      return;
    }
    json(response, 201, state.createPublicBooking(widgetId, body));
    return;
  }
  if (!["GET", "POST"].includes(method))
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается");
  throw new AppError(404, "NOT_FOUND", "Маршрут не найден");
}
