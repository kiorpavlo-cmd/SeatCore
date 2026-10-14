import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseStore } from "../src/database/store.js";
import { AuthService } from "../src/auth/service.js";
import { GoogleService, GOOGLE_SCOPE } from "../src/services/google.js";
import { StateService } from "../src/services/state.js";
import { createApp } from "../src/app.js";
import { Readable } from "node:stream";

const seed = JSON.parse(
  readFileSync(new URL("../config/seed.json", import.meta.url), "utf8"),
);
const tokenResponse = {
  access_token: "access-secret",
  refresh_token: "refresh-secret",
  expires_in: 3600,
  scope: GOOGLE_SCOPE,
};
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const options = {
  clientId: "client",
  clientSecret: "client-secret",
  encryptionKey: "ab".repeat(32),
  redirectUri: "http://127.0.0.1:4175/api/v1/google/callback",
};
function setup(t, fetcher = async () => response(tokenResponse), extra = {}) {
  const store = new DatabaseStore(":memory:", seed);
  t.after(() => store.close());
  const owner = new AuthService(store.db).createOwner(
    "owner@example.test",
    "password-for-tests",
  );
  const google = new GoogleService(store, { ...options, fetcher, ...extra });
  return { store, owner, google };
}
async function connect(google, owner, session = "session-secret") {
  const url = new URL(google.begin(owner.id, session).url);
  const state = url.searchParams.get("state");
  await google.finish({ state, code: "authorization-code" }, owner.id, session);
  return state;
}

test("OAuth requests offline access and PKCE; tokens remain encrypted outside app snapshot", async (t) => {
  const calls = [];
  const { store, owner, google } = setup(t, async (url, args) => {
    calls.push({ url, args });
    return response(tokenResponse);
  });
  const begin = new URL(google.begin(owner.id, "session").url);
  assert.equal(begin.origin, "https://accounts.google.com");
  assert.equal(begin.searchParams.get("scope"), GOOGLE_SCOPE);
  assert.equal(begin.searchParams.get("access_type"), "offline");
  assert.equal(begin.searchParams.get("code_challenge_method"), "S256");
  assert.equal(begin.searchParams.get("client_secret"), null);
  await google.finish(
    { state: begin.searchParams.get("state"), code: "code" },
    owner.id,
    "session",
  );
  const body = new URLSearchParams(calls[0].args.body);
  assert.equal(body.get("code_verifier").length, 43);
  assert.equal(body.get("redirect_uri"), options.redirectUri);
  const stored = google.connection(owner.id).tokens;
  assert.ok(
    !stored.includes("access-secret") && !stored.includes("refresh-secret"),
  );
  assert.equal(google.open(stored).refresh_token, "refresh-secret");
  const snapshot = JSON.stringify(new StateService(store).snapshot());
  assert.ok(!snapshot.includes("refresh-secret") && !snapshot.includes(stored));
  assert.equal(google.status(owner.id).connected, true);
  assert.ok(!JSON.stringify(google.status(owner.id)).includes("secret"));
});

test("OAuth state is bound to the browser session and single-use", async (t) => {
  let calls = 0;
  const { owner, google } = setup(t, async () => {
    calls++;
    return response(tokenResponse);
  });
  const state = new URL(
    google.begin(owner.id, "session-A").url,
  ).searchParams.get("state");
  await assert.rejects(
    () => google.finish({ state, code: "code" }, owner.id, "session-B"),
    { code: "GOOGLE_INVALID_STATE" },
  );
  assert.equal(calls, 0);
  await google.finish({ state, code: "code" }, owner.id, "session-A");
  await assert.rejects(
    () => google.finish({ state, code: "code" }, owner.id, "session-A"),
    { code: "GOOGLE_INVALID_STATE" },
  );
  assert.equal(calls, 1);
});

test("expired or denied OAuth cannot create a connection", async (t) => {
  let time = 1000;
  const { owner, google } = setup(t, undefined, { now: () => time });
  let state = new URL(google.begin(owner.id, "session").url).searchParams.get(
    "state",
  );
  time += 600001;
  await assert.rejects(
    () => google.finish({ state, code: "code" }, owner.id, "session"),
    { code: "GOOGLE_INVALID_STATE" },
  );
  state = new URL(google.begin(owner.id, "session").url).searchParams.get(
    "state",
  );
  await assert.rejects(
    () => google.finish({ state, error: "access_denied" }, owner.id, "session"),
    { code: "GOOGLE_CONSENT_DENIED" },
  );
  assert.equal(google.status(owner.id).connected, false);
});

test("partial permissions and missing refresh token are rejected", async (t) => {
  let data = { ...tokenResponse, scope: "openid" };
  const { owner, google } = setup(t, async () => response(data));
  await assert.rejects(() => connect(google, owner), {
    code: "GOOGLE_SCOPE_REQUIRED",
  });
  data = { ...tokenResponse, refresh_token: undefined };
  await assert.rejects(() => connect(google, owner), {
    code: "GOOGLE_OFFLINE_REQUIRED",
  });
  assert.equal(google.status(owner.id).connected, false);
});

