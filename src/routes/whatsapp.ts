import express, { type RequestHandler } from "express";
import { sendAnnouncement } from "../controllers/whatsapp.js";
import { sessionControllers } from "../controllers/whatsapp-session.js";
import { checkMessageMiddleware } from "../middleware/whatsapp.js";
import { publishPermissionMiddleware } from "../middleware/auth.js";
import { handleValidationErrors } from "../error.js";
import {
  whatsAppSessions,
  type createSessionManager,
} from "../whatsapp/baileys-client.js";

/** GET/DELETE intentionally have no publish-permission gate, even after permission loss. */
export function createWhatsAppRouter(
  sessions: Pick<
    ReturnType<typeof createSessionManager>,
    "link" | "status" | "unlink"
  >,
  permission: RequestHandler = publishPermissionMiddleware,
) {
  const router = express.Router();
  const handlers = sessionControllers(sessions);
  router.use("/session", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.post("/session", permission, handlers.link);
  router.get("/session", handlers.status);
  router.delete("/session", handlers.unlink);
  router.post(
    "/announcement",
    permission,
    checkMessageMiddleware,
    handleValidationErrors,
    sendAnnouncement,
  );
  return router;
}
export default function whatsappRouter() {
  return createWhatsAppRouter(whatsAppSessions());
}
