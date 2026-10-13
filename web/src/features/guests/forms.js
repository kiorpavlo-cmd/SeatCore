import { $, escapeHTML as esc } from "../../lib/dom.js";

export function createGuestForms(ctx) {
  const colors = [
    "#e93457",
    "#ffb74d",
    "#10aca8",
    "#3568d7",
    "#fa7b2b",
    "#8d4ccf",
    "#96cc65",
    "#496785",
    "#ef7777",
    "#2c98d6",
    "#913260",
    "#c7dc27",
  ];
  function modal(title, content, footer) {
    const { data, save, render, id, tagsTab } = ctx;
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "guest-overlay";
    overlay.id = "guest-overlay";
    overlay.innerHTML = `
      <div class="guest-modal" role="dialog" aria-modal="true">
        <div class="guest-modal-head">
          <h2>${esc(title)}</h2>
          <button class="guest-close" data-action="close">×</button>
        </div>
        <div class="guest-modal-body">${content}</div>
        <div class="guest-modal-footer">${footer}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest('[data-action="close"]')) {
        closeModal();
      }
    });
    return overlay;
  }
  function closeModal() {
    const { data, save, render, id, tagsTab } = ctx;
    $("#guest-overlay")?.remove();
  }
  function formValue(form, name) {
    const { data, save, render, id, tagsTab } = ctx;
    return form.elements.namedItem(name)?.value?.trim() || "";
  }
  function guestModal() {
    const { data, save, render, id, tagsTab } = ctx;
    const element = modal(
      "Новый гость",
      `
      <form id="guest-new-guest">
        ${[
          ["first", "Имя *"],
          ["last", "Фамилия"],
          ["phone", "Телефон"],
          ["email", "Электронная почта"],
        ]
          .map(
            ([key, title]) => `
          <div class="guest-form-row">
            <label>${title}</label>
            <input name="${key}" ${key === "first" ? "required" : ""}>
          </div>`,
          )
          .join("")}
      </form>
    `,
      `<button class="guest-green"
      data-action="create-guest">Создать гостя</button>`,
    );
    $("input[name=first]", element)?.focus();
  }
  function categoryModal(categoryId = null) {
    const { data, save, render, id, tagsTab } = ctx;
    const category = data.categories.find((x) => x.id === categoryId);
    let color = category?.color || colors[9];

    const element = modal(
      category ? "Редактирование категории" : "Создать категорию",
      `<form id="guest-category-form">
        <div class="guest-form-row">
          <label>Название категории</label>
          <input name="name" required
            value="${esc(category?.name || "")}">
        </div>
        <div class="guest-form-row">
          <label>Описание</label>
          <textarea name="description">${esc(
            category?.description || "",
          )}</textarea>
        </div>
        <div class="guest-form-row">
          <label>Цвет</label>
          <div class="guest-colors">
            ${colors
              .map(
                (c) => `
              <button type="button"
                class="guest-color ${c === color ? "active" : ""}"
                style="background:${c}"
                data-color="${c}"></button>
            `,
              )
              .join("")}
          </div>
        </div>
      </form>`,
      `${
        category
          ? `<button class="guest-danger"
        data-action="delete-category">Удалить</button>`
          : ""
      }
      <button class="guest-green"
        data-action="save-category">
        ${category ? "Сохранить" : "Создать категорию"}
      </button>`,
    );

    element.addEventListener("click", (e) => {
      const button = e.target.closest("[data-color]");
      if (button) {
        color = button.dataset.color;
        element
          .querySelectorAll(".guest-color")
          .forEach((b) => b.classList.toggle("active", b === button));
      }

      if (e.target.closest('[data-action="save-category"]')) {
        const form = $("#guest-category-form", element);
        const name = formValue(form, "name");
        if (!name) {
          alert("Введите название категории");
          return;
        }

        if (category) {
          Object.assign(category, {
            name,
            description: formValue(form, "description"),
            color,
          });
        } else {
          data.categories.push({
            id: id(),
            name,
            description: formValue(form, "description"),
            color,
          });
        }

        save();
        closeModal();
        render();
      }

      if (e.target.closest('[data-action="delete-category"]')) {
        if (!confirm("Удалить категорию?")) return;
        data.categories = data.categories.filter((x) => x.id !== category.id);
        data.tags.forEach((t) => {
          if (t.categoryId === category.id) t.categoryId = "";
        });
        save();
        closeModal();
        render();
      }
    });
  }
  function tagModal(tagId = null) {
    const { data, save, render, id, tagsTab } = ctx;
    const tag = data.tags.find((x) => x.id === tagId);
    let guest = tag?.guest ?? true;
    let reservation = tag?.reservation ?? true;

    const element = modal(
      tag ? "Редактировать тег" : "Создать тег",
      `<form id="guest-tag-form">
        <div class="guest-form-row">
          <label>Название тега</label>
          <input name="name" required
            value="${esc(tag?.name || "")}">
        </div>
        <div class="guest-form-row">
          <label>Тип тега (минимум один)</label>
          <div class="guest-choice">
            <button type="button" data-type="guest"
              class="${guest ? "active" : ""}">Гость</button>
            <button type="button" data-type="reservation"
              class="${reservation ? "active" : ""}">
              Бронирование
            </button>
          </div>
        </div>
        <div class="guest-form-row">
          <label>Приоритет тега (меньше — выше)</label>
          <input name="priority" type="number"
            value="${esc(tag?.priority ?? 10)}">
        </div>
        <div class="guest-form-row">
          <label>Иконка</label>
          <select name="icon">
            ${["Аббревиатура", "▦", "♿", "▲", "♨", "♬", "♥", "★", "●"]
              .map(
                (value) => `<option value="${esc(value)}"
                ${tag?.icon === value ? "selected" : ""}>
                ${esc(value)}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="guest-form-row">
          <label>Категория</label>
          <select name="categoryId">
            <option value="">Без категории</option>
            ${data.categories
              .map(
                (c) => `
              <option value="${esc(c.id)}"
                ${tag?.categoryId === c.id ? "selected" : ""}>
                ${esc(c.name)}
              </option>`,
              )
              .join("")}
          </select>
        </div>
        <label class="guest-checkbox">
          <input type="checkbox" name="active"
            ${tag?.active !== false ? "checked" : ""}>
          Тег активен
        </label>
      </form>`,
      `${
        tag
          ? `<button class="guest-danger"
        data-action="delete-tag">Удалить</button>`
          : ""
      }
      <button class="guest-green" data-action="save-tag">
        ${tag ? "Сохранить" : "Создать тег"}
      </button>`,
    );

    element.addEventListener("click", (e) => {
      const typeButton = e.target.closest("[data-type]");
      if (typeButton) {
        if (typeButton.dataset.type === "guest") guest = !guest;
        else reservation = !reservation;
        typeButton.classList.toggle(
          "active",
          typeButton.dataset.type === "guest" ? guest : reservation,
        );
      }

      if (e.target.closest('[data-action="save-tag"]')) {
        const form = $("#guest-tag-form", element);
        const name = formValue(form, "name");

        if (!name) {
          alert("Введите название тега");
          return;
        }
        if (!guest && !reservation) {
          alert("Выберите минимум один тип тега");
          return;
        }

        const record = {
          name,
          guest,
          reservation,
          priority: Number(formValue(form, "priority")) || 0,
          icon: formValue(form, "icon"),
          categoryId: formValue(form, "categoryId"),
          active: form.elements.active.checked,
        };

        if (tag) Object.assign(tag, record);
        else data.tags.push({ id: id(), ...record });
        save();
        closeModal();
        render();
      }

      if (e.target.closest('[data-action="delete-tag"]')) {
        if (!confirm("Удалить тег?")) return;
        data.tags = data.tags.filter((x) => x.id !== tag.id);
        data.guests.forEach((g) => {
          g.tagIds = (g.tagIds || []).filter((x) => x !== tag.id);
        });
        save();
        closeModal();
        render();
      }
    });
  }
  return { modal, closeModal, formValue, guestModal, categoryModal, tagModal };
}