test("configuration rejects missing encryption key and nonlocal callback", (t) => {
  const { owner, google } = setup(t, undefined, {
    encryptionKey: "",
    redirectUri: "https://other.example/api/v1/google/callback",
  });
  assert.equal(google.status(owner.id).configured, false);
  assert.deepEqual(google.status(owner.id).missing, [
    "MIO_GOOGLE_TOKEN_KEY",
    "GOOGLE_REDIRECT_URI",
  ]);
  assert.throws(() => google.begin(owner.id, "session"), {
    code: "GOOGLE_NOT_CONFIGURED",
  });
});

test("accounts and locations forward pagination to correct APIs with a read mask", async (t) => {
  const calls = [];
  const { owner, google } = setup(t, async (url, args) => {
    calls.push({ url, args });
    return response(
      url.endsWith("/token")
        ? tokenResponse
        : { accounts: [], locations: [], nextPageToken: "next" },
    );
  });
  await connect(google, owner);
  await google.accounts(owner.id, "opaque+page");
  await google.locations(owner.id, "accounts/123", "location-page");
  const account = new URL(calls[1].url),
    location = new URL(calls[2].url);
  assert.equal(account.hostname, "mybusinessaccountmanagement.googleapis.com");
  assert.equal(account.searchParams.get("pageToken"), "opaque+page");
  assert.equal(location.pathname, "/v1/accounts/123/locations");
  assert.ok(location.searchParams.get("readMask").includes("title"));
  assert.equal(calls[2].args.headers.Authorization, "Bearer access-secret");
  await assert.rejects(
    () => google.locations(owner.id, "accounts/123/../../evil"),
    { code: "GOOGLE_INVALID_ACCOUNT" },
  );
});

test("selection verifies membership across all location pages", async (t) => {
  const { owner, google } = setup(t, async (url) => {
    if (url.endsWith("/token")) return response(tokenResponse);
    if (new URL(url).searchParams.get("pageToken"))
      return response({
        locations: [{ name: "locations/456", title: "Restaurant" }],
      });
    return response({
      locations: [{ name: "locations/first" }],
      nextPageToken: "second",
    });
  });
  await connect(google, owner);
  const status = await google.select(owner.id, "accounts/123", "locations/456");
  assert.deepEqual(status.selected, {
    account: "accounts/123",
    location: "locations/456",
  });
  await assert.rejects(
    () => google.select(owner.id, "accounts/123", "locations/unknown"),
    { code: "GOOGLE_LOCATION_NOT_ALLOWED" },
  );
  assert.equal(google.status(owner.id).selected.location, "locations/456");
});

test("profile and reviews use selected location and never overwrite CRM content", async (t) => {
  const calls = [];
  const { store, owner, google } = setup(t, async (url) => {
    calls.push(url);
    if (url.endsWith("/token")) return response(tokenResponse);
    if (url.includes("/accounts/123/locations?"))
      return response({ locations: [{ name: "locations/456" }] });
    if (url.includes("/reviews?"))
      return response({
        reviews: [
          { reviewId: "review", starRating: "FIVE", comment: "Google text" },
        ],
        averageRating: 4.8,
        totalReviewCount: 82,
        nextPageToken: "reviews-next",
      });
    return response({ name: "locations/456", title: "Google restaurant" });
  });
  await connect(google, owner);
  await assert.rejects(() => google.reviews(owner.id), {
    code: "GOOGLE_SELECT_LOCATION",
  });
  await google.select(owner.id, "accounts/123", "locations/456");
  const before = JSON.stringify(store.read());
  assert.equal((await google.profile(owner.id)).title, "Google restaurant");
  assert.equal(
    (await google.reviews(owner.id, "next-page")).totalReviewCount,
    82,
  );
  const reviewUrl = new URL(calls.at(-1));
  assert.equal(reviewUrl.pathname, "/v4/accounts/123/locations/456/reviews");
  assert.equal(reviewUrl.searchParams.get("pageToken"), "next-page");
  assert.equal(reviewUrl.searchParams.get("pageSize"), "50");
  assert.equal(JSON.stringify(store.read()), before);
});

test("expired tokens refresh once for concurrent requests and retain refresh token", async (t) => {
  let time = 1000,
    exchanges = 0;
  const { owner, google } = setup(
    t,
    async (url, args) => {
      if (url.endsWith("/token")) {
        exchanges++;
        const refresh =
          new URLSearchParams(args.body).get("grant_type") === "refresh_token";
        return response(
          refresh ? { access_token: "fresh", expires_in: 3600 } : tokenResponse,
        );
      }
      assert.equal(args.headers.Authorization, "Bearer fresh");
      return response({ accounts: [] });
    },
    { now: () => time },
  );
  await connect(google, owner);
  time += 3600000;
  await Promise.all([google.accounts(owner.id), google.accounts(owner.id)]);
  assert.equal(exchanges, 2);
  assert.equal(
    google.open(google.connection(owner.id).tokens).refresh_token,
    "refresh-secret",
  );
});

