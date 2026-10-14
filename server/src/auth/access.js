import { AppError } from "../domain/errors.js";
import {
  PERMISSION_IDS,
  effectivePermissions,
} from "../../contracts/permissions.js";
import { publicAccount } from "../services/credentials.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutCredentials = (user) => {
  const {
    pin,
    pinHash,
    password,
    passwordHash,
    password_hash,
    hasPassword,
    ...profile
  } = user;
  return profile;
};
function differences(before = [], after = []) {
  const old = new Map(before.map((row) => [String(row.id), row]));
  const next = new Map(after.map((row) => [String(row.id), row]));
  return {
    added: after.filter((row) => !old.has(String(row.id))),
    edited: after.filter(
      (row) => old.has(String(row.id)) && !same(old.get(String(row.id)), row),
    ),
    removed: before.filter((row) => !next.has(String(row.id))),
    old,
  };
}
const servingStatuses = new Set([
  "Прибыл",
  "Частично прибыл",
  "Частично посажены",
  "За столом",
  "Закуска",
  "Основное блюдо",
  "Десерт",
  "Счёт выдан",
  "Уборка требуется",
  "Уборка выполняется",
  "Завершено",
]);
const resourcePermissions = {
  templates: "message_templates",
  automations: "crm_messages",
  campaigns: "crm_messages",
  segments: "segments",
  shifts: "shifts",
  surveys: "crm_messages",
  reviews: "manage_crm",
  "review-settings": "manage_crm",
  widgetConfigs: "admin",
  seating: "shifts",
  groups: "shifts",
  discounts: "admin",
};

