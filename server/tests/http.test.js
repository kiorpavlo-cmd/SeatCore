import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
const seed = JSON.parse(
  readFileSync(new URL("../config/seed.json", import.meta.url), "utf8"),
);
async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "eatapp-http-"));
  writeFileSync(
    path.join(directory, "index.html"),
    '<html lang="ru">Eat App</html>',
  );
  const app = createApp({
    seed,
    database: ":memory:",
    staticDirectory: directory,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    app,
    directory,
    url: "http://127.0.0.1:" + app.server.address().port,
  };
}
test("HTTP отдаёт готовый сайт и состояние базы", async (t) => {
  const { url } = await fixture(t);
  const page = await fetch(url + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Eat App/);
  const health = await (await fetch(url + "/api/health")).json();
  assert.equal(health.storage, "sqlite");
  const state = await (await fetch(url + "/api/v1/state")).json();
  assert.equal(state.revision, 0);
  assert.ok(state.collections.app);
});
test("HTTP CRUD сохраняет, ищет и удаляет запись", async (t) => {
  const { url } = await fixture(t);
  const record = {
    id: "http1",
    name: "Борис",
    date: "2026-10-13",
    time: "20:00",
    guests: 2,
    duration: 90,
    table: "2",
    room: "main",
  };
  const send = (method, endpoint, body) =>
    fetch(url + endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const response = await send("POST", "/api/v1/reservations", {
    baseRevision: 0,
    mutationId: "http-create",
    record,
  });
  assert.equal(response.status, 201);
  const saved = await response.json();
  const list = await (
    await fetch(
      url +
        "/api/v1/reservations?date=2026-10-13&q=" +
        encodeURIComponent("Борис"),
    )
  ).json();
  assert.equal(list.records.length, 1);
  const removed = await send("DELETE", "/api/v1/reservations/http1", {
    baseRevision: saved.revision,
    mutationId: "http-delete",
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).collections.app.reservations.length, 0);
});
test("API отклоняет некорректный JSON и сторонний Origin", async (t) => {
  const { url } = await fixture(t);
  const invalid = await fetch(url + "/api/v1/state", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{bad",
  });
  assert.equal(invalid.status, 400);
  const external = await fetch(url + "/api/v1/state", {
    headers: { origin: "https://example.com" },
  });
  assert.equal(external.status, 403);
  const contentType = await fetch(url + "/api/v1/state", {
    method: "PATCH",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(contentType.status, 415);
});
test("Статическая раздача не раскрывает файлы за пределами dist", async (t) => {
  const { url, directory } = await fixture(t);
  const file = path.join(directory, "private-link");
  symlinkSync("/etc/hosts", file);
  const forbidden = await fetch(url + "/private-link");
  assert.equal(forbidden.status, 404);
  const missing = await fetch(url + "/server/data/eatapp.sqlite");
  assert.equal(missing.status, 404);
});
