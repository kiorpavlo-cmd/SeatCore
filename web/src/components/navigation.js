import { storage, STORAGE_KEYS } from "../services/storage.js";
import { sidebarIcon } from "./sidebar-icons.js";
import { menuData } from "../config/navigation.js";
import { escapeHTML as safe } from "../lib/dom.js";
import { can, routePermission } from "../services/access.js";
export function createNavigation(navigate) {
  let expanded = null,
    selected = { section: "view", item: "План зала" },
    venueOpen = false;
  const navigation = document.querySelector("#navigation"),
    sidebar = document.querySelector(".sidebar"),
    account = document.querySelector(".account");
  const visible = (section, label = "") => {
    const required = routePermission(section, label);
    return !required || can(required);
  };
  const sectionVisible = (section) =>
    section.items.length
      ? section.items.some(
          (item) => Array.isArray(item) && visible(section.id, item[0]),
        )
      : visible(section.id);
  function paintNav() {
    const lastScroll = navigation.scrollTop;
    navigation.innerHTML = menuData
      .filter(sectionVisible)
      .map((section) => {
        const open = section.items.length > 0 && expanded === section.id;
        const children = open
          ? `
   <div class="nav-children">
    ${section.items
      .map((item, index) => {
        if (item.heading) {
          return `<div class="nav-heading">${safe(item.heading)}</div>`;
        }
        const label = item[0];
        if (!visible(section.id, label)) return "";
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
     <span class="nav-icon-wrap">${sidebarIcon(section.id)}</span>
     <span>${safe(section.title)}</span>
     ${
       section.items.length
         ? `<b class="nav-arrow"><svg class="mio-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></b>`
         : ""
     }
    </button>${children}`;
      })
      .join("");
    navigation.scrollTop = lastScroll;
  }
  function openSection(id) {
    if (id === "home") {
      expanded = null;
      navigate("home");
      return;
    }

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

  window.addEventListener("mio-restaurant-profile-updated", () => {
    updateRestaurant();
  });

  function updateRestaurant() {
    const profile = restaurantProfile();
    const name = profile.name || "Ресторан";
    const email = profile.email || "";

    const nameEl = document.querySelector("#restaurant-sidebar-name");
    const emailEl = document.querySelector("#restaurant-sidebar-email");

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;

    const avatar = document.querySelector("#restaurant-sidebar-avatar");
    if (avatar) {
      const logo = String(profile.logo || "");
      const letter =
        Array.from(String(name).trim())[0]?.toLocaleUpperCase() || "Р";
      avatar.replaceChildren();

      if (
        String(logo).startsWith("data:image/png;base64,") ||
        String(logo).startsWith("data:image/jpeg;base64,") ||
        String(logo).startsWith("data:image/webp;base64,")
      ) {
        const image = document.createElement("img");
        image.src = logo;
        image.alt = name;
        image.style.cssText =
          "width:100%;height:100%;object-fit:cover;display:block";
        avatar.append(image);
      } else {
        avatar.textContent = letter;
      }
    }
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
        document.querySelector("#booking3VenueButton").style.display = (
          restaurantProfile().name || "Ресторан"
        )
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

  /* MIO MENU SEARCH V1 */
  const menuSearch = document.createElement("section");
  menuSearch.id = "mio-menu-search";
  menuSearch.className = "mio-menu-search";
  menuSearch.hidden = true;
  menuSearch.setAttribute("aria-label", "Поиск по меню");

  menuSearch.innerHTML = `
    <div class="mio-menu-search-head">
      <span class="mio-menu-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></span>
      <input id="mio-menu-search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Поиск раздела..."
        aria-label="Поиск по меню"
        aria-controls="mio-menu-search-results">
      <button type="button" id="mio-menu-search-close"
        aria-label="Закрыть поиск">×</button>
    </div>
    <div id="mio-menu-search-results"
      class="mio-menu-search-results"
      role="listbox"
      aria-label="Найденные разделы"></div>
    <div class="mio-menu-search-footer">
      <span>↑ ↓ Выбор</span>
      <span>Enter Открыть</span>
      <span>Esc Закрыть</span>
    </div>`;

  document.body.appendChild(menuSearch);

  const searchInput = menuSearch.querySelector("#mio-menu-search-input");
  const searchResults = menuSearch.querySelector("#mio-menu-search-results");

  const searchEntries = [
    ...menuData.flatMap((section) => [
      {
        label: section.title,
        parent: "",
        path: section.items.length ? null : section.id,
        section: section.id,
      },
      ...section.items.filter(Array.isArray).map((item) => ({
        label: item[0],
        parent: section.title,
        path: section.id + "/" + item[0],
      })),
    ]),
  ];

  const normalizeMenuText = (value) =>
    String(value || "")
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .trim();

  let searchMatches = [];
  let searchActive = 0;

  function closeSearch() {
    menuSearch.hidden = true;
    searchInput.value = "";
    searchResults.innerHTML = "";
    searchMatches = [];
    document
      .querySelector("#mio-sidebar-search")
      ?.setAttribute("aria-expanded", "false");
  }

  function renderSearch() {
    const query = normalizeMenuText(searchInput.value);

    searchResults.hidden = !query;
    menuSearch.querySelector(".mio-menu-search-footer").hidden = !query;
    if (!query) {
      searchResults.innerHTML = "";
      searchMatches = [];
      searchActive = 0;
      return;
    }

    searchMatches = searchEntries
      .filter((entry) =>
        entry.path
          ? visible(entry.section, entry.label)
          : sectionVisible(
              menuData.find((section) => section.id === entry.section),
            ),
      )
      .filter((entry) => {
        return normalizeMenuText(entry.parent + " " + entry.label).includes(
          query,
        );
      })
      .map((entry) => {
        const label = normalizeMenuText(entry.label);
        const parent = normalizeMenuText(entry.parent);
        const score = !query
          ? 0
          : label === query
            ? 0
            : label.startsWith(query)
              ? 1
              : label.includes(query)
                ? 2
                : parent.includes(query)
                  ? 3
                  : 4;
        return { ...entry, score };
      })
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "ru"))
      .slice(0, 40);

    searchActive = 0;

    if (!searchMatches.length) {
      searchResults.innerHTML =
        '<div class="mio-search-empty">Разделы не найдены</div>';
      return;
    }

    searchResults.innerHTML = searchMatches
      .map(
        (entry, index) => `
        <button type="button"
          class="mio-search-result"
          role="option"
          aria-selected="${index === searchActive}"
          data-menu-search-index="${index}">
          <span class="mio-search-result-icon"
            aria-hidden="true">↗</span>
          <span class="mio-search-result-text">
            <strong>${safe(entry.label)}</strong>
            ${
              entry.parent
                ? `<small>${safe(entry.parent)} → ${safe(entry.label)}</small>`
                : `<small>Основное меню</small>`
            }
          </span>
        </button>`,
      )
      .join("");
  }

  function selectSearch(index) {
    const entry = searchMatches[index];
    if (!entry) return;

    closeSearch();

    if (entry.path) {
      navigate(entry.path);
    } else if (entry.section) {
      expanded = entry.section;
      paintNav();
    }
  }

  function setSearchActive(index) {
    if (!searchMatches.length) return;

    searchActive = (index + searchMatches.length) % searchMatches.length;

    searchResults
      .querySelectorAll("[data-menu-search-index]")
      .forEach((button, position) => {
        const active = position === searchActive;
        button.setAttribute("aria-selected", String(active));
        if (active) {
          button.scrollIntoView({ block: "nearest" });
        }
      });
  }

  function positionSearch() {
    const anchor = sidebar
      .querySelector(".mio-sidebar-header")
      .getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    menuSearch.style.width = width + "px";
    menuSearch.style.left =
      Math.max(12, Math.min(anchor.left + 12, window.innerWidth - width - 12)) +
      "px";
    menuSearch.style.top =
      Math.min(anchor.bottom + 8, window.innerHeight - 80) + "px";
  }

  function openSearch() {
    if (!menuSearch.hidden) {
      closeSearch();
      return;
    }
    positionSearch();
    menuSearch.hidden = false;
    document
      .querySelector("#mio-sidebar-search")
      ?.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    renderSearch();
    searchInput.focus({ preventScroll: true });
  }
  window.addEventListener("resize", () => {
    if (!menuSearch.hidden) positionSearch();
  });

  searchInput.addEventListener("input", renderSearch);

  menuSearch
    .querySelector("#mio-menu-search-close")
    .addEventListener("click", closeSearch);

  searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-search-index]");
    if (!button) return;
    selectSearch(Number(button.dataset.menuSearchIndex));
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchActive(searchActive + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchActive(searchActive - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectSearch(searchActive);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (menuSearch.hidden) openSearch();
      else closeSearch();
    }

    if (event.key === "Escape" && !menuSearch.hidden) {
      closeSearch();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (menuSearch.hidden) return;
    if (menuSearch.contains(event.target)) return;
    if (event.target.closest("#mio-sidebar-search")) return;
    closeSearch();
  });
  /* END MIO MENU SEARCH V1 */

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
  document.querySelector("#mio-home-logo")?.addEventListener("click", () => {
    closeSearch();
    expanded = null;
    navigate("home");
  });

  account.addEventListener("click", () => {
    venueOpen = !venueOpen;
    paintVenue();
  });
  paintNav();
  updateRestaurant();

  document.addEventListener("restaurant:updated", updateRestaurant);

  document.addEventListener("persistence:update", updateRestaurant);
  document.addEventListener("persistence:update", paintNav);

  return {
    openSearch,
    closeMenu() {
      closeSearch();
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
