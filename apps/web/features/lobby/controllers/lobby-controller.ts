import { ObservableStore } from "../../../lib/observable-store";
import type { RuntimeConfig } from "../../../lib/runtime-config";
import type { SessionController } from "../../auth/controllers/session-controller";
import type { AuthSessionSnapshot } from "../../auth/session";
import type { MatchController } from "../../matchmaking/controllers/match-controller";
import {
  fetchMatchSession,
  type MatchConfig,
} from "../../matchmaking/lib/queue-client";
import {
  applyLobbyPatch,
  createLobby as requestCreateLobby,
  fetchLobby,
  joinLobby as requestJoinLobby,
  kickLobbyMember as requestKickLobbyMember,
  leaveLobby as requestLeaveLobby,
  startLobby as requestStartLobby,
  streamLobby,
  transferLobbyOwner as requestTransferLobbyOwner,
  updateLobbySettings as requestUpdateLobbySettings,
  updateLobbyTeam as requestUpdateLobbyTeam,
  type LobbySnapshot,
  type LobbyTeamId,
  type PartyMode,
} from "../lib/lobby-client";

export type LobbyRuntimeStatus =
  | "idle"
  | "creating"
  | "joining"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "leaving"
  | "error";

export type LobbyRuntimeState = {
  status: LobbyRuntimeStatus;
  lobbyId: string;
  inviteCode: string;
  snapshot: LobbySnapshot | null;
  error: string;
};

