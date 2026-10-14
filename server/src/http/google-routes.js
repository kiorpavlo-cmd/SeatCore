import { json, readJson } from "./respond.js";
import { AppError } from "../domain/errors.js";

export async function routeGoogle(
  request,
  response,
  url,
  google,
  user,
  sessionToken,
) {
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Сначала войдите в Mio!");
  const action = url.pathname.slice("/api/v1/google/".length);
  const method = request.method;
  if (action === "callback" && method === "GET") {
    let result = "connected";
    try {
      await google.finish(
        Object.fromEntries(url.searchParams),
        user.id,
        sessionToken,
      );
    } catch (error) {
      if (!error.status) throw error;
      result = error.code === "GOOGLE_CONSENT_DENIED" ? "denied" : "failed";
    }
    response.writeHead(303, {
      location: `/?google=${result}#integrations/${encodeURIComponent("Сервисы")}`,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    response.end();
    return;
  }
  if (action === "status" && method === "GET")
    return json(response, 200, google.status(user.id));
  if (action === "connect" && method === "POST") {
    google.configured();
    const redirect = new URL(google.configurationStatus().redirectUri);
    if (redirect.host !== request.headers.host) {
      throw new AppError(
        400,
        "GOOGLE_CALLBACK_ORIGIN",
        `Откройте Mio! по адресу ${redirect.origin} для подключения Google`,
      );
    }
    return json(response, 200, google.begin(user.id, sessionToken));
  }
  if (action === "accounts" && method === "GET")
    return json(
      response,
      200,
      await google.accounts(user.id, url.searchParams.get("pageToken") || ""),
    );
  if (action === "locations" && method === "GET")
    return json(
      response,
      200,
      await google.locations(
        user.id,
        url.searchParams.get("account"),
        url.searchParams.get("pageToken") || "",
      ),
    );
  if (action === "select" && method === "POST") {
    const body = await readJson(request, 8192);
    return json(
      response,
      200,
      await google.select(user.id, body.account, body.location),
    );
  }
  if (action === "profile" && method === "GET")
    return json(response, 200, await google.profile(user.id));
  if (action === "reviews" && method === "GET")
    return json(
      response,
      200,
      await google.reviews(user.id, url.searchParams.get("pageToken") || ""),
    );
  if (action === "disconnect" && method === "POST")
    return json(response, 200, await google.disconnect(user.id));
  throw new AppError(404, "NOT_FOUND", "Google API-маршрут не найден");
}
