import { escapeHTML as esc } from "../../lib/dom.js";
import { createApi } from "../../services/api.js";

const defaultRequest = () =>
  createApi(globalThis.fetch, "/api", { timeoutMs: 30000 }).request;
const safeLink = (value) => {
  try {
    return new URL(value).protocol === "https:" ? value : "";
  } catch {
    return "";
  }
};
export const googleStatusLabel = (status) =>
  !status.configured
    ? "Требуется настройка"
    : !status.connected
      ? "Не подключено"
      : status.selected
        ? "Заведение подключено"
        : "Выберите заведение";

export function mountGoogleReviews(
  root,
  { request = defaultRequest(), heading = true } = {},
) {
  let alive = true,
    busy = false,
    pageToken = "",
    rows = [],
    loaded = false;
  let averageRating = null,
    totalReviewCount = 0;
  const ratings = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  root.innerHTML = `<div class="google-reviews-head">${heading ? "<h3>Отзывы Google</h3>" : ""}<button type="button" class="outline-green" data-google-refresh>Обновить отзывы</button></div><p class="google-review-summary" aria-live="polite"></p><p class="google-error" role="alert"></p><div class="google-reviews-list"></div><button type="button" class="outline-green" data-google-more hidden>Загрузить ещё</button>`;
  const refresh = root.querySelector("[data-google-refresh]");
  const more = root.querySelector("[data-google-more]");
  const error = root.querySelector(".google-error");
  const list = root.querySelector(".google-reviews-list");
  const summary = root.querySelector(".google-review-summary");
  function render() {
    summary.textContent = `Всего отзывов: ${totalReviewCount}${averageRating != null ? ` · Средняя оценка: ${averageRating}` : ""} · Источник: Google`;
    list.innerHTML =
      rows
        .map((row) => {
          const rating = ratings[row.starRating];
          const date = new Date(row.updateTime || row.createTime);
          return `<article class="google-review"><div class="google-review-heading"><strong>${esc(row.reviewer?.displayName || "Анонимный автор")}</strong><span aria-label="${rating ? `${rating} из 5` : "Нет оценки"}">${rating ? "★".repeat(rating) + "☆".repeat(5 - rating) : "—"}</span></div><small>${Number.isNaN(date.getTime()) ? "" : esc(date.toLocaleDateString("ru-RU"))}</small><p>${esc(row.comment || "Отзыв без текста")}</p>${row.reviewReply?.comment ? `<div class="google-review-reply"><strong>Ответ ресторана</strong><p>${esc(row.reviewReply.comment)}</p></div>` : ""}</article>`;
        })
        .join("") ||
      '<p class="google-muted">У заведения пока нет отзывов Google.</p>';
    more.hidden = !pageToken;
  }
  async function load(append = false) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    more.disabled = true;
    error.textContent = "";
    if (!loaded) summary.textContent = "Загружаем отзывы из Google…";
    try {
      const data = await request(
        "/v1/google/reviews" +
          (append && pageToken
            ? "?pageToken=" + encodeURIComponent(pageToken)
            : ""),
      );
      if (!alive) return;
      if (data.reviews != null && !Array.isArray(data.reviews))
        throw new Error("Не удалось прочитать отзывы Google");
      const combined = append
        ? [...rows, ...(data.reviews || [])]
        : data.reviews || [];
      rows = [
        ...new Map(
          combined.map((row, index) => [
            row.reviewId || row.name || String(index),
            row,
          ]),
        ).values(),
      ];
      pageToken = data.nextPageToken || "";
      if (!append) {
        averageRating = data.averageRating ?? null;
        totalReviewCount = data.totalReviewCount ?? rows.length;
      }
      loaded = true;
      render();
    } catch (issue) {
      if (alive) {
        error.textContent = issue.message;
        if (!loaded) summary.textContent = "Отзывы не загружены";
      }
    } finally {
      busy = false;
      if (alive) {
        refresh.disabled = false;
        more.disabled = false;
      }
    }
  }
  refresh.onclick = () => load();
  more.onclick = () => load(true);
  load();
  return () => {
    alive = false;
  };
}

