import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('ready', async () => {
  console.log('Client is ready!');


  try {

  } catch (e) {
    console.log('Error: ', e)
  }
});
client.on('message', msg => {
  console.log({
    from: msg.from,
    to: msg.to,
    author: msg.author,
    body: msg.body,
    id: msg.id,
    info: msg.getInfo,
  });
});
client.on('message_create', msg => {
  client.getState().then((a)=>console.log(a))
  console.log({
    from: msg.from,
    to: msg.to,
    author: msg.author,
    body: msg.body,
    id: msg.id,
    info: msg.getInfo,
  });

});
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.initialize();
export default client;
