import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../domain/errors.js";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
export async function serveStatic(request, response, pathname, directory) {
  if (!["GET", "HEAD"].includes(request.method))
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается");
  const base = await realpath(directory);
  const candidate = path.resolve(
    base,
    "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
  );
  if (candidate !== base && !candidate.startsWith(base + path.sep))
    throw new AppError(403, "FORBIDDEN", "Доступ запрещён");
  let file;
  try {
    file = await realpath(candidate);
    if (!file.startsWith(base + path.sep) || !(await stat(file)).isFile())
      throw new Error("invalid");
  } catch {
    throw new AppError(404, "NOT_FOUND", "Файл не найден");
  }
  const body = await readFile(file);
  response.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "cache-control": file.endsWith(".html")
      ? "no-cache"
      : "public, max-age=3600",
    "content-length": body.length,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}
