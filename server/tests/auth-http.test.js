import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/auth/service.js";

test("HTTP login, me и logout", async () => {
  const seed = JSON.parse(readFileSync(
    new URL("../config/seed.json", import.meta.url),
    "utf8"
  ));

  const app = createApp({
    database: ":memory:",
    seed
  });

  try {
    const auth = new AuthService(app.store.db);
    auth.createOwner(
      "owner@example.com",
      "StrongPassword-2026!"
    );

    await new Promise(resolve =>
      app.server.listen(0, "127.0.0.1", resolve)
    );

    const base = `http://127.0.0.1:${app.server.address().port}`;

    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": base
      },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "StrongPassword-2026!"
      })
    });

    assert.equal(login.status, 200);

    const anonymous = await fetch(base + "/api/v1/state");
    assert.equal(anonymous.status, 401);

    const cookie = login.headers
      .get("set-cookie").split(";")[0];

    assert.match(cookie, /^mio_session=/);

    const me = await fetch(base + "/api/auth/me", {
      headers: { Cookie: cookie }
    });

    assert.equal(me.status, 200);
    assert.equal(
      (await me.json()).user.email,
      "owner@example.com"
    );

    const logout = await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: base
      }
    });

    assert.equal(logout.status, 200);

    const after = await fetch(base + "/api/auth/me", {
      headers: { Cookie: cookie }
    });

    assert.equal(after.status, 401);

    const privateState = await fetch(base + "/api/v1/state", {
      headers: { Cookie: cookie }
    });
    assert.equal(privateState.status, 401);

    const privateReservations = await fetch(
      base + "/api/v1/reservations",
      { headers: { Cookie: cookie } }
    );
    assert.equal(privateReservations.status, 401);

    const anonymousReservations = await fetch(
      base + "/api/v1/reservations"
    );
    assert.equal(anonymousReservations.status, 401);

    const invalid = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": base
      },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "incorrect"
      })
    });

    assert.equal(invalid.status, 401);
  } finally {
    await app.close();
  }
});
