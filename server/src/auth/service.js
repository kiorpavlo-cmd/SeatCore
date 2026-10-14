import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "../domain/errors.js";
import { verifyPin as verifyPasswordPin } from "../services/credentials.js";
import { ROLES, effectivePermissions } from "../../contracts/permissions.js";

const SESSION_DAYS = 7;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password) > 1024
  ) {
    throw new Error("Пароль должен содержать минимум 12 символов");
  }

  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");

  return `scrypt:${salt}:${digest}`;
}

export function verifyPassword(password, stored) {
  if (
    typeof password !== "string" ||
    typeof stored !== "string" ||
    Buffer.byteLength(password) > 1024
  )
    return false;

  const parts = stored.split(":");

  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[0-9a-f]{128}$/.test(parts[2])
  )
    return false;

  const actual = scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");

  return timingSafeEqual(actual, expected);
}

export class AuthService {
  constructor(db) {
    this.db = db;
    this.pinGrants = new Map();
    this.pinAttempts = new Map();
  }

  documents() {
    return Object.fromEntries(
      this.db
        .prepare(
          "SELECT name,value FROM documents WHERE name IN ('account','permissions')",
        )
        .all()
        .map((row) => [row.name, JSON.parse(row.value)]),
    );
  }

  userContext(userId) {
    const member = this.db
      .prepare(
        `SELECT u.id,u.email,m.role,m.restaurant_id AS restaurantId,l.staff_id AS staffId
      FROM auth_users u JOIN restaurant_memberships m ON m.user_id=u.id
      LEFT JOIN auth_staff_accounts l ON l.user_id=u.id AND l.restaurant_id=m.restaurant_id
      WHERE u.id=? ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END LIMIT 1`,
      )
      .get(userId);
    if (!member) return null;
    const documents = this.documents();
    const owner = member.role === "owner";
    const staff = documents.account?.users?.find(
      (row) => String(row.id) === member.staffId,
    );
    if (
      !owner &&
      (!staff || staff.login !== true || !ROLES.includes(staff.role))
    )
      return null;
    const permissions = effectivePermissions(
      staff,
      documents.permissions,
      owner,
    );
    return {
      ...member,
      role: owner ? "owner" : staff.role,
      name: owner ? "Владелец" : staff.name,
      permissions,
      taker: owner || staff.taker === true,
      server: owner || staff.server === true,
      requirePin: !owner && staff.pinTaker === true,
    };
  }

  describeEmployees(account) {
    const linked = new Map(
      this.db
        .prepare(
          "SELECT l.staff_id,u.password_hash FROM auth_staff_accounts l JOIN auth_users u ON u.id=l.user_id",
        )
        .all()
        .map((row) => [row.staff_id, Boolean(row.password_hash)]),
    );
    return {
      ...account,
      users: account.users.map((row) => ({
        ...row,
        hasPassword: linked.get(String(row.id)) === true,
      })),
    };
  }

