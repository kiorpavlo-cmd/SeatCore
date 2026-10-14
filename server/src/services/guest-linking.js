import { randomUUID } from "node:crypto";

const clean = value => String(value ?? "").trim();

const phoneKey = value => {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
};

const emailKey = value => clean(value).toLowerCase();

export function linkReservationGuests(app, guestDocument) {
  const result = structuredClone(guestDocument);
  const guests = result.guests;

  if (!Array.isArray(guests))
    throw new Error("Invalid guest collection");

  const byId = new Map();
  const byPhone = new Map();
  const byEmail = new Map();

  function indexGuest(g) {
    byId.set(String(g.id), g);

    const phone = phoneKey(g.phone);
    const email = emailKey(g.email);

    if (phone && !byPhone.has(phone))
      byPhone.set(phone, g);

    if (email && !byEmail.has(email))
      byEmail.set(email, g);
  }

  guests.forEach(indexGuest);

  for (const booking of [
    ...(app.reservations || []),
    ...(app.waitlist || []),
  ]) {
    if (!booking || !clean(booking.name))
      continue;

    const phone = phoneKey(booking.phone);
    const email = emailKey(booking.email);

    const linked = booking.guestId
      ? byId.get(String(booking.guestId))
      : null;

    const byTelephone = phone ? byPhone.get(phone) : null;
    const byMail = email ? byEmail.get(email) : null;

    let guest = linked || null;

    if (!guest) {
      const conflict =
        (byTelephone && byMail && byTelephone !== byMail) ||
        (byTelephone && email &&
          emailKey(byTelephone.email) &&
          emailKey(byTelephone.email) !== email) ||
        (byMail && phone &&
          phoneKey(byMail.phone) &&
          phoneKey(byMail.phone) !== phone);

      if (!conflict)
        guest = byTelephone || byMail || null;
    }

    if (!guest) {
      const parts = clean(booking.name).split(/\s+/);

      guest = {
        id: randomUUID(),
        first: parts.shift(),
        last: parts.join(" "),
        phone: clean(booking.phone),
        email: clean(booking.email),
        notes: "",
        marketing: false,
        tagIds: [],
        reservations: [],
      };

      guests.push(guest);
    } else {
      if (!clean(guest.phone) && phone)
        guest.phone = clean(booking.phone);

      if (!clean(guest.email) && email)
        guest.email = clean(booking.email);
    }

    booking.guestId = guest.id;
    indexGuest(guest);
  }

  return { app, guests: result };
}
