import { resolve } from "node:path";
import { HttpError } from "./error.js";

/** Select the configured group. Development never falls back to the production group. */
export function groupId(env: NodeJS.ProcessEnv = process.env) {
  const id = env.NODE_ENV === "production" ? env.PROD_CHAT_ID : env.DEV_CHAT_ID;
  if (!id || !/^\d+(?:-\d+)?@g\.us$/.test(id))
    throw new HttpError(503, "Approved WhatsApp group is not configured");
  return id;
}

/** Resolve session storage; production must use an absolute path preserved across deployments. */
export function authDirectory(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.NODE_ENV === "production" &&
    (!env.WHATSAPP_AUTH_DIR || !env.WHATSAPP_AUTH_DIR.startsWith("/"))
  ) {
    throw new Error("Production requires an absolute WHATSAPP_AUTH_DIR");
  }
  return resolve(env.WHATSAPP_AUTH_DIR || "auth_info_baileys");
}
