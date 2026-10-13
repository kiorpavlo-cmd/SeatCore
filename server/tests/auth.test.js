import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

import {
  AuthService,
  hashPassword,
  verifyPassword
} from "../src/auth/service.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync(
    new URL("../src/database/schema.sql", import.meta.url),
    "utf8"
  ));
  return { db, auth: new AuthService(db) };
}

test("Пароли хранятся в виде хеша", () => {
  const encoded = hashPassword("StrongPassword-2026!");
  assert.ok(!encoded.includes("StrongPassword-2026!"));
  assert.equal(verifyPassword("StrongPassword-2026!", encoded), true);
  assert.equal(verifyPassword("WrongPassword", encoded), false);
});

test("Создание первого владельца", () => {
  const { db, auth } = setup();

  const user = auth.createOwner(
    "owner@example.com",
    "StrongPassword-2026!"
  );

  assert.equal(user.role, "owner");
  assert.equal(auth.ownerExists(), true);
  assert.equal(
    auth.verifyCredentials(
      "owner@example.com",
      "StrongPassword-2026!"
    )?.id,
    user.id
  );

  assert.throws(() => auth.createOwner(
    "another@example.com",
    "AnotherPassword-2026!"
  ));

  db.close();
});

test("Сессия создаётся и отзывается", () => {
  const { db, auth } = setup();

  const user = auth.createOwner(
    "owner@example.com",
    "StrongPassword-2026!"
  );

  const session = auth.createSession(user.id);

  assert.equal(auth.getSession(session.token)?.id, user.id);
  assert.equal(auth.revokeSession(session.token), true);
  assert.equal(auth.getSession(session.token), null);

  db.close();
});

test("Некорректные данные отклоняются", () => {
  const { db, auth } = setup();

  assert.throws(() => auth.createOwner(
    "invalid-email",
    "StrongPassword-2026!"
  ));

  assert.equal(auth.getSession("invalid"), null);
  assert.equal(auth.verifyCredentials("x@y.com", "wrong"), null);
  assert.throws(() => hashPassword("short"));

  db.close();
});
