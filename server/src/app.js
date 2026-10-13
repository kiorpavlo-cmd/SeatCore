import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseStore } from "./database/store.js";
import { StateService } from "./services/state.js";
import { routeApi } from "./http/routes.js";
import { serveStatic } from "./http/static.js";
import { json } from "./http/respond.js";
import { AppError } from "./domain/errors.js";
import { AuthService } from "./auth/service.js";
import { routeAuth } from "./auth/routes.js";
export function createApp({
  database = ":memory:",
  seed,
  staticDirectory,
  publicHost = "",
  accessPassword = "",
}) {
  const store = new DatabaseStore(database, seed);
  const state = new StateService(store);
  const auth = new AuthService(store.db);
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const hostname = host
        ? new URL("http://" + host).hostname
        : "";
      const expectedHost = publicHost
        ? publicHost
        : null;
      const allowedHost = expectedHost
        ? hostname === expectedHost
        : ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
      if (!allowedHost)
        throw new AppError(403, "HOST_NOT_ALLOWED", "Недопустимый адрес сервера");

      if (publicHost) {
        const authorization = request.headers.authorization || "";
        const expected = createHash("sha256")
          .update("mio:" + accessPassword)
          .digest();
        let valid = false;
        if (authorization.startsWith("Basic ") &&
            authorization.length < 4096) {
          try {
            const credentials = Buffer.from(
              authorization.slice(6), "base64"
            ).toString("utf8");
            const actual = createHash("sha256")
              .update(credentials).digest();
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
      if (url.pathname.startsWith("/api/auth/"))
        await routeAuth(request, response, url, auth, Boolean(publicHost));
      else if (url.pathname.startsWith("/api/"))
        await routeApi(request, response, url, state);
      else await serveStatic(request, response, url.pathname, staticDirectory);
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
    async close() {
      if (server.listening)
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
      store.close();
    },
  };
}
