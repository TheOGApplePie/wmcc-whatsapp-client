import { resolve } from "node:path";
import { HttpError } from "./error.js";

/** Select only the active environment's group; never fall back to another group. */
export function groupId(env: NodeJS.ProcessEnv = process.env) {
  const environment = env.NODE_ENV ?? "development";
  let id: string | undefined;
  switch (environment) {
    case "development":
      id = env.DEV_CHAT_ID;
      break;
    case "staging":
      id = env.STAGE_CHAT_ID;
      break;
    case "production":
      id = env.PROD_CHAT_ID;
      break;
    default:
      throw new HttpError(
        503,
        "NODE_ENV must be development, staging, or production",
      );
  }
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
