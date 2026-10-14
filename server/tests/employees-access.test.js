import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { normalizeState } from "../../web/src/services/store.js";

const seed = JSON.parse(
  readFileSync(new URL("../config/seed.json", import.meta.url), "utf8"),
);
const password = "Employee-password-2026";
async function request(app, path, { method = "GET", token, body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.url = path;
  req.method = method;
  req.headers = {
    host: "127.0.0.1:4175",
    ...(token ? { cookie: "mio_session=" + token } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  };
  const result = { headers: {} };
  const res = {
    headersSent: false,
    setHeader(key, value) {
      result.headers[key] = value;
    },
    writeHead(status, headers) {
      result.status = status;
      Object.assign(result.headers, headers);
      this.headersSent = true;
    },
    end(body) {
      result.body = body ? JSON.parse(body) : {};
    },
    destroy() {},
  };
  await app.server.listeners("request")[0](req, res);
  return result;
}
function fixture(t) {
  const app = createApp({ seed: structuredClone(seed) });
  const owner = app.auth.createOwner(
    "owner@example.test",
    "Owner-password-2026",
  );
  const token = app.auth.createSession(owner.id).token;
  t.after(() => app.close());
  return { app, owner, token };
}
async function employee(app, token, values = {}) {
  const user = {
    email: "employee@example.test",
    name: "Сотрудник",
    role: "Сотрудник",
    login: true,
    taker: true,
    server: true,
    password,
    ...values,
  };
  const body = {
    baseRevision: Number(app.store.getMeta("revision")),
    mutationId: randomUUID(),
    user,
  };
  const result = await request(app, "/api/v1/employees", {
    method: "POST",
    token,
    body,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const profile = result.body.collections.account.users.find(
    (row) => row.email === user.email,
  );
  const login = await request(app, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password },
  });
  const employeeToken =
    login.status === 200
      ? login.headers["Set-Cookie"].split(";")[0].slice("mio_session=".length)
      : null;
  return { profile, token: employeeToken, body };
}
async function change(app, token, changes) {
  return request(app, "/api/v1/state", {
    method: "PATCH",
    token,
    body: {
      baseRevision: Number(app.store.getMeta("revision")),
      mutationId: randomUUID(),
      changes,
    },
  });
}
async function edit(app, token, id, user, method = "PATCH") {
  return request(app, "/api/v1/employees/" + id, {
    method,
    token,
    body: {
      baseRevision: Number(app.store.getMeta("revision")),
      mutationId: randomUUID(),
      user,
    },
  });
}
const booking = (id) => ({
  id,
  name: "Гость",
  date: "2026-10-14",
  time: "19:00",
  guests: 2,
  duration: 90,
  room: "main",
  status: "Не подтверждено",
});

test("employee creation enables email/password login without exposing credentials", async (t) => {
  const { app, token } = fixture(t);
  const staff = await employee(app, token);
  assert.ok(staff.token);
  assert.equal(staff.profile.hasPassword, true);
  const me = await request(app, "/api/auth/me", { token: staff.token });
  assert.equal(me.body.user.role, "Сотрудник");
  assert.equal(me.body.user.staffId, staff.profile.id);
  const snapshot = await request(app, "/api/v1/state", { token });
  assert.ok(!JSON.stringify(snapshot).includes(password));
  assert.ok(!JSON.stringify(app.store.read()).includes(password));
  const account = app.store.db
    .prepare("SELECT password_hash FROM auth_users WHERE email=?")
    .get("employee@example.test");
  assert.match(account.password_hash, /^scrypt:/);
  assert.equal(me.body.user.permissions.admin, false);
});

test("disabling, re-enabling and deleting staff invalidates active sessions", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  assert.equal(
    (await edit(app, token, staff.profile.id, { login: false })).status,
    200,
  );
  assert.equal(
    (await request(app, "/api/auth/me", { token: staff.token })).status,
    401,
  );
  assert.equal(
    (
      await request(app, "/api/auth/login", {
        method: "POST",
        body: { email: staff.profile.email, password },
      })
    ).status,
    401,
  );
  assert.equal(
    (await edit(app, token, staff.profile.id, { login: true })).status,
    200,
  );
  const user = app.auth.verifyCredentials(staff.profile.email, password);
  const nextToken = app.auth.createSession(user.id).token;
  assert.equal(
    (await edit(app, token, staff.profile.id, undefined, "DELETE")).status,
    200,
  );
  assert.equal(
    (await request(app, "/api/auth/me", { token: nextToken })).status,
    401,
  );
  assert.equal(app.auth.verifyCredentials(staff.profile.email, password), null);
  assert.ok(app.auth.getSession(token));
});

test("password and email changes revoke previous sessions and preserve profile identity", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  assert.equal(
    (
      await edit(app, token, staff.profile.id, {
        password: "Replacement-password-2026",
        email: "changed@example.test",
      })
    ).status,
    200,
  );
  assert.equal(app.auth.getSession(staff.token), null);
  assert.equal(app.auth.verifyCredentials(staff.profile.email, password), null);
  assert.equal(
    app.auth.verifyCredentials(
      "changed@example.test",
      "Replacement-password-2026",
    )?.staffId,
    staff.profile.id,
  );
});

