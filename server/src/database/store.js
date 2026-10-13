import { DatabaseSync, backup } from "node:sqlite";
import { readFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
export class DatabaseStore {
  constructor(filename, seed) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;",
    );
    this.db.exec(
      readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
    );
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    const add = this.db.prepare(
      "INSERT OR IGNORE INTO documents(name,value) VALUES(?,?)",
    );
    this.transaction(() => {
      for (const [name, value] of Object.entries(seed))
        add.run(name, JSON.stringify(value));
    });
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  read() {
    return Object.fromEntries(
      this.db
        .prepare("SELECT name,value FROM documents")
        .all()
        .map((row) => [row.name, JSON.parse(row.value)]),
    );
  }
  write(changes) {
    const save = this.db.prepare(
      "INSERT INTO documents(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    );
    for (const [name, value] of Object.entries(changes))
      save.run(name, JSON.stringify(value));
  }
  getMeta(key) {
    return this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key)
      ?.value;
  }
  setMeta(key, value) {
    this.db
      .prepare("UPDATE metadata SET value=? WHERE key=?")
      .run(String(value), key);
  }
  receipt(id) {
    return this.db
      .prepare("SELECT hash,revision FROM mutations WHERE id=?")
      .get(id);
  }
  addReceipt(id, hash, revision) {
    this.db
      .prepare("INSERT INTO mutations VALUES(?,?,?,?)")
      .run(id, hash, revision, new Date().toISOString());
    this.db.exec(
      "DELETE FROM mutations WHERE rowid NOT IN (SELECT rowid FROM mutations ORDER BY rowid DESC LIMIT 10000)",
    );
  }
  log(name, action) {
    this.db
      .prepare("INSERT INTO audit_log(date,name,action) VALUES(?,?,?)")
      .run(new Date().toISOString(), name, action);
  }
  audit() {
    return this.db
      .prepare(
        "SELECT date,name,action FROM audit_log ORDER BY id DESC LIMIT 500",
      )
      .all()
      .reverse();
  }
  async backup(filename) {
    if (existsSync(filename))
      throw new Error("Файл резервной копии уже существует");
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    await backup(this.db, filename);
    chmodSync(filename, 0o600);
  }
  close() {
    this.db.close();
  }
}
