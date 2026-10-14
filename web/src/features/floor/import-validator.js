export function validateFloorImport(value) {
  const positions = value?.positions || value;
  if (
    !positions ||
    typeof positions !== "object" ||
    Array.isArray(positions) ||
    !Object.keys(positions).length
  )
    throw new Error("Схема должна содержать хотя бы один зал");
  for (const [key, tables] of Object.entries(positions)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !Array.isArray(tables)
    )
      throw new Error("Некорректный зал");
    if (
      tables.some(
        (t) =>
          !Array.isArray(t) ||
          t[0] == null ||
          !String(t[0]).trim() ||
          !Number.isFinite(t[1]) ||
          !Number.isFinite(t[2]) ||
          t[1] < 0 ||
          t[2] < 0 ||
          (t[3] && !["side", "round", "long", "wide"].includes(t[3])) ||
          (t[4] != null && (!Number.isInteger(t[4]) || t[4] < 1)),
      )
    )
      throw new Error("Некорректный стол в зале " + key);
    if (new Set(tables.map((t) => String(t[0]))).size !== tables.length)
      throw new Error("Повторяющиеся номера столов в зале " + key);
  }
  const rooms = value.positions ? value.rooms || {} : {};
  if (
    typeof rooms !== "object" ||
    Array.isArray(rooms) ||
    Object.values(rooms).some(
      (name) => typeof name !== "string" || !name.trim(),
    )
  )
    throw new Error("Некорректные названия залов");
  return { positions, rooms };
}