test("missing passwords and owner email collisions leave both stores unchanged", async (t) => {
  const { app, token } = fixture(t);
  const before = JSON.stringify(app.store.read());
  for (const user of [
    { email: "new@example.test", role: "Сотрудник", login: true },
    { email: "owner@example.test", role: "Менеджер", login: true, password },
  ]) {
    const result = await request(app, "/api/v1/employees", {
      method: "POST",
      token,
      body: { baseRevision: 0, mutationId: randomUUID(), user },
    });
    assert.ok([409, 422].includes(result.status));
    assert.equal(JSON.stringify(app.store.read()), before);
    assert.equal(
      app.store.db.prepare("SELECT COUNT(*) AS n FROM auth_users").get().n,
      1,
    );
  }
});

test("employee creation retries are idempotent", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  const revision = app.store.getMeta("revision");
  const repeat = await request(app, "/api/v1/employees", {
    method: "POST",
    token,
    body: staff.body,
  });
  assert.equal(repeat.status, 201);
  assert.equal(app.store.getMeta("revision"), revision);
  assert.equal(app.store.read().account.users.length, 1);
});

test("ordinary staff cannot bypass admin, account or permission checks with PATCH state", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  const current = app.store.read();
  for (const changes of [
    {
      permissions: {
        admin: { roles: [true, true, true, true, true], overrides: [] },
      },
    },
    {
      account: {
        ...current.account,
        profile: { ...current.account.profile, name: "Changed" },
      },
    },
    {
      account: {
        ...current.account,
        users: current.account.users.map((row) => ({
          ...row,
          role: "Групповой менеджер",
        })),
      },
    },
    { floor: { ...current.floor, main: [] } },
  ])
    assert.equal((await change(app, staff.token, changes)).status, 403);
  assert.equal(
    (
      await request(app, "/api/v1/employees", {
        method: "POST",
        token: staff.token,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app, "/api/v1/google/connect", {
        method: "POST",
        token: staff.token,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app, "/api/v1/viber-notifications/settings", {
        method: "POST",
        token: staff.token,
        body: { enabled: true },
      })
    ).status,
    403,
  );
  assert.deepEqual(app.store.read().account, current.account);
});

test("permissions and individual denials apply immediately to existing sessions and CRUD", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  let result = await request(app, "/api/v1/reservations", {
    method: "POST",
    token: staff.token,
    body: {
      baseRevision: 1,
      mutationId: randomUUID(),
      record: booking("first"),
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(
    result.body.collections.app.reservations[0].employeeId,
    staff.profile.id,
  );
  const settings = {
    manage_reservations: {
      roles: [true, true, true, true, true],
      overrides: [{ email: staff.profile.email, value: "deny" }],
    },
  };
  assert.equal(
    (await change(app, token, { permissions: settings })).status,
    200,
  );
  result = await request(app, "/api/v1/reservations", {
    method: "POST",
    token: staff.token,
    body: {
      baseRevision: 3,
      mutationId: randomUUID(),
      record: booking("second"),
    },
  });
  assert.equal(result.status, 403);
  assert.equal(
    (
      await change(app, staff.token, {
        app: { ...app.store.read().app, reservations: [booking("second")] },
      })
    ).status,
    403,
  );
  const allDenied = Object.fromEntries(
    Object.keys(app.auth.getSession(token).permissions).map((key) => [
      key,
      { roles: [false, false, false, false, false], overrides: [] },
    ]),
  );
  assert.equal(
    (await change(app, token, { permissions: allDenied })).status,
    200,
  );
  assert.equal(
    (
      await edit(app, token, staff.profile.id, {
        name: "Still owner-controlled",
      })
    ).status,
    200,
  );
});

test("deletion restrictions, guest deletion and bulk operations are enforced", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  assert.equal(
    (
      await change(app, token, {
        app: { ...app.store.read().app, reservations: [booking("one")] },
        guests: {
          guests: [{ id: "g", first: "Гость" }],
          tags: [],
          categories: [],
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app, "/api/v1/reservations/one", {
        method: "DELETE",
        token: staff.token,
        body: { baseRevision: 2, mutationId: randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app, "/api/v1/guests/g", {
        method: "DELETE",
        token: staff.token,
        body: { baseRevision: 2, mutationId: randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await change(app, token, {
        permissions: {
          import: { roles: [false, false, false, false, false], overrides: [] },
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await change(app, staff.token, {
        app: {
          ...app.store.read().app,
          reservations: [booking("one"), booking("two"), booking("three")],
        },
      })
    ).status,
    403,
  );
});

test("PIN validation guards reservations and throttles invalid guesses", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token, { pinTaker: true, pin: "1234" });
  const patch = {
    app: { ...app.store.read().app, reservations: [booking("pin")] },
  };
  assert.equal(
    (await change(app, staff.token, patch)).body.error.code,
    "PIN_REQUIRED",
  );
  assert.equal(
    (
      await request(app, "/api/auth/verify-pin", {
        method: "POST",
        token: staff.token,
        body: { pin: "1234" },
      })
    ).status,
    200,
  );
  assert.equal((await change(app, staff.token, patch)).status, 200);
  const second = await employee(app, token, {
    email: "other@example.test",
    pinTaker: true,
    pin: "5678",
  });
  for (let n = 0; n < 5; n++)
    assert.equal(
      (
        await request(app, "/api/auth/verify-pin", {
          method: "POST",
          token: second.token,
          body: { pin: "0000" },
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await request(app, "/api/auth/verify-pin", {
        method: "POST",
        token: second.token,
        body: { pin: "5678" },
      })
    ).status,
    429,
  );
});

test("hidden resource settings survive ordinary reservation audit updates", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  assert.equal(
    (
      await change(app, token, {
        resources: {
          ...app.store.read().resources,
          widgetConfigs: [{ id: "private", name: "Widget" }],
        },
      })
    ).status,
    200,
  );
  const snapshot = (await request(app, "/api/v1/state", { token: staff.token }))
    .body;
  assert.equal(snapshot.collections.resources.widgetConfigs, undefined);
  snapshot.collections.app.reservations.push(booking("safe"));
  assert.equal(
    (
      await change(app, staff.token, {
        app: snapshot.collections.app,
        resources: snapshot.collections.resources,
      })
    ).status,
    200,
  );
  assert.equal(app.store.read().resources.widgetConfigs[0].id, "private");
  const denied = await change(app, staff.token, {
    resources: { widgetConfigs: [] },
  });
  assert.equal(denied.status, 403);
});

test("user administrators cannot grant a more powerful role than their own", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token, { role: "Менеджер" });
  assert.equal(
    (
      await change(app, token, {
        permissions: {
          admin: { roles: [false, false, false, false, false], overrides: [] },
        },
      })
    ).status,
    200,
  );
  const result = await request(app, "/api/v1/employees", {
    method: "POST",
    token: staff.token,
    body: {
      baseRevision: 2,
      mutationId: randomUUID(),
      user: {
        email: "powerful@example.test",
        role: "Менеджер",
        login: true,
        password,
      },
    },
  });
  // This role is also denied admin, so creating it cannot escalate the actor.
  assert.equal(result.status, 201);
  const settings = {
    admin: { roles: [false, false, false, false, true], overrides: [] },
  };
  assert.equal(
    (await change(app, token, { permissions: settings })).status,
    200,
  );
  const escalation = await request(app, "/api/v1/employees", {
    method: "POST",
    token: staff.token,
    body: {
      baseRevision: 4,
      mutationId: randomUUID(),
      user: {
        email: "escalated@example.test",
        role: "Групповой менеджер",
        login: true,
        password,
      },
    },
  });
  assert.equal(escalation.status, 403);
});

test("guest read and export permissions are checked by the server", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  const permissions = Object.fromEntries(
    [
      "manage_guests",
      "manage_crm",
      "download_crm",
      "download_reservations",
    ].map((key) => [
      key,
      { roles: [false, false, false, false, false], overrides: [] },
    ]),
  );
  assert.equal((await change(app, token, { permissions })).status, 200);
  assert.equal(
    (await request(app, "/api/v1/guests", { token: staff.token })).status,
    403,
  );
  assert.equal(
    (await request(app, "/api/v1/exports/guests", { token: staff.token }))
      .status,
    403,
  );
  assert.equal(
    (await request(app, "/api/v1/exports/reservations", { token: staff.token }))
      .status,
    403,
  );
  const snapshot = (await request(app, "/api/v1/state", { token: staff.token }))
    .body;
  assert.deepEqual(snapshot.collections.guests.guests, []);
  assert.ok(
    snapshot.collections.account.users.every(
      (row) => !Object.hasOwn(row, "email"),
    ),
  );
});

test("employee function flags allow serving status changes but deny taking reservations", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token, { taker: false, server: true });
  assert.equal(
    (
      await change(app, token, {
        app: { ...app.store.read().app, reservations: [booking("serve")] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app, "/api/v1/reservations", {
        method: "POST",
        token: staff.token,
        body: {
          baseRevision: 2,
          mutationId: randomUUID(),
          record: booking("new"),
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app, "/api/v1/reservations/serve", {
        method: "PATCH",
        token: staff.token,
        body: {
          baseRevision: 2,
          mutationId: randomUUID(),
          record: { status: "За столом" },
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app, "/api/v1/reservations/serve", {
        method: "PATCH",
        token: staff.token,
        body: {
          baseRevision: 3,
          mutationId: randomUUID(),
          record: { name: "Edited guest" },
        },
      })
    ).status,
    403,
  );
});

test("individual grants work and role changes revoke old sessions", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  const permissions = {
    delete_profiles: {
      roles: [false, false, false, false, false],
      overrides: [{ email: staff.profile.email, value: "allow" }],
    },
  };
  assert.equal(
    (
      await change(app, token, {
        permissions,
        guests: {
          guests: [{ id: "grant", first: "Гость" }],
          tags: [],
          categories: [],
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app, "/api/v1/guests/grant", {
        method: "DELETE",
        token: staff.token,
        body: { baseRevision: 2, mutationId: randomUUID() },
      })
    ).status,
    200,
  );
  assert.equal(
    (await edit(app, token, staff.profile.id, { role: "Кол-центр" })).status,
    200,
  );
  assert.equal(app.auth.getSession(staff.token), null);
  assert.equal(
    app.auth.verifyCredentials(staff.profile.email, password).role,
    "Кол-центр",
  );
});

test("existing profiles are preserved and enabling login requires credentials", async (t) => {
  const { app, token } = fixture(t);
  assert.equal(
    (
      await change(app, token, {
        account: {
          ...app.store.read().account,
          users: [
            {
              id: "legacy",
              email: "legacy@example.test",
              name: "Existing",
              role: "Сотрудник",
              login: false,
            },
          ],
        },
      })
    ).status,
    200,
  );
  assert.equal((await edit(app, token, "legacy", { login: true })).status, 422);
  assert.equal(
    (await edit(app, token, "legacy", { login: true, password })).status,
    200,
  );
  assert.equal(
    app.auth.verifyCredentials("legacy@example.test", password).staffId,
    "legacy",
  );
});

test("profile restrictions and role denials cannot be bypassed by legacy PIN hashes", async (t) => {
  const { app, token } = fixture(t);
  const staff = await employee(app, token, {
    role: "Менеджер",
    deleteGuests: false,
  });
  assert.equal(
    app.auth.getSession(staff.token).permissions.delete_profiles,
    false,
  );
  const current = app.store.read();
  assert.equal(
    (
      await change(app, token, {
        permissions: {
          restaurant_users: {
            roles: [false, false, false, false, false],
            overrides: [],
          },
        },
      })
    ).status,
    200,
  );
  const poisoned = {
    ...current.account,
    users: current.account.users.map((row) => ({
      ...row,
      pinHash: "scrypt:untrusted",
    })),
  };
  assert.equal(
    (await change(app, staff.token, { account: poisoned })).status,
    200,
  );
  assert.equal(app.store.read().account.users[0].pinHash, undefined);
  assert.equal(
    (
      await edit(app, staff.token, staff.profile.id, {
        role: "Групповой менеджер",
      })
    ).status,
    403,
  );
});

test("browser-derived staff metadata does not block saving a reservation", async (t) => {
  const { app, token } = fixture(t),
    staff = await employee(app, token);
  const snapshot = (await request(app, "/api/v1/state", { token: staff.token }))
    .body;
  const normalized = normalizeState(
    snapshot.collections.app,
    snapshot.collections.account.users,
  );
  assert.deepEqual(normalized.servers, app.store.read().app.servers);
  normalized.reservations.push(booking("from-browser"));
  const saved = await change(app, staff.token, {
    app: normalized,
    resources: {
      ...snapshot.collections.resources,
      audit: [
        {
          date: new Date().toISOString(),
          name: "Бронирования",
          action: "Изменение",
        },
      ],
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const reload = (await request(app, "/api/v1/state", { token: staff.token }))
    .body;
  assert.equal(reload.collections.app.reservations.length, 1);
  assert.equal(
    reload.collections.app.reservations[0].employeeId,
    staff.profile.id,
  );
});
