import { readAccount } from "../services/repositories.js";
import { createUserForm } from "../features/account/user-form.js";
import { escapeHTML as esc } from "../lib/dom.js";
import { storage } from "../services/storage.js";

export function createPage(app) {
  "use strict";
  const KEY = "mio-ru-account-v1";
  const defaults = {
    profile: {
      name: "THAI HOUSE Vilnius",
      description: "",
      phone: "",
      email: "",
      crm: "",
      website: "",
      timezone: "Europe/Vilnius",
      notificationEmails: "",
      notificationPhones: "",
      reportEmails: "",
      hours: "",
      confirmation: "",
      terms: "",
      radius: "1",
      delivery: "30",
      sms: true,
      smsReminder: false,
      emailMessages: false,
      emailReminder: false,
      whatsapp: true,
      whatsappReminder: false,
      mandatory: false,
      autoFinish: false,
    },
    users: [],
  };
  let data = readAccount(defaults);
  const save = () => storage.setItem(KEY, JSON.stringify(data));

  let page = "",
    query = "";
  const root = () => document.querySelector("#account-page");
  function timezoneOptions() {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const supported = [
      "UTC",
      "Europe/London",
      "Europe/Dublin",
      "Europe/Lisbon",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Warsaw",
      "Europe/Prague",
      "Europe/Vilnius",
      "Europe/Riga",
      "Europe/Tallinn",
      "Europe/Helsinki",
      "Europe/Kyiv",
      "Europe/Athens",
      "Europe/Istanbul",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Australia/Sydney",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
    ];
    const saved = String(data.profile.timezone || "");

    const zones = [...new Set(
      [local, saved, ...supported].filter(Boolean)
    )];

    const offset = (zone) => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          timeZoneName: "longOffset",
        }).formatToParts(new Date());

        const value = parts.find(
          (part) => part.type === "timeZoneName"
        )?.value || "GMT";

        return value.replace("GMT", "UTC") === "UTC"
          ? "UTC+00:00"
          : value.replace("GMT", "UTC");
      } catch {
        return "UTC";
      }
    };

    return zones.map((zone, index) => {
      const title = "";

      return `<option value="${esc(zone)}"
        ${zone === saved ? "selected" : ""}>
        ${esc(zone)} (${offset(zone)})${title}
      </option>`;
    }).join("");
  }

  function field(id, label, wide = false, textarea = false) {
    const requiredFields = [
      "name", "phone", "email", "timezone",
      "notificationEmails", "notificationPhones"
    ];
    if (requiredFields.includes(id)) label += " *";
    const v = esc(data.profile[id]);
    if (id === "timezone") {
      return `<label class="account-field ${wide ? "wide" : ""}">
        <span>${label}</span>
        <select data-p="timezone" required>
          ${timezoneOptions()}
        </select>
      </label>`;
    }
    return `<label class="account-field ${wide ? "wide" : ""}"><span>${label}</span>${
      textarea
        ? `<textarea data-p="${id}">${v}</textarea>`
        : `<input data-p="${id}" value="${v}">`
    }</label>`;
  }
  function checks() {
    return [
      [
        "sms",
        "Автоматические SMS для онлайн-бронирований, напоминаний и листа ожидания",
      ],
      ["smsReminder", "Автоматическое SMS-напоминание"],
      [
        "emailMessages",
        "Автоматические письма для онлайн-бронирований, напоминаний и листа ожидания",
      ],
      ["emailReminder", "Автоматическое напоминание по электронной почте"],
      [
        "whatsapp",
        "Автоматические сообщения WhatsApp для бронирований, напоминаний и листа ожидания",
      ],
      ["whatsappReminder", "Автоматическое напоминание WhatsApp"],
      ["mandatory", "Обязательное указание предпочтения при бронировании"],
      [
        "autoFinish",
        "Завершать прежнее бронирование при посадке нового гостя за стол",
      ],
    ]
      .map(
        ([key, label]) =>
          `<label class="account-check"><input type="checkbox" data-p="${key}" ${data.profile[key] ? "checked" : ""}>${label}</label>`,
      )
      .join("");
  }
  function profile() {
    return `<div class="account-titlebar">ПРОФИЛЬ РЕСТОРАНА</div><div class="account-scroll" id="account-profile-scroll">
 <h2>Профиль ресторана</h2>
 <section class="account-panel"><h3>Основная информация</h3><div class="account-fields">
 ${field("name", "Название ресторана", true)}
 ${field("description", "Описание ресторана (необязательно)", true, true)}
 ${field("phone", "Телефон ресторана")}
 ${field("email", "Email ресторана")}
 ${field("crm", "Адрес для ответов CRM")}
 ${field("website", "Веб-сайт ресторана")}
 ${field("timezone", "Часовой пояс ресторана", true)}
 </div></section>
 <section class="account-panel"><h3>Уведомления</h3><div class="account-fields">
 ${field("notificationEmails", "Email для уведомлений")}
 ${field("notificationPhones", "Телефоны для уведомлений")}
 ${field("reportEmails", "Email для отчётов", true)}
 </div></section>
 <section class="account-panel"><h3>Онлайн-бронирования</h3><div class="account-fields">
 ${field("hours", "Рабочие часы ресторана (необязательно)", true, true)}
 ${field("confirmation", "Сообщение подтверждения бронирования", true, true)}
 ${field("terms", "Правила и условия бронирования", true, true)}
 </div></section>
 <section class="account-panel"><h3>Сообщения</h3>${checks()}</section>
 </div>
 <footer class="account-footer"><span id="account-saved" style="margin-right:20px;color:#088447"></span><button id="account-save" class="account-green">Обновить профиль</button></footer>`;
  }
  function users() {
    const rows = data.users.filter((u) =>
      (u.name + " " + u.email).toLowerCase().includes(query.toLowerCase()),
    );
    return `<div class="account-titlebar">ПОЛЬЗОВАТЕЛИ</div><div class="account-scroll">
 <h2 style="margin-bottom:6px">Пользователи</h2><p style="color:#777;margin-bottom:36px">${data.users.length} пользователей</p>
 <button class="account-green" id="account-add">Добавить пользователя</button>
 <div style="margin:22px 0"><input class="account-search" id="account-search" placeholder="Поиск по имени или email" value="${esc(query)}"></div>
 <h4>Пользователи</h4>
 <div class="account-tablebox"><table class="account-table"><thead><tr>
 <th>Имя / Электронная почта ▲</th><th>Роль</th><th>Функции</th><th>Рестораны</th><th>Двухэтапный вход</th><th>Последний вход</th><th></th>
 </tr></thead><tbody>${rows
   .map(
     (u) => `<tr data-u="${u.id}">
 <td><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></td>
 <td><span class="account-role">${esc(u.role)}</span></td>
 <td>${u.login ? "Вход" : "—"}${u.taker ? ", Приём бронирований" : ""}${u.server ? ", Официант" : ""}</td>
 <td>1</td><td style="color:#999">Не настроена</td><td style="color:#999">Нет данных</td>
 <td><button data-edit="${u.id}">⋮</button></td></tr>`,
   )
   .join("")}</tbody></table></div>
 </div>`;
  }
  function openPage(name) {
    data = readAccount(defaults);
    page = name;
    document.querySelector("#routeFallback")?.remove();
    document.querySelector("#overview-view")?.remove();
    document.querySelector("#setup-page")?.remove();
    document.querySelector(".content").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    if (!root()) {
      let node = document.createElement("section");
      node.id = "account-page";
      document.querySelector(".workspace").append(node);
    }
    paint();
  }
  function leave() {
    root()?.remove();
    page = "";
    document.querySelector(".topbar").style.display = "";
    if (
      !document.querySelector("#overview-view") &&
      !document.querySelector("#setup-page")
    )
      document.querySelector(".content").style.display = "";
  }
  function paint() {
    if (!root()) return;
    root().innerHTML = page === "profile" ? profile() : users();
    if (page === "profile") {
      document.querySelector("#account-save").onclick = () => {
        root()
          .querySelectorAll("[data-p]")
          .forEach((el) => {
            data.profile[el.dataset.p] =
              el.type === "checkbox" ? el.checked : el.value;
          });
        const required = [
          ["name", "Название ресторана"],
          ["phone", "Телефон ресторана"],
          ["email", "Email ресторана"],
          ["timezone", "Часовой пояс ресторана"],
          ["notificationEmails", "Email для уведомлений"],
          ["notificationPhones", "Телефоны для уведомлений"],
        ];

        const missing = required.filter(
          ([key]) => !String(data.profile[key] ?? "").trim()
        );

        const fields = root().querySelectorAll("[data-p]");

        fields.forEach((el) => {
          const invalid = missing.some(([key]) => key === el.dataset.p);
          const label = el.closest(".account-field");

          el.style.borderColor = invalid ? "#dc2626" : "";
          if (label) {
            const title = label.querySelector("span");
            if (title) title.style.color = invalid ? "#dc2626" : "";
          }

          el.oninput = () => {
            if (String(el.value).trim()) {
              el.style.borderColor = "";
              const title = label?.querySelector("span");
              if (title) title.style.color = "";

              if (![...fields].some((field) =>
                required.some(([key]) =>
                  key === field.dataset.p &&
                  !String(field.value).trim()
                )
              )) {
                document.querySelector("#account-validation-error")?.remove();
              }
            }
          };
        });

        document.querySelector("#account-validation-error")?.remove();

        if (missing.length) {
          const message = document.createElement("strong");
          message.id = "account-validation-error";
          message.textContent = "Заполните обязательные поля";
          message.style.color = "#dc2626";
          message.style.fontSize = "14px";
          message.style.marginRight = "16px";

          document.querySelector("#account-save").before(message);
          return;
        }

        const saved = save();
        if (saved) {
          document.dispatchEvent(
            new Event("restaurant:updated")
          );
        }
        if (saved) {
          const indicator = document.querySelector("#account-saved");
          indicator.textContent = "Сохранение…";

          storage.flush().then(() => {
            if (storage.persistence.status !== "saved") {
              indicator.textContent = "Ошибка сохранения";
              indicator.style.color = "#dc2626";
              return;
            }

            indicator.textContent = "Сохранено";
            indicator.style.color = "#088447";

            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }).catch(() => {
            indicator.textContent = "Ошибка сохранения";
            indicator.style.color = "#dc2626";
          });
        }
      };
    } else {
      document.querySelector("#account-add").onclick = () => userModal();
      const input = document.querySelector("#account-search");
      input.oninput = (e) => {
        query = e.target.value;
        const pos = e.target.selectionStart;
        paint();
        const n = document.querySelector("#account-search");
        n.focus();
        n.setSelectionRange(pos, pos);
      };
      root()
        .querySelectorAll("[data-edit]")
        .forEach((b) => (b.onclick = () => userModal(b.dataset.edit)));
      root()
        .querySelectorAll("[data-u]")
        .forEach((r) => (r.ondblclick = () => userModal(r.dataset.u)));
    }
  }

  const { userModal } = createUserForm({
    get data() {
      return data;
    },
    save,
    paint,
  });
  return { mount: openPage, unmount: leave };
}