export function mountGoogleConnection(
  root,
  { onStatus = () => {}, request = defaultRequest() } = {},
) {
  let alive = true,
    generation = 0,
    accounts = [],
    locations = [],
    status;
  let accountPage = "",
    locationPage = "",
    cleanupReviews = null;
  root.innerHTML = `<div class="google-connection"><p class="google-connection-status" role="status">Проверяем подключение Google…</p><p class="google-error" role="alert"></p><div class="google-connection-body"></div></div>`;
  const message = root.querySelector(".google-connection-status");
  const error = root.querySelector(".google-error");
  const body = root.querySelector(".google-connection-body");
  async function perform(callback) {
    error.textContent = "";
    try {
      await callback();
    } catch (issue) {
      if (alive) error.textContent = issue.message;
    }
  }
  async function refreshStatus() {
    status = await request("/v1/google/status");
    if (!alive) return;
    onStatus(status);
    render();
    if (status.connected && status.configured) {
      await loadAccounts();
      if (status.selected) await loadSelected();
    }
  }
  function render() {
    cleanupReviews?.();
    cleanupReviews = null;
    message.textContent = googleStatusLabel(status);
    if (!status.configured) {
      body.innerHTML = `<p>Для подключения требуется настройка приложения Google на сервере Mio!. После настройки здесь появится кнопка входа.</p><a href="https://developers.google.com/my-business/content/basic-setup" target="_blank" rel="noopener noreferrer">Требования Google к подключению</a><p class="google-muted">Администратору: инструкция находится в server/docs/GOOGLE.md.</p>${status.connected ? '<button type="button" class="google-disconnect" data-google-disconnect>Отключить Google</button>' : ""}`;
      bindDisconnect();
      return;
    }
    body.innerHTML = `<p class="google-muted">Войдите в Google-аккаунт владельца или управляющего заведения. Google запрашивает доступ к управлению профилем компании; Mio! использует его для просмотра профиля и отзывов.</p><button type="button" class="mio-service-button" data-google-connect>${status.connected ? "Подключить другой аккаунт" : "Войти через Google"}</button>${status.connected ? `<div class="google-selection"><label>Аккаунт компании<select data-google-account><option value="">Выберите аккаунт</option></select></label><button type="button" class="outline-green" data-google-accounts-more hidden>Ещё аккаунты</button><label>Заведение<select data-google-location disabled><option value="">Сначала выберите аккаунт</option></select></label><button type="button" class="outline-green" data-google-locations-more hidden>Ещё заведения</button><button type="button" class="mio-service-button" data-google-select disabled>Выбрать заведение</button></div><div class="google-profile"></div><div class="google-reviews"></div><button type="button" class="google-disconnect" data-google-disconnect>Отключить Google</button>` : ""}`;
    body.querySelector("[data-google-connect]").onclick = async (event) => {
      event.currentTarget.disabled = true;
      await perform(async () => {
        const data = await request("/v1/google/connect", {
          method: "POST",
          body: {},
        });
        if (alive) window.location.assign(data.url);
      });
      if (alive) body.querySelector("[data-google-connect]").disabled = false;
    };
    if (!status.connected) return;
    body.querySelector("[data-google-account]").onchange = async (event) => {
      const account = event.target.value;
      generation++;
      locations = [];
      locationPage = "";
      updateLocations();
      if (account) await perform(() => loadLocations(account));
    };
    body.querySelector("[data-google-location]").onchange = () => {
      body.querySelector("[data-google-select]").disabled = !body.querySelector(
        "[data-google-location]",
      ).value;
    };
    body.querySelector("[data-google-accounts-more]").onclick = () =>
      perform(() => loadAccounts(true));
    body.querySelector("[data-google-locations-more]").onclick = () =>
      perform(() =>
        loadLocations(body.querySelector("[data-google-account]").value, true),
      );
    body.querySelector("[data-google-select]").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await perform(async () => {
        status = await request("/v1/google/select", {
          method: "POST",
          body: {
            account: body.querySelector("[data-google-account]").value,
            location: body.querySelector("[data-google-location]").value,
          },
        });
        if (!alive) return;
        onStatus(status);
        message.textContent = googleStatusLabel(status);
        await loadSelected();
      });
      if (alive) button.disabled = false;
    };
    bindDisconnect();
  }
  function bindDisconnect() {
    const button = body.querySelector("[data-google-disconnect]");
    if (!button) return;
    button.onclick = async () => {
      button.disabled = true;
      await perform(async () => {
        const result = await request("/v1/google/disconnect", {
          method: "POST",
          body: {},
        });
        if (!alive) return;
        generation++;
        cleanupReviews?.();
        await refreshStatus();
        if (alive) message.textContent = result.message;
      });
      if (alive && button.isConnected) button.disabled = false;
    };
  }
  async function loadAccounts(append = false) {
    const data = await request(
      "/v1/google/accounts" +
        (append && accountPage
          ? "?pageToken=" + encodeURIComponent(accountPage)
          : ""),
    );
    if (!alive) return;
    const select = body.querySelector("[data-google-account]");
    if (!select) return;
    const chosen = select.value || status.selected?.account || "";
    accounts = append
      ? [...accounts, ...(data.accounts || [])]
      : data.accounts || [];
    accountPage = data.nextPageToken || "";
    select.innerHTML =
      '<option value="">Выберите аккаунт</option>' +
      accounts
        .map(
          (row) =>
            `<option value="${esc(row.name)}">${esc(row.accountName || row.name)}</option>`,
        )
        .join("");
    select.value = chosen;
    body.querySelector("[data-google-accounts-more]").hidden = !accountPage;
    if (!accounts.length)
      message.textContent = "У этого аккаунта нет доступных профилей компаний";
    if (!append && select.value) await loadLocations(select.value);
  }
  function updateLocations() {
    const select = body.querySelector("[data-google-location]");
    const chosen = select.value || status.selected?.location || "";
    select.innerHTML =
      '<option value="">Выберите заведение</option>' +
      locations
        .map(
          (row) =>
            `<option value="${esc(row.name)}">${esc(row.title || row.name)}${row.storefrontAddress?.addressLines ? " · " + esc(row.storefrontAddress.addressLines.join(", ")) : ""}</option>`,
        )
        .join("");
    select.disabled = !locations.length;
    select.value = chosen;
    body.querySelector("[data-google-locations-more]").hidden = !locationPage;
    body.querySelector("[data-google-select]").disabled = !select.value;
  }
  async function loadLocations(account, append = false) {
    const version = generation;
    const query = new window.URLSearchParams({
      account,
      ...(append && locationPage ? { pageToken: locationPage } : {}),
    });
    const data = await request("/v1/google/locations?" + query);
    if (!alive || version !== generation) return;
    locations = append
      ? [...locations, ...(data.locations || [])]
      : data.locations || [];
    locationPage = data.nextPageToken || "";
    updateLocations();
    if (!locations.length)
      message.textContent = "У выбранного аккаунта нет доступных заведений";
  }
  async function loadSelected() {
    cleanupReviews?.();
    cleanupReviews = null;
    const profileRoot = body.querySelector(".google-profile");
    const reviewRoot = body.querySelector(".google-reviews");
    profileRoot.textContent = "Загружаем профиль из Google…";
    reviewRoot.replaceChildren();
    const profile = await request("/v1/google/profile");
    if (!alive || profileRoot !== body.querySelector(".google-profile")) return;
    const address = [
      ...(profile.storefrontAddress?.addressLines || []),
      profile.storefrontAddress?.locality,
      profile.storefrontAddress?.postalCode,
    ]
      .filter(Boolean)
      .join(", ");
    const link = safeLink(profile.metadata?.mapsUri);
    const website = safeLink(profile.websiteUri);
    profileRoot.innerHTML = `<h3>${esc(profile.title || "Профиль компании")}</h3><p>${esc(address || "Адрес не указан")}</p><p>${esc(profile.phoneNumbers?.primaryPhone || "Телефон не указан")}</p>${website ? `<p><a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Сайт заведения</a></p>` : ""}${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Открыть в Google Картах</a></p>` : ""}<p class="google-muted">Данные профиля получены из Google.</p>`;
    cleanupReviews = mountGoogleReviews(reviewRoot, { request });
  }
  perform(refreshStatus);
  return () => {
    alive = false;
    generation++;
    cleanupReviews?.();
  };
}
