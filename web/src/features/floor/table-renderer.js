import { escapeHTML as esc } from "../../lib/dom.js";

export function tableSeats(type, capacity) {
  const count = Math.max(
    1,
    Math.min(999, Math.floor(Number(capacity) || 4))
  );

  const seats = [];

  for (let i = 0; i < count; i++) {
    let x, y, vertical = false;

    if (type === "round") {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / count;
      x = 50 + 52 * Math.cos(angle);
      y = 50 + 52 * Math.sin(angle);
      vertical = Math.abs(Math.cos(angle)) >
        Math.abs(Math.sin(angle));
    } else {
      const p = (i + 0.5) * 4 / count;

      if (p < 1) {
        x = 15 + p * 70;
        y = -8;
      } else if (p < 2) {
        x = 108;
        y = 15 + (p - 1) * 70;
        vertical = true;
      } else if (p < 3) {
        x = 85 - (p - 2) * 70;
        y = 108;
      } else {
        x = -8;
        y = 85 - (p - 3) * 70;
        vertical = true;
      }
    }

    seats.push(
      `<span class="mio-table-seat ${vertical ? "vertical" : ""}" ` +
      `style="left:${x}%;top:${y}%"></span>`
    );
  }

  return seats.join("");
}

export function tableContent(
  type,
  name,
  minCapacity,
  maxCapacity,
  extra = ""
) {
  const capacityLabel = minCapacity == null
    ? ""
    : `<small>${esc(String(minCapacity))}–${esc(String(maxCapacity))}</small>`;

  return (
    tableSeats(type, maxCapacity) +
    `<span class="mio-table-number">${esc(String(name))}</span>` +
    capacityLabel +
    extra
  );
}
