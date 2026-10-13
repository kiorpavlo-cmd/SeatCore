export function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
export async function readJson(request, limit = 16 * 1024 * 1024) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw Object.assign(new Error("Требуется application/json"), {
      status: 415,
      code: "CONTENT_TYPE",
    });
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit)
      throw Object.assign(new Error("Запрос превышает 16 МБ"), {
        status: 413,
        code: "BODY_TOO_LARGE",
      });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Некорректный JSON"), {
      status: 400,
      code: "INVALID_JSON",
    });
  }
}
