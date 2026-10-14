const text = (key, label, required = false) => ({ key, label, required });
const select = (key, label, options) => ({ key, label, options });
const number = (key, label) => ({ key, label, type: "number" });
const area = (key, label) => ({ key, label, type: "textarea" });
export const resources = {
  "Библиотека сообщений": {
    id: "templates",
    fields: [
      text("name", "Название", true),
      select("channel", "Канал", ["Email", "SMS", "WhatsApp"]),
      text("subject", "Тема"),
      area("body", "Текст сообщения"),
    ],
  },
  "Автоматические сообщения": {
    id: "automations",
    fields: [
      text("name", "Название", true),
      select("trigger", "Событие", [
        "Создание бронирования",
        "Подтверждение",
        "За день до визита",
        "После визита",
        "Отмена",
      ]),
      area("body", "Текст"),
      select("status", "Состояние", ["Черновик", "Подготовлено"]),
    ],
  },
  "Рассылки и кампании": {
    id: "campaigns",
    fields: [
      text("name", "Название", true),
      text("subject", "Тема"),
      area("body", "Содержание"),
      text("segment", "Сегмент гостей"),
      select("status", "Состояние", ["Черновик", "Подготовлено"]),
    ],
  },
  Смены: {
    id: "shifts",
    fields: [
      text("name", "Название", true),
      { key: "start", label: "Начало", type: "time", required: true },
      { key: "end", label: "Окончание", type: "time", required: true },
      number("capacity", "Лимит гостей"),
    ],
  },
  "Варианты рассадки": {
    id: "seating",
    fields: [
      text("name", "Название", true),
      number("min", "Минимум гостей"),
      number("max", "Максимум гостей"),
      number("duration", "Длительность, мин"),
    ],
  },
  "Объединение столов": {
    id: "groups",
    fields: [
      text("name", "Название", true),
      text("tables", "Номера столов через запятую", true),
      select("room", "Зал", ["Основной зал", "Летняя терраса"]),
    ],
  },
  "База знаний чат-бота": {
    id: "knowledge",
    fields: [text("name", "Вопрос", true), area("body", "Ответ")],
  },
  Опросы: {
    id: "surveys",
    fields: [text("name", "Название", true), area("body", "Вопросы")],
  },
  "Настройки отзывов": {
    id: "review-settings",
    fields: [
      text("name", "Название", true),
      text("url", "Ссылка на отзывы"),
      number("delay", "После визита, часов"),
    ],
  },
  "Отзывы за столом": {
    id: "reviews",
    fields: [
      text("name", "Гость", true),
      number("rating", "Оценка от 1 до 5"),
      area("body", "Отзыв"),
    ],
  },
};
resources["Автоматизация"] = resources["Автоматические сообщения"];
resources["Онлайн-отзывы"] = resources["Отзывы за столом"];
export const externalRoutes = new Set([
  "WhatsApp",
  "Гостевой чат-бот Navi",
  "Агент Navi",
  "Настройка Navi",
  "Входящие чаты",
  "Счета",
  "Изменение тарифа",
  "Управление репутацией",
]);
