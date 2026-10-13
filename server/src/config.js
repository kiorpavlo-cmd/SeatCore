import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function configuration(env = process.env) {
  const host = env.HOST || "127.0.0.1";
  const publicHost = env.PUBLIC_HOST || env.RENDER_EXTERNAL_HOSTNAME || "";
  const accessPassword = env.ACCESS_PASSWORD || "";
  if (publicHost) {
    if (
      !/^[a-z0-9.-]+$/.test(publicHost) ||
      accessPassword.length < 20 ||
      host !== "0.0.0.0"
    )
      throw new Error("Некорректная конфигурация облачного доступа");
  } else if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("Публичный режим требует авторизации");
  const port = Number(env.PORT || 4175);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Некорректный PORT");
  return {
    host,
    publicHost,
    accessPassword,
    port,
    database: path.resolve(root, env.DATABASE_PATH || "data/mio.sqlite"),
    staticDirectory: path.resolve(root, env.WEB_DIST || "../web/dist"),
    seed: JSON.parse(readFileSync(path.join(root, "config/seed.json"), "utf8")),
  };
}
