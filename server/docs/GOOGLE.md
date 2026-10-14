# Google Business Profile в Mio!

Подключение позволяет выбрать принадлежащее вам заведение, просматривать его профиль и читать отзывы с оценками и существующими ответами ресторана. Кнопка «Обновить отзывы» запрашивает свежие данные; «Загрузить ещё» открывает следующую страницу. Изменение профиля и публикация ответов в Google в этой версии отсутствуют.

## Настройка администратора

1. Получите доступ проекта Google Cloud к Business Profile APIs. Google требует одобрение проекта; одного API-ключа Google Maps недостаточно.
2. Включите My Business Account Management API, My Business Business Information API и Google My Business API (v4 для отзывов).
3. Настройте OAuth consent screen и создайте OAuth client типа Web application. Для приложения в режиме Testing добавьте аккаунт владельца ресторана в Test users. Разрешение: `https://www.googleapis.com/auth/business.manage`.
4. Добавьте **точный** Authorized redirect URI: `http://127.0.0.1:4175/api/v1/google/callback`. Если изменяете порт или используете `localhost`, измените URI одновременно в Google Cloud и в `.env`. Открывайте Mio! через тот же адрес, чтобы браузер передал сессию при возврате.
5. Добавьте в `server/.env`:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:4175/api/v1/google/callback
MIO_GOOGLE_TOKEN_KEY=64-hexadecimal-characters
```

Для генерации ключа выполните:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Сохраните ключ в `.env`; сохраняйте его вместе с резервной копией конфигурации отдельно от исходников. При потере ключа потребуется повторное подключение Google. Токены шифруются AES-256-GCM и записываются в отдельную таблицу SQLite. Они не попадают в `/api/v1/state`, localStorage, CSV или клиентские резервные экспорты. OAuth client secret и ключ шифрования не отправляются в браузер.

6. Перезапустите сервер Mio!, войдите в приложение и откройте **Интеграции → Сервисы → Google → Войти через Google**. Предоставьте разрешение, выберите аккаунт компании и заведение. Для загрузки отзывов Google требует подтверждённое заведение.
7. Просматривайте отзывы в диалоге Google или в **Гости → Онлайн-отзывы**.

OAuth возвращается в текущую сессию Mio!. Одноразовый `state` действует 10 минут, привязан к сессии, используется вместе с PKCE. Доступ автоматически обновляется refresh token. Если доступ отозван, интерфейс предлагает повторное подключение.

## Отключение

Кнопка «Отключить Google» удаляет локальные ключи и пытается отозвать доступ у Google. Если Google недоступен или ключ шифрования изменён, Mio! всё равно удаляет локальное подключение и просит удалить доступ вручную на https://myaccount.google.com/connections.

Данные профиля и отзывы читаются по запросу, не сохраняются в CRM и не экспортируются вместе с локальными отзывами. Ручные отзывы «за столом» остаются отдельным источником данных.

## Ошибки

- «Требуется настройка»: отсутствует client ID, secret, корректный ключ шифрования или redirect URI.
- «Доступ запрещён»: Business Profile APIs не одобрены/не включены либо аккаунту не разрешено управлять заведением.
- «Нет доступных заведений»: выберите аккаунт владельца или управляющего, проверьте аккаунт компании.
- «Лимит запросов»: проверьте квоты проекта Google; интерфейс позволяет повторить запрос позже.
- Ошибка возвращения OAuth: проверьте точное совпадение redirect URI и адреса, через который вы вошли в Mio!.

## Проверка

Серверные тесты используют подменённый HTTP-клиент Google, тестовую SQLite и проверяют OAuth, шифрование, выбор заведения, пагинацию, обновление доступа, отключение и защиту маршрутов. Они не обращаются к Google. Живое подключение требует настроенного Google Cloud проекта и входа владельца; прохождение тестов не подтверждает наличие такого доступа.

Официальная документация:

- https://developers.google.com/my-business/content/basic-setup
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list
- https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
- https://developers.google.com/my-business/content/policies
