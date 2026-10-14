import { readResources } from "../../services/repositories.js";
import { escapeHTML as esc } from "../../lib/dom.js";

export function createGuestViews(ctx) {
  function guestsPage() {
    const {
      state,
      data,
      guestTab,
      tagsTab,
      guestQuery,
      tagQuery,
      guestId,
      currentGuest,
    } = ctx;
    const guest = currentGuest();

    const filtered = data.guests
      .filter((g) =>
        [g.first, g.last, g.phone, g.email]
          .join(" ")
          .toLowerCase()
          .includes(guestQuery.toLowerCase()),
      )
      .sort((a, b) =>
        ((a.first || "") + " " + (a.last || "")).localeCompare(
          (b.first || "") + " " + (b.last || ""),
          "ru",
        ),
      );

    let previousLetter = "";

    const rows = filtered
      .map((g) => {
        const letter = (g.first || g.last || "#")[0].toUpperCase();

        const header =
          letter !== previousLetter
            ? `<div class="guest-letter">${esc(letter)}</div>`
            : "";

        previousLetter = letter;

        return (
          header +
          `
        <button class="guest-guest-row
          ${g.id === guestId ? "selected" : ""}"
          data-guest="${g.id}">
          ${esc([g.first, g.last].filter(Boolean).join(" ") || "Без имени")}
        </button>`
        );
      })
      .join("");

    return `
      <div class="guest-main">
        <div class="guest-guest-list">
          <div class="guest-list-search">
            <input class="guest-search" id="guest-guest-search"
              placeholder="⌕  Поиск гостя"
              value="${esc(guestQuery)}">
          </div>
          <div class="guest-list-scroll">
            ${rows || '<div class="guest-empty">Нет гостей</div>'}
          </div>
          <div class="guest-list-bottom">
            <button class="guest-green" data-action="new-guest">
              ДОБАВИТЬ ГОСТЯ
            </button>
          </div>
        </div>
        <div class="guest-guest-panel">
          ${
            guest
              ? guestDetails(guest)
              : `
            <div class="guest-guest-header">
              <div class="guest-avatar"><svg class="guest-avatar-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg></div>
              <div class="guest-guest-heading">Гость не выбран</div>
              <button class="guest-orange"
                data-action="new-guest">+</button>
            </div>
            <div class="guest-empty">
              Выберите гостя или создайте нового.
            </div>
          `
          }
        </div>
      </div>`;
  }
  function stat(value, title) {
    const {
      state,
      data,
      guestTab,
      tagsTab,
      guestQuery,
      tagQuery,
      guestId,
      currentGuest,
    } = ctx;
    return `<div class="guest-stat">
      <strong>${esc(value)}</strong>${esc(title)}
    </div>`;
  }
  const fields = [
    ["first", "Имя"],
    ["last", "Фамилия"],
    ["title", "Обращение"],
    ["phone", "Телефон"],
    ["email", "Электронная почта"],
    ["job", "Должность"],
    ["company", "Компания"],
    ["gender", "Пол"],
    ["birthday", "Дата рождения"],
    ["anniversary", "Годовщина"],
    ["address", "Адрес"],
    ["altPhone", "Дополнительный телефон"],
    ["altEmail", "Дополнительная почта"],
  ];
  function field(g, key, title) {
    const {
      state,
      data,
      guestTab,
      tagsTab,
      guestQuery,
      tagQuery,
      guestId,
      currentGuest,
    } = ctx;
    if (key === "gender") {
      return `<div class="guest-field">
        <div class="guest-field-label">${title}</div>
        <select name="${key}">
          <option value="">Выберите пол</option>
          <option value="Мужской"
            ${g.gender === "Мужской" ? "selected" : ""}>
            Мужской
          </option>
          <option value="Женский"
            ${g.gender === "Женский" ? "selected" : ""}>
            Женский
          </option>
          <option value="Другой"
            ${g.gender === "Другой" ? "selected" : ""}>
            Другой
          </option>
        </select>
      </div>`;
    }

    const date = ["birthday", "anniversary"].includes(key);

    return `<div class="guest-field">
      <div class="guest-field-label">${esc(title)}</div>
      <input name="${key}"
        type="${date ? "date" : "text"}"
        value="${esc(g[key] || "")}"
        placeholder="—">
    </div>`;
  }
  function guestDetails(g) {
    const {
      state,
      data,
      guestTab,
      tagsTab,
      guestQuery,
      tagQuery,
      guestId,
      currentGuest,
    } = ctx;
    const count = data.guests.length;
    const guestTags = (g.tagIds || [])
      .map((tid) => data.tags.find((t) => t.id === tid))
      .filter(Boolean);

    const storedHistory = Array.isArray(g.reservations) ? g.reservations : [];
    const history = [
      ...new Map(
        [
          ...storedHistory,
          ...state.reservations.filter(
            (r) =>
              (r.guestId
                  ? String(r.guestId) === String(g.id)
                  : (
                      (g.phone && r.phone === g.phone) ||
                      (g.email &&
                       r.email?.toLowerCase() === g.email.toLowerCase())
                    )),
          ),
        ].map((r) => [r.id, r]),
      ).values(),
    ];

    const completed = history.filter((x) => x.status === "Завершено").length;

    const upcoming = history.filter(
      (x) =>
        !["Завершено", "Отменено", "Отменено гостем", "Не пришёл"].includes(
          x.status,
        ) && x.date >= state.date,
    ).length;

    return `
      <div class="guest-guest-header">
        <div class="guest-avatar"><svg class="guest-avatar-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg></div>
        <div>
          <div class="guest-guest-heading">
            ${esc([g.first, g.last].filter(Boolean).join(" "))}
          </div>
          <div class="guest-muted">${esc(g.phone || "")}</div>
        </div>
        <button class="guest-orange"
          data-action="new-guest">+</button>
      </div>
      <div class="guest-stats">
        ${stat(0, "Лояльность")}
        ${stat(upcoming, "Предстоящие")}
        ${stat(completed, "Посещения")}
        ${stat(history.filter((r) => r.status === "Отказано").length, "Отказы")}
        ${stat(history.filter((r) => ["Отменено", "Отменено гостем"].includes(r.status)).length, "Отменены")}
        ${stat(history.filter((r) => r.status === "Не пришёл").length, "Неявки")}
        ${stat("—", "Расход / гость")}
        ${stat("—", "Расход, EUR")}
        ${stat((readResources().reviews || []).filter((r) => r.name === [g.first, g.last].filter(Boolean).join(" ")).length, "Отзывы")}
      </div>
      <div class="guest-tabs">
        <button class="guest-tab
          ${guestTab === "profile" ? "active" : ""}"
          data-guest-tab="profile">Профиль</button>
        <button class="guest-tab
          ${guestTab === "history" ? "active" : ""}"
          data-guest-tab="history">
          История бронирований
        </button>
      </div>
      ${
        guestTab === "history"
          ? `
        <div class="guest-profile-scroll">
          ${
            history.length
              ? history
                  .map(
                    (h) => `
            <div class="guest-history-item">
              ${esc(h.date)} · ${esc(h.time)} ·
              ${esc(h.guests)} гостей · ${esc(h.status)}
            </div>
          `,
                  )
                  .join("")
              : '<div class="guest-empty">Нет бронирований</div>'
          }
        </div>
      `
          : `
        <div class="guest-profile-scroll">
          <div class="guest-summary">
            <div class="guest-summary-head">
              <span>🟣 Сводка гостя</span>
              <button class="guest-purple"
                data-action="summary">
                Создать сводку
              </button>
            </div>
            <p class="guest-muted">
              Бронирований: ${history.length}. Последний визит: ${esc(
                history
                  .map((r) => r.date)
                  .sort()
                  .at(-1) || "нет данных",
              )}.
            </p>
          </div>
          <form id="guest-guest-form" class="guest-fields">
            <div class="guest-field-col">
              ${fields.map(([k, t]) => field(g, k, t)).join("")}
              <div class="guest-field">
                <label class="guest-checkbox">
                  <input name="marketing" type="checkbox"
                    ${g.marketing ? "checked" : ""}>
                  Согласие на маркетинговые сообщения
                </label>
              </div>
            </div>
            <div class="guest-field-col">
              <div class="guest-field">
                <div class="guest-field-label">Теги гостя</div>
                <select id="guest-assign-tag">
                  <option value="">Выберите тег</option>
                  ${data.tags
                    .filter((t) => t.active && t.guest)
                    .map(
                      (t) => `<option value="${esc(t.id)}">
                      ${esc(t.name)}
                    </option>`,
                    )
                    .join("")}
                </select>
                <div>
                  ${guestTags
                    .map(
                      (t) => `
                    <span class="guest-tag-pill">
                      ${esc(t.name)}
                      <button type="button"
                        data-remove-tag="${esc(t.id)}">×</button>
                    </span>
                  `,
                    )
                    .join("")}
                </div>
              </div>
              <div class="guest-field">
                <div class="guest-field-label">Заметки о госте</div>
                <textarea name="notes"
                  placeholder="Добавьте внутренние заметки">${esc(g.notes || "")}</textarea>
              </div>
              <div class="guest-field">
                <span class="guest-muted">Нет ваучеров</span>
              </div>
            </div>
          </form>
        </div>
        <div class="guest-footer">
          <div class="guest-footer-actions">
            <button class="guest-green" data-action="save-guest">
              Сохранить изменения
            </button>
            <button class="guest-secondary" data-action="cancel-guest">
              Отмена
            </button>
          </div>
          <button class="guest-danger"
            data-action="delete-guest">Удалить гостя</button>
        </div>
      `
      }
      <span hidden data-guest-count="${count}"></span>`;
  }
  function tagsPage() {
    const {
      state,
      data,
      guestTab,
      tagsTab,
      guestQuery,
      tagQuery,
      guestId,
      currentGuest,
    } = ctx;
    const categoryMode = tagsTab === "categories";
    const source = categoryMode ? data.categories : data.tags;

    const filtered = source.filter((x) =>
      x.name.toLowerCase().includes(tagQuery.toLowerCase()),
    );

    return `<div class="guest-tags-layout">
      <div class="guest-tags-nav">
        <button data-tags-tab="tags"
          class="${!categoryMode ? "active" : ""}">
          Теги
        </button>
        <button data-tags-tab="categories"
          class="${categoryMode ? "active" : ""}">
          Категории
        </button>
      </div>
      <div class="guest-tags-content">
        <h2>${
          categoryMode ? "Управление категориями тегов" : "Управление тегами"
        }</h2>
        <button class="guest-green" data-action="${
          categoryMode ? "new-category" : "new-tag"
        }">
          ${categoryMode ? "Новая категория" : "Новый тег"}
        </button>
        <div class="guest-tag-toolbar">
          <input class="guest-search" id="guest-tag-search"
            value="${esc(tagQuery)}"
            placeholder="⌕  Поиск по названию">
        </div>
        <div class="guest-data-table">
          <div class="guest-table-head">
            <span>Название ▲</span>
            <span>${categoryMode ? "Описание" : "Категория"}</span>
            <span>${categoryMode ? "Теги" : "Приоритет"}</span>
            <span>${categoryMode ? "Цвет" : "Статус"}</span>
            <span>Действия</span>
          </div>
          ${
            filtered.length
              ? filtered
                  .map((x) => {
                    const cat = data.categories.find(
                      (c) => c.id === x.categoryId,
                    );
                    return `<div class="guest-table-row">
              <strong>${esc(x.name)}</strong>
              <span>${esc(
                categoryMode
                  ? x.description || "—"
                  : cat?.name || "Без категории",
              )}</span>
              <span>${esc(
                categoryMode
                  ? data.tags.filter((t) => t.categoryId === x.id).length
                  : x.priority,
              )}</span>
              <span>${
                categoryMode
                  ? `<span style="display:inline-block;width:22px;
                   height:22px;border-radius:50%;
                   background:${x.color}"></span>`
                  : x.active
                    ? "Активен"
                    : "Неактивен"
              }</span>
              <span>
                <button data-edit-${categoryMode ? "category" : "tag"}
                  ="${esc(x.id)}">Изменить</button>
              </span>
            </div>`;
                  })
                  .join("")
              : `<div class="guest-empty">Нет данных</div>`
          }
        </div>
      </div>
    </div>`;
  }
  return { guestsPage, tagsPage, fields };
}
