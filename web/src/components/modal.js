import { $, escapeHTML as esc } from "../lib/dom.js";
import { hidePop } from "./popover.js";
export function openModal(title, inner, onSave) {
  $("#overlay").classList.remove("hidden");
  hidePop();
  $("#modal").innerHTML =
    `<div class="modal-head">${esc(title)}<button id="closeModal">×</button></div><div class="modal-body">${inner}</div><div class="modal-footer"><button class="green full" id="saveModal">Сохранить</button></div>`;
  $("#closeModal").onclick = closeModal;
  $("#saveModal").onclick = onSave;
}
export function closeModal() {
  $("#overlay").classList.add("hidden");
  delete $("#overlay").dataset.accessible;
}
