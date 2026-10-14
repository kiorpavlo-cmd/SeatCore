/** Backwards-compatible persistence. Invalid records are retained for recovery. */
import { STORAGE_KEYS } from "../../../server/contracts/storage.js";
export { STORAGE_KEYS } from "../../../server/contracts/storage.js";
export function createStorage(backend, report = () => {}) {
  return {
    getItem(key) {
      try {
        return backend.getItem(key);
      } catch (error) {
        report(error);
        return null;
      }
    },
    setItem(key, value) {
      try {
        backend.setItem(key, value);
        return true;
      } catch (error) {
        report(error);
        return false;
      }
    },
    read(key, fallback) {
      try {
        const raw = backend.getItem(key);
        return raw === null
          ? structuredClone(fallback)
          : (JSON.parse(raw) ?? structuredClone(fallback));
      } catch (error) {
        report(error);
        return structuredClone(fallback);
      }
    },
    write(key, value) {
      return this.setItem(key, JSON.stringify(value));
    },
    export() {
      return Object.fromEntries(
        Object.values(STORAGE_KEYS).map((key) => [key, this.getItem(key)]),
      );
    },
  };
}
let backend;
try {
  backend = globalThis.localStorage;
} catch {}
const localRepository = createStorage(
  backend ?? {
    getItem: () => null,
    setItem: () => {
      throw new Error("Хранилище недоступно");
    },
  },
  (error) => {
    if (typeof document !== "undefined")
      document.dispatchEvent(
        new CustomEvent("storage:error", { detail: error }),
      );
  },
);

let activeRepository = localRepository;
export function usePersistence(repository) {
  activeRepository = repository;
}
export const localStorageRepository = localRepository;
export const storage = {
  getItem: (...args) => activeRepository.getItem(...args),
  setItem: (...args) => activeRepository.setItem(...args),
  read: (...args) => activeRepository.read(...args),
  write: (...args) => activeRepository.write(...args),
  export: () => activeRepository.export(),
  get persistence() {
    return activeRepository.persistence || { mode: "local", status: "local" };
  },
  flush: () => activeRepository.flush?.() || Promise.resolve(),
  retry: () => activeRepository.retry?.(),
  sync: () => activeRepository.sync?.(),
  legacyBackup: () => activeRepository.legacyBackup?.(),
  unsavedBackup: () => activeRepository.unsavedBackup?.(),
};
