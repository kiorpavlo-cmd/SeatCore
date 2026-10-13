import { $, $$ } from "../lib/dom.js";
import { popAt, hidePop } from "./popover.js";
export function createCalendar({ state, save, render }) {
  function showCalendar(anchor) {
    let current = new Date(state.date + "T12:00:00");
    function paint() {
      const year = current.getFullYear(),
        month = current.getMonth();
      const first = new Date(year, month, 1).getDay(),
        offset = first;
      const days = new Date(year, month + 1, 0).getDate();
      const count = Math.ceil((offset + days) / 7) * 7;
      const names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      const html = `<div class="cal-head"><strong>${new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(current)}</strong><div><button id="calPrev">‹</button><button id="calNext">›</button></div></div>
 <div class="cal-grid">${names.map((n) => `<span>${n}</span>`).join("")}
 ${Array.from({ length: count }, (_, i) => {
   let d = new Date(year, month, i - offset + 1);
   let key = [
     d.getFullYear(),
     String(d.getMonth() + 1).padStart(2, "0"),
     String(d.getDate()).padStart(2, "0"),
   ].join("-");
   return `<button data-day="${key}" class="${key === state.date ? "selected" : ""}" style="${d.getMonth() !== month ? "color:#bbb" : ""}">${d.getDate()}</button>`;
 }).join("")}</div>`;
      popAt(anchor, html);
      $("#calPrev").onclick = () => {
        current = new Date(year, month - 1, 1);
        paint();
      };
      $("#calNext").onclick = () => {
        current = new Date(year, month + 1, 1);
        paint();
      };
      $$("[data-day]").forEach(
        (b) =>
          (b.onclick = () => {
            state.date = b.dataset.day;
            save();
            hidePop();
            render();
          }),
      );
    }
    paint();
  }
  return showCalendar;
}
