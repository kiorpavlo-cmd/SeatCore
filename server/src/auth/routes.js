import { json, readJson } from "../http/respond.js";
import { AppError } from "../domain/errors.js";

const COOKIE = "mio_session";

function cookieToken(request) {
  const header = request.headers.cookie || "";
  const values = header.split(";");

  for (const entry of values) {
    const [key, ...value] = entry.trim().split("=");
    if (key === COOKIE) return value.join("=");
  }

  return null;
}

function sessionCookie(token, secure, clear = false) {
  const attributes = [
    `${COOKIE}=${clear ? "" : token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    clear ? "Max-Age=0" : "Max-Age=604800"
  ];

  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function reject() {
  throw new AppError(
    401,
    "UNAUTHORIZED",
    "Неверные данные для входа или отсутствует сессия"
  );
}

export async function routeAuth(request, response, url, auth, secure) {
  const path = url.pathname;
  const method = request.method;

  response.setHeader("Cache-Control", "no-store");

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readJson(request);

    const email = body?.email;
    const password = body?.password;

    if (typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 1024) reject();

    const user = auth.verifyCredentials(email, password);
    if (!user) reject();

    const existing = cookieToken(request);
    if (existing) auth.revokeSession(existing);

    const session = auth.createSession(user.id);

    response.setHeader(
      "Set-Cookie",
      sessionCookie(session.token, secure)
    );

    json(response, 200, {
      authenticated: true,
      user
    });
    return;
  }

  if (path === "/api/auth/me" && method === "GET") {
    const user = auth.getSession(cookieToken(request));
    if (!user) reject();

    json(response, 200, {
      authenticated: true,
      user
    });
    return;
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = cookieToken(request);
    if (token) auth.revokeSession(token);

    response.setHeader(
      "Set-Cookie",
      sessionCookie("", secure, true)
    );

    json(response, 200, { authenticated: false });
    return;
  }

  throw new AppError(404, "NOT_FOUND", "Маршрут не найден");
}
