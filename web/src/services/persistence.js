import { storage, usePersistence, localStorageRepository } from "./storage.js";
import { createApi } from "./api.js";
import { createServerStorage } from "./server-storage.js";
import { seedDemoData } from "../config/demo-data.js";
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
  if (import.meta.env?.VITE_DEMO_MODE === "true") {
    seedDemoData(localStorageRepository);
    const demoRepository = {
      ...localStorageRepository,
      persistence: {
        mode: "local",
        status: "local",
        access: { role: "owner", permissions: {} },
        message:
          "Демо: изменения хранятся только в этом браузере. Бронирования не отправляются ресторану.",
      },
    };
    usePersistence(demoRepository);
    announce(demoRepository.persistence);
    return demoRepository.persistence;
  }
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
    const message =
      "Локальный сервер недоступен. Запустите Mio из папки проекта и нажмите здесь для повторного подключения. Сохранение приостановлено: данные хранятся в server/data/mio.sqlite.";
    usePersistence(
      disconnectedStorage(
        localStorageRepository,
        message,
        (issue) =>
          document.dispatchEvent(
            new CustomEvent("storage:error", { detail: issue }),
          ),
        () => location.reload(),
      ),
    );
    announce(storage.persistence);
  }
  return storage.persistence;
}
