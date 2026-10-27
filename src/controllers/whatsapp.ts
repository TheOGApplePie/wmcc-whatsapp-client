import { sendMessageToWhatsApp } from "../services/whatsapp.js";
import type { RequestHandler } from "express";
export const sendAnnouncement: RequestHandler = async (req, res) => {
  const result = await sendMessageToWhatsApp(
    res.locals.auth.userId,
    req.body.message,
    req.body.mediaUrl,
  );
  res.status(200).json({ success: true, message: result });
};
