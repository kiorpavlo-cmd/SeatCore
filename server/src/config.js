import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function configuration(env = process.env) {
  const host = env.HOST || "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("Mio работает локально. HOST должен указывать на localhost");
  let publicHost = env.MIO_PUBLIC_HOST?.trim() || undefined;
  if (publicHost) {
    let parsed;
    try {
      parsed = new URL(`https://${publicHost}`);
    } catch {
      throw new Error("MIO_PUBLIC_HOST должен содержать только доменное имя");
    }
    if (
      parsed.hostname !== publicHost.toLowerCase() ||
      parsed.host !== publicHost.toLowerCase() ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !publicHost.includes(".")
    )
      throw new Error("MIO_PUBLIC_HOST должен содержать только доменное имя");
    publicHost = parsed.hostname;
  }
  const database = path.resolve(root, env.DATABASE_PATH || "data/mio.sqlite");
  const relativeDatabase = path.relative(root, database);
  if (!relativeDatabase || relativeDatabase === ".." ||
      relativeDatabase.startsWith(".." + path.sep) || path.isAbsolute(relativeDatabase))
    throw new Error("База Mio должна храниться внутри папки server");
  const port = Number(env.PORT || 4175);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Некорректный PORT");
  return {
    host,
    port,
    publicHost,
    accessPassword: env.MIO_ACCESS_PASSWORD || "",
    database,
    staticDirectory: path.resolve(root, env.WEB_DIST || "../web/dist"),
    seed: JSON.parse(readFileSync(path.join(root, "config/seed.json"), "utf8")),
  };
}
