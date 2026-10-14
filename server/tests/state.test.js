import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseStore } from "../src/database/store.js";
import { StateService } from "../src/services/state.js";
import { verifyPin } from "../src/services/credentials.js";
const seed = JSON.parse(
  readFileSync(new URL("../config/seed.json", import.meta.url), "utf8"),
);
const booking = {
  id: "b1",
  name: "Анна",
  date: "2026-10-13",
  time: "19:00",
  guests: 2,
  duration: 90,
  table: "1",
  room: "main",
  status: "Не подтверждено",
  source: "В ресторане",
};
function fixture(t, file = ":memory:") {
  const store = new DatabaseStore(file, structuredClone(seed));
  t.after(() => store.close());
  return { store, service: new StateService(store) };
}
const update = (service, snapshot, changes, mutationId) =>
  service.commit({ baseRevision: snapshot.revision, changes, mutationId });
test("Сохраняет запись в настоящей SQLite и перечитывает после открытия", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "mio-db-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "test.sqlite");
  const first = new DatabaseStore(file, seed),
    service = new StateService(first);
  const before = service.snapshot();
  update(
    service,
    before,
    { app: { ...before.collections.app, reservations: [booking] } },
    "create",
  );
  first.close();
  const second = new DatabaseStore(file, seed);
  try {
    const result = new StateService(second).snapshot();
    assert.equal(result.revision, 1);
    assert.equal(result.collections.app.reservations[0].name, "Анна");
    assert.equal(result.initialized, true);
  } finally {
    second.close();
  }
});
test("Сервер отклоняет пересекающиеся брони без участия браузера", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  const saved = update(
    service,
    initial,
    { app: { ...initial.collections.app, reservations: [booking] } },
    "create",
  );
  assert.throws(
    () =>
      update(
        service,
        saved,
        {
          app: {
            ...saved.collections.app,
            reservations: [booking, { ...booking, id: "b2", time: "19:30" }],
          },
        },
        "overlap",
      ),
    /занят/,
  );
  assert.equal(service.snapshot().revision, 1);
  assert.equal(service.snapshot().collections.app.reservations.length, 1);
});
test("Версия защищает изменения из другого окна", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  update(service, initial, { notes: { "2026-10-13": "Первое окно" } }, "first");
  assert.throws(
    () =>
      update(
        service,
        initial,
        { notes: { "2026-10-13": "Второе окно" } },
        "second",
      ),
    (error) => error.status === 409 && error.code === "REVISION_CONFLICT",
  );
  assert.equal(
    service.snapshot().collections.notes["2026-10-13"],
    "Первое окно",
  );
});
test("Повторный запрос не создаёт дубль и не увеличивает версию", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  const changes = { notes: { "2026-10-13": "Запись" } };
  const first = update(service, initial, changes, "same");
  const repeated = update(service, initial, changes, "same");
  assert.equal(repeated.revision, first.revision);
  assert.equal(repeated.collections.resources.audit.length, 1);
  assert.throws(
    () => update(service, initial, { notes: {} }, "same"),
    (error) => error.code === "IDEMPOTENCY_REUSE",
  );
});
test("Ошибочная составная операция полностью откатывается", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  assert.throws(
    () =>
      update(
        service,
        initial,
        {
          notes: { "2026-10-13": "Не должно сохраниться" },
          app: {
            ...initial.collections.app,
            reservations: [{ ...booking, guests: 0 }],
          },
        },
        "invalid",
      ),
    /Количество гостей/,
  );
  assert.deepEqual(service.snapshot().collections.notes, {});
  assert.equal(service.snapshot().revision, 0);
});
test("Блокировка времени проверяется на сервере", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  const block = {
    id: "block",
    scope: "Весь ресторан",
    sources: ["В ресторане"],
    repeat: "Однократно",
    days: [0, 1, 2, 3, 4, 5, 6],
    tables: [],
    start: "2026-10-13T18:00",
    end: "2026-10-13T21:00",
  };
  assert.throws(
    () =>
      update(
        service,
        initial,
        {
          blocks: [block],
          app: { ...initial.collections.app, reservations: [booking] },
        },
        "blocked",
      ),
    /ограничение/,
  );
  assert.equal(service.snapshot().revision, 0);
});
test("Миграция сохраняет прежние идентификаторы и не заменяет активную базу", (t) => {
  const { service } = fixture(t);
  const initial = service.snapshot();
  const result = service.migrate({
    baseRevision: initial.revision,
    mutationId: "import",
    legacy: {
      "mio-ru-demo-v1": JSON.stringify({
        ...initial.collections.app,
        date: "2026-10-13",
        search: "Личный поиск",
        reservations: [booking],
      }),
    },
  });
  assert.equal(result.collections.app.reservations[0].id, "b1");
  assert.equal(result.collections.app.search, undefined);
  assert.throws(
    () =>
      service.migrate({
        baseRevision: result.revision,
        legacy: {},
        mutationId: "again",
      }),
    (error) => error.code === "ALREADY_INITIALIZED",
  );
});
test("PIN хранится хешем и не выдаётся API-клиенту", (t) => {
  const { service, store } = fixture(t);
  const initial = service.snapshot();
  const result = update(
    service,
    initial,
    {
      account: {
        profile: { name: "Ресторан" },
        users: [
          {
            id: "u1",
            name: "Сотрудник",
            email: "staff@example.com",
            pin: "1234",
          },
        ],
      },
    },
    "user",
  );
  const user = store.read().account.users[0];
  assert.equal(user.pin, undefined);
  assert.ok(verifyPin("1234", user.pinHash));
  assert.equal(verifyPin("9999", user.pinHash), false);
  assert.equal(result.collections.account.users[0].pinHash, undefined);
  const modified = update(
    service,
    result,
    {
      account: {
        ...result.collections.account,
        users: [
          {
            ...result.collections.account.users[0],
            name: "Обновлено",
            pin: "",
          },
        ],
      },
    },
    "edit-user",
  );
  assert.equal(modified.collections.account.users[0].name, "Обновлено");
  assert.equal(store.read().account.users[0].pinHash, user.pinHash);
});
test("CRUD работает через те же серверные правила", (t) => {
  const { service } = fixture(t);
  const saved = service.updateRecord("reservations", "POST", null, booking, {
    baseRevision: 0,
    mutationId: "create",
  });
  const edited = service.updateRecord(
    "reservations",
    "PATCH",
    "b1",
    { guests: 4 },
    { baseRevision: saved.revision, mutationId: "edit" },
  );
  assert.equal(edited.collections.app.reservations[0].guests, 4);
  const removed = service.updateRecord("reservations", "DELETE", "b1", null, {
    baseRevision: edited.revision,
    mutationId: "delete",
  });
  assert.equal(removed.collections.app.reservations.length, 0);
});
test("Резервная копия SQLite открывается и сохраняет данные", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "mio-backup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { service, store } = fixture(t);
  update(
    service,
    service.snapshot(),
    { notes: { "2026-10-13": "Для копии" } },
    "note",
  );
  const file = path.join(directory, "backup.sqlite");
  await store.backup(file);
  const copy = new DatabaseStore(file, seed);
  try {
    assert.equal(
      new StateService(copy).snapshot().collections.notes["2026-10-13"],
      "Для копии",
    );
  } finally {
    copy.close();
  }
});

