import { createClient } from "@supabase/supabase-js";
import type { RequestHandler } from "express";
import { HttpError } from "../error.js";
import { requireUserId } from "../whatsapp/session-store.js";

export interface AccessVerifier {
  identify(token: string): Promise<string | null>;
  permitted(token: string): Promise<boolean>;
}

/** Identity is derived only from Supabase's verified user, never from request data. */
export function createAuthMiddleware(verifier: AccessVerifier): RequestHandler {
  return async (req, res, next) => {
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
      if (!match) throw new HttpError(401, "Unauthorized");
      const token = match[1]!;
      const id = await verifier.identify(token);
      if (!id) throw new HttpError(401, "Unauthorized");
      res.locals.auth = { userId: requireUserId(id), token };
      next();
    } catch (error) {
      next(
        error instanceof HttpError
          ? error
          : new HttpError(503, "Authorization service unavailable"),
      );
    }
  };
}
/** Apply only to creating a session or publishing; inspecting/unlinking needs identity alone. */
export function createPublishMiddleware(
  verifier: AccessVerifier,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const auth = res.locals.auth;
      if (!auth) throw new HttpError(401, "Unauthorized");
      if (!(await verifier.permitted(auth.token)))
        throw new HttpError(403, "social.publish permission required");
      next();
    } catch (error) {
      next(
        error instanceof HttpError
          ? error
          : new HttpError(503, "Permission lookup unavailable"),
      );
    }
  };
}
const supabaseVerifier: AccessVerifier = {
  async identify(token) {
    const { data, error } = await userClient(token).auth.getUser(token);
    if (error && (!error.status || error.status >= 500))
      throw new HttpError(503, "Authorization service unavailable");
    return !error && data.user ? data.user.id : null;
  },
  async permitted(token) {
    const { data, error } = await userClient(token).rpc("has_perm", {
      p_module: "social",
      p_action: "publish",
    });
    if (error || typeof data !== "boolean")
      throw new HttpError(503, "Permission lookup unavailable");
    return data;
  },
};
export const authMiddleWare = createAuthMiddleware(supabaseVerifier);
export const publishPermissionMiddleware =
  createPublishMiddleware(supabaseVerifier);

/** Request-local identity allows has_perm to use auth.uid() without sharing user sessions. */
function userClient(token: string) {
  return createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
