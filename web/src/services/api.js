export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function createApi(fetcher = globalThis.fetch, base = "/api") {
  return {
    async request(path, { method = "GET", body } = {}) {
      let response;
      try {
        response = await fetcher(base + path, {
          method,
          headers: {
            accept: "application/json",
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        throw new ApiError(0, "NETWORK_ERROR", "Нет связи с сервером");
      }
      const data = await response.json().catch(() => {
        throw new ApiError(
          response.status,
          "INVALID_RESPONSE",
          "Сервер вернул некорректный ответ",
        );
      });
      if (!response.ok)
        throw new ApiError(
          response.status,
          data.error?.code || "API_ERROR",
          data.error?.message || "Ошибка сервера",
          data.error?.details,
        );
      return data;
    },
  };
}
