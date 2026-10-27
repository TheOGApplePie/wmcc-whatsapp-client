import { getWhatsAppSocket } from "../whatsapp/baileys-client.js";
import { groupId } from "../config.js";
import { submitMessage } from "./submission.js";
/** Submit text or one approved poster URL with its caption, without retries or fallback. */
export async function sendMessageToWhatsApp(
  userId: string,
  message: string,
  posterUrl?: string,
) {
  const jid = groupId();
  const sock = getWhatsAppSocket(userId);
  // Baileys downloads and uploads the URL. The CMS already owns poster validation.
  const content = posterUrl
    ? {
        image: { url: posterUrl },
        caption: message,
      }
    : { text: message };
  return submitMessage(sock, jid, content);
}
