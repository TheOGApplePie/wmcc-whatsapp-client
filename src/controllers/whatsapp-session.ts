import type { RequestHandler } from 'express';
import type { createSessionManager } from '../whatsapp/baileys-client.js';

/** Thin HTTP adapter; session ownership is always the verified identity in res.locals. */
export function sessionControllers(sessions: Pick<ReturnType<typeof createSessionManager>, 'link' | 'status' | 'unlink'>) {
  const link: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await sessions.link(res.locals.auth.userId, res.locals.auth.token));
  };
  const status: RequestHandler = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(sessions.status(res.locals.auth.userId));
  };
  const unlink: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    await sessions.unlink(res.locals.auth.userId, res.locals.auth.token);
    res.json({ status: 'disconnected' });
  };
  return { link, status, unlink };
}
