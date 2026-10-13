import { storage, usePersistence, localStorageRepository } from "./storage.js";
import { createApi } from "./api.js";
import { createServerStorage, SERVER_MARKER } from "./server-storage.js";
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
  } catch (error) {
    if (localStorageRepository.getItem(SERVER_MARKER)) {
      const message =
        "Сервер недоступен. Запустите сервер и нажмите здесь для повторного подключения. Сохранение приостановлено.";
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
    } else if (
      !["NOT_FOUND", "NETWORK_ERROR", "INVALID_RESPONSE"].includes(error.code)
    ) {
      localStorageRepository.persistence = {
        mode: "local",
        status: "error",
        message:
          "Перенос на сервер не выполнен: " +
          error.message +
          ". Исходные данные остаются в браузере.",
      };
    }
    announce(storage.persistence);
  }
  return storage.persistence;
}
