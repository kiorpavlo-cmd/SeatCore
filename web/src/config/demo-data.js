import { initial } from "./defaults.js";
import { STORAGE_KEYS } from "../services/storage.js";

const DEMO_SEED_KEY = "seatcore-pages-demo-seed-v2";

export const demoFloor = {
  main: [
    [6, 101, 164, "long", null, { width: 44, height: 72, rotation: 0 }],
    [7, 211, 86, "round", null, { width: 62, height: 62, rotation: 0 }],
    [8, 229, 226.5, null, null, { width: 44, height: 43, rotation: 0 }],
    [9, 220, 294],
    [10, 298, 294],
    [11, 370, 294],
    [12, 447, 294],
    [13, 538, 294, "long"],
    [22, 170, 374],
    [23, 73, 410, "wide"],
    [20, 289, 410, "wide"],
    [18, 366, 374],
    [16, 456, 374],
    [14, 538, 374],
    [21, 170, 448],
    [19, 366, 448],
    [17, 456, 448],
    [15, 538, 448],
  ],
  terrace: [["27 SUM", 112, 208]],
};

function localDate() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function sampleReservations(date) {
  return [
    {
      id: "seatcore-pages-demo-1",
      name: "ТЕСТ Гость 1",
      phone: "",
      email: "guest1@example.com",
      date,
      time: "12:00",
      guests: 1,
      duration: 90,
      room: "main",
      table: "20",
      status: "Завершено",
      source: "Демо",
    },
    {
      id: "seatcore-pages-demo-2",
      name: "ТЕСТ Гость 2",
      phone: "",
      email: "guest2@example.com",
      date,
      time: "15:00",
      guests: 2,
      duration: 90,
      room: "main",
      table: "18",
      status: "Не подтверждено",
      source: "Демо",
    },
    {
      id: "seatcore-pages-demo-3",
      name: "ТЕСТ Гость 3",
      phone: "",
      email: "guest3@example.com",
      date,
      time: "19:00",
      guests: 3,
      duration: 90,
      room: "main",
      table: "16",
      status: "Подтверждено",
      source: "Демо",
    },
  ];
}

function tableCount(rooms) {
  if (!rooms || typeof rooms !== "object") return 0;
  return Object.values(rooms).reduce(
    (total, tables) => total + (Array.isArray(tables) ? tables.length : 0),
    0,
  );
}

export function seedDemoData(repository) {
  if (repository.getItem(DEMO_SEED_KEY)) return;

  const app = repository.read(STORAGE_KEYS.app, null);
  if (
    !app ||
    !Array.isArray(app.reservations) ||
    app.reservations.length === 0
  ) {
    const date = localDate();
    repository.write(STORAGE_KEYS.app, {
      ...structuredClone(initial),
      ...(app || {}),
      date,
      reservations: sampleReservations(date),
    });
  }

  const storedFloor = repository.read(STORAGE_KEYS.floor, null);
  if (!storedFloor || tableCount(storedFloor) === 32) {
    repository.write(STORAGE_KEYS.floor, structuredClone(demoFloor));
  }

  const account = repository.read(STORAGE_KEYS.account, {});
  if (!account.profile?.name || account.profile.name === "Ресторан") {
    repository.write(STORAGE_KEYS.account, {
      ...account,
      profile: {
        ...account.profile,
        name: "Демо-ресторан",
        email: "demo@example.com",
      },
    });
  }

  repository.setItem(DEMO_SEED_KEY, "1");
}
