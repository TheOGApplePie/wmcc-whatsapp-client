import makeWASocket, {
  DisconnectReason,
  jidNormalizedUser,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { authDirectory } from "../config.js";
import { HttpError } from "../error.js";
import { supabaseOwnership, type WhatsAppOwnership } from "../services/ownership.js";
import { createSessionStore, requireUserId } from "./session-store.js";

type Socket = ReturnType<typeof makeWASocket>;
export type SessionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "linking"; qr?: string }
  | { status: "failed"; reason: "account_claimed" | "user_has_other_account" | "claim_unavailable" };
type Session = {
  userId: string;
  jid?: string;
  socket?: Socket;
  qr?: string;
  connected: boolean;
  linking: boolean;
  pairingToken?: string;
  timer?: ReturnType<typeof setTimeout>;
  opening?: Promise<void>;
  credentialWrite?: Promise<void>;
  qrPromise?: Promise<SessionState>;
  resolveQr?: (state: SessionState) => void;
  rejectQr?: (error: Error) => void;
  detach?: () => void;
};

/** One small lifecycle record per verified Supabase user. */
export function createSessionManager(options: {
  root: string;
  makeSocket?: (
    state: Awaited<ReturnType<typeof useMultiFileAuthState>>["state"],
  ) => Socket;
  loadAuth?: typeof useMultiFileAuthState;
  linkingMs?: number;
  qrWaitMs?: number;
  ownership: WhatsAppOwnership;
}) {
  const store = createSessionStore(options.root);
  const sessions = new Map<string, Session>();
  const failures = new Map<string, Extract<SessionState, { status: "failed" }>["reason"]>();
  const cleanups = new Map<string, Promise<void>>();
  const makeSocket = options.makeSocket ?? ((auth) => makeWASocket({ auth }));
  const loadAuth = options.loadAuth ?? useMultiFileAuthState;
  let started: Promise<void> | undefined;
  let stopping = false;

  function stateOf(session?: Session): SessionState {
    if (!session) return { status: "disconnected" };
    if (session.connected) return { status: "connected" };
    if (!session.linking && (session.socket || session.opening)) return { status: "connecting" };
    if (!session.linking) return { status: "disconnected" };
    if (session.qr) return { status: "linking", qr: session.qr };
    return { status: "linking" };
  }

  /** Resolve the single request waiting for the first QR, then forget the callbacks. */
  function finishQr(session: Session, error?: Error) {
    if (!session.qrPromise) return;
    if (error) session.rejectQr?.(error);
    else session.resolveQr?.(stateOf(session));
    session.qrPromise = undefined;
    session.resolveQr = undefined;
    session.rejectQr = undefined;
  }

  /** Stop a socket and release the timer/listeners owned by this session. */
  function closeSocket(session: Session) {
    clearTimeout(session.timer);
    session.timer = undefined;
    session.detach?.();
    session.detach = undefined;
    session.socket?.end(new Error("Session closed"));
    session.socket = undefined;
  }
  async function remove(s: Session, logout: boolean) {
    s.linking = false;
    s.connected = false;
    s.qr = undefined;
    s.pairingToken = undefined;
    finishQr(s, new HttpError(503, "WhatsApp linking attempt ended"));
    const socket = s.socket;
    let logoutFailed = false;
    if (logout && socket) {
      // Keep the connection open until WhatsApp receives the unlink request.
      s.detach?.();
      s.detach = undefined;
      try {
        await socket.logout();
      } catch {
        logoutFailed = true;
      }
    }
    closeSocket(s);
    await s.opening;
    await s.credentialWrite;
    await store.remove(s.userId);
    sessions.delete(s.userId);
    if (logoutFailed)
      throw new HttpError(
        502,
        "Local session removed; WhatsApp unlink could not be confirmed",
      );
  }
  function failPairing(s: Session, reason: Extract<SessionState, { status: "failed" }>["reason"]) {
    failures.set(s.userId, reason);
    const cleanup = remove(s, false);
    cleanups.set(s.userId, cleanup);
    void cleanup.then(
      () => cleanups.delete(s.userId),
      () => cleanups.delete(s.userId),
    );
  }
  async function open(s: Session) {
    if (s.opening || stopping) return;
    // Baileys owns the auth files. This function only connects the user's directory
    // and translates its events into the small public session state above.
    s.opening = (async () => {
      const { state, saveCreds } = await loadAuth(store.directory(s.userId));
      // DELETE may have completed while auth files were loading.
      if (stopping || (!s.linking && !s.jid)) return;
      const socket = makeSocket(state);
      s.socket = socket;
      // Baileys emits this whenever credentials or Signal keys change. Do not
      // filter these writes: every key is required for a future reconnect.
      const onCreds = () => {
        s.credentialWrite = (s.credentialWrite ?? Promise.resolve()).then(saveCreds).catch(() => {
          finishQr(
            s,
            new HttpError(503, "WhatsApp credential persistence failed"),
          );
          void remove(s, false);
        });
      };
      // QR, open, and close are the only lifecycle events this service needs.
      const onUpdate = (update: {
        connection?: string;
        qr?: string;
        lastDisconnect?: { error?: unknown };
      }) => {
        if (s.socket !== socket || stopping) return;
        if (update.qr) {
          if (s.jid) {
            void remove(s, false);
            return;
          }
          s.qr = update.qr;
          finishQr(s);
        }
        if (update.connection === "open") {
          s.qr = undefined;
          const jid = jidNormalizedUser(
            state.creds.me?.id ?? socket.user?.id ?? "",
          );
          if (!/^\d+@s\.whatsapp\.net$/.test(jid)) {
            void remove(s, false);
            return;
          }
          if (s.jid && s.jid !== jid) {
            void remove(s, false);
            return;
          }
          // The socket is authenticated. Persisting the directory is enough to
          // restore it later; runtime state stays in memory only.
          Promise.resolve()
            .then(async () => {
              if ([...sessions.values()].some(
                (other) => other !== s && other.jid === jid,
              ))
                throw new HttpError(409, "account_claimed");
              if (s.linking) {
                const token = s.pairingToken!;
                const result = await options.ownership.claim(token, jid);
                if (result === "account_claimed" || result === "user_has_other_account")
                  throw new HttpError(409, result);
                if (!s.linking || sessions.get(s.userId) !== s) {
                  if (result === "claimed") await options.ownership.release(token);
                  return;
                }
              }
              s.jid = jid;
              s.connected = true;
              s.linking = false;
              s.pairingToken = undefined;
              s.qr = undefined;
              clearTimeout(s.timer);
              finishQr(s);
            })
            .catch((e) => {
              finishQr(
                s,
                e instanceof Error
                  ? e
                  : new Error("Session could not be saved"),
              );
              if (s.linking && sessions.get(s.userId) === s)
                failPairing(s, e instanceof HttpError && e.statusCode === 409
                  ? e.message as "account_claimed" | "user_has_other_account"
                  : "claim_unavailable");
            });
        }
        if (update.connection === "close") {
          s.connected = false;
          s.socket = undefined;
          socket.ev.off("creds.update", onCreds);
          socket.ev.off("connection.update", onUpdate);
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const mustRelink = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.forbidden,
          ].includes(code as DisconnectReason);
          if (mustRelink) {
            void remove(s, false);
          } else if (code === DisconnectReason.restartRequired && s.linking) {
            // A successful scan closes the first socket. Reopen with its saved
            // credentials without resetting the original pairing deadline.
            s.qr = undefined;
            void (async () => {
              await s.credentialWrite;
              await s.opening;
              if (s.linking && sessions.get(s.userId) === s && !stopping)
                await open(s);
            })();
          } else if (s.linking) {
            finishQr(s, new HttpError(503, "WhatsApp linking failed"));
            void remove(s, false);
          } else {
            // The CMS decides when to request another connection attempt.
          }
        }
      };
      socket.ev.on("creds.update", onCreds);
      socket.ev.on("connection.update", onUpdate);
      s.detach = () => {
        socket.ev.off("creds.update", onCreds);
        socket.ev.off("connection.update", onUpdate);
      };
    })()
      .catch((error) => {
        if (s.linking) {
          const connectionError =
            error instanceof Error
              ? error
              : new Error("WhatsApp connection failed");
          finishQr(s, connectionError);
        }
      })
      .finally(() => {
        s.opening = undefined;
      });
    await s.opening;
  }
  const waitForQr = (s: Session) => {
    if (s.qr || s.connected) return Promise.resolve(stateOf(s));
    s.qrPromise ??= new Promise<SessionState>((resolve, reject) => {
      s.resolveQr = resolve;
      s.rejectQr = reject;
      const timer = setTimeout(
        () =>
          finishQr(s, new HttpError(504, "WhatsApp QR generation timed out")),
        options.qrWaitMs ?? 15_000,
      );
      timer.unref();
    });
    return s.qrPromise;
  };
  return {
    async start() {
      started ??= (async () => {
        for (const userId of (await store.users()).sort()) {
          const { state } = await loadAuth(store.directory(userId));
          const jid = jidNormalizedUser(state.creds.me?.id ?? "");
          if ([...sessions.values()].some((s) => s.jid === jid)) {
            console.error(`Skipping duplicate WhatsApp account for ${userId}`);
            continue;
          }
          const s: Session = {
            userId,
            jid: /^\d+@s\.whatsapp\.net$/.test(jid) ? jid : undefined,
            connected: false,
            linking: false,
          };
          sessions.set(userId, s);
        }
      })();
      return started;
    },
    async link(userId: string, token: string) {
      userId = requireUserId(userId);
      await this.start();
      await cleanups.get(userId);
      failures.delete(userId);
      const existing = sessions.get(userId);
      if (existing?.connected)
        throw new HttpError(409, "WhatsApp account is already linked");
      if (existing?.jid) {
        const result = await options.ownership.claim(token, existing.jid);
        if (result === "account_claimed" || result === "user_has_other_account") {
          failures.set(userId, result);
          await remove(existing, false);
          return { status: "failed" as const, reason: result };
        }
        if (sessions.get(userId) !== existing) {
          if (result === "claimed") await options.ownership.release(token);
          throw new HttpError(409, "Session changed during reconnect");
        }
        if (!existing.socket && !existing.opening) void open(existing);
        return { status: "connecting" as const };
      }
      const s = existing ?? {
        userId,
        connected: false,
        linking: true,
      };
      if (!existing || !existing.linking) {
        s.linking = true;
        s.pairingToken = token;
        sessions.set(userId, s);
        s.timer = setTimeout(
          () => void remove(s, false),
          options.linkingMs ?? 120_000,
        );
        await store.prepare(userId);
        void open(s);
      }
      return waitForQr(s);
    },
    status(userId: string) {
      userId = requireUserId(userId);
      const failure = failures.get(userId);
      return failure ? { status: "failed" as const, reason: failure } : stateOf(sessions.get(userId));
    },
    socket(userId: string) {
      const s = sessions.get(requireUserId(userId));
      if (!s?.connected || !s.socket)
        throw new HttpError(503, "WhatsApp client is not connected");
      return s.socket;
    },
    async unlink(userId: string, token: string) {
      userId = requireUserId(userId);
      await this.start();
      await cleanups.get(userId);
      const s = sessions.get(userId);
      let unlinkError: unknown;
      if (s) {
        try { await remove(s, Boolean(s.jid)); }
        catch (error) { unlinkError = error; }
      }
      const released = await options.ownership.release(token);
      const hadFailure = failures.has(userId);
      failures.delete(userId);
      if (unlinkError) throw unlinkError;
      if (!s && released === "not_found" && !hadFailure)
        throw new HttpError(404, "No WhatsApp session to unlink");
    },
    async stop() {
      stopping = true;
      await started;
      for (const s of sessions.values()) {
        s.linking = false;
        s.connected = false;
        closeSocket(s);
        finishQr(s, new HttpError(503, "Service stopping"));
        await s.credentialWrite;
        if (!s.jid) {
          await store.remove(s.userId);
        }
      }
      sessions.clear();
      failures.clear();
    },
  };
}

let manager: ReturnType<typeof createSessionManager> | undefined;
export function whatsAppSessions() {
  return (manager ??= createSessionManager({ root: authDirectory(), ownership: supabaseOwnership }));
}
export function startWhatsApp() {
  return whatsAppSessions().start();
}
export function stopWhatsApp() {
  return manager?.stop() ?? Promise.resolve();
}
export function getWhatsAppSocket(userId: string) {
  return whatsAppSessions().socket(userId);
}
