import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import type { RequestHandler } from "express";
import { HttpError } from "../error.js";
import { getWhatsAppSocket } from "../whatsapp/baileys-client.js";

// Authenticate the machine before parsing a request or trusting its userId.
export const serviceTokenMiddleware: RequestHandler = (req, _res, next) => {
  const secret = process.env.WHATSAPP_API_TOKEN;
  if (!secret)
    return next(new HttpError(503, "Scheduled publishing is not configured"));
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
  const supplied = Buffer.from(match?.[1] || "");
  const expected = Buffer.from(secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return next(new HttpError(401, "Unauthorized"));
  next();
};

export function createServicePublisherMiddleware(
  lookup: (userId: string) => Promise<string>,
  socketFor: typeof getWhatsAppSocket = getWhatsAppSocket,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const userId = req.body?.userId;
      if (
        typeof userId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        )
      )
        throw new HttpError(400, "A publisher userId is required");
      const jid = await lookup(userId);
      if (typeof jid !== "string" || !jid)
        throw new HttpError(403, "Publisher has no paired account");
      const socket = socketFor(userId.toLowerCase());
      if (
        !socket.user?.id ||
        jidNormalizedUser(socket.user.id) !== jidNormalizedUser(jid)
      )
        throw new HttpError(
          403,
          "Connected WhatsApp account does not match publisher ownership",
        );
      res.locals.auth = { userId: userId.toLowerCase() };
      next();
    } catch (error) {
      next(
        error instanceof HttpError
          ? error
          : new HttpError(503, "Publisher validation unavailable"),
      );
    }
  };
}

export const servicePublisherMiddleware = createServicePublisherMiddleware(
  async (userId) => {
    const url = process.env.PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new HttpError(503, "Publisher validation is not configured");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: jid, error } = await db.rpc("get_whatsapp_publisher", {
      p_user_id: userId,
    });
    if (error)
      throw new HttpError(
        error.code === "42501" ? 403 : 503,
        error.code === "42501"
          ? "Publisher is not eligible to send"
          : "Publisher validation unavailable",
      );
    return jid;
  },
);
