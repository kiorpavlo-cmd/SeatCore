import { readGuests } from "../services/repositories.js";
import { createGuestForms } from "../features/guests/forms.js";
import { createGuestViews } from "../features/guests/views.js";
import { $ } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  const { state } = app;
  ("use strict");
  const KEY = "mio-ru-stage9-v1";

  const initial = {
    guests: [],
    categories: [],
    tags: [],
  };
  let data = readGuests();
  let view = "guests";
  let tagsTab = "tags";
  let guestId = null;
  let guestTab = "profile";
  let guestQuery = "";
  let tagQuery = "";
  const save = () => storage.setItem(KEY, JSON.stringify(data));
  const id = () =>
    crypto.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  const root = () => $("#guest-root");
  const currentGuest = () => data.guests.find((x) => x.id === guestId);
  function mount() {
    const element = document.createElement("section");
    element.id = "guest-root";
    document.querySelector(".workspace").append(element);
    document.querySelector(".content").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    return true;
  }
  function unmount() {
    closeModal();
    root()?.remove();
  }
  function open(page) {
    data = readGuests();
    view = page;

    if (!mount()) return;

    render();
  }
  function render() {
    if (!root()) return;
    root().innerHTML =
      `<div class="guest-topbar">${
        view === "guests" ? "ГОСТИ" : "ТЕГИ"
      }</div>` + (view === "guests" ? guestsPage() : tagsPage());

    bind();
  }

  function saveGuest() {
    const g = currentGuest();
    const form = $("#guest-guest-form");
    if (!g || !form) return;

    const draft = Object.fromEntries(
      fields.map(([key]) => [key, formValue(form, key)]),
    );
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))
      return alert("Укажите корректную электронную почту");
    if (!draft.first) {
      alert("Имя гостя не может быть пустым");
      return;
    }

    Object.assign(g, draft);
    g.notes = formValue(form, "notes");
    g.marketing = form.elements.marketing.checked;
    save();
    render();
  }
  function bind() {
    const page = root();
    if (!page) return;

    page.onclick = (e) => {
      const row = e.target.closest("[data-guest]");
      if (row) {
        guestId = row.dataset.guest;
        guestTab = "profile";
        render();
        return;
      }

      const tab = e.target.closest("[data-guest-tab]");
      if (tab) {
        guestTab = tab.dataset.guestTab;
        render();
        return;
      }

      const tagsNav = e.target.closest("[data-tags-tab]");
      if (tagsNav) {
        tagsTab = tagsNav.dataset.tagsTab;
        tagQuery = "";
        render();
        return;
      }

      const editCategory = e.target.closest("[data-edit-category]");
      if (editCategory) {
        categoryModal(editCategory.dataset.editCategory);
        return;
      }

      const editTag = e.target.closest("[data-edit-tag]");
      if (editTag) {
        tagModal(editTag.dataset.editTag);
        return;
      }

      const removeTag = e.target.closest("[data-remove-tag]");
      if (removeTag) {
        const g = currentGuest();
        g.tagIds = (g.tagIds || []).filter(
          (x) => x !== removeTag.dataset.removeTag,
        );
        save();
        render();
        return;
      }

      const action = e.target.closest("[data-action]")?.dataset.action;

      switch (action) {
        case "new-guest":
          guestModal();
          break;
        case "new-tag":
          tagModal();
          break;
        case "new-category":
          categoryModal();
          break;
        case "save-guest":
          saveGuest();
          break;
        case "cancel-guest":
          render();
          break;
        case "delete-guest": {
          const g = currentGuest();
          if (!g) break;
          if (!confirm("Удалить гостя без возможности восстановления?")) break;
          data.guests = data.guests.filter((x) => x.id !== g.id);
          guestId = null;
          save();
          render();
          break;
        }
        case "summary":
          const g = currentGuest();
          alert(
            [g.first, g.last].filter(Boolean).join(" ") +
              ". Телефон: " +
              (g.phone || "не указан") +
              ". Заметки: " +
              (g.notes || "нет"),
          );
          break;
      }
    };

    const guestSearch = $("#guest-guest-search", page);
    if (guestSearch)
      guestSearch.oninput = (e) => {
        guestQuery = e.target.value;
        const position = e.target.selectionStart;
        render();
        const input = $("#guest-guest-search", page);
        input.focus();
        input.setSelectionRange(position, position);
      };

    const tagSearch = $("#guest-tag-search", page);
    if (tagSearch)
      tagSearch.oninput = (e) => {
        tagQuery = e.target.value;
        const position = e.target.selectionStart;
        render();
        const input = $("#guest-tag-search", page);
        input.focus();
        input.setSelectionRange(position, position);
      };

    const assign = $("#guest-assign-tag", page);
    if (assign)
      assign.onchange = (e) => {
        const g = currentGuest();
        if (!g || !e.target.value) return;
        g.tagIds = g.tagIds || [];
        if (!g.tagIds.includes(e.target.value)) g.tagIds.push(e.target.value);
        save();
        render();
      };
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest('[data-action="create-guest"]')) return;

    const form = $("#guest-new-guest");
    if (!form) return;

    const first = formValue(form, "first");
    if (!first) {
      alert("Введите имя гостя");
      return;
    }

    const guest = {
      id: id(),
      first,
      last: formValue(form, "last"),
      phone: formValue(form, "phone"),
      email: formValue(form, "email"),
      notes: "",
      marketing: false,
      tagIds: [],
      reservations: [],
    };

    data.guests.push(guest);
    guestId = guest.id;
    guestTab = "profile";
    save();
    closeModal();
    render();
  });
  const { guestsPage, tagsPage, fields } = createGuestViews({
    state,
    get data() {
      return data;
    },
    get guestTab() {
      return guestTab;
    },
    get tagsTab() {
      return tagsTab;
    },
    get guestQuery() {
      return guestQuery;
    },
    get tagQuery() {
      return tagQuery;
    },
    get guestId() {
      return guestId;
    },
    currentGuest,
  });
  const { modal, closeModal, formValue, guestModal, categoryModal, tagModal } =
    createGuestForms({
      get data() {
        return data;
      },
      save,
      render,
      id,
      get tagsTab() {
        return tagsTab;
      },
    });
  return { mount: open, unmount };
}
