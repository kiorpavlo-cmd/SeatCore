import { sidebarIcon } from "./sidebar-icons.js";
export const sidebar = `<aside class="sidebar">
    <header class="mio-sidebar-header">
      <button type="button" class="mio-sidebar-brand" id="mio-home-logo" aria-label="Перейти на главную" title="Главная"><strong>SeatCore</strong><small>Система бронирований</small></button>
      <div class="side-top">
        <button class="icon-button" id="collapseSide" aria-label="Свернуть или развернуть меню" title="Свернуть или развернуть меню"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <button class="icon-button" id="mio-sidebar-search" aria-label="Поиск по меню" aria-expanded="false" title="Поиск по меню"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button>
      </div>
    </header>

    <nav id="navigation" aria-label="Основная навигация"></nav>
    <div class="side-bottom">
      <div class="account"><div class="avatar" id="restaurant-sidebar-avatar">Р</div><div><strong id="restaurant-sidebar-name"></strong><small id="restaurant-sidebar-email"></small></div><span class="mio-account-chevron"><svg class="mio-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></div>
      <div class="logout"><strong>SeatCore</strong><button>⇥ Выйти</button></div>
    </div>
  </aside>`;