test("Миграция сохраняет старый журнал, дальнейшие записи не позволяют подменить его", (t) => {
  const { service } = fixture(t);
  const old = {
    date: "2026-10-12T12:00:00Z",
    name: "Старая операция",
    action: "Добавлено",
  };
  const migrated = service.migrate({
    baseRevision: 0,
    mutationId: "legacy-audit",
    legacy: {
      "mio-ru-resources-v1": JSON.stringify({ audit: [old], shifts: [] }),
    },
  });
  assert.ok(
    migrated.collections.resources.audit.some((row) => row.name === old.name),
  );
  const saved = update(
    service,
    migrated,
    { resources: { audit: [{ ...old, name: "Подмена" }], shifts: [] } },
    "new-audit",
  );
  assert.ok(
    saved.collections.resources.audit.some((row) => row.name === old.name),
  );
  assert.equal(
    saved.collections.resources.audit.some((row) => row.name === "Подмена"),
    false,
  );
});

test("Повтор CRUD-запроса с автоматически созданным ID возвращает прежнюю запись", (t) => {
  const { service } = fixture(t);
  const { id, ...record } = booking;
  const meta = { baseRevision: 0, mutationId: "retry-record" };
  const first = service.updateRecord(
    "reservations",
    "POST",
    null,
    record,
    meta,
  );
  const repeated = service.updateRecord(
    "reservations",
    "POST",
    null,
    record,
    meta,
  );
  assert.equal(repeated.revision, first.revision);
  assert.equal(repeated.collections.app.reservations.length, 1);
  assert.equal(
    repeated.collections.app.reservations[0].id,
    first.collections.app.reservations[0].id,
  );
  assert.throws(
    () =>
      service.updateRecord(
        "reservations",
        "POST",
        null,
        { ...record, name: "Другая запись" },
        meta,
      ),
    (error) => error.code === "IDEMPOTENCY_REUSE",
  );
});

test('Отметки прочтения уведомлений сохраняются вместе с настройками виджета', (t) => {
  const {service} = fixture(t);
  const before = service.snapshot();
  const read = [{id:'b1',key:JSON.stringify(['b1','Анна','2026-10-13','19:00','Не подтверждено',2,'1','main'])}];
  const widgets = [{id:'widget-1',name:'Основной виджет'}];
  const saved = update(service, before, {resources:{...before.collections.resources,bookingNotificationReads:read,widgetConfigs:widgets}}, 'notifications-read');
  assert.deepEqual(saved.collections.resources.bookingNotificationReads, read);
  assert.deepEqual(service.snapshot().collections.resources.widgetConfigs, widgets);
});

test('Удаление зала сохраняет брони без стола и удаляет план одним запросом', (t) => {
  const {service} = fixture(t);
  const before=service.snapshot();
  const saved=update(service,before,{
    app:{...before.collections.app,rooms:{terrace:'Терраса'},reservations:[{...booking,room:'terrace',table:''}]},
    floor:{terrace:[]},blocked:[],backgrounds:{},
    resources:{...before.collections.resources,floorScenes:[{id:'terrace',room:'terrace',objects:[]}]},
  },'delete-room');
  assert.equal(saved.collections.app.reservations[0].id,booking.id);
  assert.equal(saved.collections.app.reservations[0].table,'');
  assert.equal(saved.collections.floor.main,undefined);
  assert.deepEqual(service.snapshot().collections.app.rooms,{terrace:'Терраса'});
});
