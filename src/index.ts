import "dotenv/config";
import express from "express";
import whatsappRouter from "./routes/whatsapp.js";
import { authMiddleWare } from "./middleware/auth.js";
import { errorHandler } from "./error.js";
import app from "./server.js";
import { startWhatsApp, stopWhatsApp } from "./whatsapp/baileys-client.js";
import { groupId } from "./config.js";

// Validate the destination before starting either service.
groupId();
await startWhatsApp();
// Verify access before parsing content; the router then validates and sends it.
app.use(
  "/api/whatsapp",
  authMiddleWare,
  express.json({ limit: "64kb" }),
  whatsappRouter(),
);
app.use(errorHandler);
const server = app.listen(process.env.PORT || 3000, () =>
  console.log("HTTP server ready"),
);
let stopping = false;
/** Stop accepting requests, drain existing requests, then close WhatsApp and save credentials. */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  // A stuck request must not prevent a deployment from stopping the process.
  const deadline = setTimeout(() => process.exit(1), 20_000);
  server.close(async () => {
    try {
      await stopWhatsApp();
      clearTimeout(deadline);
    } catch {
      console.error("WhatsApp shutdown failed");
      process.exitCode = 1;
      // Keep the deadline active if resources could not be released.
    }
  });
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