  // Called inside the same transaction as the employee profile update.
  syncEmployees(account, previous, migration = false) {
    const owner = this.db
      .prepare(
        "SELECT user_id,restaurant_id FROM restaurant_memberships WHERE role='owner' LIMIT 1",
      )
      .get();
    if (!owner) return;
    const oldProfiles = new Map(
      previous.users.map((row) => [String(row.id), row]),
    );
    const links = new Map(
      this.db
        .prepare("SELECT * FROM auth_staff_accounts WHERE restaurant_id=?")
        .all(owner.restaurant_id)
        .map((row) => [row.staff_id, row]),
    );
    const nextIds = new Set(account.users.map((row) => String(row.id)));
    for (const [staffId, link] of links) {
      if (!nextIds.has(staffId))
        this.db.prepare("DELETE FROM auth_users WHERE id=?").run(link.user_id);
    }
    for (const staff of account.users) {
      const staffId = String(staff.id),
        old = oldProfiles.get(staffId),
        link = links.get(staffId);
      const password = staff.password;
      if (
        password != null &&
        (typeof password !== "string" ||
          (password &&
            (password.length < 12 || Buffer.byteLength(password) > 1024)))
      )
        throw new AppError(
          422,
          "INVALID_PASSWORD",
          "Пароль сотрудника должен содержать минимум 12 символов",
        );
      if (
        !ROLES.includes(staff.role) &&
        (!old || old.role !== staff.role || link)
      )
        throw new AppError(422, "INVALID_ROLE", "Выберите роль сотрудника");
      if (
        staff.login === true &&
        !link &&
        !password &&
        (!old || old.login !== true) &&
        !migration
      )
        throw new AppError(
          422,
          "PASSWORD_REQUIRED",
          "Задайте пароль для входа сотрудника",
        );
      if (!link && !password) continue; // Existing profiles need an explicit password to enable their account.
      if (staff.pinTaker === true && !staff.pin && !old?.pinHash)
        throw new AppError(
          422,
          "PIN_REQUIRED",
          "Задайте PIN перед включением проверки при бронировании",
        );
      const collision = this.db
        .prepare("SELECT id FROM auth_users WHERE email=?")
        .get(staff.email.trim().toLowerCase());
      if (collision && collision.id !== link?.user_id)
        throw new AppError(
          409,
          "EMAIL_IN_USE",
          "Этот email уже используется для входа. Укажите другой адрес сотрудника",
        );
      const now = new Date().toISOString();
      if (!link) {
        const userId = randomUUID();
        this.db
          .prepare(
            "INSERT INTO auth_users(id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(
            userId,
            staff.email.trim().toLowerCase(),
            hashPassword(password),
            now,
            now,
          );
        this.db
          .prepare(
            "INSERT INTO restaurant_memberships(user_id,restaurant_id,role,created_at) VALUES(?,?,?,?)",
          )
          .run(
            userId,
            owner.restaurant_id,
            staff.role.includes("менеджер") || staff.role === "Менеджер"
              ? "manager"
              : "host",
            now,
          );
        this.db
          .prepare("INSERT INTO auth_staff_accounts VALUES(?,?,?)")
          .run(staffId, userId, owner.restaurant_id);
      } else {
        this.db
          .prepare("UPDATE auth_users SET email=?,updated_at=? WHERE id=?")
          .run(staff.email.trim().toLowerCase(), now, link.user_id);
        if (password)
          this.db
            .prepare("UPDATE auth_users SET password_hash=? WHERE id=?")
            .run(hashPassword(password), link.user_id);
        if (
          password ||
          staff.login !== true ||
          old?.email !== staff.email ||
          old?.role !== staff.role ||
          old?.pinTaker !== staff.pinTaker ||
          staff.pin
        ) {
          this.db
            .prepare(
              "UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
            )
            .run(now, link.user_id);
          this.db
            .prepare("DELETE FROM auth_tokens WHERE user_id=?")
            .run(link.user_id);
        }
      }
    }
  }

  verifyEmployeePin(user, token, pin) {
    if (user.role === "owner") return true;
    const now = Date.now(),
      key = user.id;
    const attempts = this.pinAttempts.get(key);
    if (attempts?.until > now && attempts.count >= 5)
      throw new AppError(
        429,
        "PIN_RATE_LIMIT",
        "Слишком много попыток PIN. Повторите через 5 минут",
      );
    const staff = this.documents().account?.users?.find(
      (row) => String(row.id) === user.staffId,
    );
    if (!/^\d{4}$/.test(pin || "") || !verifyPasswordPin(pin, staff?.pinHash)) {
      this.pinAttempts.set(key, {
        count: (attempts?.until > now ? attempts.count : 0) + 1,
        until: attempts?.until > now ? attempts.until : now + 300000,
      });
      throw new AppError(403, "INVALID_PIN", "Неверный PIN сотрудника");
    }
    this.pinAttempts.delete(key);
    this.pinGrants.set(hash(token), now + 120000);
    return true;
  }

  ownerExists() {
    return Boolean(this.db.prepare("SELECT 1 FROM auth_users LIMIT 1").get());
  }

