/** Fit the original 700×610 plan without changing stored geometry. */
export function fitFloorCanvas(canvas, container) {
  if (
    !canvas ||
    !container ||
    !container.clientWidth ||
    !container.clientHeight
  )
    return;
  const scale = Math.min(
    (container.clientWidth - 20) /
      (Number.parseFloat(canvas.style.width) || 700),
    (container.clientHeight - 20) /
      (Number.parseFloat(canvas.style.height) || 610),
  );
  canvas.style.margin = "10px";
  canvas.style.transform = `scale(${Math.max(0.25, Math.min(2, scale))})`;
  canvas.style.transformOrigin = "top left";
}
