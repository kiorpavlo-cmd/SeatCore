export function installDialogAccessibility() {
  const selector =
    "#overlay:not(.hidden),#bookingScreen,.account-modal-bg,.guest-overlay,#customField-overlay,.operation-overlay,.booking-modal";
  let previousFocus = null;
  const observer = new MutationObserver(() => {
    for (const dialog of document.querySelectorAll(selector))
      if (!dialog.dataset.accessible) {
        dialog.dataset.accessible = "true";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        const heading = dialog.querySelector(
          "h2,strong,.booking-header,.booking-dialog-title",
        );
        dialog.setAttribute(
          "aria-label",
          heading?.textContent.replace(/[×−]/g, "").trim() || "Диалог",
        );
        previousFocus = document.activeElement;
        const field = dialog.querySelector(
          "input:not([type=checkbox]):not([type=file]),textarea,select",
        );
        field?.focus();
      }
    if (!document.querySelector(selector) && previousFocus) {
      if (previousFocus.isConnected) previousFocus.focus();
      previousFocus = null;
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener(
    "keydown",
    (event) => {
      const dialogs = [...document.querySelectorAll(selector)],
        dialog = dialogs.at(-1);
      if (!dialog) return;
      if (event.key === "Escape") {
        dialog
          .querySelector(
            '#bookingClose,#account-close,[data-action="close"],#customField-close,#operation-close,#tableDialogClose,#closeModal',
          )
          ?.click();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...dialog.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    true,
  );
  return () => observer.disconnect();
}
