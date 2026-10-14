import { escapeHTML as esc } from '../lib/dom.js';
import { storage, STORAGE_KEYS } from '../services/storage.js';
import { bookingNotifications, markBookingNotificationsRead } from '../services/booking-notifications.js';
import { toast } from './toast.js';

const bell = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
function entries(app) {
  return bookingNotifications(app.state.reservations, (storage.read(STORAGE_KEYS.resources, {}).bookingNotificationReads || []).map(row => row.key));
}
function badge(count) { return count ? `<span class="booking-notification-count">${count > 99 ? '99+' : count}</span>` : ''; }
export function notificationButton(app, extraClass = '') {
  const count = entries(app).filter(item => item.unread).length;
  return `<button type="button" class="booking-notification-button ${extraClass}" data-booking-notifications aria-label="Уведомления о бронированиях${count ? `, непрочитанных: ${count}` : ''}" aria-controls="booking-notifications-panel" aria-expanded="false" title="Уведомления о бронированиях">${bell}${badge(count)}</button>`;
}
function dateText(record) {
  const date = new Date(`${record.date}T12:00:00`);
  const formatted = Number.isNaN(date.getTime()) ? record.date || '' : new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long'}).format(date);
  return [formatted, record.time].filter(Boolean).join(' · ');
}
export function installBookingNotifications(app) {
  let anchor = null, syncing = false, error = false;
  const panel = document.createElement('section');
  panel.id = 'booking-notifications-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Уведомления о бронированиях');
  document.body.append(panel);
  function position() {
    if (panel.hidden || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + 'px';
    panel.style.top = rect.bottom + 10 + 'px';
    panel.style.maxHeight = Math.max(100, window.innerHeight - rect.bottom - 24) + 'px';
  }
  function close(focus = false) {
    panel.hidden = true;
    if (focus && anchor?.isConnected) anchor.focus();
    refresh();
  }
  function refresh() {
    const notifications = entries(app), count = notifications.filter(item => item.unread).length;
    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusBooking = focused?.dataset.notificationBooking;
    const focusClose = focused?.hasAttribute('data-notification-close');
    const focusAll = focused?.hasAttribute('data-notification-read-all');
    document.querySelectorAll('[data-booking-notifications]').forEach(button => {
      button.innerHTML = bell + badge(count);
      button.setAttribute('aria-label', 'Уведомления о бронированиях' + (count ? `, непрочитанных: ${count}` : ''));
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    if (panel.hidden) return;
    // The home page may have repainted after a reservation update.
    if (!anchor?.isConnected) anchor = [...document.querySelectorAll('[data-booking-notifications]')].find(button => button.getClientRects().length);
    panel.innerHTML = `<div class="booking-notifications-head"><div><h2>Уведомления</h2><p>${count ? `Непрочитанных: ${count}` : 'Всё прочитано'}</p></div><button type="button" data-notification-close aria-label="Закрыть уведомления">×</button></div><div class="booking-notifications-toolbar"><span>Бронирования</span><button type="button" data-notification-read-all ${count ? '' : 'disabled'}>Прочитать все</button></div>${error ? '<p class="booking-notifications-error" role="status">Не удалось обновить список. Проверьте локальный сервер.</p>' : ''}<div class="booking-notifications-list">${notifications.length ? notifications.slice(0, 100).map(item => {const r = item.reservation;return `<button type="button" class="booking-notification-item ${item.unread ? 'unread' : ''}" data-notification-booking="${esc(String(r.id))}"><span class="booking-notification-symbol">${bell}</span><span class="booking-notification-details"><strong>${esc(r.name || 'Гость без имени')}</strong><span>${esc(dateText(r))} · Гостей: ${Number(r.guests) || 1}</span><small>${esc(r.status || 'Новая бронь')}${r.source ? ` · ${esc(r.source)}` : ''}</small></span>${item.unread ? '<span class="booking-notification-dot" aria-label="Непрочитано"></span>' : ''}</button>`;}).join('') : `<div class="booking-notifications-empty">${bell}<strong>Уведомлений пока нет</strong><p>Здесь появятся новые бронирования.</p></div>`}</div>`;
    position();
    const nextFocus = focusClose ? panel.querySelector('[data-notification-close]') : focusAll ? panel.querySelector('[data-notification-read-all]') : focusBooking ? [...panel.querySelectorAll('[data-notification-booking]')].find(button => button.dataset.notificationBooking === focusBooking) : null;
    nextFocus?.focus({preventScroll:true});
  }
  async function markRead(keys) {
    const resources = storage.read(STORAGE_KEYS.resources, {});
    const readKeys = markBookingNotificationsRead((resources.bookingNotificationReads || []).map(row => row.key), keys, app.state.reservations);
    resources.bookingNotificationReads = entries(app).filter(item => readKeys.includes(item.key)).map(item => ({id: String(item.reservation.id), key: item.key}));
    if (!storage.write(STORAGE_KEYS.resources, resources)) return false;
    await storage.flush();
    if (storage.persistence.status === 'error') { toast('Не удалось сохранить отметку о прочтении'); return false; }
    refresh();
    return true;
  }
  async function sync() {
    if (syncing || document.hidden) return;
    syncing = true;
    try { await storage.sync(); error = false; } catch { error = true; }
    finally { syncing = false; refresh(); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-booking-notifications]');
    if (!button) return;
    if (!panel.hidden) { close(); return; }
    anchor = button; panel.hidden = false; refresh(); sync();
    panel.querySelector('[data-notification-close]').focus({preventScroll:true});
  });
  panel.addEventListener('click', async event => {
    if (event.target.closest('[data-notification-close]')) { close(true); return; }
    if (event.target.closest('[data-notification-read-all]')) { await markRead(entries(app).map(item => item.key)); return; }
    const button = event.target.closest('[data-notification-booking]');
    if (!button) return;
    const record = app.state.reservations.find(item => String(item.id) === button.dataset.notificationBooking);
    if (!record) { toast('Бронирование больше недоступно'); refresh(); return; }
    const item = entries(app).find(item => item.reservation.id === record.id);
    if (item) await markRead([item.key]);
    close();
    app.bookingModal(false, null, record.id);
  });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !event.target.closest('[data-booking-notifications]')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); } });
  window.addEventListener('resize', position);
  window.addEventListener('hashchange', () => close());
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('persistence:update', refresh);
  function poll() { setTimeout(async () => { await sync(); poll(); }, 10000); }
  poll(); refresh();
  return {refresh, close};
}
