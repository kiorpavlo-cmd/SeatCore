import { $, $$, escapeHTML as esc } from "../lib/dom.js";
export function popAt(anchor, html) {
  const p = $("#popover");
  p.innerHTML = html;
  p.classList.remove("hidden");
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth,
    h = p.offsetHeight;
  p.style.left =
    Math.max(8, Math.min(window.innerWidth - w - 9, r.left)) + "px";
  p.style.top =
    (r.bottom + h + 8 < window.innerHeight
      ? r.bottom + 5
      : Math.max(8, r.top - h - 5)) + "px";
}
export function hidePop() {
  $("#popover").classList.add("hidden");
}
export function showMenu(anchor, items, fn) {
  popAt(
    anchor,
    items
      .map((x, i) => `<button data-option="${i}">${esc(x)}</button>`)
      .join(""),
  );
  $$("[data-option]").forEach(
    (b) =>
      (b.onclick = () => {
        hidePop();
        fn(items[+b.dataset.option]);
      }),
  );
}
