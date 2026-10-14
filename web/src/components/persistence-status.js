import { toast } from "./toast.js";
export function installPersistenceStatus(storage) {
  const button = document.querySelector('.top-actions [title="Связь"]');
  function paint(state = storage.persistence) {
    button.classList.add("persistence-status");
    button.dataset.status = state.status;
    button.hidden = state.status !== "error";
    button.textContent =
      state.mode === "local"
        ? state.status === "error"
          ? "Данные не перенесены"
          : "Данные в браузере"
        : state.status === "saving"
          ? "Сохраняем…"
          : state.status === "error"
            ? "Ошибка сохранения"
            : "Сохранено";
    button.setAttribute("aria-label", state.message || "Данные в браузере");
    button.onclick = () => {
      if (state.status === "error" && state.mode === "server") storage.retry();
      else toast(state.message || "Данные сохраняются в браузере");
    };
  }
  document.addEventListener("persistence:status", (event) => {
    paint(event.detail);
    if (event.detail.status === "error") toast(event.detail.message);
  });
  paint();
  if (storage.persistence.status === "error")
    toast(storage.persistence.message);
}
