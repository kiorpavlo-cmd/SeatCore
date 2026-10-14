import { createServer } from "node:http";
import { handleViberWebhook } from "./services/viber.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseStore } from "./database/store.js";
import { StateService } from "./services/state.js";
import { routeApi } from "./http/routes.js";
import { serveStatic } from "./http/static.js";
import { json } from "./http/respond.js";
import { AppError } from "./domain/errors.js";
import { AuthService } from "./auth/service.js";
import { AccessService } from "./auth/access.js";
import { routeAuth } from "./auth/routes.js";
import { GoogleService } from "./services/google.js";
import { routeGoogle } from "./http/google-routes.js";
import {
  ViberNotifications,
  routeViberNotifications,
} from "./services/viber-notifications.js";
export function createApp({
  database = ":memory:",
  seed,
  staticDirectory,
  publicHost = "",
  accessPassword = "",
  googleOptions,
  viberNotificationOptions,
}) {
  const store = new DatabaseStore(database, seed);
  const viberNotifications = new ViberNotifications(
    store,
    viberNotificationOptions,
  );
  const auth = new AuthService(store.db);
  const access = new AccessService(store, auth);
  const state = new StateService(store, {
    auth,
    access,
    onCommit: (...args) => viberNotifications.enqueue(...args),
  });
  const google = new GoogleService(store, googleOptions);
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const hostname = host ? new URL("http://" + host).hostname : "";
      const expectedHost = publicHost ? publicHost : null;
      const allowedHost = expectedHost
        ? hostname === expectedHost
        : ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
      if (!allowedHost)
        throw new AppError(
          403,
          "HOST_NOT_ALLOWED",
          "Недопустимый адрес сервера",
        );

      if (
        publicHost &&
        !(
          request.url?.split("?")[0] === "/api/v1/viber/webhook" &&
          request.method === "POST"
        )
      ) {
        const authorization = request.headers.authorization || "";
        const expected = createHash("sha256")
          .update("mio:" + accessPassword)
          .digest();
        let valid = false;
        if (authorization.startsWith("Basic ") && authorization.length < 4096) {
          try {
            const credentials = Buffer.from(
              authorization.slice(6),
              "base64",
            ).toString("utf8");
            const actual = createHash("sha256").update(credentials).digest();
            valid = timingSafeEqual(expected, actual);
          } catch {}
        }
        if (!valid) {
          response.writeHead(401, {
            "www-authenticate": 'Basic realm="Mio! Test"',
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          });
          response.end("Требуется пароль");
          return;
        }
      }

      const origin = request.headers.origin;
      const expectedOrigin = publicHost
        ? "https://" + publicHost
        : "http://" + host;
      if (origin && origin !== expectedOrigin)
        throw new AppError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "Недопустимый источник запроса",
        );
      const url = new URL(request.url, "http://" + host);
      const sessionToken = (request.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("mio_session="))
        ?.slice("mio_session=".length);
      const user = auth.getSession(sessionToken);
      if (
        url.pathname === "/api/v1/viber/webhook" &&
        request.method === "POST"
      ) {
        await handleViberWebhook(request, response);
        return;
      }
      if (url.pathname.startsWith("/api/v1/viber-notifications/")) {
        if (!user)
          throw new AppError(401, "UNAUTHORIZED", "Требуется вход в Mio!");
        access.require(
          user,
          ["status", "reservation", "refresh", "retry"].includes(
            url.pathname.split("/").at(-1),
          )
            ? "manage_reservations"
            : "admin",
        );
        await routeViberNotifications(
          request,
          response,
          url,
          viberNotifications,
        );
      } else if (url.pathname.startsWith("/api/v1/google/")) {
        if (user) access.require(user, "admin");
        await routeGoogle(request, response, url, google, user, sessionToken);
      } else if (url.pathname.startsWith("/api/auth/"))
        await routeAuth(request, response, url, auth, Boolean(publicHost));
      else if (url.pathname.startsWith("/api/")) {
        if (url.pathname !== "/api/health" && auth.ownerExists() && !user) {
          throw new AppError(401, "UNAUTHORIZED", "Требуется вход в Mio!");
        }
        await routeApi(request, response, url, state, user);
      } else
        await serveStatic(request, response, url.pathname, staticDirectory);
    } catch (error) {
      if (!response.headersSent)
        json(response, error.status || 500, {
          error: {
            code: error.code || "INTERNAL_ERROR",
            message: error.status ? error.message : "Ошибка сервера",
            details: error.details,
          },
        });
      else response.destroy();
      if (!error.status) console.error("Mio! server:", error.message);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    store,
    state,
    auth,
    access,
    viberNotifications,
    async close() {
      await viberNotifications.stop();
      if (server.listening)
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
      store.close();
    },
  };
}
