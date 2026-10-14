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
    clear ? "Max-Age=0" : "Max-Age=604800",
  ];

  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function reject() {
  throw new AppError(
    401,
    "UNAUTHORIZED",
    "Неверные данные для входа или отсутствует сессия",
  );
}

export async function routeAuth(request, response, url, auth, secure) {
  const path = url.pathname;
  const method = request.method;

  response.setHeader("Cache-Control", "no-store");

  if (path === "/api/auth/verify-pin" && method === "POST") {
    const token = cookieToken(request),
      user = auth.getSession(token);
    if (!user) reject();
    const body = await readJson(request, 8192);
    auth.verifyEmployeePin(user, token, body.pin);
    json(response, 200, { verified: true });
    return;
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readJson(request);

    const email = body?.email;
    const password = body?.password;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    )
      reject();

    const user = auth.verifyCredentials(email, password);
    if (!user) reject();

    const existing = cookieToken(request);
    if (existing) auth.revokeSession(existing);

    const session = auth.createSession(user.id);

    response.setHeader("Set-Cookie", sessionCookie(session.token, secure));

    json(response, 200, {
      authenticated: true,
      user,
    });
    return;
  }

  if (path === "/api/auth/me" && method === "GET") {
    const user = auth.getSession(cookieToken(request));
    if (!user) reject();

    json(response, 200, {
      authenticated: true,
      user,
    });
    return;
  }

  if (path === "/api/auth/forgot-password" && method === "POST") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MIO_MAIL_FROM;
    const publicUrl = process.env.MIO_PUBLIC_URL;

    if (!apiKey || !from || !publicUrl) {
      throw new AppError(
        503,
        "MAIL_NOT_CONFIGURED",
        "Восстановление пароля пока недоступно",
      );
    }

    let base;
    try {
      base = new URL(publicUrl);
    } catch {
      throw new AppError(503, "MAIL_CONFIG_ERROR", "Ошибка настройки почты");
    }

    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(base.hostname)
        ))
    ) {
      throw new AppError(503, "MAIL_CONFIG_ERROR", "Ошибка настройки адреса");
    }

    const body = await readJson(request);
    if (typeof body?.email !== "string" || body.email.length > 254) {
      throw new AppError(400, "INVALID_EMAIL", "Некорректный email");
    }

    const reset = auth.requestPasswordReset(body.email);

    if (reset) {
      const link = new URL("/", base.origin);
      link.searchParams.set("reset_token", reset.token);

      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [reset.email],
          subject: "Mio! — восстановление пароля",
          text:
            "Для установки нового пароля откройте ссылку:\\n" +
            link.href +
            "\\n\\nСсылка действует 30 минут. " +
            "Если вы не запрашивали сброс, игнорируйте письмо.",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!mail.ok) {
        throw new AppError(
          503,
          "MAIL_DELIVERY_FAILED",
          "Не удалось отправить письмо. Попробуйте позже",
        );
      }
    }

    json(response, 200, {
      message: "Если аккаунт существует, письмо будет отправлено",
    });
    return;
  }

  if (path === "/api/auth/reset-password" && method === "POST") {
    const body = await readJson(request);

    if (typeof body?.token !== "string" || typeof body?.password !== "string") {
      throw new AppError(400, "INVALID_RESET", "Неверные данные");
    }

    let success;
    try {
      success = auth.resetPassword(body.token, body.password);
    } catch {
      throw new AppError(
        400,
        "INVALID_PASSWORD",
        "Пароль должен содержать минимум 12 символов",
      );
    }

    if (!success) {
      throw new AppError(
        400,
        "INVALID_RESET",
        "Ссылка недействительна или срок действия истёк",
      );
    }

    response.setHeader(
      "Set-Cookie",
      "mio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" +
        (secure ? "; Secure" : ""),
    );

    json(response, 200, {
      message: "Пароль успешно изменён",
    });
    return;
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = cookieToken(request);
    if (token) auth.revokeSession(token);

    response.setHeader("Set-Cookie", sessionCookie("", secure, true));

    json(response, 200, { authenticated: false });
    return;
  }

  throw new AppError(404, "NOT_FOUND", "Маршрут не найден");
}
