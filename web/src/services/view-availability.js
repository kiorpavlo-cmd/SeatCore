import { validateReservation } from "./reservations.js";
export function availableTables({
  positions,
  reservations,
  date,
  time,
  guests = 1,
  duration = 90,
  blocks = [],
  blocked = [],
  room = "all",
}) {
  return Object.entries(positions)
    .filter(([key]) => room === "all" || key === room)
    .flatMap(([key, tables]) =>
      tables
        .filter((t) => Number.isInteger(t[4]) && t[4] >= guests)
        .filter(
          (t) =>
            !validateReservation(
              {
                name: "Доступность",
                date,
                time,
                guests,
                duration,
                room: key,
                table: String(t[0]),
                source: "В ресторане",
              },
              reservations,
              blocks,
              blocked,
            ),
        )
        .map((t) => ({ room: key, table: String(t[0]), capacity: t[4] })),
    );
}
