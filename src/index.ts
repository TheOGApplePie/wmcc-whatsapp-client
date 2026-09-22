import whatsappRouter from './routes/whatsapp.js'
import {authMiddleWare} from './middleware/auth.js'
import {errorHandler} from './error.js'
import app from './server.js';
import 'dotenv/config';
import express from 'express';

app.use(express.json());
app.use(authMiddleWare);
app.use('/api/whatsapp', whatsappRouter);
app.use(errorHandler);
