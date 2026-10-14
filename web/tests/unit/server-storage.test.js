import { describe, it, expect } from "vitest";
import { createStorage, STORAGE_KEYS } from "../../src/services/storage.js";
import { disconnectedStorage } from "../../src/services/persistence.js";
import { createServerStorage } from "../../src/services/server-storage.js";
const local = () =>
  createStorage({
    data: new Map(),
    getItem(key) {
      return this.data.get(key) ?? null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    },
  });
const initial = () => ({
  revision: 0,
  initialized: true,
  collections: {
    app: {
      reservations: [],
      waitlist: [],
      servers: [],
      rooms: { main: "Зал" },
    },
    floor: { main: [] },
    blocked: [],
    blocks: [],
    notes: {},
    account: { profile: {}, users: [] },
    permissions: {},
    guests: { guests: [], categories: [], tags: [] },
    fields: [],
    resources: {},
    backgrounds: {},
  },
});
describe("Подключение интерфейса к серверу", () => {
  it("обновляет эффективные права из ответа сервера и откатывает запрещённое изменение", async () => {
    const state = initial();
    state.access = {
      id: "employee",
      permissions: { manage_reservations: false },
    };
    const repo = await createServerStorage({
      local: local(),
      api: {
        async request(path, { body } = {}) {
          if (body)
            throw Object.assign(new Error("Недостаточно прав"), {
              status: 403,
            });
          return structuredClone(state);
        },
      },
    });
    expect(repo.persistence.access.permissions.manage_reservations).toBe(false);
    repo.write(STORAGE_KEYS.app, {
      ...state.collections.app,
      reservations: [{ id: "denied", name: "Гость" }],
    });
    await repo.flush();
    expect(repo.read(STORAGE_KEYS.app, {}).reservations).toEqual([]);
    expect(repo.persistence.status).toBe("error");
    expect(repo.unsavedBackup().collections.app.reservations[0].id).toBe(
      "denied",
    );
    state.access.permissions.manage_reservations = true;
    state.revision++;
    await repo.sync();
    expect(repo.persistence.access.permissions.manage_reservations).toBe(true);
  });
  it("оставляет фильтры и дату в браузере, сохраняет записи через API", async () => {
    const browser = local();
    browser.write(STORAGE_KEYS.app, {
      date: "2026-10-13",
      search: "Мой поиск",
    });
    let state = initial(),
      writes = 0;
    const api = {
      async request(path, { body } = {}) {
        if (body) {
          writes++;
          state = {
            ...state,
            revision: state.revision + 1,
            collections: { ...state.collections, ...body.changes },
          };
        }
        return structuredClone(state);
      },
    };
    const repo = await createServerStorage({
      api,
      local: browser,
      mutationId: () => String(writes),
    });
    const app = repo.read(STORAGE_KEYS.app, {});
    expect(app.search).toBe("Мой поиск");
    repo.write(STORAGE_KEYS.app, {
      ...app,
      date: "2026-10-14",
      reservations: [{ id: 1, name: "Анна" }],
    });
    await repo.flush();
    expect(writes).toBe(1);
    expect(state.collections.app.date).toBeUndefined();
    expect(state.collections.app.reservations[0].name).toBe("Анна");
    expect(repo.read(STORAGE_KEYS.app, {}).date).toBe("2026-10-14");
  });
  it("сохраняет копию браузера до замены серверными данными", async () => {
    const browser = local();
    browser.write(STORAGE_KEYS.notes, { "2026-10-13": "Старая запись" });
    const repo = await createServerStorage({
      api: { request: async () => initial() },
      local: browser,
    });
    expect(repo.legacyBackup()[STORAGE_KEYS.notes]).toContain("Старая запись");
    expect(repo.read(STORAGE_KEYS.notes, {})).toEqual({});
  });
  it("после конфликта сохраняет несохранённую копию и загружает данные сервера", async () => {
    const browser = local();
    let state = initial();
    state.collections.notes = { "2026-10-13": "Другое окно" };
    let updates = 0;
    const api = {
      async request(path, { body } = {}) {
        if (body) throw Object.assign(new Error("Конфликт"), { status: 409 });
        return structuredClone(state);
      },
    };
    const repo = await createServerStorage({
      api,
      local: browser,
      onUpdate: () => updates++,
    });
    repo.write(STORAGE_KEYS.notes, { "2026-10-13": "Моя запись" });
    await repo.flush();
    expect(repo.persistence.status).toBe("error");
    expect(repo.read(STORAGE_KEYS.notes, {})).toEqual({
      "2026-10-13": "Другое окно",
    });
    expect(repo.unsavedBackup().collections.notes["2026-10-13"]).toBe(
      "Моя запись",
    );
    expect(updates).toBe(1);
  });
  it("повторяет тот же запрос после обрыва соединения", async () => {
    const browser = local();
    let state = initial(),
      attempts = 0;
    const ids = [];
    const api = {
      async request(path, { body } = {}) {
        if (body) {
          attempts++;
          ids.push(body.mutationId);
          if (attempts === 1)
            throw Object.assign(new Error("Нет связи"), { status: 0 });
          state = {
            ...state,
            revision: 1,
            collections: { ...state.collections, ...body.changes },
          };
        }
        return structuredClone(state);
      },
    };
    const repo = await createServerStorage({
      api,
      local: browser,
      mutationId: () => "stable-id",
    });
    repo.write(STORAGE_KEYS.notes, { "2026-10-13": "Черновик" });
    await repo.flush();
    expect(repo.persistence.status).toBe("error");
    await repo.retry();
    expect(repo.persistence.status).toBe("saved");
    expect(ids).toEqual(["stable-id", "stable-id"]);
    expect(state.collections.notes["2026-10-13"]).toBe("Черновик");
  });
  it("не затирает более новые изменения ответом на предыдущую запись", async () => {
    const browser = local();
    let state = initial(),
      resolveFirst,
      started;
    const start = new Promise((resolve) => (started = resolve));
    let requests = 0;
    const api = {
      async request(path, { body } = {}) {
        if (body) {
          requests++;
          if (requests === 1) {
            started();
            await new Promise((resolve) => (resolveFirst = resolve));
          }
          state = {
            ...state,
            revision: state.revision + 1,
            collections: { ...state.collections, ...body.changes },
          };
        }
        return structuredClone(state);
      },
    };
    const repo = await createServerStorage({ api, local: browser });
    repo.write(STORAGE_KEYS.notes, { date: "Первая" });
    const flushing = repo.flush();
    await start;
    repo.write(STORAGE_KEYS.notes, { date: "Вторая" });
    resolveFirst();
    await flushing;
    expect(requests).toBe(2);
    expect(repo.read(STORAGE_KEYS.notes, {}).date).toBe("Вторая");
  });
});

