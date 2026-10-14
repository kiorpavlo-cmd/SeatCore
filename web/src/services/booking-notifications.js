// A reservation's current details identify the notification. Changes become unread again.
export function bookingNotificationKey(record) {
  return JSON.stringify([String(record.id), record.name || '', record.date || '', record.time || '', record.status || '', Number(record.guests) || 1, String(record.table || ''), record.room || 'main']);
}
export function bookingNotifications(reservations = [], readKeys = []) {
  const read = new Set(Array.isArray(readKeys) ? readKeys : []);
  return reservations.filter(record => record && record.id != null && !record.walkIn).map(record => ({
    key: bookingNotificationKey(record),
    reservation: record,
    unread: !read.has(bookingNotificationKey(record)),
  })).sort((a, b) => {
    const time = record => Date.parse(record.createdAt) || Number(record.id) || 0;
    return time(b.reservation) - time(a.reservation) || String(b.reservation.id).localeCompare(String(a.reservation.id));
  });
}
export function markBookingNotificationsRead(previous, keys, reservations) {
  const current = new Set(bookingNotifications(reservations).map(item => item.key));
  return [...new Set([...(Array.isArray(previous) ? previous : []), ...keys])].filter(key => current.has(key));
}
