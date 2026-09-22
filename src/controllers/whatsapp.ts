import { sendMessageToWhatsApp } from '../services/whatsapp.js'
import {type NextFunction, type Request, type Response } from 'express';

export const sendAnnouncement = async (req:Request, res:Response, next:NextFunction) => {

  const { message, mediaUrl } = req.body;
  const { error, status } = await sendMessageToWhatsApp(message, mediaUrl);
    if (error) {
      return res.status(503).json({
          success: false,
          message: error,
        })
    }
  return res.status(200).json({
    success:true, message:status
  })
}
