import { storage, usePersistence, localStorageRepository } from "./storage.js";
import { createApi } from "./api.js";
import { createServerStorage } from "./server-storage.js";
export function disconnectedStorage(local, message, report, retry) {
  return {
    ...local,
    persistence: { mode: "server", status: "error", message },
    setItem() {
      report(new Error(message));
      return false;
    },
    write() {
      report(new Error(message));
      return false;
    },
    retry,
  };
}
export async function initializePersistence() {
  const announce = (detail) =>
    document.dispatchEvent(new CustomEvent("persistence:status", { detail }));
  try {
    const repository = await createServerStorage({
      api: createApi(),
      local: localStorageRepository,
      onStatus: announce,
      onUpdate: (detail) =>
        document.dispatchEvent(
          new CustomEvent("persistence:update", { detail }),
        ),
    });
    usePersistence(repository);
  } catch {
    const message = "Локальный сервер недоступен. Запустите Mio из папки проекта и нажмите здесь для повторного подключения. Сохранение приостановлено: данные хранятся в server/data/mio.sqlite.";
    usePersistence(
      disconnectedStorage(
        localStorageRepository,
        message,
        (issue) => document.dispatchEvent(
          new CustomEvent("storage:error", { detail: issue }),
        ),
        () => location.reload(),
      ),
    );
    announce(storage.persistence);
  }
  return storage.persistence;
}
