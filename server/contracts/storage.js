export const STORAGE_KEYS = {
  app: "eatapp-ru-demo-v1",
  floor: "eatapp-stage2-positions",
  blocked: "eatapp-stage2-blocked",
  blocks: "eatapp-ru-time-blocks-v1",
  notes: "eatapp-ru-daily-notes-v1",
  account: "eatapp-ru-account-v1",
  permissions: "eatapp-ru-permissions-v1",
  guests: "eatapp-ru-stage9-v1",
  fields: "eatapp-ru-stage10-v1",
  resources: "eatapp-ru-resources-v1",
  backgrounds: "eatapp-ru-backgrounds-v1",
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
