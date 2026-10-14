import { describe, it, expect } from 'vitest';
import { deleteFloorRoom } from '../../src/features/floor/rooms.js';
import { normalizeState } from '../../src/services/store.js';
import { normalizeFloor } from '../../src/services/repositories.js';
const draft = () => ({
  room:'main', positions:{main:[['1',0,0]],terrace:[['2',10,10]]}, rooms:{main:'Основной зал',terrace:'Терраса'},
  scenes:{main:[{id:'shape'}],terrace:[]}, backgrounds:{main:'image'},
  bookings:[{id:'booking',name:'Анна',date:'2026-10-13',time:'19:00',table:'1',guests:2},{id:'other',room:'terrace',table:'2'}],
  waitlist:[{id:'waiting',room:'main',table:'1'}], blocked:['main:1','terrace:2'],
  servers:[{id:'staff',tables:['main:1','terrace:2']}],
});
describe('Удаление залов', () => {
  it('сохраняет бронирования и ожидание без назначенного стола в выбранном зале', () => {
    const original=draft(), next=deleteFloorRoom(original,'main','terrace');
    expect(next.bookings[0]).toEqual({...original.bookings[0],room:'terrace',table:''});
    expect(next.waitlist[0]).toEqual({id:'waiting',room:'terrace',table:''});
    expect(next.bookings[1]).toEqual(original.bookings[1]);
    expect(original.bookings[0].table).toBe('1');
    expect(original.positions.main).toHaveLength(1);
  });
  it('удаляет план, оформление, блокировки и назначения официантов только этого зала', () => {
    const next=deleteFloorRoom(draft(),'main','terrace');
    for(const key of ['positions','rooms','scenes','backgrounds']) expect(next[key].main).toBeUndefined();
    expect(next.positions.terrace).toHaveLength(1);
    expect(next.blocked).toEqual(['terrace:2']);
    expect(next.servers[0].tables).toEqual(['terrace:2']);
    expect(next.room).toBe('terrace');
  });
  it('удалённые стандартные залы не возвращаются после сохранения и перезагрузки', () => {
    const next=JSON.parse(JSON.stringify(deleteFloorRoom(draft(),'main','terrace')));
    const state=normalizeState({rooms:next.rooms,room:'main',reservations:next.bookings});
    expect(state.rooms).toEqual({terrace:'Терраса'});
    expect(state.room).toBe('terrace');
    expect(normalizeFloor(next.positions,{main:[],terrace:[]})).toEqual({terrace:[['2',10,10]]});
  });
  it('сохраняет хотя бы один зал и проверяет место переноса', () => {
    expect(()=>deleteFloorRoom({...draft(),positions:{main:[]}},'main','terrace')).toThrow(/последнего/);
    expect(()=>deleteFloorRoom(draft(),'main','missing')).toThrow(/оставшийся/);
    expect(()=>deleteFloorRoom(draft(),'missing','main')).toThrow(/не найден/);
  });
});