test("401 retries once with refreshed access; provider errors do not leak payloads", async (t) => {
  let gets = 0,
    status = 401;
  const { owner, google } = setup(t, async (url) => {
    if (url.endsWith("/token")) return response(tokenResponse);
    gets++;
    return response({ error: { message: "secret provider payload" } }, status);
  });
  await connect(google, owner);
  await assert.rejects(() => google.accounts(owner.id), {
    code: "GOOGLE_RECONNECT",
  });
  assert.equal(gets, 2);
  status = 403;
  await assert.rejects(
    () => google.accounts(owner.id),
    (error) =>
      error.code === "GOOGLE_ACCESS_DENIED" &&
      !error.message.includes("secret"),
  );
  status = 429;
  await assert.rejects(() => google.accounts(owner.id), {
    code: "GOOGLE_RATE_LIMIT",
  });
});

test("disconnect revokes access and clears tokens and pending OAuth states", async (t) => {
  let revoked = false;
  const { store, owner, google } = setup(t, async (url, args) => {
    if (url.endsWith("/revoke")) {
      revoked = true;
      assert.equal(
        new URLSearchParams(args.body).get("token"),
        "refresh-secret",
      );
      return response({});
    }
    return response(tokenResponse);
  });
  await connect(google, owner);
  google.begin(owner.id, "session");
  assert.equal((await google.disconnect(owner.id)).revoked, true);
  assert.equal(revoked, true);
  assert.equal(google.status(owner.id).connected, false);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM google_oauth_states").get().n,
    0,
  );
});

test("offline revocation and changed encryption key still allow local disconnect", async (t) => {
  let offline = false;
  const { owner, google } = setup(t, async () => {
    if (offline) throw new Error("offline");
    return response(tokenResponse);
  });
  await connect(google, owner);
  offline = true;
  const result = await google.disconnect(owner.id);
  assert.equal(result.revoked, false);
  assert.equal(google.status(owner.id).connected, false);
  offline = false;
  await connect(google, owner);
  google.key = Buffer.from("cd".repeat(32), "hex");
  assert.equal((await google.disconnect(owner.id)).revoked, false);
  assert.equal(google.status(owner.id).connected, false);
});

test("OAuth callback in flight cannot reconnect after disconnect", async (t) => {
  let resolve;
  const { owner, google } = setup(
    t,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const state = new URL(google.begin(owner.id, "session").url).searchParams.get(
    "state",
  );
  const pending = google.finish({ state, code: "code" }, owner.id, "session");
  await google.disconnect(owner.id);
  resolve(response(tokenResponse));
  await assert.rejects(() => pending, { code: "GOOGLE_CONNECTION_CHANGED" });
  assert.equal(google.status(owner.id).connected, false);
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
  const result = { headers: {}, body: "" };
  const response = {
    headersSent: false,
    setHeader(key, value) {
      result.headers[key] = value;
    },
    writeHead(status, headers) {
      result.status = status;
      Object.assign(result.headers, headers);
      this.headersSent = true;
    },
    end(body = "") {
      result.body = body;
    },
    destroy() {},
  };
  await app.server.listeners("request")[0](request, response);
  return result;
}

test("Google HTTP routes require a Mio session even before owner creation, and reject foreign Origin", async (t) => {
  const app = createApp({
    seed,
    staticDirectory: "/tmp/unused",
    googleOptions: options,
  });
  t.after(() => app.close());
  assert.equal((await invoke(app, "/api/v1/google/status")).status, 401);
  const auth = new AuthService(app.store.db);
  const owner = auth.createOwner("owner@example.test", "test-password-long");
  const session = auth.createSession(owner.id);
  const cookie = "mio_session=" + session.token;
  const result = await invoke(app, "/api/v1/google/status", { cookie });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).connected, false);
  assert.equal(
    (
      await invoke(app, "/api/v1/google/connect", {
        method: "POST",
        cookie,
        body: {},
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
});

test("callback redirects without echoing authorization codes or provider error payload", async (t) => {
  const app = createApp({
    seed,
    staticDirectory: "/tmp/unused",
    googleOptions: { ...options, fetcher: async () => response(tokenResponse) },
  });
  t.after(() => app.close());
  const auth = new AuthService(app.store.db);
  const owner = auth.createOwner("owner@example.test", "test-password-long");
  const session = auth.createSession(owner.id);
  const cookie = "mio_session=" + session.token;
  const begin = JSON.parse(
    (
      await invoke(app, "/api/v1/google/connect", {
        method: "POST",
        cookie,
        body: {},
      })
    ).body,
  );
  const state = new URL(begin.url).searchParams.get("state");
  const result = await invoke(
    app,
    `/api/v1/google/callback?code=secret-code&state=${state}`,
    { cookie },
  );
  assert.equal(result.status, 303);
  assert.ok(result.headers.location.includes("google=connected"));
  assert.ok(!result.headers.location.includes("secret-code"));
  assert.equal(result.headers["referrer-policy"], "no-referrer");
  const replay = await invoke(
    app,
    `/api/v1/google/callback?code=secret-code&state=${state}`,
    { cookie },
  );
  assert.ok(replay.headers.location.includes("google=failed"));
});