const initialState: LobbyRuntimeState = {
  status: "idle",
  lobbyId: "",
  inviteCode: "",
  snapshot: null,
  error: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function mergeLobbySnapshotPreservingPresence(
  current: LobbySnapshot | null,
  next: LobbySnapshot,
): LobbySnapshot {
  if (!current || current.id !== next.id) return next;
  const currentMembers = new Map(
    current.members.map((member) => [member.userId, member]),
  );
  return {
    ...next,
    members: next.members.map((member) => {
      const existing = currentMembers.get(member.userId);
      if (!existing || typeof member.connected === "boolean") return member;
      return { ...member, connected: existing.connected };
    }),
  };
}

export class LobbyController extends ObservableStore<LobbyRuntimeState> {
  private readonly config: RuntimeConfig;
  private readonly sessionController: SessionController;
  private readonly matchController: MatchController;
  private state: LobbyRuntimeState = initialState;
  private streamAbort: AbortController | null = null;
  private streamSession: AuthSessionSnapshot | null = null;
  private handledMatchId = "";
  private connectRequestId = 0;
  private destroyed = false;

  constructor(params: {
    config: RuntimeConfig;
    sessionController: SessionController;
    matchController: MatchController;
  }) {
    super();
    this.config = params.config;
    this.sessionController = params.sessionController;
    this.matchController = params.matchController;
  }

  getState() {
    return this.state;
  }

  destroy() {
    this.destroyed = true;
    this.abortStream();
  }

  reset = () => {
    this.abortStream();
    this.handledMatchId = "";
    this.patchState(initialState);
  };

  ensureLobby = async (inviteCode: string) => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    if (this.state.inviteCode === code && this.state.snapshot) {
      await this.ensureStream();
      return;
    }
    if (
      this.state.inviteCode === code &&
      (this.state.status === "connecting" ||
        this.state.status === "joining" ||
        this.state.status === "creating")
    ) {
      return;
    }
    this.patchState({
      status: "connecting",
      inviteCode: code,
      lobbyId: "",
      snapshot: null,
      error: "",
    });
    try {
      const snap = await fetchLobby(this.config, code);
      if (!snap) {
        this.patchState({ status: "error", error: "Lobby not found" });
        return;
      }
      this.patchState({
        lobbyId: snap.id,
        inviteCode: snap.inviteCode,
        snapshot: mergeLobbySnapshotPreservingPresence(
          this.state.snapshot,
          snap,
        ),
      });
      if (!this.isCurrentUserMember(snap)) {
        this.patchState({ status: "ready", error: "" });
        return;
      }
      await this.ensureStream();
    } catch (error) {
      this.patchState({
        status: "error",
        error: getErrorMessage(error, "Lobby unavailable"),
      });
    }
  };

  createLobby = async (mode: PartyMode = "duel") => {
    this.patchState({ status: "creating", error: "" });
    try {
      const session = await this.playableSession();
      if (!session) return false;
      const snap = await requestCreateLobby(
        this.config,
        session.accessToken,
        mode,
      );
      this.handledMatchId = "";
      this.patchState({
        status: "connecting",
        lobbyId: snap.id,
        inviteCode: snap.inviteCode,
        snapshot: snap,
      });
      await this.connectToLobby(session, snap.id, { waitForSnapshot: true });
      return this.state.status === "ready" && !!this.state.snapshot;
    } catch (error) {
      this.patchState({
        status: "error",
        error: getErrorMessage(error, "Lobby unavailable"),
      });
      return false;
    }
  };

  joinLobby = async (requestedInviteCode?: string) => {
    const code = (
      requestedInviteCode ||
      this.state.inviteCode ||
      this.state.snapshot?.inviteCode ||
      ""
    )
      .trim()
      .toUpperCase();
    if (!code) {
      this.patchState({ error: "Lobby invite is missing." });
      return false;
    }
    this.patchState({ status: "joining", inviteCode: code, error: "" });
    try {
      const session = await this.playableSession();
      if (!session) return false;
      const snap = await requestJoinLobby(this.config, code, session.accessToken);
      this.handledMatchId = "";
      this.patchState({
        status: "connecting",
        lobbyId: snap.id,
        inviteCode: snap.inviteCode,
        snapshot: snap,
      });
      await this.connectToLobby(session, snap.id, { waitForSnapshot: true });
      return this.state.status === "ready" && !!this.state.snapshot;
    } catch (error) {
      this.patchState({
        status: "error",
        error: getErrorMessage(error, "Could not join lobby"),
      });
      return false;
    }
  };

  leaveLobby = async () => {
    if (!this.state.lobbyId) return;
    const lobbyId = this.state.lobbyId;
    const session = this.sessionController.getSessionSnapshot();
    this.patchState({ status: "leaving", error: "" });
    try {
      if (session) {
        await requestLeaveLobby(this.config, lobbyId, session.accessToken);
      }
      this.reset();
    } catch (error) {
      this.patchState({
        status: "error",
        error: getErrorMessage(error, "Could not leave lobby"),
      });
    }
  };

  kickMember = async (userId: string) => {
    const session = this.sessionController.getSessionSnapshot();
    if (!this.state.lobbyId || !session) return;
    this.patchState({ error: "" });
    try {
      const next = await requestKickLobbyMember(
        this.config,
        this.state.lobbyId,
        session.accessToken,
        userId,
      );
      this.patchSnapshot(next);
    } catch (error) {
      this.patchState({
        error: getErrorMessage(error, "Could not kick player"),
      });
    }
  };

  transferOwner = async (userId: string) => {
    const session = this.sessionController.getSessionSnapshot();
    if (!this.state.lobbyId || !session) return;
    this.patchState({ error: "" });
    try {
      const next = await requestTransferLobbyOwner(
        this.config,
        this.state.lobbyId,
        session.accessToken,
        userId,
      );
      this.patchSnapshot(next);
    } catch (error) {
      this.patchState({
        error: getErrorMessage(error, "Could not transfer leader"),
      });
    }
  };

  startLobby = async () => {
    const session = this.sessionController.getSessionSnapshot();
    if (!this.state.lobbyId || !session) return;
    this.patchState({ error: "" });
    try {
      const assignment = await requestStartLobby(
        this.config,
        this.state.lobbyId,
        session.accessToken,
      );
      this.handledMatchId = assignment.matchId;
      await this.matchController.resumeResolvedMatch(assignment, {
        playMatchFoundSfx: true,
      });
    } catch (error) {
      this.patchState({
        error: getErrorMessage(error, "Could not start lobby"),
      });
    }
  };

  updateSettings = async (matchConfig: MatchConfig, mode?: PartyMode) => {
    const session = this.sessionController.getSessionSnapshot();
    if (!this.state.lobbyId || !session) return;
    this.patchState({ error: "" });
    try {
      const next = await requestUpdateLobbySettings(
        this.config,
        this.state.lobbyId,
        session.accessToken,
        matchConfig,
        mode,
      );
      this.patchSnapshot(next);
    } catch (error) {
      this.patchState({
        error: getErrorMessage(error, "Could not update lobby settings"),
      });
    }
  };

  switchTeam = async (teamId: LobbyTeamId) => {
    const session = this.sessionController.getSessionSnapshot();
    if (!this.state.lobbyId || !session) return;
    this.patchState({ error: "" });
    try {
      const next = await requestUpdateLobbyTeam(
        this.config,
        this.state.lobbyId,
        session.accessToken,
        teamId,
      );
      this.patchSnapshot(next);
    } catch (error) {
      this.patchState({
        error: getErrorMessage(error, "Could not switch team"),
      });
    }
  };

  private async playableSession() {
    const session = await this.sessionController.getPlayableSession();
    if (!session) {
      this.patchState({
        status: "error",
        error: "Could not start a guest session.",
      });
      return null;
    }
    return session;
  }

  private async ensureStream() {
    if (!this.state.lobbyId || !this.isCurrentUserMember(this.state.snapshot)) {
      return;
    }
    const session =
      this.sessionController.getSessionSnapshot() ||
      (await this.sessionController.ensureFreshSession());
    if (!session) return;
    await this.connectToLobby(session, this.state.lobbyId);
  }

  private async connectToLobby(
    session: AuthSessionSnapshot,
    lobbyId: string,
    options?: { waitForSnapshot?: boolean },
  ) {
    this.abortStream();
    const controller = new AbortController();
    const requestId = ++this.connectRequestId;
    this.streamAbort = controller;
    this.streamSession = session;
    this.patchState({
      status: options?.waitForSnapshot
        ? "connecting"
        : this.state.snapshot
          ? "reconnecting"
          : "connecting",
      error: "",
    });
    let readyResolve: (() => void) | null = null;
    let readyReject: ((error: Error) => void) | null = null;
    let readyTimeout: number | null = null;
    const ready = options?.waitForSnapshot
      ? new Promise<void>((resolve, reject) => {
          readyResolve = resolve;
          readyReject = reject;
          readyTimeout = window.setTimeout(() => {
            readyReject?.(new Error("Lobby connection timed out"));
            controller.abort();
          }, 10000);
        })
      : Promise.resolve();
    void streamLobby(
      this.config,
      session,
      lobbyId,
      controller.signal,
      (event) => {
        if (requestId !== this.connectRequestId) return;
        if (event.type === "lobby_snapshot") {
          if (readyTimeout) window.clearTimeout(readyTimeout);
          this.patchSnapshot(event.lobby, "ready");
          this.handleStartedLobby(event.lobby, controller);
          readyResolve?.();
          readyResolve = null;
          readyReject = null;
          return;
        }
        if (event.type === "lobby_patch") {
          const next = applyLobbyPatch(this.state.snapshot, event.patch);
          if (next) {
            this.patchSnapshot(next, "ready");
            this.handleStartedLobby(next, controller);
          }
          return;
        }
        if (event.type === "match_assigned") {
          if (this.handledMatchId === event.assignment.matchId) return;
          this.handledMatchId = event.assignment.matchId;
          void this.matchController.resumeResolvedMatch(event.assignment, {
            playMatchFoundSfx: true,
          });
          return;
        }
        if (event.type === "lobby_error") {
          if (readyTimeout) window.clearTimeout(readyTimeout);
          this.patchState({ status: "error", error: event.message });
          if (event.message.toLowerCase().includes("left this lobby")) {
            this.reset();
          }
          readyReject?.(new Error(event.message));
        }
      },
    )
      .then(() => {
        if (requestId !== this.connectRequestId) return;
        if (readyReject) {
          if (readyTimeout) window.clearTimeout(readyTimeout);
          readyReject(new Error("Lobby connection closed"));
        }
      })
      .catch((error) => {
        if (requestId !== this.connectRequestId) return;
        if (error?.name === "AbortError") return;
        if (readyTimeout) window.clearTimeout(readyTimeout);
        this.patchState({
          status: this.state.snapshot ? "reconnecting" : "error",
          error: getErrorMessage(error, "Lobby connection failed"),
        });
        readyReject?.(
          error instanceof Error
            ? error
            : new Error("Lobby connection failed"),
        );
      });
    return ready;
  }

  private abortStream() {
    this.streamAbort?.abort();
    this.streamAbort = null;
    this.streamSession = null;
  }

  private patchSnapshot(next: LobbySnapshot, status: LobbyRuntimeStatus = "ready") {
    const snapshot = mergeLobbySnapshotPreservingPresence(this.state.snapshot, next);
    this.patchState({
      status,
      lobbyId: snapshot.id,
      inviteCode: snapshot.inviteCode,
      snapshot,
      error: "",
    });
  }

  private isCurrentUserMember(snapshot: LobbySnapshot | null) {
    const session = this.sessionController.getSessionSnapshot();
    if (!snapshot || !session?.userId) return false;
    return snapshot.members.some((member) => member.userId === session.userId);
  }

  private async handleStartedLobby(
    snap: LobbySnapshot,
    controller: AbortController,
  ) {
    const matchId = snap.activeMatchId || snap.startedMatchId || "";
    if (
      !matchId ||
      this.handledMatchId === matchId ||
      (snap.state !== "in_match" && snap.state !== "started")
    ) {
      return;
    }
    const session = this.streamSession;
    if (!session) return;
    try {
      const resolved = await fetchMatchSession(
        this.config,
        session.accessToken,
        matchId,
        controller.signal,
      );
      if (resolved.status === "live_connectable") {
        const connected = await this.matchController.resumeResolvedMatch(
          resolved,
          { playMatchFoundSfx: true },
        );
        if (connected) {
          this.handledMatchId = matchId;
        }
      }
    } catch {
      // The stream will continue carrying lobby state; match recovery can retry elsewhere.
    }
  }

  private patchState(patch: Partial<LobbyRuntimeState>) {
    this.state = { ...this.state, ...patch };
    if (!this.destroyed) {
      this.emit();
    }
  }
}
