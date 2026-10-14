import { ROLES } from "../../../../server/contracts/permissions.js";
import { createApi } from "../../services/api.js";
import { storage } from "../../services/storage.js";
import { escapeHTML as esc } from "../../lib/dom.js";

export function createUserForm(ctx) {
  const colors = [
    "#33699b",
    "#294b59",
    "#9bc8b8",
    "#ffda97",
    "#b5b785",
    "#777267",
    "#b33d68",
    "#fc8052",
    "#f5be49",
    "#36d4cb",
    "#a93a3f",
    "#e1d3b1",
    "#f19b9b",
    "#ffa42a",
    "#f7e64c",
    "#9bd3ad",
    "#65b5f3",
    "#c891db",
    "#d42e2e",
    "#118a4c",
    "#1e77d8",
    "#9724ac",
  ];
  const permissions = [
    ["pinTaker", "Требовать PIN при приёме бронирования"],
    ["pinRefund", "Требовать PIN для возврата"],
    ["refund", "Разрешить возвраты"],
    ["shared", "Просмотр общих гостей"],
    ["deleteGuests", "Удаление общих гостей"],
    ["mergeGuests", "Объединение гостей"],
  ];
  function userModal(id) {
    const { data, paint, reload } = ctx;
    const api = createApi();
    let pending = null;
    const existing = data.users.find((u) => String(u.id) === String(id));
    const u = existing
      ? { ...existing }
      : {
          email: "",
          name: "",
          job: "",
          role: "Сотрудник",
          login: true,
          taker: true,
          server: true,
          pin: "",
          color: "#fc8052",
          extension: "",
          refund: false,
          shared: false,
        };
    const bg = document.createElement("div");
    bg.className = "account-modal-bg";
    bg.id = "account-modal-bg";
    const chk = (k, label) =>
      `<label class="account-check"><input data-ucheck="${k}" type="checkbox" ${u[k] ? "checked" : ""}>${label}</label>`;
    bg.innerHTML = `<div class="account-modal"><div class="account-modal-header"><strong>${existing ? "Редактировать пользователя" : "Добавить пользователя"}</strong><button id="account-close">×</button></div>
 <div class="account-modal-body">
 <div class="account-fields">
 <label class="account-field"><span>Электронная почта</span><input id="uEmail" type="email" value="${esc(u.email)}" placeholder="name@example.com"></label>
 <label class="account-field"><span>Имя</span><input id="uName" value="${esc(u.name)}"></label>
 <label class="account-field wide"><span>Должность</span><select id="uJob">
 ${["", "Приём гостей", "Обслуживание", "Маркетинг", "Управление", "Финансы", "Склад", "Шеф-повар", "IT-администрирование"].map((v) => `<option ${u.job === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
 <label class="account-field wide"><span>Роль</span><select id="uRole">${ROLES.map((role) => `<option ${u.role === role ? "selected" : ""}>${esc(role)}</option>`).join("")}</select></label>
 </div>
 <h4>Функции</h4><div class="account-permissions">${chk("login", "Может входить")}${chk("taker", "Принимать бронирования")}${chk("server", "Обслуживать столы")}</div>
 <h4>Пароль для входа</h4><label class="account-field"><input id="uPassword" aria-label="Пароль для входа" type="password" autocomplete="new-password" minlength="12" placeholder="Минимум 12 символов"></label><p>${existing?.hasPassword ? "Пароль установлен. Оставьте поле пустым, чтобы сохранить его." : "Для входа сотрудника задайте пароль. Сообщите его сотруднику лично."}</p>
 <h4>PIN-код</h4><label class="account-field"><input id="uPin" aria-label="PIN сотрудника" type="password" value="${esc(u.pin || "")}" inputmode="numeric" maxlength="4" placeholder="Необязательно, 4 цифры"></label>
 <h4>Цвет столов официанта</h4><div class="account-colors">${colors.map((c) => `<button class="account-color ${u.color === c ? "active" : ""}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>
 <label class="account-field"><span>Внутренний номер телефона</span><input id="uExtension" value="${esc(u.extension)}" placeholder="Необязательно"></label>
 <h4>Разрешения</h4><div class="account-permissions">${permissions.map(([k, label]) => chk(k, label)).join("")}</div>
 </div><p id="uError" role="alert" style="color:#b42318;padding:0 24px"></p><div class="account-modal-footer">${existing ? '<button id="account-remove" style="color:#d22">Удалить пользователя</button>' : "<span></span>"}<button class="account-green" id="account-confirm">${existing ? "Обновить пользователя" : "Создать сотрудника"}</button></div></div>`;
    document.body.append(bg);
    const close = () => bg.remove();
    bg.querySelector("#account-close").onclick = close;
    bg.onclick = (e) => {
      if (e.target === bg) close();
    };
    bg.querySelectorAll("[data-color]").forEach(
      (b) =>
        (b.onclick = () => {
          u.color = b.dataset.color;
          bg.querySelectorAll("[data-color]").forEach((el) =>
            el.classList.toggle("active", el === b),
          );
        }),
    );
    async function submit(method, user) {
      await storage.flush();
      if (storage.persistence.status === "error")
        throw new Error("Сначала сохраните или восстановите текущие изменения");
      const snapshot = await api.request("/v1/state");
      const path = existing
        ? "/v1/employees/" + encodeURIComponent(existing.id)
        : "/v1/employees";
      const signature = JSON.stringify([method, user]);
      if (!pending || pending.signature !== signature)
        pending = {
          signature,
          body: {
            user,
            baseRevision: snapshot.revision,
            mutationId: crypto.randomUUID(),
          },
        };
      await api.request(path, { method, body: pending.body });
      bg.querySelector("#uPassword").value = "";
      await reload();
      close();
      paint();
    }
    const passwordInput = bg.querySelector("#uPassword");
    const loginInput = bg.querySelector('[data-ucheck="login"]');
    const updatePassword = () =>
      (passwordInput.required = loginInput.checked && !existing?.hasPassword);
    loginInput.addEventListener("change", updatePassword);
    updatePassword();
    bg.querySelector("#account-confirm").onclick = async () => {
      const button = bg.querySelector("#account-confirm"),
        error = bg.querySelector("#uError");
      error.textContent = "";
      const get = (selector) => bg.querySelector(selector).value.trim();
      const email = get("#uEmail");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error.textContent = "Укажите корректную электронную почту.";
        return;
      }
      const password = passwordInput.value;
      if (
        (loginInput.checked && !existing?.hasPassword && !password) ||
        (password && (password.length < 12 || password.length > 1024))
      ) {
        error.textContent = "Задайте пароль длиной не менее 12 символов.";
        return;
      }
      const pin = get("#uPin");
      if (pin && !/^\d{4}$/.test(pin)) {
        error.textContent = "PIN должен содержать 4 цифры.";
        return;
      }
      const user = {
        ...u,
        email,
        name: get("#uName") || email.split("@")[0],
        job: get("#uJob"),
        role: get("#uRole"),
        pin,
        extension: get("#uExtension"),
      };
      if (password) user.password = password;
      bg.querySelectorAll("[data-ucheck]").forEach(
        (el) => (user[el.dataset.ucheck] = el.checked),
      );
      button.disabled = true;
      try {
        await submit(existing ? "PATCH" : "POST", user);
      } catch (issue) {
        error.textContent = issue.message;
      } finally {
        button.disabled = false;
      }
    };
    if (existing)
      bg.querySelector("#account-remove").onclick = async () => {
        if (!confirm("Удалить сотрудника и отключить его учётную запись?"))
          return;
        const button = bg.querySelector("#account-remove");
        button.disabled = true;
        try {
          await submit("DELETE");
        } catch (issue) {
          bg.querySelector("#uError").textContent = issue.message;
        } finally {
          button.disabled = false;
        }
      };
  }
  return { userModal };
}
