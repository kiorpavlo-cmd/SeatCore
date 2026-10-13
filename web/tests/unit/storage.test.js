import { describe, it, expect } from "vitest";
import { createStorage, STORAGE_KEYS } from "../../src/services/storage.js";
import { createStore, normalizeState } from "../../src/services/store.js";
import { normalizeFloor } from "../../src/services/repositories.js";
const backend = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
};
describe("Совместимость данных", () => {
  it("сохраняет исходный ключ и дополнительные поля", () => {
    const repo = createStorage(
      backend({
        [STORAGE_KEYS.app]: JSON.stringify({
          date: "2026-10-13",
          reservations: [{ id: 1, name: "Анна", fields: { allergy: "орехи" } }],
          customSetting: "value",
        }),
      }),
    );
    const store = createStore(repo);
    expect(store.state.reservations[0].fields.allergy).toBe("орехи");
    expect(store.state.customSetting).toBe("value");
    store.save();
    expect(repo.read(STORAGE_KEYS.app, {}).reservations).toHaveLength(1);
  });
  it("восстанавливает повреждённые коллекции", () => {
    const state = normalizeState({
      reservations: null,
      waitlist: 7,
      servers: {},
      search: 42,
      room: null,
      date: "invalid",
    });
    expect(state.reservations).toEqual([]);
    expect(state.waitlist).toEqual([]);
    expect(state.servers).toHaveLength(7);
    expect(state.search).toBe("");
  });
  it("не перезаписывает повреждённый JSON при чтении", () => {
    const raw = backend({ broken: "{oops" }),
      repo = createStorage(raw);
    expect(repo.read("broken", [])).toEqual([]);
    expect(raw.getItem("broken")).toBe("{oops");
  });
  it("возвращает ошибку записи вместо ложного успеха", () => {
    const errors = [];
    const repo = createStorage(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceeded");
        },
      },
      (e) => errors.push(e),
    );
    expect(repo.write("a", {})).toBe(false);
    expect(errors).toHaveLength(1);
  });
  it("сохраняет дополнительные залы", () => {
    const value = normalizeFloor(
      { main: [[1, 0, 0]], private: [[2, 100, 100]] },
      { main: [], terrace: [] },
    );
    expect(value.private).toHaveLength(1);
    expect(value.terrace).toEqual([]);
  });
  it("восстанавливает некорректный план, не падает на null", () =>
    expect(
      normalizeFloor(
        { main: null, terrace: [null, [1, "x", 0]] },
        { main: [[1, 0, 0]], terrace: [] },
      ),
    ).toEqual({ main: [[1, 0, 0]], terrace: [] }));
  it("уведомляет подписчика и позволяет отписаться", () => {
    const store = createStore(createStorage(backend()));
    let count = 0;
    const off = store.subscribe(() => count++);
    store.save();
    off();
    store.save();
    expect(count).toBe(1);
  });
});
