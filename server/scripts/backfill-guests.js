import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseStore } from "../src/database/store.js";
import { StateService } from "../src/services/state.js";
import { linkReservationGuests } from "../src/services/guest-linking.js";

const filename = path.resolve("server/data/mio.sqlite");
const store = new DatabaseStore(filename, {});

try {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const backupFile = path.resolve(
    `server/data/backups/mio-before-guests-${stamp}.sqlite`
  );

  await store.backup(backupFile);

  console.log("DATABASE BACKUP:", backupFile);

  const service = new StateService(store);
  const snapshot = service.snapshot();

  const app = structuredClone(snapshot.collections.app);
  const guests = structuredClone(snapshot.collections.guests);

  const previous = JSON.stringify({ app, guests });

  const linked = linkReservationGuests(app, guests);

  const updated = JSON.stringify({
    app: linked.app,
    guests: linked.guests,
  });

  if (previous !== updated) {
    service.commit({
      baseRevision: snapshot.revision,
      mutationId: randomUUID(),
      changes: {
        app: linked.app,
        guests: linked.guests,
      },
    });
  }

  const final = service.snapshot();

  const bookings = [
    ...final.collections.app.reservations,
    ...final.collections.app.waitlist,
  ];

  const guestIds = new Set(
    final.collections.guests.guests.map(g => String(g.id))
  );

  const missing = bookings.filter(
    r => r.name &&
      (!r.guestId || !guestIds.has(String(r.guestId)))
  );

  console.log("GUESTS:", guestIds.size);
  console.log("BOOKINGS:", bookings.length);
  console.log("UNLINKED BOOKINGS:", missing.length);

  if (missing.length)
    throw new Error("Some bookings have no linked guest");

  console.log("=== GUEST MIGRATION SUCCESS ===");
} finally {
  store.close();
}
