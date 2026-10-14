import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { DatabaseStore } from "../src/database/store.js";
import { StateService } from "../src/services/state.js";
import { AuthService } from "../src/auth/service.js";
import { createApp } from "../src/app.js";
import {
  ViberNotifications,
  normalizeViberPhone,
  viberNotificationTransition,
  VIBER_TEMPLATE_FIELDS,
} from "../src/services/viber-notifications.js";
const seed = JSON.parse(
  readFileSync(new URL("../config/seed.json", import.meta.url), "utf8"),
);
const options = {
  baseUrl: "https://test.api.infobip.com",
  apiKey: "private-key",
  sender: "Mio",
  acceptedTemplate: "accept-template",
  cancelledTemplate: "cancel-template",
  language: "ru",
};
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const approved = (kind) => ({
  status: "APPROVED",
  body: [{ language: "ru", template: "Approved sample" }],
  params: VIBER_TEMPLATE_FIELDS[kind].map((name) => ({ name, type: "TEXT" })),
});
function setup(
  t,
  fetcher = async (url, request) => {
    if (url.includes("/templates/"))
      return response(
        approved(url.endsWith("accept-template") ? "accepted" : "cancelled"),
      );
    const payload = JSON.parse(request.body);
    const target = payload.messages[0].destinations[0];
    return response({
      messages: [
        {
          messageId: target.messageId,
          destination: target.to,
          status: { groupId: 1, id: 26, name: "PENDING_ACCEPTED" },
        },
      ],
    });
  },
) {
  const copy = structuredClone(seed);
  copy.app.reservations = [];
  copy.app.waitlist = [];
  copy.guests.guests = [];
  copy.account.profile.name = "Test Restaurant";
  copy.account.profile.phone = "+37060000999";
  const store = new DatabaseStore(":memory:", copy);
  t.after(() => store.close());
  const service = new ViberNotifications(store, { ...options, fetcher });
  const state = new StateService(store, {
    onCommit: (...args) => service.enqueue(...args),
  });
  const rows = () =>
    store.db
      .prepare("SELECT * FROM viber_business_notifications ORDER BY rowid")
      .all();
  const save = (changes, mutationId = crypto.randomUUID()) =>
    state.commit({
      baseRevision: state.snapshot().revision,
      mutationId,
      changes,
    });
  const booking = {
    id: "booking",
    name: "Guest",
    date: "2026-10-14",
    time: "19:00",
    guests: 2,
    duration: 90,
    table: "",
    room: "main",
    status: "Не подтверждено",
    phone: "+37060000123",
    notify: true,
  };
  function put(patch = {}, mutationId) {
    const app = state.snapshot().collections.app;
    const existing = app.reservations.find((x) => x.id === "booking");
    app.reservations = [{ ...booking, ...existing, ...patch }];
    return save({ app }, mutationId);
  }
  return { store, service, state, rows, save, put, booking };
}

