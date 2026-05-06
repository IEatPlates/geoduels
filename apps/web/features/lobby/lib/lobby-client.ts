import type { RuntimeConfig } from "../../../lib/runtime-config";
import { normalizeHTTPBase, normalizeWSBase } from "../../../lib/runtime-config";
import type { AuthSessionSnapshot } from "../../auth/session";

export type LobbyMember = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  isGuest?: boolean;
  isAdmin?: boolean;
  role: string;
  ready?: boolean;
  connected?: boolean;
};

export type LobbySnapshot = {
  id: string;
  inviteCode: string;
  ownerUserId: string;
  state: "open" | "in_match" | "started" | "closed" | "expired";
  mode: "duel";
  mapScope: string;
  activeMatchId?: string;
  lastMatchId?: string;
  startedMatchId?: string;
  members: LobbyMember[];
};

export type LobbyAssignment = {
  matchId: string;
  mode?: string;
  node: string;
  ticket: string;
  wsPath: string;
  sourceLobbyId?: string;
  sourceLobbyInviteCode?: string;
};

export type LobbyEvent =
  | { type: "lobby_snapshot"; lobby: LobbySnapshot }
  | { type: "match_assigned"; assignment: LobbyAssignment }
  | { type: "lobby_error"; message: string };

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function createLobby(config: RuntimeConfig, accessToken: string): Promise<LobbySnapshot> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "duel", mapScope: "world" }),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Lobby unavailable");
  return resp.json();
}

export async function fetchLobby(config: RuntimeConfig, code: string): Promise<LobbySnapshot | null> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies/${encodeURIComponent(code)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error("Lobby unavailable");
  return resp.json();
}

export async function joinLobby(config: RuntimeConfig, code: string, accessToken: string): Promise<LobbySnapshot> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not join lobby");
  return resp.json();
}

export async function leaveLobby(config: RuntimeConfig, lobbyId: string, accessToken: string): Promise<LobbySnapshot> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies/${encodeURIComponent(lobbyId)}/leave`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not leave lobby");
  return resp.json();
}

export async function kickLobbyMember(config: RuntimeConfig, lobbyId: string, accessToken: string, userId: string): Promise<LobbySnapshot> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies/${encodeURIComponent(lobbyId)}/kick`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not kick player");
  return resp.json();
}

export async function transferLobbyOwner(config: RuntimeConfig, lobbyId: string, accessToken: string, userId: string): Promise<LobbySnapshot> {
  const resp = await fetch(`${config.apiURL}/v1/lobbies/${encodeURIComponent(lobbyId)}/transfer-owner`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not transfer leader");
  return resp.json();
}

export async function startLobby(config: RuntimeConfig, lobbyId: string, accessToken: string): Promise<LobbyAssignment> {
  const resp = await fetch(`${normalizeHTTPBase(config.queueURL).replace(/\/$/, "")}/lobbies/${encodeURIComponent(lobbyId)}/start`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not start lobby");
  const data = await resp.json();
  return data.assignment;
}

export async function streamLobby(
  config: RuntimeConfig,
  session: AuthSessionSnapshot,
  lobbyId: string,
  signal: AbortSignal,
  onEvent: (event: LobbyEvent) => void,
) {
  const target = `${normalizeWSBase(config.queueURL).replace(/\/$/, "")}/lobbies/${encodeURIComponent(lobbyId)}/ws?accessToken=${encodeURIComponent(session.accessToken)}`;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(target);
    const cleanup = () => signal.removeEventListener("abort", abort);
    const settle = (fn: typeof resolve | typeof reject, value?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value as never);
    };
    const abort = () => {
      ws.close();
      settle(reject, new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    ws.onerror = () => settle(reject, new Error("Lobby connection failed"));
    ws.onclose = () => {
      if (signal.aborted) settle(reject, new DOMException("Aborted", "AbortError"));
      else settle(resolve);
    };
    ws.onmessage = (evt) => {
      let msg: any;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        settle(reject, new Error("Lobby connection failed"));
        return;
      }
      const payload = msg?.payload ?? {};
      if (msg?.type === "lobby_snapshot") onEvent({ type: "lobby_snapshot", lobby: payload as LobbySnapshot });
      if (msg?.type === "match_assigned") onEvent({ type: "match_assigned", assignment: payload as LobbyAssignment });
      if (msg?.type === "lobby_error") onEvent({ type: "lobby_error", message: payload?.message || "Lobby unavailable" });
    };
  });
}
