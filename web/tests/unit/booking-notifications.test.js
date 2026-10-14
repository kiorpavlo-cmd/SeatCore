import { describe, it, expect } from 'vitest';
import { bookingNotifications, markBookingNotificationsRead } from '../../src/services/booking-notifications.js';

const record = { id:'booking-1', name:'Анна', date:'2026-10-14', time:'19:00', guests:2, status:'Подтверждено', createdAt:'2026-10-13T19:00:00Z' };
describe('Уведомления о бронированиях', () => {
  it('новые брони непрочитаны, отметка сохраняется при повторном открытии', () => {
    const list = bookingNotifications([record]);
    expect(list[0].unread).toBe(true);
    const saved = JSON.parse(JSON.stringify(markBookingNotificationsRead([], [list[0].key], [record])));
    expect(bookingNotifications([record], saved)[0].unread).toBe(false);
  });
  it('изменение времени или отмена требует нового прочтения', () => {
    const read = [bookingNotifications([record])[0].key];
    expect(bookingNotifications([{...record,time:'20:00'}], read)[0].unread).toBe(true);
    expect(bookingNotifications([{...record,status:'Отменено гостем'}], read)[0].unread).toBe(true);
  });
  it('новая бронь не теряется при прочтении предыдущих', () => {
    const next = {...record,id:'booking-2',createdAt:'2026-10-13T20:00:00Z'};
    const read = markBookingNotificationsRead([], [bookingNotifications([record])[0].key], [record,next]);
    const notifications = bookingNotifications([record,next],read);
    expect(notifications[0].reservation.id).toBe('booking-2');
    expect(notifications.filter(item=>item.unread)).toHaveLength(1);
  });
  it('быстрые посадки не выдаются за новые бронирования; удалённые записи не остаются в списке', () => {
    expect(bookingNotifications([{...record,walkIn:true}])).toEqual([]);
    expect(markBookingNotificationsRead(['removed-key'], [], [record])).toEqual([]);
  });
});
