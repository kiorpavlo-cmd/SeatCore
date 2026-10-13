import {
  STORAGE_KEYS,
  projectCollection,
} from "../../../server/contracts/storage.js";
export const SERVER_MARKER = "mio-server-connected-v1";
const BACKUP_KEY = "mio-browser-before-server-v1",
  UNSAVED_KEY = "mio-server-unsaved-v1";
const nameByKey = Object.fromEntries(
  Object.entries(STORAGE_KEYS).map(([name, key]) => [key, name]),
);
const copy = (value) => JSON.parse(JSON.stringify(value));
const json = (value) => JSON.stringify(value);
const publicValue = (name, value) =>
  name === "account"
    ? { ...value, users: value.users.map(({ pin, pinHash, ...user }) => user) }
    : value;
export async function createServerStorage({
  api,
  local,
  onStatus = () => {},
  onUpdate = () => {},
  mutationId = () => crypto.randomUUID(),
}) {
  let snapshot = await api.request("/v1/state");
  if (!Number.isInteger(snapshot.revision) || !snapshot.collections)
    throw new Error("Неверное состояние сервера");
  const legacy = local.export();
  const hasLegacy = Object.values(legacy).some((value) => value !== null);
  if (
    hasLegacy &&
    !local.getItem(BACKUP_KEY) &&
    !local.setItem(BACKUP_KEY, json(legacy))
  )
    throw new Error(
      "Не удалось сохранить копию данных браузера перед подключением сервера",
    );
  if (!snapshot.initialized && hasLegacy)
    snapshot = await api.request("/v1/migrations/browser", {
      method: "POST",
      body: {
        baseRevision: snapshot.revision,
        mutationId: mutationId(),
        legacy,
      },
    });
  let confirmed = snapshot.collections,
    revision = snapshot.revision,
    pending = {},
    flight = null,
    scheduled = null,
    running = false,
    paused = false,
    lastDraft = null;
  const cache = new Map();
  const persistence = {
    mode: "server",
    status: "saved",
    message: "Сохранено на сервере",
  };
  function status(value, message) {
    persistence.status = value;
    persistence.message = message;
    onStatus({ ...persistence });
  }
  function mirror(name, value) {
    const key = STORAGE_KEYS[name];
    let cached = publicValue(name, value);
    if (name === "app") {
      let ui = {};
      try {
        ui = JSON.parse(local.getItem(key) || "{}");
      } catch {}
      cached = { ...ui, ...cached };
    }
    cache.set(key, json(cached));
    local.setItem(key, json(cached));
  }
  function apply(data, overlay = {}) {
    confirmed = data.collections;
    revision = data.revision;
    for (const [name, value] of Object.entries({ ...confirmed, ...overlay }))
      mirror(name, value);
  }
  function legacyBackup() {
    try {
      return JSON.parse(local.getItem(BACKUP_KEY) || "null");
    } catch {
      return null;
    }
  }
  function unsavedBackup() {
    if (lastDraft) return lastDraft;
    try {
      return JSON.parse(local.getItem(UNSAVED_KEY) || "null");
    } catch {
      return null;
    }
  }
  apply(snapshot);
  local.setItem(SERVER_MARKER, "1");
  function schedule() {
    if (!paused && !scheduled)
      scheduled = setTimeout(() => {
        scheduled = null;
        flush();
      }, 30);
  }
  async function flush() {
    if (running) return;
    if (paused) return;
    running = true;
    try {
      while (flight || Object.keys(pending).length) {
        if (!flight) {
          flight = {
            baseRevision: revision,
            mutationId: mutationId(),
            changes: pending,
          };
          pending = {};
        }
        status("saving", "Сохраняем на сервере…");
        try {
          const data = await api.request("/v1/state", {
            method: "PATCH",
            body: flight,
          });
          flight = null;
          apply(data, pending);
          onUpdate({ reload: false });
        } catch (error) {
          const draft = {
            date: new Date().toISOString(),
            message: error.message,
            collections: Object.fromEntries(
              Object.values(STORAGE_KEYS)
                .filter((key) => cache.has(key))
                .map((key) => [
                  nameByKey[key],
                  publicValue(nameByKey[key], JSON.parse(cache.get(key))),
                ]),
            ),
          };
          lastDraft = draft;
          const durableDraft = local.setItem(UNSAVED_KEY, json(draft));
          if (error.status === 409 || error.status === 422) {
            try {
              const latest = await api.request("/v1/state");
              flight = null;
              pending = {};
              apply(latest);
              onUpdate({ reload: true });
            } catch {
              paused = true;
            }
          } else paused = true;
          status(
            "error",
            error.message +
              (durableDraft
                ? " · Копия изменений доступна в настройках"
                : " · Скачайте черновик в настройках до перезагрузки страницы: хранилище браузера недоступно"),
          );
          return;
        }
      }
      status("saved", "Сохранено на сервере");
    } finally {
      running = false;
    }
  }
  return {
    persistence,
    getItem(key) {
      return cache.has(key) ? cache.get(key) : local.getItem(key);
    },
    setItem(key, raw) {
      const name = nameByKey[key];
      if (!name) return local.setItem(key, raw);
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        status("error", "Некорректные данные для сохранения");
        return false;
      }
      cache.set(key, raw);
      local.setItem(key, json(publicValue(name, value)));
      const domain = copy(projectCollection(name, value));
      const reference = flight?.changes[name] || confirmed[name];
      if (json(domain) !== json(projectCollection(name, reference)))
        pending[name] = domain;
      else delete pending[name];
      if (Object.keys(pending).length) {
        status("saving", "Сохраняем на сервере…");
        schedule();
      }
      return true;
    },
    read(key, fallback) {
      try {
        return JSON.parse(this.getItem(key)) ?? structuredClone(fallback);
      } catch {
        return structuredClone(fallback);
      }
    },
    write(key, value) {
      return this.setItem(key, json(value));
    },
    export() {
      return Object.fromEntries(
        Object.values(STORAGE_KEYS).map((key) => [key, this.getItem(key)]),
      );
    },
    flush,
    retry() {
      ((paused = false), (lastDraft = null));
      return flush();
    },
    legacyBackup,
    unsavedBackup,
  };
}
