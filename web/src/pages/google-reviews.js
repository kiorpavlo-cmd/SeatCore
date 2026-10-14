import { mountGoogleReviews } from "../features/google/panel.js";
import { createApi } from "../services/api.js";
import { escapeHTML as esc } from "../lib/dom.js";

export function createPage(app) {
  let node,
    alive = false,
    cleanup;
  async function mount() {
    alive = true;
    document.querySelector(".content").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    node = document.createElement("section");
    node.id = "google-reviews-page";
    node.innerHTML = `<header class="page-titlebar">Онлайн-отзывы</header><div class="google-reviews-scroll"><div class="page-heading"><h1>Отзывы Google</h1><button class="outline-green" data-open-google>Настроить Google</button></div><div class="google-page-body" aria-live="polite">Загружаем…</div></div>`;
    document.querySelector(".workspace").append(node);
    node.querySelector("[data-open-google]").onclick = () =>
      app.navigate("integrations/Сервисы");
    try {
      const status = await createApi().request("/v1/google/status");
      if (!alive) return;
      const body = node.querySelector(".google-page-body");
      if (!status.connected || !status.selected) {
        body.innerHTML = `<div class="google-empty"><h2>${status.connected ? "Выберите заведение" : "Подключите Google"}</h2><p>В разделе «Сервисы» подключите Google и выберите профиль ресторана. После этого здесь появятся его отзывы.</p></div>`;
        return;
      }
      cleanup = mountGoogleReviews(body, { heading: false });
    } catch (error) {
      if (alive)
        node.querySelector(".google-page-body").innerHTML =
          `<p class="google-error" role="alert">${esc(error.message)}</p>`;
    }
  }
  function unmount() {
    alive = false;
    cleanup?.();
    cleanup = null;
    node?.remove();
  }
  return { mount, unmount };
}
