import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  return "scrypt:" + salt + ":" + scryptSync(pin, salt, 32).toString("hex");
}
export function verifyPin(pin, encoded) {
  if (typeof pin !== "string" || typeof encoded !== "string") return false;
  const [algorithm, salt, hash] = encoded.split(":");
  if (
    algorithm !== "scrypt" ||
    !salt ||
    !hash ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    return false;
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, "hex"));
}
export function protectUsers(account, previous = { users: [] }) {
  return {
    ...account,
    users: account.users.map((user) => {
      const {
        pin,
        pinHash,
        password,
        passwordHash,
        password_hash,
        hasPassword,
        ...profile
      } = user;
      const old = previous.users.find((x) => String(x.id) === String(user.id));
      return {
        ...profile,
        ...(pin
          ? { pinHash: hashPin(pin) }
          : old?.pinHash
            ? { pinHash: old.pinHash }
            : {}),
      };
    }),
  };
}
export function publicAccount(account) {
  return {
    ...account,
    users: account.users.map(
      ({ pin, pinHash, password, passwordHash, password_hash, ...user }) =>
        user,
    ),
  };
}
