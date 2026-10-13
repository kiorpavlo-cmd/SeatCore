export function reservationGuestTags(row, data) {
  const phone = (value) => String(value || "").replace(/\D/g, "");
  const guest = data.guests.find(
    (g) =>
      (row.guestId && String(g.id) === String(row.guestId)) ||
      (row.email && g.email?.toLowerCase() === row.email.toLowerCase()) ||
      (row.phone && phone(g.phone) === phone(row.phone)),
  );
  return [
    ...(row.guestTags || []),
    ...(guest?.tagIds || [])
      .map((id) => data.tags.find((t) => t.id === id)?.name)
      .filter(Boolean),
  ];
}