export class AccessService {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
  }
  context(actor) {
    if (!actor) return null;
    const current = this.auth.userContext(actor.id);
    if (!current)
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Доступ сотрудника отключён. Войдите снова",
      );
    return { ...current, pinAuthorized: actor.pinAuthorized };
  }
  require(actor, permission) {
    const current = this.context(actor);
    if (
      !current ||
      (current.role !== "owner" && current.permissions[permission] !== true)
    )
      throw new AppError(
        403,
        "FORBIDDEN",
        "Недостаточно прав для этого действия",
        { permission },
      );
    return current;
  }
  readCollection(actor, collection) {
    if (!actor && !this.auth.ownerExists()) return;
    if (["guests", "tags", "tag-categories"].includes(collection)) {
      const user = this.context(actor);
      if (!user?.permissions.manage_guests && !user?.permissions.manage_crm)
        this.require(actor, "manage_guests");
    }
    if (collection === "custom-fields") this.require(actor, "admin");
  }
  snapshot(snapshot, actor) {
    if (!actor && !this.auth.ownerExists()) return snapshot;
    const user = this.context(actor);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Требуется вход в Mio!");
    const result = structuredClone(snapshot),
      c = result.collections;
    result.access = user;
    if (user.role === "owner") return result;
    if (!user.permissions.restaurant_users)
      c.account.users = c.account.users.map(({ id, name, taker, server }) => ({
        id,
        name,
        taker,
        server,
      }));
    if (!user.permissions.manage_permissions) c.permissions = {};
    if (!user.permissions.manage_guests && !user.permissions.manage_crm)
      c.guests = { guests: [], tags: [], categories: [] };
    for (const name of Object.keys(c.resources)) {
      if (name === "bookingNotificationReads") continue;
      const permission =
        name === "audit"
          ? "advanced_reports"
          : resourcePermissions[name] || "admin";
      if (!user.permissions[permission]) delete c.resources[name];
    }
    return result;
  }
  changes(current, projected, actor, migration = false) {
    if (!actor && !this.auth.ownerExists()) return;
    const user = this.context(actor);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Требуется вход в Mio!");
    if (migration) this.require(actor, "admin");
    if (user.role === "owner") return;
    const need = (permission) => this.require(user, permission);
    if (
      projected.permissions &&
      !same(current.permissions, projected.permissions)
    )
      need("manage_permissions");
    if (projected.account) {
      const before = current.account,
        after = projected.account;
      if (!same(before.profile, after.profile)) need("admin");
      const credentials = after.users?.some((row) => row.password || row.pin);
      if (
        credentials ||
        !same(
          before.users.map(withoutCredentials),
          after.users.map(withoutCredentials),
        )
      ) {
        need("restaurant_users");
        // A user administrator cannot grant privileges they do not possess.
        const old = new Map(before.users.map((row) => [String(row.id), row]));
        for (const row of after.users) {
          if (same(old.get(String(row.id)), row)) continue;
          const powers = effectivePermissions(row, current.permissions);
          for (const id of PERMISSION_IDS) {
            if (
              [
                "disable_reservation_deletion",
                "reservation_taker",
                "reservation_editor",
              ].includes(id)
            )
              continue;
            if (powers[id] && !user.permissions[id]) need(id);
          }
        }
      }
    }
    if (projected.app) {
      for (const [key, permission] of [
        ["rooms", "admin"],
        ["servers", "restaurant_users"],
      ])
        if (
          Object.hasOwn(projected.app, key) &&
          !same(current.app[key], projected.app[key])
        )
          need(permission);
      for (const bucket of ["reservations", "waitlist"]) {
        if (!Object.hasOwn(projected.app, bucket)) continue;
        const diff = differences(current.app[bucket], projected.app[bucket]);
        if (!diff.added.length && !diff.edited.length && !diff.removed.length)
          continue;
        need("manage_reservations");
        const servingOnly =
          !diff.added.length &&
          !diff.removed.length &&
          diff.edited.every((row) => {
            const prior = diff.old.get(String(row.id));
            return (
              servingStatuses.has(row.status) &&
              same({ ...prior, status: row.status }, row)
            );
          });
        if (!user.taker && !(user.server && servingOnly))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Сотруднику не разрешён приём или изменение бронирований",
          );
        if (
          diff.removed.length &&
          user.permissions.disable_reservation_deletion
        )
          throw new AppError(
            403,
            "FORBIDDEN",
            "Для сотрудника запрещено удаление бронирований",
          );
        if (diff.added.length > 1) need("import");
        if (user.requirePin && !user.pinAuthorized)
          throw new AppError(
            403,
            "PIN_REQUIRED",
            "Подтвердите действие PIN-кодом сотрудника",
          );
        for (const row of [...diff.added, ...diff.edited]) {
          row.employee = user.name || user.email;
          row.employeeId = user.staffId;
          row.updatedBy = user.id;
          if (diff.added.includes(row)) row.createdBy = user.id;
        }
      }
    }
    if (projected.guests) {
      const diff = differences(current.guests.guests, projected.guests.guests);
      if (diff.added.length || diff.edited.length) need("manage_guests");
      if (diff.added.length > 1) need("import");
      if (diff.removed.length) need("delete_profiles");
      if (diff.removed.length && diff.edited.length) need("merge_guests");
      if (
        diff.edited.filter(
          (row) => !same(diff.old.get(String(row.id))?.tagIds, row.tagIds),
        ).length > 1
      )
        need("crm_tagging");
      for (const key of ["tags", "categories"])
        if (!same(current.guests[key], projected.guests[key])) need("tags");
    }
    for (const [name, permission] of [
      ["floor", "admin"],
      ["backgrounds", "admin"],
      ["fields", "admin"],
      ["blocked", "closing_period"],
      ["blocks", "closing_period"],
      ["notes", "day_notes"],
    ])
      if (
        Object.hasOwn(projected, name) &&
        !same(current[name], projected[name])
      )
        need(permission);
    if (projected.resources)
      for (const key of new Set([
        ...Object.keys(current.resources),
        ...Object.keys(projected.resources),
      ])) {
        if (
          key === "audit" ||
          key === "bookingNotificationReads" ||
          same(current.resources[key], projected.resources[key])
        )
          continue;
        need(resourcePermissions[key] || "admin");
      }
  }
}
