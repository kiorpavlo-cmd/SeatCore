export const ROLES = [
  "Сотрудник",
  "Кол-центр",
  "Руководитель кол-центра",
  "Менеджер",
  "Групповой менеджер",
];
export const PERMISSION_DEFINITIONS = [
  [
    "delete_profiles",
    "Удаление профилей гостей",
    "Безвозвратное удаление профилей гостей",
    "00011",
  ],

  [
    "view_shared",
    "Просмотр общих гостей группы",
    "Просмотр общих гостей других ресторанов группы",
    "00010",
  ],

  [
    "segments",
    "Создание сегментов нескольких ресторанов",
    "Создание сегментов гостей для маркетинговых рассылок",
    "10000",
  ],

  [
    "manage_permissions",
    "Управление правами доступа",
    "Изменение разрешений для ролей",
    "00011",
  ],

  ["import", "Импорт гостей и бронирований", "Импорт данных из CSV", "11111"],

  ["navi", "Доступ к Navi", "Открытие и использование помощника Navi", "00111"],

  [
    "manage_guests",
    "Управление гостями",
    "Создание и изменение профилей гостей",
    "11111",
  ],

  [
    "manage_reservations",
    "Управление бронированиями",
    "Создание и изменение бронирований",
    "11111",
  ],

  [
    "merge_guests",
    "Объединение гостей",
    "Объединение повторяющихся профилей",
    "11111",
  ],

  [
    "reservation_taker",
    "Обязательное указание сотрудника при создании",
    "При создании бронирования необходимо указать принявшего его сотрудника",
    "10000",
  ],

  [
    "reservation_editor",
    "Обязательное указание сотрудника при изменении",
    "При редактировании необходимо указать сотрудника",
    "10000",
  ],

  ["invoices", "Управление счетами", "Просмотр и управление счетами", "11111"],

  [
    "restaurant_users",
    "Управление пользователями ресторана",
    "Создание профилей новых сотрудников",
    "00011",
  ],

  [
    "admin",
    "Управление административной панелью",
    "Доступ к административным настройкам",
    "00011",
  ],

  [
    "disable_reservation_deletion",
    "Запрет удаления бронирований",
    "Ограничение удаления бронирований, созданных внутри ресторана",
    "10000",
  ],

  [
    "closing_period",
    "Управление блокировкой времени",
    "Блокировка и разблокировка интервалов бронирования",
    "11111",
  ],

  [
    "crm_tagging",
    "Массовое присвоение тегов CRM",
    "Массовое добавление тегов гостям",
    "11111",
  ],

  [
    "tags",
    "Управление тегами",
    "Создание и изменение тегов гостей и бронирований",
    "11111",
  ],

  [
    "crm_messages",
    "Управление CRM-рассылками",
    "Создание маркетинговых сообщений",
    "11111",
  ],

  [
    "message_templates",
    "Управление шаблонами сообщений",
    "Создание и изменение шаблонов SMS и электронной почты",
    "11111",
  ],

  [
    "advanced_reports",
    "Расширенные отчёты",
    "Просмотр полного набора отчётов",
    "11111",
  ],

  [
    "download_reservations",
    "Скачивание отчётов по бронированиям",
    "Экспорт отчётов по бронированиям",
    "11111",
  ],

  ["manage_crm", "Управление CRM", "Просмотр отчётов по гостям", "11111"],

  [
    "download_crm",
    "Скачивание данных CRM",
    "Экспорт отчётов по гостям",
    "11111",
  ],

  [
    "shifts",
    "Управление сменами онлайн-бронирования",
    "Создание и изменение интервалов доступности",
    "11111",
  ],

  [
    "day_notes",
    "Управление заметками дня",
    "Создание и изменение ежедневных заметок",
    "11111",
  ],
];

export const PERMISSION_IDS = PERMISSION_DEFINITIONS.map(([id]) => id);
export function effectivePermissions(staff, settings = {}, owner = false) {
  const role = ROLES.indexOf(staff?.role);
  const email = String(staff?.email || "")
    .trim()
    .toLowerCase();
  const grants = {
    delete_profiles: staff?.deleteGuests,
    merge_guests: staff?.mergeGuests,
    view_shared: staff?.shared,
  };
  return Object.fromEntries(
    PERMISSION_DEFINITIONS.map(([id, , , flags]) => {
      if (owner)
        return [
          id,
          id !== "disable_reservation_deletion" &&
            id !== "reservation_taker" &&
            id !== "reservation_editor",
        ];
      const item = settings[id];
      const overrides = (
        Array.isArray(item?.overrides) ? item.overrides : []
      ).filter((row) => row?.email?.trim().toLowerCase() === email);
      if (overrides.some((row) => row.value === "deny")) return [id, false];
      if (overrides.some((row) => row.value === "allow")) return [id, true];
      if (grants[id] === false) return [id, false];
      const roles =
        Array.isArray(item?.roles) && item.roles.length === ROLES.length
          ? item.roles
          : flags.split("").map((flag) => flag === "1");
      return [
        id,
        Boolean((role >= 0 && roles[role] === true) || grants[id] === true),
      ];
    }),
  );
}
