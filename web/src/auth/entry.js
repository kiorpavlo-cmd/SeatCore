import "./login.css";

const app = document.querySelector("#app");
const params = new window.URLSearchParams(window.location.search);
const resetToken = params.get("reset_token");

if (resetToken) {
  window.history.replaceState(
    null, "",
    window.location.pathname
  );
}

function layout(content) {
  app.innerHTML = `
    <main class="mio-auth">
      <section class="mio-auth-panel">
        <header class="mio-auth-header">
          <div class="mio-auth-logo">SeatCore</div>
          <span>УПРАВЛЕНИЕ РЕСТОРАНОМ</span>
        </header>
        ${content}
      </section>
    </main>
  `;
}

async function request(path, body) {
  let response;

  try {
    response = await window.fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error("Нет соединения с сервером");
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error(
        "Восстановление пароля пока недоступно. " +
        "Почтовый сервис не настроен или не отвечает."
      );
    }

    if (response.status === 401) {
      throw new Error("Неверный email или пароль");
    }

    if (response.status === 400) {
      throw new Error("Проверьте введённые данные или ссылку");
    }

    throw new Error("Ошибка сервера. Повторите позже.");
  }

  return response.json();
}

function errorHandler(form, button) {
  const error = form.querySelector("[role=alert]");

  return async (callback) => {
    error.textContent = "";
    button.disabled = true;

    try {
      await callback();
    } catch (issue) {
      error.textContent = issue.message;
    } finally {
      button.disabled = false;
    }
  };
}

function renderLogin() {
  layout(`
    <form class="mio-auth-form" id="mio-login-form">
      <h1>Вход в Mio!</h1>
      <label for="mio-email">Электронная почта</label>
      <input id="mio-email" type="email"
        autocomplete="username" required />

      <label for="mio-password">Пароль</label>
      <input id="mio-password" type="password"
        autocomplete="current-password" required />

      <p class="mio-auth-error" role="alert"></p>
      <button type="submit">Войти</button>
      <a href="#" id="mio-forgot">Забыли пароль?</a>
    </form>
  `);

  const form = document.querySelector("#mio-login-form");
  const button = form.querySelector("button");
  const run = errorHandler(form, button);

  form.addEventListener("submit", event => {
    event.preventDefault();

    run(async () => {
      await request("/api/auth/login", {
        email: form.querySelector("#mio-email").value.trim(),
        password: form.querySelector("#mio-password").value
      });

      form.querySelector("#mio-password").value = "";
      window.location.replace("/");
      window.location.reload();
    });
  });

  document.querySelector("#mio-forgot").onclick = event => {
    event.preventDefault();
    renderForgot();
  };
}

function renderForgot() {
  layout(`
    <form class="mio-auth-form" id="mio-forgot-form">
      <h1>Забыли пароль?</h1>
      <p class="mio-auth-description">
        Введите email вашего аккаунта.
        Мы отправим ссылку для создания нового пароля.
      </p>

      <label for="mio-recovery-email">
        Электронная почта
      </label>
      <input id="mio-recovery-email"
        type="email" autocomplete="email" required />

      <p class="mio-auth-error" role="alert"></p>
      <button type="submit">Отправить ссылку</button>
      <a href="#" class="mio-back">Вернуться ко входу</a>
    </form>
  `);

  const form = document.querySelector("#mio-forgot-form");
  const button = form.querySelector("button");
  const run = errorHandler(form, button);

  form.onsubmit = event => {
    event.preventDefault();

    run(async () => {
      await request("/api/auth/forgot-password", {
        email: form.querySelector(
          "#mio-recovery-email"
        ).value.trim()
      });

      layout(`
        <div class="mio-auth-form">
          <h1>Проверьте почту</h1>
          <p class="mio-auth-description">
            Если такой аккаунт существует,
            на его email отправлена инструкция.
          </p>
          <button id="mio-return">Вернуться ко входу</button>
        </div>
      `);

      document.querySelector("#mio-return").onclick =
        renderLogin;
    });
  };

  document.querySelector(".mio-back").onclick = event => {
    event.preventDefault();
    renderLogin();
  };
}

function renderReset(token) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    renderLogin();
    return;
  }

  layout(`
    <form class="mio-auth-form" id="mio-reset-form">
      <h1>Новый пароль</h1>
      <p class="mio-auth-description">
        Создайте новый пароль длиной не менее 12 символов.
      </p>

      <label for="mio-new-password">Новый пароль</label>
      <input id="mio-new-password" type="password"
        autocomplete="new-password" minlength="12" required />

      <label for="mio-confirm-password">
        Повторите пароль
      </label>
      <input id="mio-confirm-password" type="password"
        autocomplete="new-password" minlength="12" required />

      <p class="mio-auth-error" role="alert"></p>
      <button type="submit">Сохранить пароль</button>
    </form>
  `);

  const form = document.querySelector("#mio-reset-form");
  const button = form.querySelector("button");
  const run = errorHandler(form, button);

  form.onsubmit = event => {
    event.preventDefault();

    run(async () => {
      const password = form.querySelector(
        "#mio-new-password"
      ).value;

      const confirm = form.querySelector(
        "#mio-confirm-password"
      ).value;

      if (password !== confirm) {
        throw new Error("Пароли не совпадают");
      }

      await request("/api/auth/reset-password", {
        token,
        password
      });

      layout(`
        <div class="mio-auth-form">
          <h1>Пароль изменён</h1>
          <p class="mio-auth-description">
            Теперь вы можете войти с новым паролем.
          </p>
          <button id="mio-return">Перейти ко входу</button>
        </div>
      `);

      document.querySelector("#mio-return").onclick =
        renderLogin;
    });
  };
}

async function start() {
  if (resetToken) {
    renderReset(resetToken);
    return;
  }

  layout(`
    <div class="mio-auth-loading">Загрузка Mio!…</div>
  `);

  let response;

  try {
    response = await window.fetch("/api/auth/me", {
      credentials: "same-origin",
      cache: "no-store"
    });
  } catch (error) {
    console.error("MIO AUTH CHECK ERROR:", error);
    layout('<div class="mio-auth-loading">Нет соединения с сервером. Обновите страницу.</div>');
    return;
  }

  if (!response.ok) {
    if (response.status === 401) {
      renderLogin();
      return;
    }

    console.error("MIO AUTH HTTP ERROR:", response.status);
    layout('<div class="mio-auth-loading">Ошибка проверки авторизации. Обновите страницу.</div>');
    return;
  }

  try {
    await import("../app/main.js");
  } catch (error) {
    console.error("MIO APP START ERROR:", error);
    layout('<div class="mio-auth-loading">Ошибка запуска MIO!. Откройте консоль браузера.</div>');
  }
}

start();
