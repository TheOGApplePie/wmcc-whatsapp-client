import express from 'express';
import {sendAnnouncement} from '../controllers/whatsapp.js'
import { checkMessageMiddleware } from '../middleware/whatsapp.js'
import { handleValidationErrors } from '../error.js';

const whatsAppRouter = express.Router();

whatsAppRouter.post('/announcement', checkMessageMiddleware, handleValidationErrors, sendAnnouncement);
export default whatsAppRouter;
