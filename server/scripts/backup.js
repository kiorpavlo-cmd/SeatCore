import { DatabaseStore } from "../src/database/store.js";
import { configuration, root } from "../src/config.js";
import path from "node:path";
const config = configuration();
const target = path.resolve(
  root,
  process.argv[2] ||
    "data/backups/mio-" +
      new Date().toISOString().replaceAll(":", "-") +
      ".sqlite",
);
const store = new DatabaseStore(config.database, config.seed);
try {
  await store.backup(target);
  console.log("Резервная копия: " + target);
} finally {
  store.close();
}
