import { readFileSync } from "node:fs";
import { DatabaseStore } from "../src/database/store.js";
import { AuthService } from "../src/auth/service.js";
import { configuration } from "../src/config.js";

async function main() {
  const options = configuration();
  const store = new DatabaseStore(options.database, options.seed);

  try {
    const auth = new AuthService(store.db);

    if (auth.ownerExists()) {
      throw new Error("Аккаунт владельца уже существует");
    }

    const input = readFileSync(0, "utf8");
    const { email, password } = JSON.parse(input);

    const owner = auth.createOwner(email, password);

    console.log("OWNER_CREATED");
    console.log("Email:", owner.email);
    console.log("Role:", owner.role);
  } finally {
    store.close();
  }
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
