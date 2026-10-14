import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AuthService } from "../src/auth/service.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync(
    new URL("../src/database/schema.sql", import.meta.url),
    "utf8"
  ));

  const auth = new AuthService(db);
  const owner = auth.createOwner(
    "owner@example.com",
    "OriginalPassword-2026!"
  );

  return { db, auth, owner };
}

test("Unknown email does not get a token", () => {
  const { db, auth } = fixture();
  assert.equal(
    auth.requestPasswordReset("unknown@example.com"),
    null
  );
  db.close();
});

test("Password reset is one-time and revokes sessions", () => {
  const { db, auth, owner } = fixture();

  const session = auth.createSession(owner.id);
  const reset = auth.requestPasswordReset(
    "owner@example.com"
  );

  assert.ok(reset?.token);
  assert.equal(reset.token.length, 64);

  assert.equal(auth.resetPassword(
    reset.token,
    "NewSecurePassword-2026!"
  ), true);

  assert.equal(auth.getSession(session.token), null);

  assert.equal(auth.verifyCredentials(
    "owner@example.com",
    "OriginalPassword-2026!"
  ), null);

  assert.ok(auth.verifyCredentials(
    "owner@example.com",
    "NewSecurePassword-2026!"
  ));

  assert.equal(auth.resetPassword(
    reset.token,
    "AnotherPassword-2026!"
  ), false);

  db.close();
});

test("Expired and invalid reset tokens are rejected", () => {
  const { db, auth } = fixture();
  const reset = auth.requestPasswordReset(
    "owner@example.com"
  );

  db.prepare(
    "UPDATE auth_tokens SET expires_at=? WHERE token_hash=?"
  ).run(
    "2000-01-01T00:00:00.000Z",
    createHash("sha256")
      .update(reset.token)
      .digest("hex")
  );

  assert.equal(auth.resetPassword(
    reset.token,
    "NewSecurePassword-2026!"
  ), false);

  assert.equal(auth.resetPassword(
    "invalid",
    "NewSecurePassword-2026!"
  ), false);

  db.close();
});

test("New reset link invalidates previous reset link", () => {
  const { db, auth } = fixture();

  const first = auth.requestPasswordReset(
    "owner@example.com"
  );
  const second = auth.requestPasswordReset(
    "owner@example.com"
  );

  assert.notEqual(first.token, second.token);

  assert.equal(auth.resetPassword(
    first.token,
    "NewSecurePassword-2026!"
  ), false);

  assert.equal(auth.resetPassword(
    second.token,
    "NewSecurePassword-2026!"
  ), true);

  db.close();
});
