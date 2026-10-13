import { initial } from "../config/defaults.js";
import { storage, STORAGE_KEYS } from "./storage.js";
export function normalizeState(value = {}, accountUsers = null) {
  const next = {
    ...structuredClone(initial),
    ...(value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {}),
  };
  for (const key of ["reservations", "waitlist", "servers"])
    if (!Array.isArray(next[key])) next[key] = structuredClone(initial[key]);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(next.date) ||
    Number.isNaN(Date.parse(next.date))
  )
    next.date = initial.date;
  if (typeof next.room !== "string" || !next.room) next.room = "main";
  next.rooms = { ...initial.rooms, ...next.rooms };
  if (!["reservations", "waitlist", "servers"].includes(next.tab))
    next.tab = "reservations";
  for (const key of ["reservations", "waitlist"])
    next[key] = next[key]
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        ...x,
        name: String(x.name || ""),
        guests: Number(x.guests) || 1,
      }));
  next.servers = next.servers
    .filter((x) => x && typeof x === "object")
    .map((x) => ({ ...x, name: String(x.name || "") }));
  if (Array.isArray(accountUsers)) {
    const existing = next.servers;

    next.servers = accountUsers
      .filter((user) =>
        user &&
        user.id != null &&
        user.server === true &&
        String(user.name || "").trim()
      )
      .map((user, index) => {
        const previous = existing.find(
          (entry) => String(entry.id) === String(user.id)
        );

        return {
          id: user.id,
          name: String(user.name).trim(),
          color: previous?.color ||
            ["#2d495a", "#36d4cb", "#9cce64",
             "#d39cde", "#fc8052"][index % 5],
          on: previous?.on ?? true,
          tables: Array.isArray(previous?.tables)
            ? previous.tables
            : [],
        };
      });
  }

  if (typeof next.search !== "string") next.search = "";
  return next;
}
export function createStore(repository = storage) {
  const state = normalizeState(
    repository.read(STORAGE_KEYS.app, {}),
    repository.read(STORAGE_KEYS.account, {}).users || []
  );
  const listeners = new Set();
  return {
    state,
    save() {
      if (!repository.write(STORAGE_KEYS.app, state)) return false;
      listeners.forEach((fn) => fn(state));
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reload() {
      Object.assign(
        state,
        normalizeState(
          repository.read(STORAGE_KEYS.app, {}),
          repository.read(STORAGE_KEYS.account, {}).users || []
        ),
      );
      listeners.forEach((fn) => fn(state));
    },
  };
}
