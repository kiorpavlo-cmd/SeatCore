import { json, readJson } from "./respond.js";
import { AppError } from "../domain/errors.js";
export async function routeApi(request, response, url, state) {
  const path = url.pathname,
    method = request.method;
  if (path === "/api/health" && method === "GET") {
    json(response, 200, {
      status: "ok",
      service: "EatApp server",
      storage: "sqlite",
    });
    return;
  }
  if (path === "/api/v1/state") {
    if (method === "GET") {
      json(response, 200, state.snapshot());
      return;
    }
    if (method === "PATCH") {
      json(response, 200, state.commit(await readJson(request)));
      return;
    }
  }
  if (path === "/api/v1/migrations/browser" && method === "POST") {
    json(response, 200, state.migrate(await readJson(request)));
    return;
  }
  const match =
    /^\/api\/v1\/(reservations|waitlist|staff|guests|tags|tag-categories|custom-fields)(?:\/([^/]+))?$/.exec(
      path,
    );
  if (match) {
    const [, collection, encodedId] = match;
    const id = encodedId ? decodeURIComponent(encodedId) : null;
    if (method === "GET") {
      const result = state.records(collection);
      if (id) {
        const record = result.records.find((x) => String(x.id) === id);
        if (!record) throw new AppError(404, "NOT_FOUND", "Запись не найдена");
        json(response, 200, { revision: result.revision, record });
        return;
      }
      const date = url.searchParams.get("date"),
        query = url.searchParams.get("q");
      if (date) result.records = result.records.filter((x) => x.date === date);
      if (query)
        result.records = result.records.filter((x) =>
          JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
        );
      json(response, 200, result);
      return;
    }
    if (
      (method === "POST" && !id) ||
      (["PATCH", "DELETE"].includes(method) && id)
    ) {
      const body = await readJson(request);
      json(
        response,
        method === "POST" ? 201 : 200,
        state.updateRecord(collection, method, id, body.record, {
          baseRevision: body.baseRevision,
          mutationId: body.mutationId,
        }),
      );
      return;
    }
  }
  throw new AppError(404, "NOT_FOUND", "API-маршрут не найден");
}