describe("Сохранность при отключённом сервере", () => {
  it("показывает кеш, но не записывает изменения локально вместо сервера", () => {
    const browser = local();
    browser.write(STORAGE_KEYS.notes, { day: "Подтверждено" });
    let errors = 0,
      retries = 0;
    const repo = disconnectedStorage(
      browser,
      "Нет связи",
      () => errors++,
      () => retries++,
    );
    expect(repo.read(STORAGE_KEYS.notes, {})).toEqual({ day: "Подтверждено" });
    expect(repo.write(STORAGE_KEYS.notes, { day: "Изменено" })).toBe(false);
    expect(repo.setItem(STORAGE_KEYS.notes, "{}")).toBe(false);
    expect(browser.read(STORAGE_KEYS.notes, {})).toEqual({
      day: "Подтверждено",
    });
    expect(errors).toBe(2);
    repo.retry();
    expect(retries).toBe(1);
  });
  it("не сохраняет новые PIN в резервном черновике браузера", async () => {
    const browser = local();
    const api = {
      async request(path, { body } = {}) {
        if (body) throw Object.assign(new Error("Нет связи"), { status: 0 });
        return initial();
      },
    };
    const repo = await createServerStorage({ api, local: browser });
    repo.write(STORAGE_KEYS.account, {
      profile: {},
      users: [{ id: "u1", email: "user@example.com", pin: "1234" }],
    });
    await repo.flush();
    expect(
      repo.unsavedBackup().collections.account.users[0].pin,
    ).toBeUndefined();
    expect(browser.read(STORAGE_KEYS.account, {}).users[0].pin).toBeUndefined();
  });
});

it("оставляет черновик доступным для экспорта при переполнении браузерного хранилища", async () => {
  const memory = new Map();
  const browser = createStorage({
    getItem: (key) => memory.get(key) ?? null,
    setItem(key, value) {
      if (key === "mio-server-unsaved-v1") throw new Error("Нет места");
      memory.set(key, value);
    },
  });
  const api = {
    async request(path, { body } = {}) {
      if (body) throw Object.assign(new Error("Нет связи"), { status: 0 });
      return initial();
    },
  };
  const repo = await createServerStorage({ api, local: browser });
  repo.write(STORAGE_KEYS.notes, { day: "Скачать вручную" });
  await repo.flush();
  expect(repo.unsavedBackup().collections.notes.day).toBe("Скачать вручную");
  expect(repo.persistence.message).toContain("до перезагрузки страницы");
});

it("обновляет бронирования, созданные в другом окне", async () => {
  let snapshot = initial(),
    updates = 0;
  const api = {
    async request() {
      return structuredClone(snapshot);
    },
  };
  const repo = await createServerStorage({
    api,
    local: local(),
    onUpdate: () => updates++,
  });
  snapshot.revision++;
  snapshot.collections.app.reservations = [
    { id: "external", name: "Новая бронь" },
  ];
  expect(await repo.sync()).toBe(true);
  expect(repo.read(STORAGE_KEYS.app, {}).reservations[0].id).toBe("external");
  expect(updates).toBe(1);
  await repo.sync();
  expect(updates).toBe(1);
});

it("фоновое обновление не заменяет ожидающие сохранения данные", async () => {
  let snapshot = initial(),
    release;
  const api = {
    async request(path, { body } = {}) {
      if (body) {
        snapshot = {
          ...snapshot,
          revision: snapshot.revision + 1,
          collections: { ...snapshot.collections, ...body.changes },
        };
        return structuredClone(snapshot);
      }
      return release
        ? new Promise((resolve) => {
            release.resolve = resolve;
          })
        : structuredClone(snapshot);
    },
  };
  const repo = await createServerStorage({ api, local: local() });
  release = {};
  const sync = repo.sync();
  repo.write(STORAGE_KEYS.notes, { day: "Несохранённая заметка" });
  release.resolve({ ...structuredClone(snapshot), revision: 2 });
  expect(await sync).toBe(false);
  expect(repo.read(STORAGE_KEYS.notes, {}).day).toBe("Несохранённая заметка");
  await repo.flush();
});
