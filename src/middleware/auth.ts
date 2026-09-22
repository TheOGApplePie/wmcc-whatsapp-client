import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.PUBLIC_SUPABASE_ANON_KEY!
);

export const authMiddleWare = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const BEARER = 'Bearer ';
  if (!authHeader?.startsWith(BEARER)) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  const token = authHeader.substring(BEARER.length);

  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  req.user = user;

  next();
};
