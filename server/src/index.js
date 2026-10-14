import { createApp } from "./app.js";
import { configuration } from "./config.js";
import { execFile } from "node:child_process";
process.umask(0o077);
const options = configuration();
const app = createApp(options);
const address = (port) =>
  "http://" +
  (options.host === "::1" ? "[::1]" : options.host) +
  ":" +
  port +
  "/";
function openSite(url) {
  execFile("open", [url], (error) => {
    if (error) console.log("Откройте адрес в браузере: " + url);
  });
}
app.server.on("error", async (error) => {
  app.store.close();
  if (
    error.code === "EADDRINUSE" &&
    process.argv.includes("--open") &&
    process.platform === "darwin"
  ) {
    try {
      const response = await fetch(address(options.port) + "api/health", {
        signal: AbortSignal.timeout(1000),
      });
      const health = await response.json();
      if (response.ok && health.service === "Mio! server") {
        console.log("Сервер уже работает: " + address(options.port));
        openSite(address(options.port));
        return;
      }
    } catch {}
  }
  console.error(
    error.code === "EADDRINUSE"
      ? "Адрес занят. Проверьте ранее запущенный сервер Mio!."
      : error.message,
  );
  process.exitCode = 1;
});
app.server.listen(options.port, options.host, () => {
  app.viberNotifications.start();
  const port = app.server.address().port;
  const url = address(port);
  console.log("Mio!: " + url);
  console.log("База данных: " + options.database);
  if (process.argv.includes("--open") && process.platform === "darwin")
    openSite(url);
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  });
