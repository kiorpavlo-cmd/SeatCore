import { createHash, randomUUID } from "node:crypto";
import { AppError, invalid } from "../domain/errors.js";
import { validateState } from "../domain/validation.js";
import {
  STORAGE_KEYS,
  projectCollection,
  COLLECTIONS,
} from "../../contracts/storage.js";
import { protectUsers, publicAccount } from "./credentials.js";
import { linkReservationGuests } from "./guest-linking.js";
import { deriveStaff } from "../../contracts/staff.js";
import {
  checkPublicBookingInput,
  publicWidgetConfig,
} from "./public-booking-domain.js";
export class StateService {
  constructor(store, { onCommit, auth, access } = {}) {
    this.store = store;
    this.onCommit = onCommit;
    this.auth = auth;
    this.access = access;
    const current = store.read();
    const servers = deriveStaff(current.account.users, current.app.servers);
    if (
      auth &&
      JSON.stringify(servers) !== JSON.stringify(current.app.servers)
    ) {
      store.transaction(() => {
        store.write({ app: { ...current.app, servers } });
        store.setMeta("revision", Number(store.getMeta("revision")) + 1);
        store.log("Сотрудники", "Согласование списка официантов с профилями");
      });
    }
  }
  snapshot(actor = null) {
    const collections = this.store.read();
    collections.account = publicAccount(collections.account);
    if (this.auth)
      collections.account = this.auth.describeEmployees(collections.account);
    collections.resources.audit = [
      ...(collections.resources.audit || []),
      ...this.store.audit(),
    ].slice(-500);
    const result = {
      revision: Number(this.store.getMeta("revision")),
      initialized: this.store.getMeta("initialized") === "1",
      collections,
    };
    return this.access ? this.access.snapshot(result, actor) : result;
  }
  commit(
    { baseRevision, changes, mutationId = randomUUID() },
    migration = false,
    receiptHash = null,
    actor = null,
  ) {
    if (
      !Number.isInteger(baseRevision) ||
      !changes ||
      typeof changes !== "object" ||
      Array.isArray(changes) ||
      typeof mutationId !== "string" ||
      !mutationId ||
      mutationId.length > 128
    )
      invalid("Неверный запрос изменения данных");
    const hash =
      receiptHash ||
      createHash("sha256").update(JSON.stringify(changes)).digest("hex");
    return this.store.transaction(() => {
      const receipt = this.store.receipt(mutationId);
      if (receipt) {
        if (receipt.hash !== hash)
          throw new AppError(
            409,
            "IDEMPOTENCY_REUSE",
            "Идентификатор запроса уже использован",
          );
        return this.snapshot(actor);
      }
      const revision = Number(this.store.getMeta("revision"));
      if (baseRevision !== revision)
        throw new AppError(
          409,
          "REVISION_CONFLICT",
          "Данные изменились в другом окне. Обновите их перед сохранением",
          { revision },
        );
      if (migration && this.store.getMeta("initialized") === "1")
        throw new AppError(
          409,
          "ALREADY_INITIALIZED",
          "На сервере уже есть данные. Автоматическая замена запрещена",
        );
      const current = this.store.read();
      const projected = {};
      for (const [name, value] of Object.entries(changes)) {
        if (!COLLECTIONS.includes(name))
          invalid("Неизвестная коллекция: " + name);
        if (value == null || typeof value !== "object")
          invalid("Неверная коллекция: " + name);
        projected[name] = projectCollection(name, value);
        if (name === "resources") {
          projected[name] = { ...current.resources, ...projected[name] };
          const audit = migration ? value.audit : current.resources.audit;
          if (Array.isArray(audit))
            projected[name].audit = audit
              .slice(-500)
              .filter(
                (row) =>
                  row &&
                  typeof row.date === "string" &&
                  typeof row.name === "string" &&
                  typeof row.action === "string",
              )
              .map(({ date, name, action }) => ({ date, name, action }));
        }
      }
      this.access?.changes(current, projected, actor, migration);
      if (projected.account && this.auth)
        projected.app = {
          ...current.app,
          ...projected.app,
          servers: deriveStaff(projected.account.users, current.app.servers),
        };
      if (
        projected.app &&
        (Object.hasOwn(projected.app, "reservations") ||
          Object.hasOwn(projected.app, "waitlist"))
      ) {
        const linked = linkReservationGuests(
          { ...current.app, ...projected.app },
          projected.guests ?? current.guests,
        );

        projected.app = linked.app;
        projected.guests = linked.guests;
      }

      const next = { ...current, ...projected };
      validateState(next, current, Object.keys(projected));
      if (projected.account) {
        this.auth?.syncEmployees(projected.account, current.account, migration);
        projected.account = protectUsers(projected.account, current.account);
      }
      this.store.write(projected);
      this.onCommit?.(current, next, { revision: revision + 1, migration });
      this.store.setMeta("revision", revision + 1);
      this.store.setMeta("initialized", "1");
      for (const name of Object.keys(projected))
        this.store.log(
          {
            app: "Бронирования и залы",
            floor: "Планы залов",
            blocked: "Закрытые столы",
            blocks: "Ограничения времени",
            notes: "Заметки",
            account: "Ресторан и сотрудники",
            permissions: "Разрешения",
            guests: "Гости",
            fields: "Пользовательские поля",
            resources: "Настройки и операции",
            backgrounds: "Фоны залов",
          }[name] || name,
          migration ? "Перенос данных браузера" : "Сохранение на сервере",
        );
      this.store.addReceipt(mutationId, hash, revision + 1);
      return this.snapshot(actor);
    });
  }
  migrate({ legacy, baseRevision, mutationId }, actor = null) {
    if (!legacy || typeof legacy !== "object" || Array.isArray(legacy))
      invalid("Неверный экспорт браузера");
    const changes = {};
    for (const [name, key] of Object.entries(STORAGE_KEYS))
      if (legacy[key] != null) {
        try {
          changes[name] =
            typeof legacy[key] === "string"
              ? JSON.parse(legacy[key])
              : legacy[key];
        } catch {
          invalid("Повреждены данные браузера: " + name);
        }
      }
    return this.commit(
      { changes, baseRevision, mutationId },
      true,
      null,
      actor,
    );
  }
  updateRecord(collection, method, id, record, meta, actor = null) {
    const paths = {
      reservations: ["app", "reservations"],
      waitlist: ["app", "waitlist"],
      staff: ["app", "servers"],
      guests: ["guests", "guests"],
      tags: ["guests", "tags"],
      "tag-categories": ["guests", "categories"],
      "custom-fields": ["fields", null],
    };
    const pair = paths[collection];
    if (!pair) throw new AppError(404, "NOT_FOUND", "Коллекция не найдена");
    const receiptHash = createHash("sha256")
      .update(JSON.stringify(["record", collection, method, id, record]))
      .digest("hex");
    const receipt =
      typeof meta.mutationId === "string"
        ? this.store.receipt(meta.mutationId)
        : null;
    if (receipt) {
      if (receipt.hash !== receiptHash)
        throw new AppError(
          409,
          "IDEMPOTENCY_REUSE",
          "Идентификатор запроса уже использован",
        );
      return this.snapshot(actor);
    }
    const state = this.snapshot(actor);
    const [name, key] = pair;
    const document = state.collections[name];
    const rows = key ? document[key] : document;
    const found = rows.findIndex((x) => String(x.id) === String(id));
    if (method !== "POST" && found < 0)
      throw new AppError(404, "NOT_FOUND", "Запись не найдена");
    let next;
    if (method === "POST")
      next = [...rows, { ...record, id: record?.id ?? randomUUID() }];
    else if (method === "DELETE")
      next = rows.filter((_, index) => index !== found);
    else
      next = rows.map((row, index) =>
        index === found ? { ...row, ...record, id: row.id } : row,
      );
    return this.commit(
      {
        ...meta,
        changes: { [name]: key ? { ...document, [key]: next } : next },
      },
      false,
      receiptHash,
      actor,
    );
  }
  createPublicBooking(widgetId, body) {
    const mutationId = body?.mutationId;
    if (
      typeof mutationId !== "string" ||
      !mutationId.trim() ||
      mutationId.length > 128
    )
      invalid("Неверный идентификатор запроса");
    const hash = createHash("sha256")
      .update(JSON.stringify(["public-widget", widgetId, body]))
      .digest("hex");
    return this.store.transaction(() => {
      const receipt = this.store.receipt(mutationId);
      if (receipt) {
        if (receipt.hash !== hash)
          throw new AppError(
            409,
            "IDEMPOTENCY_REUSE",
            "Идентификатор запроса уже использован",
          );
        return { accepted: true, duplicate: true, revision: receipt.revision };
      }
      const current = this.store.read();
      const widget = publicWidgetConfig(current, widgetId);
      const { record, waitlist } = checkPublicBookingInput(
        current,
        widget,
        body,
      );
      record.id = randomUUID();
      record.createdAt = new Date().toISOString();
      record.tags = "";
      record.employee = "";
      record.preference = "";
      record.teamChat = "";
      const app = structuredClone(current.app);
      (waitlist ? app.waitlist : app.reservations).push(record);
      const linked = linkReservationGuests(app, current.guests);
      const next = { ...current, app: linked.app, guests: linked.guests };
      validateState(next, current, ["app", "guests"]);
      this.store.write({ app: linked.app, guests: linked.guests });
      const revision = Number(this.store.getMeta("revision")) + 1;
      this.store.setMeta("revision", revision);
      this.store.setMeta("initialized", "1");
      this.store.log(
        "Бронирования и залы",
        waitlist
          ? "Заявка добавлена в лист ожидания через виджет"
          : "Создано бронирование через виджет",
      );
      this.store.addReceipt(mutationId, hash, revision);
      this.onCommit?.(current, next, { revision, public: true });
      return {
        accepted: true,
        booking: { id: record.id, waitlist },
        revision,
      };
    });
  }
  publicWidget(widgetId) {
    return publicWidgetConfig(this.store.read(), widgetId);
  }
  publicWidgetData() {
    return this.store.read();
  }
  records(collection, actor = null) {
    this.access?.readCollection(actor, collection);
    const state = this.snapshot(actor);
    const paths = {
      reservations: state.collections.app.reservations,
      waitlist: state.collections.app.waitlist,
      staff: state.collections.app.servers,
      guests: state.collections.guests.guests,
      tags: state.collections.guests.tags,
      "tag-categories": state.collections.guests.categories,
      "custom-fields": state.collections.fields,
    };
    if (!paths[collection])
      throw new AppError(404, "NOT_FOUND", "Коллекция не найдена");
    return { revision: state.revision, records: paths[collection] };
  }
}
