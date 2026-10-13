import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const SESSION_DAYS = 7;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password) {
  if (typeof password !== "string" ||
      password.length < 12 ||
      Buffer.byteLength(password) > 1024) {
    throw new Error("Пароль должен содержать минимум 12 символов");
  }

  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");

  return `scrypt:${salt}:${digest}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" ||
      typeof stored !== "string" ||
      Buffer.byteLength(password) > 1024) return false;

  const parts = stored.split(":");

  if (parts.length !== 3 ||
      parts[0] !== "scrypt" ||
      !/^[0-9a-f]{32}$/.test(parts[1]) ||
      !/^[0-9a-f]{128}$/.test(parts[2])) return false;

  const actual = scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");

  return timingSafeEqual(actual, expected);
}

export class AuthService {
  constructor(db) {
    this.db = db;
  }

  ownerExists() {
    return Boolean(this.db.prepare(
      "SELECT 1 FROM auth_users LIMIT 1"
    ).get());
  }

  createOwner(email, password) {
    email = String(email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254) {
      throw new Error("Некорректный email");
    }

    if (this.ownerExists()) {
      throw new Error("Первый владелец уже создан");
    }

    const passwordHash = hashPassword(password);
    const id = randomUUID();
    const restaurantId = randomUUID();
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");

    try {
      if (this.ownerExists()) {
        throw new Error("Первый владелец уже создан");
      }

      this.db.prepare(
        `INSERT INTO auth_users
         (id,email,password_hash,created_at,updated_at)
         VALUES (?,?,?,?,?)`
      ).run(id, email, passwordHash, now, now);

      this.db.prepare(
        `INSERT INTO restaurants (id,name,created_at)
         VALUES (?,?,?)`
      ).run(restaurantId, "Мой ресторан", now);

      this.db.prepare(
        `INSERT INTO restaurant_memberships
         (user_id,restaurant_id,role,created_at)
         VALUES (?,?,?,?)`
      ).run(id, restaurantId, "owner", now);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return { id, email, restaurantId, role: "owner" };
  }

  verifyCredentials(email, password) {
    if (typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254) return null;

    const user = this.db.prepare(
      `SELECT id,email,password_hash
       FROM auth_users WHERE email=?`
    ).get(email.trim().toLowerCase());

    if (!user?.password_hash ||
        !verifyPassword(password, user.password_hash)) {
      return null;
    }

    return { id: user.id, email: user.email };
  }

  createSession(userId) {
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(
      now.getTime() + SESSION_DAYS * 86400000
    );

    this.db.prepare(
      `INSERT INTO auth_sessions
       (token_hash,user_id,created_at,expires_at)
       VALUES (?,?,?,?)`
    ).run(
      hash(token),
      userId,
      now.toISOString(),
      expires.toISOString()
    );

    return { token, expiresAt: expires.toISOString() };
  }

  getSession(token) {
    if (typeof token !== "string" ||
        !/^[0-9a-f]{64}$/.test(token)) return null;

    return this.db.prepare(
      `SELECT u.id,u.email
       FROM auth_sessions s
       JOIN auth_users u ON u.id=s.user_id
       WHERE s.token_hash=?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?`
    ).get(hash(token), new Date().toISOString()) || null;
  }

  revokeSession(token) {
    if (typeof token !== "string" ||
        !/^[0-9a-f]{64}$/.test(token)) return false;

    const result = this.db.prepare(
      `UPDATE auth_sessions
       SET revoked_at=?
       WHERE token_hash=? AND revoked_at IS NULL`
    ).run(new Date().toISOString(), hash(token));

    return result.changes > 0;
  }
}
