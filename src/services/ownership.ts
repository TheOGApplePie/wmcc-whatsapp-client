import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../error.js";

export type ClaimResult =
  | "claimed"
  | "already_claimed_by_you"
  | "account_claimed"
  | "user_has_other_account";

export interface WhatsAppOwnership {
  claim(token: string, jid: string): Promise<ClaimResult>;
  release(token: string): Promise<"released" | "not_found">;
}

function userClient(token: string) {
  return createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/** CMS-owned RPCs derive the user from the bearer token. Unknown results fail closed. */
export const supabaseOwnership: WhatsAppOwnership = {
  async claim(token, jid) {
    const { data, error } = await userClient(token).rpc(
      "claim_whatsapp_account",
      {
        whatsapp_jid: jid,
      },
    );
    if (
      error ||
      ![
        "claimed",
        "already_claimed_by_you",
        "account_claimed",
        "user_has_other_account",
      ].includes(data)
    )
      throw new HttpError(503, "WhatsApp account claim unavailable");
    return data as ClaimResult;
  },
  async release(token) {
    const { data, error } = await userClient(token).rpc(
      "release_whatsapp_account",
    );
    if (error || !["released", "not_found"].includes(data))
      throw new HttpError(503, "WhatsApp account release unavailable");
    return data as "released" | "not_found";
  },
};
