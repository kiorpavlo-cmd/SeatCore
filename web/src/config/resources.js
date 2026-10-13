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
  "Сегменты гостей": {
    id: "segments",
    fields: [
      text("name", "Название", true),
      text("query", "Поиск по имени или контакту"),
      select("consent", "Согласие на маркетинг", [
        "Все гости",
        "Только с согласием",
      ]),
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
  "События и пакеты": {
    id: "events",
    fields: [
      text("name", "Название", true),
      { key: "date", label: "Дата", type: "date" },
      number("capacity", "Количество мест"),
      number("price", "Цена, EUR"),
      area("description", "Описание"),
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
  Заказы: {
    id: "orders",
    fields: [
      text("name", "Номер или название", true),
      text("guest", "Гость"),
      text("table", "Стол"),
      { key: "date", label: "Дата", type: "date" },
      number("amount", "Сумма, EUR"),
      select("status", "Статус", [
        "Новый",
        "Готовится",
        "Готов",
        "Выдан",
        "Отменён",
      ]),
    ],
  },
  Консьержи: {
    id: "concierges",
    fields: [
      text("name", "Имя", true),
      { key: "email", label: "Email", type: "email", required: true },
      text("phone", "Телефон"),
    ],
  },
  "База знаний чат-бота": {
    id: "knowledge",
    fields: [text("name", "Вопрос", true), area("body", "Ответ")],
  },
  "Отслеживание источников": {
    id: "sources",
    fields: [
      text("name", "Название", true),
      text("url", "Ссылка"),
      text("utm", "UTM-метка"),
    ],
  },
  Ваучеры: {
    id: "vouchers",
    fields: [
      text("name", "Код", true),
      number("amount", "Номинал, EUR"),
      { key: "expiry", label: "Действует до", type: "date" },
      select("status", "Статус", ["Черновик", "Выдан", "Использован"]),
    ],
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
  "Программа лояльности": {
    id: "loyalty",
    fields: [
      text("name", "Название", true),
      number("visits", "Необходимое число визитов"),
      area("description", "Условия"),
    ],
  },
  "Скидки за предоплату": {
    id: "discounts",
    fields: [
      text("name", "Название", true),
      number("percent", "Скидка, %"),
      area("description", "Условия"),
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
  "Маркетплейс",
  "Оплата за столом (Spades)",
  "Телефон",
  "Универсальный виджет",
  "QR-коды универсального виджета",
  "Виджет бронирования",
  "Входящие чаты",
  "Предоплата",
  "Сводка платежей",
  "Банковская карта",
  "Счета",
  "Изменение тарифа",
  "Дополнительные услуги",
  "Покупка принтера чеков",
  "Управление репутацией",
]);