test("phones require a country code and normalize only unambiguous input", () => {
  assert.equal(normalizeViberPhone("+370 (600) 00-123"), "+37060000123");
  assert.equal(normalizeViberPhone("0037060000123"), "+37060000123");
  for (const phone of [
    "860000123",
    "37060000123",
    "+370abc123",
    "+000123456",
    "+1",
    "+1234567890123456",
    "+37060000123 ext 9",
    null,
  ])
    assert.equal(normalizeViberPhone(phone), null);
});
test("only employee confirmation and cancellation transitions trigger notifications", () => {
  assert.equal(
    viberNotificationTransition(null, { status: "Не подтверждено" }),
    null,
  );
  assert.equal(
    viberNotificationTransition(null, { status: "Подтверждено гостем" }),
    null,
  );
  assert.equal(
    viberNotificationTransition(
      { status: "Не подтверждено" },
      { status: "Подтверждено" },
    ),
    "accepted",
  );
  assert.equal(
    viberNotificationTransition(
      { status: "Подтверждено" },
      { status: "Подтверждено" },
    ),
    null,
  );
  assert.equal(
    viberNotificationTransition(
      { status: "Подтверждено" },
      { status: "Отменено" },
    ),
    "cancelled",
  );
  assert.equal(
    viberNotificationTransition(
      { status: "Отменено" },
      { status: "Отменено гостем" },
    ),
    null,
  );
  assert.equal(
    viberNotificationTransition(null, {
      status: "Подтверждено",
      notify: false,
    }),
    null,
  );
  assert.equal(
    viberNotificationTransition(null, { status: "Подтверждено", walkIn: true }),
    null,
  );
});
test("configuration rejects arbitrary hosts and does not expose the API key", (t) => {
  const { store, service } = setup(t);
  assert.equal(service.status().configured, true);
  assert.ok(!JSON.stringify(service.status()).includes("private-key"));
  for (const baseUrl of [
    "http://test.api.infobip.com",
    "https://evil.example",
    "https://api.infobip.com.evil.test",
    "https://api.infobip.com/?leak=1",
    "https://user:pass@api.infobip.com",
  ]) {
    const other = new ViberNotifications(store, { ...options, baseUrl });
    assert.equal(other.status().configured, false);
  }
});
test("activation verifies both approved templates, language and exact parameter names", async (t) => {
  const { service } = setup(t);
  await service.setEnabled(true);
  assert.equal(service.status().enabled, true);
  await service.setEnabled(false);
  assert.equal(service.status().enabled, false);
  service.fetch = async () => response({ status: "PENDING" });
  await assert.rejects(() => service.setEnabled(true), {
    code: "VIBER_TEMPLATE_NOT_APPROVED",
  });
  assert.equal(service.status().enabled, false);
  service.fetch = async () =>
    response({ ...approved("accepted"), params: [{ name: "wrong" }] });
  await assert.rejects(() => service.setEnabled(true), {
    code: "VIBER_TEMPLATE_FIELDS",
  });
});
test("disabled notifications do not enqueue or retrospectively notify existing bookings", async (t) => {
  const { service, put, rows } = setup(t);
  put({ status: "Подтверждено" });
  assert.equal(rows().length, 0);
  await service.setEnabled(true);
  put({ notes: "Edit" });
  assert.equal(rows().length, 0);
});
test("queue is committed with the reservation and repeated mutations do not duplicate it", async (t) => {
  const { service, state, put, rows, store } = setup(t);
  await service.setEnabled(true);
  put();
  const app = state.snapshot().collections.app;
  app.reservations[0].status = "Подтверждено";
  const request = {
    baseRevision: state.snapshot().revision,
    mutationId: "same-request",
    changes: { app },
  };
  state.commit(request);
  state.commit(request);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].kind, "accepted");
  await service.processQueue();
  assert.equal(rows()[0].status, "accepted");
  await service.processQueue();
  assert.equal(rows().length, 1);
  assert.ok(!JSON.stringify(state.snapshot()).includes(rows()[0].id));
  const broken = new StateService(store, {
    onCommit: () => {
      throw new Error("outbox failure");
    },
  });
  const before = state.snapshot();
  const modified = structuredClone(before.collections.app);
  modified.reservations[0].status = "Отменено";
  assert.throws(
    () =>
      broken.commit({
        baseRevision: before.revision,
        mutationId: "broken",
        changes: { app: modified },
      }),
    /outbox failure/,
  );
  assert.equal(state.snapshot().revision, before.revision);
  assert.equal(
    state.snapshot().collections.app.reservations[0].status,
    "Подтверждено",
  );
});
test("validation failures, migrations and waitlist do not send notifications", async (t) => {
  const { service, state, put, rows, save } = setup(t);
  await service.setEnabled(true);
  assert.throws(() => put({ guests: 0, status: "Подтверждено" }));
  assert.equal(rows().length, 0);
  const app = state.snapshot().collections.app;
  app.waitlist = [
    {
      id: "wait",
      name: "Waiting",
      date: "2026-10-14",
      time: "19:00",
      guests: 2,
      duration: 90,
      status: "Подтверждено",
    },
  ];
  save({ app });
  assert.equal(rows().length, 0);
  service.enqueue(
    { app: { reservations: [] } },
    { app: { reservations: [{ id: "migrate", status: "Подтверждено" }] } },
    { revision: 1, migration: true },
  );
  assert.equal(rows().length, 0);
});
test("send uses Viber TEMPLATE by phone with no SMS fallback or subscriber ID", async (t) => {
  const calls = [];
  const { service, put, rows } = setup(t, async (url, args) => {
    calls.push({ url, args });
    if (url.includes("/templates/"))
      return response(
        approved(url.endsWith("accept-template") ? "accepted" : "cancelled"),
      );
    const destination = JSON.parse(args.body).messages[0].destinations[0];
    return response({
      messages: [
        {
          messageId: destination.messageId,
          destination: destination.to,
          status: { groupId: 1, id: 26 },
        },
      ],
    });
  });
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  await service.processQueue();
  const send = calls.find((call) => call.url.endsWith("/viber/2/messages"));
  assert.equal(send.args.headers.Authorization, "App private-key");
  const message = JSON.parse(send.args.body).messages[0];
  assert.equal(message.destinations[0].to, "37060000123");
  assert.equal(message.destinations[0].messageId, rows()[0].id);
  assert.equal(message.content.type, "TEMPLATE");
  assert.equal(message.content.templateId, "accept-template");
  assert.equal(message.content.language, "ru");
  assert.deepEqual(message.content.parameters, {
    name: "Guest",
    restaurant: "Test Restaurant",
    date: "14.10.2026",
    time: "19:00",
    guests: "2",
  });
  assert.ok(!send.args.body.includes("receiver"));
  assert.ok(!send.args.body.includes("SMS"));
  assert.equal(send.args.redirect, "error");
});
test("a cancellation supersedes pending confirmation and uses the cancellation template", async (t) => {
  const { service, put, rows } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  put({ status: "Отменено" });
  assert.equal(rows()[0].status, "superseded");
  assert.equal(rows()[1].kind, "cancelled");
  await service.processQueue();
  assert.equal(rows()[1].status, "accepted");
  assert.equal(
    service.payload(
      rows()[1],
      service.currentBooking("booking"),
      "+37060000123",
    ).messages[0].content.templateId,
    "cancel-template",
  );
});
test("phone errors are visible and can be retried only after fixing the booking", async (t) => {
  const { service, put, rows } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено", phone: "860000123" });
  await service.processQueue();
  assert.equal(rows()[0].status, "skipped");
  put({ phone: "+37060000123" });
  service.retry(rows()[0].id);
  await service.processQueue();
  assert.equal(rows().at(-1).status, "accepted");
});
test("opt-out, deletion and stale status stop queued sends", async (t) => {
  const { service, put, rows, state, save } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  put({ notify: false });
  await service.processQueue();
  assert.equal(rows()[0].status, "superseded");
  put({ notify: true, status: "Не подтверждено" });
  put({ status: "Подтверждено" });
  const app = state.snapshot().collections.app;
  app.reservations = [];
  save({ app });
  await service.processQueue();
  assert.equal(rows().at(-1).status, "superseded");
});
test("timeout stays unknown and never resends automatically or via unsafe retry", async (t) => {
  let sends = 0;
  const { service, put, rows } = setup(t, async (url) => {
    if (url.includes("/templates/"))
      return response(
        approved(url.endsWith("accept-template") ? "accepted" : "cancelled"),
      );
    sends++;
    throw new Error("private network payload");
  });
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  await service.processQueue();
  await service.processQueue();
  assert.equal(rows()[0].status, "unknown");
  assert.equal(sends, 1);
  assert.throws(() => service.retry(rows()[0].id), {
    code: "VIBER_RETRY_UNSAFE",
  });
  assert.ok(!rows()[0].error.includes("private"));
});
test("confirmed provider rejection is retryable, HTTP 500 remains uncertain", async (t) => {
  let errorStatus = 400;
  const { service, put, rows } = setup(t, async (url) => {
    if (url.includes("/templates/"))
      return response(
        approved(url.endsWith("accept-template") ? "accepted" : "cancelled"),
      );
    return response({ private: "secret" }, errorStatus);
  });
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  await service.processQueue();
  assert.equal(rows()[0].status, "failed");
  errorStatus = 500;
  service.retry(rows()[0].id);
  await service.processQueue();
  assert.equal(rows().at(-1).status, "unknown");
});
test("accepted provider response is not shown as delivered to the guest", async (t) => {
  const { service, put, rows } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  await service.processQueue();
  assert.equal(rows()[0].status, "accepted");
  service.fetch = async () =>
    response({
      results: [
        {
          messageId: rows()[0].id,
          to: "37060000123",
          status: { groupId: 3, id: 2 },
        },
      ],
    });
  await service.refreshReport(rows()[0].id);
  assert.equal(rows()[0].status, "accepted");
  service.fetch = async () =>
    response({
      results: [
        {
          messageId: rows()[0].id,
          to: "37060000123",
          status: { groupId: 3, id: 5 },
        },
      ],
    });
  await service.refreshReport(rows()[0].id);
  assert.equal(rows()[0].status, "delivered");
});
test("delivery lookup ignores reports for other recipients and does not resend", async (t) => {
  const { service, put, rows } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  await service.processQueue();
  service.fetch = async (url, args) => {
    assert.equal(args.method, "GET");
    assert.ok(url.includes("/viber/2/logs?"));
    return response({
      results: [
        { messageId: rows()[0].id, to: "wrong", status: { groupId: 3, id: 5 } },
      ],
    });
  };
  await service.refreshReport(rows()[0].id);
  assert.equal(rows()[0].status, "accepted");
});
test("restart marks interrupted sends unknown instead of replaying them", async (t) => {
  const { service, put, rows, store } = setup(t);
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  store.db
    .prepare("UPDATE viber_business_notifications SET status='sending'")
    .run();
  const restarted = new ViberNotifications(store, {
    ...options,
    fetcher: async () => {
      throw new Error("must not send");
    },
  });
  await restarted.processQueue();
  assert.equal(rows()[0].status, "unknown");
});
test("only one queue processor can send a pending notification", async (t) => {
  let resolve,
    count = 0;
  const { service, put, rows } = setup(t, async (url, args) => {
    if (url.includes("/templates/"))
      return response(
        approved(url.endsWith("accept-template") ? "accepted" : "cancelled"),
      );
    count++;
    const id = JSON.parse(args.body).messages[0].destinations[0].messageId;
    return new Promise((done) => {
      resolve = () =>
        done(
          response({
            messages: [{ messageId: id, status: { groupId: 1, id: 26 } }],
          }),
        );
    });
  });
  await service.setEnabled(true);
  put({ status: "Подтверждено" });
  const flight = service.processQueue();
  await service.processQueue();
  resolve();
  await flight;
  assert.equal(count, 1);
  assert.equal(rows()[0].status, "accepted");
});
async function invoke(
  app,
  url,
  { method = "GET", cookie = "", body, origin } = {},
) {
  const request = Readable.from(body ? [JSON.stringify(body)] : []);
  request.url = url;
  request.method = method;
  request.headers = {
    host: "127.0.0.1:4175",
    cookie,
    ...(body ? { "content-type": "application/json" } : {}),
    ...(origin ? { origin } : {}),
  };
  const result = { headers: {} };
  const response = {
    headersSent: false,
    writeHead(status, headers) {
      result.status = status;
      Object.assign(result.headers, headers);
      this.headersSent = true;
    },
    end(body) {
      result.body = body;
    },
    setHeader(k, v) {
      result.headers[k] = v;
    },
    destroy() {},
  };
  await app.server.listeners("request")[0](request, response);
  return result;
}
test("notification routes require a session even with no owner and reject foreign origins", async (t) => {
  const app = createApp({
    seed,
    staticDirectory: "/tmp/unused",
    viberNotificationOptions: options,
  });
  t.after(() => app.close());
  assert.equal(
    (await invoke(app, "/api/v1/viber-notifications/status")).status,
    401,
  );
  const auth = new AuthService(app.store.db),
    owner = auth.createOwner("owner@example.test", "test-password-12345"),
    session = auth.createSession(owner.id);
  const cookie = "mio_session=" + session.token;
  const status = await invoke(app, "/api/v1/viber-notifications/status", {
    cookie,
  });
  assert.equal(status.status, 200);
  assert.ok(!status.body.includes("private-key"));
  assert.equal(
    (
      await invoke(app, "/api/v1/viber-notifications/settings", {
        cookie,
        method: "POST",
        body: { enabled: true },
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
