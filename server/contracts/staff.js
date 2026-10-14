export function deriveStaff(users, existing = []) {
  return users
    .filter(
      (user) =>
        user &&
        user.id != null &&
        user.server === true &&
        String(user.name || "").trim(),
    )
    .map((user, index) => {
      const previous = existing.find(
        (row) => String(row.id) === String(user.id),
      );
      return {
        id: user.id,
        name: String(user.name).trim(),
        color:
          previous?.color ||
          ["#2d495a", "#36d4cb", "#9cce64", "#d39cde", "#fc8052"][index % 5],
        on: previous?.on ?? true,
        tables: Array.isArray(previous?.tables) ? previous.tables : [],
      };
    });
}
