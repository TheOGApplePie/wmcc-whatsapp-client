import client from '../whatsapp/client.js';
import pkg from 'whatsapp-web.js';
import 'dotenv/config';
const { MessageMedia } = pkg;
export const sendMessageToWhatsApp = async (message:string, posterUrl:string) => {
  const state = await client.getState();
  const chatId ='120363408991082605@g.us'// process.env.CHAT_ID
  if (state !== 'CONNECTED') {
    return {error:"WhatsApp Client not ready"};
  }
  if (!chatId) {
    return {error:"No ChatId defined"};
  }

  let messageSent;
  if (posterUrl) {
    const messageMedia = await MessageMedia.fromUrl(posterUrl);

    messageSent = await client.sendMessage(chatId, messageMedia, { caption: message });//, {caption:message});
  } else {
  messageSent =  await client.sendMessage(chatId, message);
  }
  return {status:messageSent }
}
