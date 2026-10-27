import {
  generateMessageIDV2,
  type AnyMessageContent,
  type BinaryNode,
} from "@whiskeysockets/baileys";
import type { EventEmitter } from "node:events";
import { HttpError } from "../error.js";
/** Only the socket operations required to submit and observe an acknowledgement. */
export interface SendingSocket {
  ws: Pick<EventEmitter, "on" | "off">;
  sendMessage(
    jid: string,
    content: AnyMessageContent,
    options: { messageId: string },
  ): Promise<unknown>;
}
/**
 * Send once and wait for WhatsApp to acknowledge the matching message ID.
 * Success confirms submission, not recipient delivery or reading. A timeout leaves
 * submission uncertain, so this function deliberately does not retry.
 * @param timeoutMs Acknowledgement deadline, measured from listener registration.
 */
export async function submitMessage(
  sock: SendingSocket,
  jid: string,
  content: AnyMessageContent,
  timeoutMs = 15_000,
) {
  const id = generateMessageIDV2();
  let timer: ReturnType<typeof setTimeout>;
  let onAck: (node: BinaryNode) => void;
  let onClose: () => void;
  // Register before sending so a fast acknowledgement cannot be missed.
  const ack = new Promise<void>((resolve, reject) => {
    onAck = ({ attrs }) => {
      if (attrs.id !== id) return;
      if (attrs.error)
        reject(new HttpError(502, "WhatsApp rejected message submission"));
      else resolve();
    };
    onClose = () =>
      reject(
        new HttpError(503, "WhatsApp disconnected; submission unconfirmed"),
      );
    timer = setTimeout(
      () =>
        reject(
          new HttpError(
            504,
            "WhatsApp acknowledgement timed out; submission unconfirmed",
          ),
        ),
      timeoutMs,
    );
    sock.ws.on("CB:ack,class:message", onAck);
    sock.ws.on("close", onClose);
  });
  try {
    await Promise.all([sock.sendMessage(jid, content, { messageId: id }), ack]);
    return { id, status: "acknowledged" as const };
  } finally {
    // Release per-request listeners and timers on success, rejection, or timeout.
    clearTimeout(timer!);
    sock.ws.off("CB:ack,class:message", onAck!);
    sock.ws.off("close", onClose!);
  }
}
