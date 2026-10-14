import { storage, STORAGE_KEYS } from "./storage.js";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const records = (value) =>
  Array.isArray(value)
    ? value.filter((x) => x && typeof x === "object" && !Array.isArray(x))
    : [];
export function readGuests() {
  const data = object(storage.read(STORAGE_KEYS.guests, {}));
  return {
    ...data,
    guests: records(data.guests),
    tags: records(data.tags),
    categories: records(data.categories),
  };
}
export function readAccount(defaults) {
  const data = object(storage.read(STORAGE_KEYS.account, {}));
  return {
    ...data,
    profile: { ...defaults.profile, ...object(data.profile) },
    users: records(data.users),
  };
}
export function readFields() {
  return records(storage.read(STORAGE_KEYS.fields, [])).filter(
    (x) => typeof x.variable === "string" && typeof x.scope === "string",
  );
}
export function normalizeFloor(value, fallback) {
  const source = object(value),
    result = {};
  const rooms = Object.keys(source).length ? source : fallback;
  for (const [room, tables] of Object.entries(rooms)) {
    result[room] = Array.isArray(tables)
      ? tables.filter(
          (row) =>
            Array.isArray(row) &&
            row[0] != null &&
            Number.isFinite(row[1]) &&
            Number.isFinite(row[2]) &&
            (!row[3] || ["side", "long", "wide", "round"].includes(row[3])),
        )
      : structuredClone(fallback[room] || []);
  }
  return result;
}

export function readResources() {
  const data = object(storage.read(STORAGE_KEYS.resources, {}));
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, records(value)]),
  );
}
