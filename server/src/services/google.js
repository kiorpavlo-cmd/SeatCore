import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { AppError } from "../domain/errors.js";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const LOCATION_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEW_API = "https://mybusiness.googleapis.com/v4";
const PROFILE_MASK =
  "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

export class GoogleService {
  constructor(store, options = {}) {
    this.store = store;
    this.db = store.db;
    this.fetch = options.fetcher || globalThis.fetch;
    this.now = options.now || Date.now;
    this.clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
    this.clientSecret =
      options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
    this.redirectUri =
      options.redirectUri ??
      process.env.GOOGLE_REDIRECT_URI ??
      `http://127.0.0.1:${process.env.PORT || 4175}/api/v1/google/callback`;
    const key = options.encryptionKey ?? process.env.MIO_GOOGLE_TOKEN_KEY ?? "";
    this.key = /^[0-9a-f]{64}$/i.test(key) ? Buffer.from(key, "hex") : null;
    this.refreshing = null;
    this.generation = 0;
  }

  configurationStatus() {
    const missing = [];
    if (!this.clientId.trim()) missing.push("GOOGLE_CLIENT_ID");
    if (!this.clientSecret.trim()) missing.push("GOOGLE_CLIENT_SECRET");
    if (!this.key) missing.push("MIO_GOOGLE_TOKEN_KEY");
    try {
      const uri = new URL(this.redirectUri);
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname) ||
        uri.protocol !== "http:" ||
        uri.pathname !== "/api/v1/google/callback" ||
        uri.search ||
        uri.hash ||
        uri.username ||
        uri.password
      ) {
        missing.push("GOOGLE_REDIRECT_URI");
      }
    } catch {
      missing.push("GOOGLE_REDIRECT_URI");
    }
    return {
      configured: missing.length === 0,
      missing,
      redirectUri: this.redirectUri,
    };
  }

  configured() {
    if (!this.configurationStatus().configured)
      fail(
        503,
        "GOOGLE_NOT_CONFIGURED",
        "Подключение Google ещё не настроено на сервере",
      );
  }

  seal(value) {
    this.configured();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((x) => x.toString("base64"))
      .join(".");
  }

  open(value) {
    this.configured();
    try {
      const [iv, tag, encrypted] = value
        .split(".")
        .map((x) => Buffer.from(x, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(encrypted), decipher.final()]),
      );
    } catch {
      fail(
        503,
        "GOOGLE_KEY_CHANGED",
        "Не удалось прочитать подключение Google. Проверьте ключ сервера или подключитесь заново",
      );
    }
  }

  connection(userId) {
    return this.db
      .prepare("SELECT * FROM google_connection WHERE user_id=?")
      .get(userId);
  }

  status(userId) {
    const connection = this.connection(userId);
    return {
      ...this.configurationStatus(),
      connected: Boolean(connection),
      selected:
        connection?.account && connection?.location
          ? { account: connection.account, location: connection.location }
          : null,
    };
  }

  begin(userId, sessionToken) {
    this.configured();
    if (!userId || !sessionToken)
      fail(401, "UNAUTHORIZED", "Сначала войдите в Mio!");
    this.generation++;
    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(32).toString("base64url");
    this.db
      .prepare(
        "DELETE FROM google_oauth_states WHERE expires_at<=? OR user_id=?",
      )
      .run(this.now(), userId);
    this.db
      .prepare("INSERT INTO google_oauth_states VALUES(?,?,?,?,?)")
      .run(
        digest(state),
        userId,
        digest(sessionToken),
        verifier,
        this.now() + 600000,
      );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      state,
      access_type: "offline",
      prompt: "consent",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return { url: url.href };
  }

  async finish({ state, code, error }, userId, sessionToken) {
    this.configured();
    if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state))
      fail(
        400,
        "GOOGLE_INVALID_STATE",
        "Ссылка подключения недействительна. Начните подключение заново",
      );
    const pending = this.db
      .prepare("SELECT * FROM google_oauth_states WHERE state_hash=?")
      .get(digest(state));
    if (
      !pending ||
      pending.user_id !== userId ||
      pending.session_hash !== digest(sessionToken || "") ||
      pending.expires_at <= this.now()
    )
      fail(
        400,
        "GOOGLE_INVALID_STATE",
        "Сессия подключения истекла. Начните подключение заново",
      );
    this.db
      .prepare("DELETE FROM google_oauth_states WHERE state_hash=?")
      .run(digest(state));
    if (error)
      fail(400, "GOOGLE_CONSENT_DENIED", "Доступ к Google не предоставлен");
    if (typeof code !== "string" || !code || code.length > 4096)
      fail(400, "GOOGLE_INVALID_CODE", "Google не вернул код подключения");
    const generation = this.generation;
    const tokens = await this.tokenRequest({
      code,
      code_verifier: pending.verifier,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    });
    if (!tokens.scope?.split(" ").includes(GOOGLE_SCOPE))
      fail(
        403,
        "GOOGLE_SCOPE_REQUIRED",
        "Предоставьте доступ к профилю компании при подключении Google",
      );
    if (!tokens.refresh_token)
      fail(
        400,
        "GOOGLE_OFFLINE_REQUIRED",
        "Google не выдал доступ для повторного подключения. Повторите вход с подтверждением разрешений",
      );
    if (generation !== this.generation)
      fail(
        409,
        "GOOGLE_CONNECTION_CHANGED",
        "Подключение отменено. Начните заново",
      );
    const encrypted = this.seal(this.normalizeTokens(tokens));
    this.store.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO google_connection
        (user_id,connection_id,tokens,account,location) VALUES(?,?,?,'','')
        ON CONFLICT(user_id) DO UPDATE SET connection_id=excluded.connection_id,
        tokens=excluded.tokens,account='',location=''`,
        )
        .run(userId, randomUUID(), encrypted);
      this.store.log("Google", "Подключён аккаунт Google Business Profile");
    });
  }

  normalizeTokens(tokens, previous = {}) {
    if (
      typeof tokens.access_token !== "string" ||
      !tokens.access_token ||
      !Number.isFinite(Number(tokens.expires_in)) ||
      Number(tokens.expires_in) <= 0
    )
      fail(
        502,
        "GOOGLE_INVALID_RESPONSE",
        "Google вернул некорректные данные подключения",
      );
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || previous.refresh_token,
      expires_at: this.now() + Number(tokens.expires_in) * 1000,
    };
  }

  async tokenRequest(parameters) {
    let response;
    try {
      response = await this.fetch(TOKEN_URL, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          ...parameters,
        }).toString(),
      });
    } catch {
      fail(502, "GOOGLE_UNAVAILABLE", "Нет связи с Google. Попробуйте ещё раз");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      if (data?.error === "invalid_grant")
        fail(
          401,
          "GOOGLE_RECONNECT",
          "Доступ к Google истёк или отозван. Подключите Google заново",
        );
      fail(
        502,
        "GOOGLE_TOKEN_ERROR",
        "Google отклонил подключение. Проверьте настройки OAuth на сервере",
      );
    }
    return data;
  }

  async accessToken(connection, force = false) {
    const tokens = this.open(connection.tokens);
    if (!force && tokens.expires_at > this.now() + 60000)
      return tokens.access_token;
    if (this.refreshing?.id === connection.connection_id)
      return this.refreshing.promise;
    const promise = (async () => {
      const updated = this.normalizeTokens(
        await this.tokenRequest({
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
        tokens,
      );
      const result = this.db
        .prepare(
          "UPDATE google_connection SET tokens=? WHERE user_id=? AND connection_id=?",
        )
        .run(this.seal(updated), connection.user_id, connection.connection_id);
      if (!result.changes)
        fail(
          409,
          "GOOGLE_CONNECTION_CHANGED",
          "Подключение Google изменилось. Обновите страницу",
        );
      return updated.access_token;
    })();
    this.refreshing = { id: connection.connection_id, promise };
    try {
      return await promise;
    } finally {
      if (this.refreshing?.promise === promise) this.refreshing = null;
    }
  }

  requiredConnection(userId) {
    this.configured();
    const connection = this.connection(userId);
    if (!connection)
      fail(409, "GOOGLE_NOT_CONNECTED", "Сначала подключите Google");
    return connection;
  }

  async get(userId, url) {
    let connection = this.requiredConnection(userId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(connection, attempt === 1);
      let response;
      try {
        response = await this.fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        fail(
          502,
          "GOOGLE_UNAVAILABLE",
          "Нет связи с Google. Попробуйте ещё раз",
        );
      }
      if (response.status === 401 && attempt === 0) {
        connection = this.requiredConnection(userId);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        if (response.status === 401)
          fail(401, "GOOGLE_RECONNECT", "Подключите Google заново");
        if (response.status === 403)
          fail(
            403,
            "GOOGLE_ACCESS_DENIED",
            "Google запретил доступ. Проверьте права на заведение и доступ проекта к Business Profile API",
          );
        if (response.status === 429)
          fail(
            429,
            "GOOGLE_RATE_LIMIT",
            "Лимит запросов Google исчерпан. Попробуйте позже",
          );
        if (response.status === 404)
          fail(
            404,
            "GOOGLE_LOCATION_NOT_FOUND",
            "Заведение недоступно в Google. Проверьте выбранный профиль",
          );
        fail(502, "GOOGLE_API_ERROR", "Не удалось загрузить данные из Google");
      }
      if (this.connection(userId)?.connection_id !== connection.connection_id)
        fail(
          409,
          "GOOGLE_CONNECTION_CHANGED",
          "Подключение Google изменилось. Обновите страницу",
        );
      return data;
    }
  }

  pageUrl(base, pageToken, parameters = {}) {
    if (typeof pageToken !== "string" || pageToken.length > 4096)
      fail(400, "GOOGLE_INVALID_PAGE", "Некорректная страница результатов");
    const url = new URL(base);
    url.search = new URLSearchParams({
      ...parameters,
      ...(pageToken ? { pageToken } : {}),
    }).toString();
    return url.href;
  }

  async accounts(userId, pageToken = "") {
    return this.get(
      userId,
      this.pageUrl(`${ACCOUNT_API}/accounts`, pageToken, { pageSize: "20" }),
    );
  }

  validateAccount(account) {
    if (
      typeof account !== "string" ||
      !/^accounts\/[A-Za-z0-9_-]+$/.test(account)
    )
      fail(400, "GOOGLE_INVALID_ACCOUNT", "Выберите аккаунт Google");
  }

  async locations(userId, account, pageToken = "") {
    this.validateAccount(account);
    return this.get(
      userId,
      this.pageUrl(`${LOCATION_API}/${account}/locations`, pageToken, {
        pageSize: "100",
        readMask: PROFILE_MASK,
      }),
    );
  }

  async select(userId, account, location) {
    this.validateAccount(account);
    if (
      typeof location !== "string" ||
      !/^locations\/[A-Za-z0-9_-]+$/.test(location)
    )
      fail(400, "GOOGLE_INVALID_LOCATION", "Выберите заведение Google");
    const connection = this.requiredConnection(userId);
    let pageToken = "",
      found = false;
    const seen = new Set();
    do {
      const page = await this.locations(userId, account, pageToken);
      found = (page.locations || []).some((row) => row.name === location);
      pageToken = page.nextPageToken || "";
      if (seen.has(pageToken) && pageToken)
        fail(
          502,
          "GOOGLE_INVALID_RESPONSE",
          "Не удалось проверить список заведений Google",
        );
      seen.add(pageToken);
    } while (!found && pageToken);
    if (!found)
      fail(
        403,
        "GOOGLE_LOCATION_NOT_ALLOWED",
        "Заведение не принадлежит выбранному аккаунту",
      );
    const result = this.db
      .prepare(
        "UPDATE google_connection SET account=?,location=? WHERE user_id=? AND connection_id=?",
      )
      .run(account, location, userId, connection.connection_id);
    if (!result.changes)
      fail(
        409,
        "GOOGLE_CONNECTION_CHANGED",
        "Подключение Google изменилось. Обновите страницу",
      );
    return this.status(userId);
  }

  selected(userId) {
    const connection = this.requiredConnection(userId);
    if (!connection.account || !connection.location)
      fail(409, "GOOGLE_SELECT_LOCATION", "Выберите заведение Google");
    return connection;
  }

  async profile(userId) {
    const selected = this.selected(userId);
    return this.get(
      userId,
      this.pageUrl(`${LOCATION_API}/${selected.location}`, "", {
        readMask: PROFILE_MASK,
      }),
    );
  }

  async reviews(userId, pageToken = "") {
    const selected = this.selected(userId);
    return this.get(
      userId,
      this.pageUrl(
        `${REVIEW_API}/${selected.account}/${selected.location}/reviews`,
        pageToken,
        { pageSize: "50", orderBy: "updateTime desc" },
      ),
    );
  }

  async disconnect(userId) {
    const connection = this.connection(userId);
    this.generation++;
    let revoked = !connection;
    if (connection && this.configurationStatus().configured) {
      let token;
      try {
        token = this.open(connection.tokens).refresh_token;
      } catch {
        /* Remove unreadable local credentials too. */
      }
      if (token) {
        try {
          const response = await this.fetch(
            "https://oauth2.googleapis.com/revoke",
            {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token }).toString(),
              signal: AbortSignal.timeout(10000),
            },
          );
          const data = response.ok
            ? null
            : await response.json().catch(() => null);
          revoked = response.ok || data?.error === "invalid_token";
        } catch {
          /* Local disconnect must remain possible while Google is offline. */
        }
      }
    }
    // Do not erase a new connection established while revocation was in flight.
    this.db
      .prepare(
        "DELETE FROM google_connection WHERE user_id=? AND connection_id=?",
      )
      .run(userId, connection?.connection_id || "");
    this.db
      .prepare("DELETE FROM google_oauth_states WHERE user_id=?")
      .run(userId);
    return {
      disconnected: true,
      revoked,
      message: revoked
        ? "Google отключён"
        : "Google отключён в Mio!. Удалите доступ Mio! в настройках аккаунта Google",
    };
  }
}
