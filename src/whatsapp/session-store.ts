import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { HttpError } from "../error.js";

/** Keep client-controlled values out of filesystem paths. */
export function requireUserId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new HttpError(401, "Invalid authenticated user identity");
  }
  return id.toLowerCase();
}

/** Small filesystem boundary; only Baileys auth files persist. */
export function createSessionStore(root: string) {
  const directory = (userId: string) => join(root, requireUserId(userId));
  return {
    directory,
    async prepare(userId: string) {
      await mkdir(directory(userId), { recursive: true, mode: 0o700 });
    },
    async users() {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const entries = await readdir(root, { withFileTypes: true });
      return entries
        .filter(
          (entry) => entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name),
        )
        .map((entry) => entry.name.toLowerCase());
    },
    async remove(userId: string) {
      await rm(directory(userId), { recursive: true, force: true });
    },
  };
}