  createOwner(email, password) {
    email = String(email || "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
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

      this.db
        .prepare(
          `INSERT INTO auth_users
         (id,email,password_hash,created_at,updated_at)
         VALUES (?,?,?,?,?)`,
        )
        .run(id, email, passwordHash, now, now);

      this.db
        .prepare(
          `INSERT INTO restaurants (id,name,created_at)
         VALUES (?,?,?)`,
        )
        .run(restaurantId, "Мой ресторан", now);

      this.db
        .prepare(
          `INSERT INTO restaurant_memberships
         (user_id,restaurant_id,role,created_at)
         VALUES (?,?,?,?)`,
        )
        .run(id, restaurantId, "owner", now);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return { id, email, restaurantId, role: "owner" };
  }

  verifyCredentials(email, password) {
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254
    )
      return null;

    const user = this.db
      .prepare(
        `SELECT id,email,password_hash
       FROM auth_users WHERE email=?`,
      )
      .get(email.trim().toLowerCase());

    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      return null;
    }

    return this.userContext(user.id);
  }

  createSession(userId) {
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);

    this.db
      .prepare(
        `INSERT INTO auth_sessions
       (token_hash,user_id,created_at,expires_at)
       VALUES (?,?,?,?)`,
      )
      .run(hash(token), userId, now.toISOString(), expires.toISOString());

    return { token, expiresAt: expires.toISOString() };
  }

  getSession(token) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;

    const session = this.db
      .prepare(
        `SELECT u.id,u.email
       FROM auth_sessions s
       JOIN auth_users u ON u.id=s.user_id
       WHERE s.token_hash=?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?`,
      )
      .get(hash(token), new Date().toISOString());
    if (!session) return null;
    const user = this.userContext(session.id);
    return user
      ? {
          ...user,
          pinAuthorized: (this.pinGrants.get(hash(token)) || 0) > Date.now(),
        }
      : null;
  }

  requestPasswordReset(email) {
    if (typeof email !== "string" || email.length > 254) return null;

    const user = this.db
      .prepare("SELECT id,email FROM auth_users WHERE email=?")
      .get(email.trim().toLowerCase());

    if (!user || !this.userContext(user.id)) return null;

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `DELETE FROM auth_tokens
         WHERE user_id=? AND purpose='reset_password'`,
        )
        .run(user.id);

      this.db
        .prepare(
          `INSERT INTO auth_tokens
         (token_hash,user_id,purpose,expires_at)
         VALUES (?,?,'reset_password',?)`,
        )
        .run(hash(token), user.id, expiresAt);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    // Return only to trusted server-side email delivery code.
    return { email: user.email, token, expiresAt };
  }

  resetPassword(token, password) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))
      return false;

    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const record = this.db
        .prepare(
          `SELECT user_id FROM auth_tokens
         WHERE token_hash=?
           AND purpose='reset_password'
           AND consumed_at IS NULL
           AND expires_at > ?`,
        )
        .get(hash(token), now);

      if (!record) {
        this.db.exec("ROLLBACK");
        return false;
      }

      if (!this.userContext(record.user_id)) {
        this.db.exec("ROLLBACK");
        return false;
      }

      this.db
        .prepare(
          `UPDATE auth_users
         SET password_hash=?,updated_at=?
         WHERE id=?`,
        )
        .run(passwordHash, now, record.user_id);

      this.db
        .prepare(
          `UPDATE auth_tokens SET consumed_at=?
         WHERE token_hash=?`,
        )
        .run(now, hash(token));

      this.db
        .prepare(
          `UPDATE auth_sessions SET revoked_at=?
         WHERE user_id=? AND revoked_at IS NULL`,
        )
        .run(now, record.user_id);

      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  revokeSession(token) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))
      return false;

    const result = this.db
      .prepare(
        `UPDATE auth_sessions
       SET revoked_at=?
       WHERE token_hash=? AND revoked_at IS NULL`,
      )
      .run(new Date().toISOString(), hash(token));

    return result.changes > 0;
  }
}
