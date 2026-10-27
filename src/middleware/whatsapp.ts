import { body } from 'express-validator';
export const checkMessageMiddleware = [
  body('message').isString().bail().custom(v => v.trim().length > 0).withMessage('A nonempty message is required'),
  body('mediaUrl').optional().isString().bail().custom(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'gkpctbvyswcfccogoepl.supabase.co'
        && !url.username && !url.password && !url.port
        && url.pathname.startsWith('/storage/v1/object/public/event-posters/public/');
    } catch { return false; }
  }).withMessage('Use an approved poster URL'),
];
