import { escapeHTML as safe } from "../lib/dom.js";
import { SEATED, totalGuests } from "../services/reservation-queries.js";

const CLOSED = ["Завершено", "Отменено", "Отменено гостем", "Не пришёл", "Отказано"];
const CANCELLED = ["Отменено", "Отменено гостем", "Отказано"];
const confirmed = (status) => String(status || "").startsWith("Подтвержд");
const pending = (status) => !confirmed(status) && !SEATED.includes(status) && !CLOSED.includes(status);
const statusClass = (status) => CANCELLED.includes(status) ? "cancelled" : SEATED.includes(status) ? "seated" : status === "Завершено" ? "finished" : confirmed(status) ? "confirmed" : "pending";
const labelStatus = (status) => status || "Ожидается";
const dateLabel = (date) => new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
const shortDate = (date) => new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
const guestWord = (n) => n % 10 === 1 && n % 100 !== 11 ? "гость" : [2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? "гостя" : "гостей";

export function createPage(app) {
  const { state } = app;
  let query = "", statusFilter = "all", roomFilter = "all", mounted = false;
  const rootId = "home-page";
  function sourceRecords() { return (state.reservations || []).filter(r => r.date === state.date).sort((a,b) => String(a.time || "").localeCompare(String(b.time || ""))); }
  function displayed(records) { return records.filter(r => (roomFilter === "all" || (r.room || "main") === roomFilter) && (statusFilter === "all" || (statusFilter === "confirmed" && confirmed(r.status)) || (statusFilter === "pending" && pending(r.status)) || (statusFilter === "cancelled" && CANCELLED.includes(r.status))) && [r.name,r.phone,r.email,r.table].some(v => String(v || "").toLowerCase().includes(query.toLowerCase()))); }
  function availableCount(records) {
    const tables = Object.entries(app.floor.positions || {}).flatMap(([room, rows]) => rows.map(row => `${room}:${row[0]}`));
    const busy = new Set(records.filter(r => !CLOSED.includes(r.status) && r.table).map(r => `${r.room || "main"}:${r.table}`));
    return { free: tables.filter(t => !busy.has(t)).length, total: tables.length };
  }
  function badge(status) { return `<span class="home-status ${statusClass(status)}">${safe(labelStatus(status))}</span>`; }
  function row(r) { return `<tr><td class="home-time">${safe(r.time || "—")}</td><td><button class="home-guest" data-booking="${safe(String(r.id))}">${safe(r.name || "Без имени")}</button><small>${safe(r.phone || "")}</small></td><td>${Number(r.guests) || 0}</td><td>${safe(r.table ? `Стол ${r.table}` : "Не назначен")}</td><td>${badge(r.status)}</td><td>${safe(r.source || "—")}</td><td><button class="home-more" aria-label="Открыть бронирование" data-booking="${safe(String(r.id))}">⋮</button></td></tr>`; }
  function paint() {
    const el = document.getElementById(rootId); if (!mounted || !el) return;
    const records = sourceRecords(), shown = displayed(records), tables = availableCount(records);
    const active = records.filter(r => !CANCELLED.includes(r.status));
    const upcoming = records.filter(r => pending(r.status));
    const rooms = Object.entries(state.rooms || {});
    el.innerHTML = `<div class="home-header"><h1>Главная</h1><div class="home-actions"><label class="home-search-wrap"><span aria-hidden="true">⌕</span><input id="home-search" placeholder="Поиск по гостям, телефону или столику..." value="${safe(query)}" aria-label="Поиск бронирований"></label><label class="home-date" title="Выбрать дату">▣ &nbsp;<input id="home-date" type="date" value="${safe(state.date)}" aria-label="Дата бронирований"></label><button class="home-new" id="home-new">＋ &nbsp;Новая бронь</button></div></div>
    <div class="home-stats">
      <div class="home-stat"><div class="home-stat-label"><span>▣</span>Бронирований</div><strong>${active.length}</strong><small>на выбранную дату</small></div>
      <div class="home-stat"><div class="home-stat-label"><span>♧</span>Гостей</div><strong>${totalGuests(active)}</strong><small>всего гостей по броням</small></div>
      <div class="home-stat"><div class="home-stat-label"><span>▤</span>Свободно</div><strong>${tables.free}</strong><small>столов из ${tables.total} (без активных броней)</small></div>
      <div class="home-stat"><div class="home-stat-label"><span>◷</span>Ожидаются</div><strong>${upcoming.length}</strong><small>броней ожидают прибытия</small></div>
    </div>
    <div class="home-columns"><section class="home-panel home-reservations"><div class="home-panel-heading"><h2>Бронирования на ${safe(dateLabel(state.date))}</h2><label class="home-room-label">Показать: <select id="home-room"><option value="all">Все залы</option>${rooms.map(([id,name]) => `<option value="${safe(id)}" ${roomFilter===id?'selected':''}>${safe(name)}</option>`).join('')}</select></label></div><div class="home-tabs">${[['all','Все',records.length],['confirmed','Подтверждённые',records.filter(r => confirmed(r.status)).length],['pending','Ожидаются',upcoming.length],['cancelled','Отменённые',records.filter(r => CANCELLED.includes(r.status)).length]].map(([key,label,count]) => `<button data-status="${key}" class="${statusFilter===key?'active':''}">${label} (${count})</button>`).join('')}</div><div class="home-table-scroll"><table class="home-table"><thead><tr><th>Время</th><th>Гость</th><th>Гостей</th><th>Стол</th><th>Статус</th><th>Источник</th><th></th></tr></thead><tbody>${shown.map(row).join('') || '<tr><td colspan="7" class="home-no-data">Бронирований не найдено</td></tr>'}</tbody></table></div></section>
    <section class="home-panel home-schedule"><div class="home-panel-heading"><h2>План на день</h2><span>${safe(shortDate(state.date))}</span></div><div class="home-timeline">${records.map(r => `<div class="home-event"><time>${safe(r.time || '—')}</time><span class="home-dot ${statusClass(r.status)}"></span><button data-booking="${safe(String(r.id))}" class="home-event-card"><span class="home-event-head"><strong>${safe(r.name || 'Без имени')}</strong>${badge(r.status)}</span><small>${Number(r.guests)||0} ${guestWord(Number(r.guests)||0)} · ${safe(r.table ? `Стол ${r.table}` : 'Без стола')}</small></button></div>`).join('') || '<p class="home-no-events">На выбранную дату бронирований нет</p>'}</div></section></div>`;
    el.querySelector('#home-search').addEventListener('input', e => { query=e.target.value; const pos=e.target.selectionStart; paint(); const input=document.querySelector('#home-search'); input?.focus();input?.setSelectionRange(pos,pos); });
    el.querySelector('#home-room').onchange=e=>{roomFilter=e.target.value;paint()};
    el.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{statusFilter=b.dataset.status;paint()});
    el.querySelectorAll('[data-booking]').forEach(b=>b.onclick=()=>{const record=state.reservations.find(r=>String(r.id)===b.dataset.booking);if(record)app.bookingModal(false,null,record.id)});
    el.querySelector('#home-new').onclick=()=>app.bookingModal(false);
    el.querySelector('#home-date').onchange=e=>{if(!e.target.value)return;state.date=e.target.value;app.save();app.render();};
  }
  return {mount(){mounted=true;document.querySelector('#routeFallback')?.remove();document.querySelector('.content').style.display='none';document.querySelector('.topbar').style.display='none';document.getElementById(rootId)?.remove();const el=document.createElement('section');el.id=rootId;document.querySelector('.workspace').appendChild(el);paint();},unmount(){mounted=false;document.getElementById(rootId)?.remove();},refresh:paint};
}
