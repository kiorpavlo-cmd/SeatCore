export const STORAGE_KEYS = {
  app: "mio-ru-demo-v1",
  floor: "mio-stage2-positions",
  blocked: "mio-stage2-blocked",
  blocks: "mio-ru-time-blocks-v1",
  notes: "mio-ru-daily-notes-v1",
  account: "mio-ru-account-v1",
  permissions: "mio-ru-permissions-v1",
  guests: "mio-ru-stage9-v1",
  fields: "mio-ru-stage10-v1",
  resources: "mio-ru-resources-v1",
  backgrounds: "mio-ru-backgrounds-v1",
};
export const APP_DOMAIN_KEYS = ["reservations", "waitlist", "servers", "rooms"];
export const COLLECTIONS = Object.keys(STORAGE_KEYS);
export function projectCollection(name, value) {
  if (name === "app")
    return Object.fromEntries(
      APP_DOMAIN_KEYS.filter((key) => Object.hasOwn(value, key)).map((key) => [
        key,
        value[key],
      ]),
    );
  if (name === "resources") {
    const { audit, ...resources } = value;
    return resources;
  }
  return value;
}
