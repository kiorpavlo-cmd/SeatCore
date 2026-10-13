import { storage, STORAGE_KEYS } from "../services/storage.js";
import { icon } from "./icons.js";
import { menuData } from "../config/navigation.js";
import { escapeHTML as safe } from "../lib/dom.js";
export function createNavigation(navigate) {
  let expanded = null,
    selected = { section: "view", item: "План зала" },
    venueOpen = false;
  const navigation = document.querySelector("#navigation"),
    sidebar = document.querySelector(".sidebar"),
    account = document.querySelector(".account");
  function paintNav() {
    const lastScroll = navigation.scrollTop;
    navigation.innerHTML = menuData
      .map((section) => {
        const open = expanded === section.id;
        const children = open
          ? `
   <div class="nav-children">
    ${section.items
      .map((item, index) => {
        if (item.heading) {
          return `<div class="nav-heading">${safe(item.heading)}</div>`;
        }
        const label = item[0];
        const active =
          selected.section === section.id && selected.item === label;
        return `<button class="nav-child ${active ? "active" : ""}"
      aria-current="${active ? "page" : "false"}" data-child="${section.id}" data-index="${index}">
      ${safe(label)} ${item[1] ? `<span style="color:#f55">${safe(item[1])}</span>` : ""}
     </button>`;
      })
      .join("")}
   </div>`
          : "";
        return `<button class="nav ${open ? "expanded" : ""} ${selected.section === section.id ? "active" : ""}"
    aria-label="${safe(section.title)}" aria-expanded="${open}" title="${safe(section.title)}" data-section="${section.id}">
     <span class="nav-icon-wrap">${icon(section.id)}</span>
     <span>${safe(section.title)}</span>
     <b class="nav-arrow">${open ? "⌃" : "⌄"}</b>
    </button>${children}`;
      })
      .join("");
    navigation.scrollTop = lastScroll;
  }
  function openSection(id) {
    if (id === "setup" || id === "support") {
      expanded = null;
      paintNav();
      navigate(id);
      return;
    }
    expanded = expanded === id ? null : id;
    paintNav();
    const button = navigation.querySelector(`[data-section="${id}"]`);
    if (button && expanded === id) {
      button.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  function restaurantProfile() {
    return storage.read(STORAGE_KEYS.account, {}).profile || {};
  }

  function updateRestaurant() {
    const profile = restaurantProfile();
    const name = profile.name || "Ресторан";
    const email = profile.email || "";

    const nameEl = document.querySelector("#restaurant-sidebar-name");
    const emailEl = document.querySelector("#restaurant-sidebar-email");

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
  }

  function paintVenue() {
    document.querySelector("#booking3Venue")?.remove();
    if (!venueOpen) return;

    const container = document.createElement("div");
    container.id = "booking3Venue";
    container.className = "venue-switcher";
    container.innerHTML = `
  <input class="venue-search" id="booking3VenueSearch"
    placeholder="Поиск ресторана">
  <button class="venue-option" id="booking3VenueButton">
    ${safe(restaurantProfile().name || "Ресторан")} <span>✓</span>
  </button>
  <div class="venue-language">
   <label for="booking3Language">Язык интерфейса</label>
   <select id="booking3Language">
    <option value="ru">Русский</option>
   </select>
  </div>`;
    const logout = document.querySelector(".logout");
    sidebar.querySelector(".side-bottom").insertBefore(container, logout);
    document
      .querySelector("#booking3VenueSearch")
      .addEventListener("input", (e) => {
        document.querySelector("#booking3VenueButton").style.display =
          (restaurantProfile().name || "Ресторан")
            .toLowerCase()
            .includes(e.target.value.toLowerCase())
            ? "flex"
            : "none";
      });
    document.querySelector("#booking3VenueButton").onclick = () => {
      venueOpen = false;
      paintVenue();
    };
  }
  navigation.addEventListener("click", (event) => {
    const child = event.target.closest("[data-child]");
    if (child) {
      const section = menuData.find((x) => x.id === child.dataset.child);
      const item = section.items[Number(child.dataset.index)];
      if (Array.isArray(item)) navigate(section.id + "/" + item[0]);
      return;
    }
    const button = event.target.closest("[data-section]");
    if (button) openSection(button.dataset.section);
  });
  account.addEventListener("click", () => {
    venueOpen = !venueOpen;
    paintVenue();
  });
  paintNav();
  updateRestaurant();

  document.addEventListener(
    "restaurant:updated",
    updateRestaurant
  );

  document.addEventListener(
    "persistence:update",
    updateRestaurant
  );

  return {
    closeMenu() {
      expanded = null;
      paintNav();
    },
    select(section, item) {
      selected = { section, item };
      expanded =
        sidebar.classList.contains("compact") || window.innerWidth <= 750
          ? null
          : section;
      paintNav();
    },
  };
}
