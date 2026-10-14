import { json, readJson } from "./respond.js";
import { routeViber } from "../services/viber.js";
import { AppError } from "../domain/errors.js";
import { randomUUID, createHash } from "node:crypto";
export async function routeApi(request, response, url, state, actor = null) {
  const path = url.pathname,
    method = request.method;
  if (path.startsWith("/api/v1/viber/")) {
    state.access?.require(actor, "admin");
    await routeViber(request, response, url);
    return;
  }
  const employee = /^\/api\/v1\/employees(?:\/([^/]+))?$/.exec(path);
  if (employee) {
    state.access.require(actor, "restaurant_users");
    const body = await readJson(request),
      id = employee[1] ? decodeURIComponent(employee[1]) : null;
    const account = state.store.read().account;
    const found = account.users.findIndex((row) => String(row.id) === id);
    if (id && found < 0)
      throw new AppError(404, "NOT_FOUND", "Сотрудник не найден");
    if (method === "POST" && !id)
      account.users.push({ ...body.user, id: randomUUID() });
    else if (method === "PATCH" && id)
      account.users[found] = {
        ...account.users[found],
        ...body.user,
        id: account.users[found].id,
      };
    else if (method === "DELETE" && id) account.users.splice(found, 1);
    else
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается");
    const receiptHash = createHash("sha256")
      .update(JSON.stringify(["employee", method, id, body.user]))
      .digest("hex");
    json(
      response,
      method === "POST" ? 201 : 200,
      state.commit(
        {
          changes: { account },
          baseRevision: body.baseRevision,
          mutationId: body.mutationId,
        },
        false,
        receiptHash,
        actor,
      ),
    );
    return;
  }
  const exported =
    /^\/api\/v1\/exports\/(reservations|waitlist|guests|reviews|audit)$/.exec(
      path,
    );
  if (exported && method === "GET") {
    const collection = exported[1];
    state.access.require(
      actor,
      ["guests", "reviews"].includes(collection)
        ? "download_crm"
        : "download_reservations",
    );
    if (["reviews", "audit"].includes(collection)) {
      state.access.require(
        actor,
        collection === "reviews" ? "manage_crm" : "advanced_reports",
      );
      const snapshot = state.snapshot(actor);
      json(response, 200, {
        revision: snapshot.revision,
        records: snapshot.collections.resources[collection] || [],
      });
    } else json(response, 200, state.records(collection, actor));
    return;
  }
  if (path === "/api/health" && method === "GET") {
    json(response, 200, {
      status: "ok",
      service: "Mio! server",
      storage: "sqlite",
    });
    return;
  }
  if (path === "/api/v1/state") {
    if (method === "GET") {
      json(response, 200, state.snapshot(actor));
      return;
    }
    if (method === "PATCH") {
      json(
        response,
        200,
        state.commit(await readJson(request), false, null, actor),
      );
      return;
    }
  }
  if (path === "/api/v1/migrations/browser" && method === "POST") {
    json(response, 200, state.migrate(await readJson(request), actor));
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
      const result = state.records(collection, actor);
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
        state.updateRecord(
          collection,
          method,
          id,
          body.record,
          {
            baseRevision: body.baseRevision,
            mutationId: body.mutationId,
          },
          actor,
        ),
      );
      return;
    }
  }
  throw new AppError(404, "NOT_FOUND", "API-маршрут не найден");
}
