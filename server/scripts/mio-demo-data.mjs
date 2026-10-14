// MIO! — безопасное тестовое наполнение: node scripts/mio-demo-data.mjs --apply
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseStore } from '../src/database/store.js';
import { StateService } from '../src/services/state.js';
import { validateReservation } from '../contracts/reservations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.env.MIO_DB_PATH || path.join(root, 'data', 'mio.sqlite');
const mode = process.argv[2];
if (!['--apply', '--remove-demo'].includes(mode)) {
  console.log('Использование: node scripts/mio-demo-data.mjs --apply | --remove-demo');
  console.log('Существующие реальные данные не заменяются. Резервные файлы не создаются.');
  process.exit(0);
}
if (!existsSync(dbFile)) throw new Error('База данных не найдена: ' + dbFile);
const seed = JSON.parse(readFileSync(path.join(root, 'config', 'seed.json'), 'utf8'));
const store = new DatabaseStore(dbFile, seed);
try {
  const service = new StateService(store);
  const snapshot = service.snapshot();
  const { app, guests: guestDoc } = snapshot.collections;
  const demo = id => String(id).startsWith('mio-demo-20261014-');
  if (mode === '--remove-demo') {
    const changes = {
      app: {
        ...app,
        reservations: app.reservations.filter(r => !demo(r.id)),
        waitlist: app.waitlist.filter(r => !demo(r.id)),
      },
      guests: { ...guestDoc, guests: guestDoc.guests.filter(g => !demo(g.id)) },
    };
    const removed = (app.reservations.length - changes.app.reservations.length) + (app.waitlist.length - changes.app.waitlist.length) + (guestDoc.guests.length - changes.guests.guests.length);
    if (!removed) { console.log('Тестовых записей для удаления нет.'); process.exit(0); }
    service.commit({ baseRevision: snapshot.revision, changes });
    console.log('Удалены только тестовые записи:', removed);
    process.exit(0);
  }
  if ([...app.reservations, ...app.waitlist, ...guestDoc.guests].some(r => demo(r.id))) {
    console.log('Тестовые записи уже присутствуют. Повторное добавление отменено.');
    process.exit(0);
  }
  const names = [
    ['Анна', 'Коваль'], ['Максим', 'Шевченко'], ['София', 'Петренко'],
    ['Александр', 'Мельник'], ['Мария', 'Бондаренко'], ['Даниил', 'Савченко'],
    ['Елена', 'Иванова'], ['Никита', 'Романюк'], ['Ольга', 'Климова'],
    ['Артём', 'Литвин'], ['Катерина', 'Орлова'], ['Виктор', 'Мороз'],
    ['Ирина', 'Ткаченко'], ['Игорь', 'Бойко'], ['Алина', 'Павлова'],
    ['Роман', 'Белый'], ['Дарья', 'Соколова'], ['Полина', 'Левченко'],
    ['Андрей', 'Волков'], ['Юлия', 'Кравец'], ['Тимур', 'Новиков'],
    ['Вера', 'Зайцева'], ['Кирилл', 'Черненко'], ['Наталья', 'Руденко'],
    ['Богдан', 'Демченко'], ['Эмилия', 'Лукаш'], ['Михаил', 'Захаров'],
    ['Валерия', 'Сидоренко'], ['Павел', 'Гриценко'], ['Лиза', 'Федорова'],
  ];
  const people = names.map(([first, last], i) => ({
    id: `mio-demo-20261014-guest-${i + 1}`,
    first: `ТЕСТ ${first}`, last,
    phone: '', email: `mio.demo.${i + 1}@example.com`,
    notes: i % 5 === 0 ? 'Тестовый постоянный гость' : 'Тестовая запись MIO!',
    marketing: false, tagIds: [], reservations: [],
  }));
  const now = new Date();
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const iso = n => new Date(day.getTime() + n * 86400000).toISOString().slice(0, 10);
  const rooms = Object.keys(app.rooms).filter(r => Array.isArray(snapshot.collections.floor[r]) && snapshot.collections.floor[r].length);
  if (!rooms.length) throw new Error('В базе нет залов со столами.');
  const statuses = ['Не подтверждено', 'Подтверждено', 'Ожидает визита', 'Пришёл', 'Завершено', 'Не пришёл', 'Отменено гостем', 'Отказано'];
  const sources = ['В ресторане', 'Сайт', 'Телефон', 'Google', 'Виджет бронирования'];
  const reservations = [];
  let skipped = 0;
  for (let offset = -28; offset <= 14; offset++) {
    for (let slot = 0; slot < 3; slot++) {
      const index = (offset + 28) * 3 + slot;
      const person = people[index % people.length];
      const room = rooms[(index + slot) % rooms.length];
      const tables = snapshot.collections.floor[room].map(t => String(t[0]));
      const times = ['12:00', '15:00', '19:00'];
      const status = offset < -1 ? statuses[4 + (index % 4)] : offset > 0 ? statuses[index % 3] : statuses[index % 5];
      let candidate = null;
      for (let step = 0; step < tables.length; step++) {
        const table = tables[(index + step) % tables.length];
        const test = {
          id: `mio-demo-20261014-res-${index}`,
          guestId: person.id, name: `${person.first} ${person.last}`,
          phone: '', email: person.email,
          date: iso(offset), time: times[slot], guests: 1 + (index % 6), duration: 90,
          room, table, status, source: sources[index % sources.length],
          notes: index % 7 === 0 ? 'ТЕСТ: день рождения, тихий стол' : 'Тестовое бронирование',
        };
        const conflict = validateReservation(test, [...app.reservations, ...reservations], snapshot.collections.blocks, snapshot.collections.blocked);
        if (!conflict) { candidate = test; break; }
      }
      if (candidate) reservations.push(candidate); else skipped++;
    }
  }
  const waitlist = [];
  for (let i = 0; i < 15; i++) {
    const person = people[(i * 2 + 3) % people.length];
    waitlist.push({
      id: `mio-demo-20261014-wait-${i}`, guestId: person.id,
      name: `${person.first} ${person.last}`, phone: '', email: person.email,
      date: iso(i % 9), time: ['13:30','18:00','20:30'][i % 3],
      guests: 2 + i % 5, duration: 90, room: rooms[i % rooms.length],
      table: '', status: 'Не подтверждено', source: sources[i % sources.length],
      notes: 'ТЕСТ: лист ожидания',
    });
  }
  const changes = {
    app: { ...app, reservations: [...app.reservations, ...reservations], waitlist: [...app.waitlist, ...waitlist] },
    guests: { ...guestDoc, guests: [...guestDoc.guests, ...people] },
  };
  service.commit({ baseRevision: snapshot.revision, changes });
  console.log(`Добавлено: ${reservations.length} бронирований, ${waitlist.length} записей листа ожидания, ${people.length} гостей.`);
  if (skipped) console.log('Пропущено из-за ограничений или занятых столов:', skipped);
  console.log('Даты:', iso(-28), '—', iso(14));
  console.log('Для удаления: node scripts/mio-demo-data.mjs --remove-demo');
} finally { store.close(); }
