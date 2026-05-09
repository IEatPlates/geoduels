import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RESULT_ANIMATION_CONFIG } from "../../../components/ui/round-result-animation-config";
import { getRuntimeConfig } from "../../../lib/runtime-config";
import {
  requestCompleteOnboarding,
  requestGoogleStart,
  requestGuestSession,
  requestLogout,
  requestMatchReport,
  requestUserNotifications,
  requestSession,
  requestRefreshSession,
  requestUpdateNickname,
  markUserNotificationRead,
  type UserNotification,
} from "../../auth/lib/auth-client";
import type { AuthSessionSnapshot } from "../../auth/session";
import {
  createLobby,
  fetchLobby,
  joinLobby,
  kickLobbyMember as requestKickLobbyMember,
  leaveLobby,
  startLobby,
  streamLobby,
  transferLobbyOwner as requestTransferLobbyOwner,
  updateLobbySettings as requestUpdateLobbySettings,
  type LobbySnapshot,
} from "../../lobby/lib/lobby-client";
import { getHomeRuntime, startHomeRuntime } from "../state/home-runtime";
import { deriveHomeModel } from "./derive-home-model";
import type { HomeModel } from "./types";
import { useLobbyData } from "./useLobbyData";
import {
  fetchMatchSession,
  fetchResumableSession,
  type MatchConfig,
} from "../../matchmaking/lib/queue-client";

type AuthResponseUser = {
  id?: string;
  isGuest?: boolean;
  isAdmin?: boolean;
  isModerator?: boolean;
};

type AuthResponse = {
  accessToken?: string;
  onboardingRequired?: boolean;
  suggestedNickname?: string;
  authURL?: string;
  user?: AuthResponseUser;
};

function currentReturnTo() {
  if (typeof window === "undefined") return "/";
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.startsWith("/") ? path : "/";
}

function clearGoogleAuthParams(url: URL) {
  url.searchParams.delete("googleAuth");
  url.searchParams.delete("googleAuthError");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function buildSessionFromAuthResponse(
  data: AuthResponse,
  fallback: { userId: string; nicknameInput: string },
): AuthSessionSnapshot {
  return {
    userId:
      typeof data.user?.id === "string" && data.user.id
        ? data.user.id
        : fallback.userId,
    accessToken: data.accessToken || "",
    onboardingRequired: !!data.onboardingRequired,
    nicknameInput: data.suggestedNickname || fallback.nicknameInput,
  };
}

export function useHomeModel(options?: {
  routeMatchId?: string | null;
  routeContext?: "home" | "match";
  lobbyInviteCode?: string | null;
  onPrivateLobbyEntered?: (inviteCode: string) => void;
  onPrivateLobbyLeft?: () => void;
}): HomeModel {
  const config = getRuntimeConfig();
  const runtimeRef = useRef(getHomeRuntime(config));
  const { sessionController, matchController, gameController } =
    runtimeRef.current;
  const [homeResumeMatchId, setHomeResumeMatchId] = useState("");
  const routeMatchId = options?.routeMatchId ?? null;
  const routeContext = options?.routeContext ?? "home";
  const lobbyInviteCode = options?.lobbyInviteCode?.trim().toUpperCase() ?? "";
  const onPrivateLobbyEntered = options?.onPrivateLobbyEntered;
  const onPrivateLobbyLeft = options?.onPrivateLobbyLeft;
  const isMatchRoute = routeContext === "match";
  const [privateLobby, setPrivateLobby] = useState<LobbySnapshot | null>(null);
  const [pendingLobbyCode, setPendingLobbyCode] = useState("");
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const lobbyStreamAbortRef = useRef<AbortController | null>(null);
  const handledLobbyMatchRef = useRef("");

  const auth = useSyncExternalStore(
    sessionController.subscribe,
    sessionController.getState.bind(sessionController),
    sessionController.getState.bind(sessionController),
  );
  const match = useSyncExternalStore(
    matchController.subscribe,
    matchController.getState.bind(matchController),
    matchController.getState.bind(matchController),
  );
  const game = useSyncExternalStore(
    gameController.subscribe,
    gameController.getState.bind(gameController),
    gameController.getState.bind(gameController),
  );
  const lobbyData = useLobbyData({
    config,
    sessionController,
    auth,
    enabled: !isMatchRoute,
  });

  const refreshSessionMutation = useMutation({
    mutationFn: () => requestRefreshSession(config),
  });
  const sessionMutation = useMutation({
    mutationFn: () => requestSession(config),
  });
  const guestSessionMutation = useMutation({
    mutationFn: () => requestGuestSession(config),
  });
  const completeOnboardingMutation = useMutation({
    mutationFn: ({
      accessToken,
      nickname,
    }: {
      accessToken: string;
      nickname: string;
    }) => requestCompleteOnboarding(config, accessToken, nickname),
  });
  const updateNicknameMutation = useMutation({
    mutationFn: ({
      accessToken,
      nickname,
    }: {
      accessToken: string;
      nickname: string;
    }) => requestUpdateNickname(config, accessToken, nickname),
  });
  const googleStartMutation = useMutation({
    mutationFn: ({
      accessToken,
      returnTo,
    }: {
      accessToken?: string;
      returnTo?: string;
    }) => requestGoogleStart(config, accessToken, returnTo),
  });

  async function bootstrapSession() {
    const data = await sessionMutation.mutateAsync();
    if (!data) {
      return null;
    }
    const current = sessionController.getState();
    const nextSession = buildSessionFromAuthResponse(data, {
      userId: current.userId,
      nicknameInput: current.nicknameInput,
    });
    sessionController.applySessionSnapshot(nextSession, {
      isGuest:
        typeof data.user?.isGuest === "boolean"
          ? data.user.isGuest
          : current.isGuest,
      isAdmin:
        typeof data.user?.isAdmin === "boolean"
          ? data.user.isAdmin
          : current.isAdmin,
      isModerator:
        typeof data.user?.isModerator === "boolean"
          ? data.user.isModerator
          : current.isModerator,
      leaderboard: current.leaderboard,
      authLoading: false,
      authError: "",
    });
    return nextSession;
  }

  async function refreshSession() {
    const current = sessionController.getState();
    const data = await refreshSessionMutation.mutateAsync();
    if (!data) {
      return null;
    }
    const nextSession = buildSessionFromAuthResponse(data, {
      userId: current.userId,
      nicknameInput: current.nicknameInput,
    });
    sessionController.applySessionSnapshot(nextSession, {
      isGuest:
        typeof data.user?.isGuest === "boolean"
          ? data.user.isGuest
          : current.isGuest,
      isAdmin:
        typeof data.user?.isAdmin === "boolean"
          ? data.user.isAdmin
          : current.isAdmin,
      isModerator:
        typeof data.user?.isModerator === "boolean"
          ? data.user.isModerator
          : current.isModerator,
      leaderboard: current.leaderboard,
    });
    return nextSession;
  }

  async function ensurePlayableSession() {
    const currentSession = sessionController.getSessionSnapshot();
    if (currentSession) {
      return currentSession;
    }
    const current = sessionController.getState();
    if (current.onboardingRequired) {
      return null;
    }
    sessionController.setAuthPending({
      authLoading: true,
      authError: "",
      nicknameError: "",
    });
    try {
      const bootstrapped = await sessionController.bootstrapSession();
      if (bootstrapped) {
        sessionController.setAuthPending({ authLoading: false, authError: "" });
        return bootstrapped;
      }
      const data = await guestSessionMutation.mutateAsync();
      const name = data.suggestedNickname || "Guest";
      const nextSession: AuthSessionSnapshot = {
        userId: data.user?.id || "",
        accessToken: data.accessToken || "",
        onboardingRequired: !!data.onboardingRequired,
        nicknameInput: data.suggestedNickname || name,
      };
      sessionController.applySessionSnapshot(nextSession, {
        displayName: name,
        isGuest:
          typeof data.user?.isGuest === "boolean" ? data.user.isGuest : true,
        isAdmin:
          typeof data.user?.isAdmin === "boolean" ? data.user.isAdmin : false,
        isModerator:
          typeof data.user?.isModerator === "boolean"
            ? data.user.isModerator
            : false,
        leaderboard: null,
        nicknameError: "",
        authLoading: false,
        authError: "",
      });
      return nextSession;
    } catch (error) {
      sessionController.setAuthPending({
        authLoading: false,
        authError: getErrorMessage(error, "Guest login failed"),
      });
      return null;
    }
  }

  const prevEndedMatchRef = useRef("");
  const privateLobbyMemberKey =
    privateLobby?.members.map((member) => member.userId).join("|") || "";

  useEffect(() => {
    startHomeRuntime(runtimeRef.current);
  }, []);

  useEffect(() => {
    sessionController.setNetworkHandlers({
      bootstrapSession,
      refreshSession,
      getPlayableSession: ensurePlayableSession,
    });
  }, [sessionController]);

  useEffect(() => {
    if (isMatchRoute) {
      sessionController.setAuthPending({ authLoading: false });
      return;
    }
    let cancelled = false;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const googleAuth = url.searchParams.get("googleAuth");
      if (googleAuth === "success") {
        clearGoogleAuthParams(url);
        window.history.replaceState({}, "", url.toString());
        sessionController.setAuthPending({ authLoading: true, authError: "" });
        void (async () => {
          try {
            await sessionController.bootstrapSession();
          } catch {
            if (cancelled) return;
            sessionController.setAuthPending({
              authLoading: false,
              authError:
                "Sign-in completed, but restoring the session failed. Please try again.",
            });
          }
        })();
        return () => {
          cancelled = true;
        };
      }
      if (googleAuth === "error") {
        const errorMessage =
          url.searchParams.get("googleAuthError") || "Login failed";
        clearGoogleAuthParams(url);
        window.history.replaceState({}, "", url.toString());
        sessionController.setAuthPending({
          authLoading: false,
          authError: errorMessage,
        });
      }
    }
    if (sessionController.getState().userId) {
      return;
    }
    sessionController.setAuthPending({ authLoading: true, authError: "" });
    void (async () => {
      try {
        const bootstrapped = await sessionController.bootstrapSession();
        if (!bootstrapped) {
          sessionController.setAuthPending({ authLoading: false });
        }
      } catch {
        if (cancelled) return;
        sessionController.setAuthPending({ authLoading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMatchRoute, sessionController]);

  useEffect(() => {
    if (isMatchRoute) {
      setHomeResumeMatchId("");
      return;
    }
    const session = sessionController.getSessionSnapshot();
    if (!session || session.onboardingRequired) {
      setHomeResumeMatchId("");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const ensured = await sessionController.ensureFreshSession(60_000, {
        allowOnboarding: false,
      });
      if (!ensured || cancelled) {
        if (!cancelled) setHomeResumeMatchId("");
        return;
      }
      const resumable = await fetchResumableSession(
        config,
        ensured.accessToken,
        controller.signal,
      );
      if (cancelled) return;
      setHomeResumeMatchId(
        resumable.status === "match" ? resumable.matchId : "",
      );
    })().catch(() => {
      if (!cancelled) {
        setHomeResumeMatchId("");
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    auth.userId,
    auth.onboardingRequired,
    config,
    isMatchRoute,
    sessionController,
  ]);

  useEffect(() => {
    if (isMatchRoute || !lobbyInviteCode) {
      return;
    }
    if (privateLobby?.inviteCode === lobbyInviteCode) {
      return;
    }
    let cancelled = false;
    setPendingLobbyCode(lobbyInviteCode);
    setLobbyError("");
    void fetchLobby(config, lobbyInviteCode)
      .then((snap) => {
        if (!cancelled) {
          setPrivateLobby(snap);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPrivateLobby(null);
          setLobbyError(getErrorMessage(error, "Lobby unavailable"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config, isMatchRoute, lobbyInviteCode, privateLobby?.inviteCode]);

  useEffect(() => {
    const member = privateLobby?.members.find(
      (item) => item.userId === auth.userId,
    );
    if (!privateLobby?.id || !auth.accessToken || !member || isMatchRoute) {
      lobbyStreamAbortRef.current?.abort();
      lobbyStreamAbortRef.current = null;
      return;
    }
    const controller = new AbortController();
    lobbyStreamAbortRef.current?.abort();
    lobbyStreamAbortRef.current = controller;
    const handleStarted = async (matchId: string) => {
      if (!matchId || handledLobbyMatchRef.current === matchId) {
        return;
      }
      const resolved = await fetchMatchSession(
        config,
        auth.accessToken,
        matchId,
        controller.signal,
      );
      if (resolved.status === "live_connectable") {
        const connected = await matchController.resumeResolvedMatch(resolved, {
          playMatchFoundSfx: true,
        });
        if (connected) {
          handledLobbyMatchRef.current = matchId;
        }
      }
    };
    void streamLobby(
      config,
      {
        userId: auth.userId,
        accessToken: auth.accessToken,
        onboardingRequired: false,
        nicknameInput: "",
      },
      privateLobby.id,
      controller.signal,
      (event) => {
        if (event.type === "lobby_snapshot") {
          setPrivateLobby(event.lobby);
          const activeLobbyMatchId =
            event.lobby.activeMatchId || event.lobby.startedMatchId || "";
          if (
            (event.lobby.state === "in_match" ||
              event.lobby.state === "started") &&
            activeLobbyMatchId
          ) {
            void handleStarted(activeLobbyMatchId);
          }
          return;
        }
        if (event.type === "match_assigned") {
          if (handledLobbyMatchRef.current === event.assignment.matchId) {
            return;
          }
          handledLobbyMatchRef.current = event.assignment.matchId;
          void matchController.resumeResolvedMatch(event.assignment, {
            playMatchFoundSfx: true,
          });
          return;
        }
        if (event.type === "lobby_error") {
          setLobbyError(event.message);
          if (event.message.toLowerCase().includes("left this lobby")) {
            lobbyStreamAbortRef.current?.abort();
            lobbyStreamAbortRef.current = null;
            setPrivateLobby(null);
            setPendingLobbyCode("");
            onPrivateLobbyLeft?.();
          }
        }
      },
    ).catch((error) => {
      if (error?.name !== "AbortError") {
        setLobbyError(getErrorMessage(error, "Lobby connection failed"));
      }
    });
    return () => {
      controller.abort();
      if (lobbyStreamAbortRef.current === controller) {
        lobbyStreamAbortRef.current = null;
      }
    };
  }, [
    auth.accessToken,
    auth.userId,
    config,
    isMatchRoute,
    matchController,
    onPrivateLobbyLeft,
    privateLobby?.id,
    privateLobbyMemberKey,
  ]);

  useEffect(() => {
    const snapshot = match.snapshot;
    if (
      !snapshot ||
      snapshot.state !== "ended" ||
      snapshot.matchId === prevEndedMatchRef.current
    ) {
      return;
    }
    prevEndedMatchRef.current = snapshot.matchId;
    if (snapshot.mode === "singleplayer") {
      return;
    }
    sessionController.setGamesPlayed((value) => value + 1);
    const me = snapshot.players[auth.userId];
    const opponentId =
      Object.keys(snapshot.players || {}).find((id) => id !== auth.userId) ||
      "";
    const opp = opponentId ? snapshot.players[opponentId] : undefined;
    if (me && opp && me.hp > opp.hp) {
      sessionController.setWins((value) => value + 1);
    }
    if (me && opp && !me.isGuest) {
      const preview = snapshot.ratingPreview?.[me.userId];
      const selfDelta =
        me.hp > opp.hp
          ? preview?.win
          : me.hp < opp.hp
            ? preview?.lose
            : preview?.draw;
      if (typeof selfDelta === "number") {
        sessionController.setMmr(me.mmr + selfDelta);
      }
      sessionController.setRankedGamesPlayed((value) => value + 1);
      if (me.hp > opp.hp) {
        sessionController.setRankedWins((value) => value + 1);
      }
    }
  }, [match.snapshot, auth.userId, sessionController]);

  useEffect(() => {
    let cancelled = false;
    if (!auth.userId || !auth.accessToken || auth.onboardingRequired) {
      setNotifications([]);
      return;
    }
    void (async () => {
      const result = await requestUserNotifications(config, auth.accessToken);
      if (!cancelled) {
        setNotifications(result.notifications || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.userId, auth.accessToken, auth.onboardingRequired]);

  const baseView = deriveHomeModel({
    auth,
    match: {
      ...match,
      onlinePlayers:
        typeof lobbyData.onlinePlayers === "number"
          ? lobbyData.onlinePlayers
          : match.onlinePlayers,
    },
    game,
    config,
    homeResumeMatchId,
    routeMatchId,
    leaderboardLoading: lobbyData.leaderboardLoading,
    maintenance: lobbyData.maintenance,
    changelogEyebrow: lobbyData.changelogEyebrow,
    changelogTitle: lobbyData.changelogTitle,
    changelogMarkdown: lobbyData.changelogMarkdown,
  });
  const privateLobbyMember = privateLobby?.members.find(
    (member) => member.userId === auth.userId,
  );
  const view = {
    ...baseView,
    overlays: {
      ...baseView.overlays,
      notifications,
    },
    lobby: {
      ...baseView.lobby,
      privateLobby: {
        snapshot: privateLobby,
        inviteCode: pendingLobbyCode || privateLobby?.inviteCode || "",
        isMember: !!privateLobbyMember,
        isOwner: !!privateLobby && privateLobby.ownerUserId === auth.userId,
        busy: lobbyBusy,
        error: lobbyError,
      },
    },
  };

  useEffect(() => {
    if (view.game.uiPhase !== "match_end") {
      gameController.setShowMatchEndPage(false);
      return;
    }
    if (game.resultPhase !== "hp_apply") return;
    const timer = setTimeout(
      () => gameController.setShowMatchEndPage(true),
      RESULT_ANIMATION_CONFIG.timeline.endPageDelayMs,
    );
    return () => clearTimeout(timer);
  }, [
    view.game.uiPhase,
    game.resultPhase,
    match.snapshot?.lastRoundResult?.roundId,
    gameController,
    config,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isTyping) return;
      if (!view.game.canFinalizeGuess && !view.game.canAdvanceRound) return;
      event.preventDefault();
      if (view.game.canFinalizeGuess) {
        gameController.finalizeGuess();
        return;
      }
      if (view.game.canAdvanceRound) {
        gameController.advanceRound();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view.game.canFinalizeGuess, view.game.canAdvanceRound, gameController]);

  const submitOnboardingNickname = async () => {
    const nick = sessionController.getState().nicknameInput.trim();
    if (!nick) {
      sessionController.setAuthPending({
        nicknameError: "Please choose a nickname.",
      });
      return;
    }
    const current = sessionController.getState();
    sessionController.setAuthPending({
      nicknameSaving: true,
      nicknameError: "",
      authError: "",
    });
    try {
      const session = await sessionController.ensureFreshSession(60_000, {
        allowOnboarding: true,
      });
      if (!session) {
        sessionController.clearAuthSession(
          "Session expired. Please sign in again.",
        );
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await completeOnboardingMutation.mutateAsync({
        accessToken: session.accessToken,
        nickname: nick,
      });
      const nextSession: AuthSessionSnapshot = {
        userId: current.userId,
        accessToken: data.accessToken || current.accessToken,
        onboardingRequired: false,
        nicknameInput: nick,
      };
      sessionController.applySessionSnapshot(nextSession, {
        nicknameSaving: false,
        nicknameError: "",
        leaderboard: current.leaderboard,
        displayName: nick,
      });
    } catch (error) {
      sessionController.setAuthPending({
        nicknameSaving: false,
        nicknameError: getErrorMessage(error, "Failed to save nickname"),
      });
    }
  };

  const submitProfileNickname = async (): Promise<boolean> => {
    const current = sessionController.getState();
    const nick = current.nicknameInput.trim();
    if (!nick) {
      sessionController.setAuthPending({
        nicknameError: "Please choose a nickname.",
      });
      return false;
    }
    if (!current.userId || !current.accessToken) {
      sessionController.setAuthPending({
        nicknameError: "Please sign in again.",
      });
      return false;
    }
    if (current.isGuest) {
      sessionController.setAuthPending({
        nicknameError: "Guest nicknames cannot be changed.",
      });
      return false;
    }
    sessionController.setAuthPending({
      nicknameSaving: true,
      nicknameError: "",
      authError: "",
    });
    try {
      const session = await sessionController.ensureFreshSession();
      if (!session) {
        sessionController.clearAuthSession(
          "Session expired. Please sign in again.",
        );
        throw new Error("Session expired. Please sign in again.");
      }
      let resp = await updateNicknameMutation.mutateAsync({
        accessToken: session.accessToken,
        nickname: nick,
      });
      if (resp.status === 401 || resp.status === 403) {
        const refreshed = await sessionController.ensureFreshSession(60_000, {
          forceRefresh: true,
        });
        if (!refreshed) {
          sessionController.clearAuthSession(
            "Session expired. Please sign in again.",
          );
          throw new Error("Session expired. Please sign in again.");
        }
        resp = await updateNicknameMutation.mutateAsync({
          accessToken: refreshed.accessToken,
          nickname: nick,
        });
      }
      if (!resp.ok) {
        throw new Error((await resp.text()) || "Failed to save nickname");
      }
      const data = (await resp.json()) as { user?: { display_name?: string } };
      sessionController.setAuthPending({
        nicknameSaving: false,
        nicknameError: "",
      });
      if (
        typeof data.user?.display_name === "string" &&
        data.user.display_name
      ) {
        sessionController.applyProfileSnapshot({
          display_name: data.user.display_name,
        });
      }
      return true;
    } catch (error) {
      sessionController.setAuthPending({
        nicknameSaving: false,
        nicknameError: getErrorMessage(error, "Failed to save nickname"),
      });
      return false;
    }
  };

  const devLogin = () => ensurePlayableSession();

  const logout = () => {
    void requestLogout(config);
    sessionController.clearAuthSession();
  };

  const triggerGoogleSignIn = async () => {
    if (typeof window === "undefined") return;
    if (
      !config.googleClientId ||
      !sessionController.getState().googleSignInEnabled
    ) {
      return;
    }
    sessionController.setAuthPending({ authLoading: true, authError: "" });
    try {
      const session = await sessionController.ensureFreshSession(60_000, {
        allowOnboarding: true,
      });
      const data = await googleStartMutation.mutateAsync({
        accessToken: session?.accessToken,
        returnTo: currentReturnTo(),
      });
      if (!data.authURL) {
        throw new Error("Missing Google auth URL");
      }
      window.location.assign(data.authURL);
    } catch (error) {
      sessionController.setAuthPending({
        authLoading: false,
        authError: getErrorMessage(error, "Failed to start Google sign-in"),
      });
    }
  };

  const playableSessionForLobby = async () => {
    const session = await sessionController.getPlayableSession();
    if (!session) {
      setLobbyError("Could not start a guest session.");
      return null;
    }
    return session;
  };

  const createInviteLobby = async () => {
    setLobbyBusy(true);
    setLobbyError("");
    try {
      const session = await playableSessionForLobby();
      if (!session) return;
      const snap = await createLobby(config, session.accessToken);
      handledLobbyMatchRef.current = "";
      setPendingLobbyCode(snap.inviteCode);
      setPrivateLobby(snap);
      onPrivateLobbyEntered?.(snap.inviteCode);
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Lobby unavailable"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const joinInviteLobby = async (requestedInviteCode?: string) => {
    const inviteCode = (
      requestedInviteCode ||
      pendingLobbyCode ||
      privateLobby?.inviteCode ||
      ""
    )
      .trim()
      .toUpperCase();
    if (!inviteCode) {
      setLobbyError("Lobby invite is missing.");
      return;
    }
    setPendingLobbyCode(inviteCode);
    setLobbyBusy(true);
    setLobbyError("");
    try {
      const session = await playableSessionForLobby();
      if (!session) return;
      const snap = await joinLobby(config, inviteCode, session.accessToken);
      handledLobbyMatchRef.current = "";
      setPendingLobbyCode(snap.inviteCode);
      setPrivateLobby(snap);
      onPrivateLobbyEntered?.(snap.inviteCode);
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not join lobby"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const leavePrivateLobby = async () => {
    if (!privateLobby?.id) return;
    const session = sessionController.getSessionSnapshot();
    setLobbyBusy(true);
    setLobbyError("");
    try {
      if (session) {
        await leaveLobby(config, privateLobby.id, session.accessToken);
      }
      lobbyStreamAbortRef.current?.abort();
      lobbyStreamAbortRef.current = null;
      handledLobbyMatchRef.current = "";
      setPrivateLobby(null);
      setPendingLobbyCode("");
      onPrivateLobbyLeft?.();
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not leave lobby"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const kickLobbyMember = async (userId: string) => {
    if (!privateLobby?.id || !auth.accessToken) return;
    setLobbyBusy(true);
    setLobbyError("");
    try {
      setPrivateLobby(
        await requestKickLobbyMember(
          config,
          privateLobby.id,
          auth.accessToken,
          userId,
        ),
      );
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not kick player"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const transferLobbyOwner = async (userId: string) => {
    if (!privateLobby?.id || !auth.accessToken) return;
    setLobbyBusy(true);
    setLobbyError("");
    try {
      setPrivateLobby(
        await requestTransferLobbyOwner(
          config,
          privateLobby.id,
          auth.accessToken,
          userId,
        ),
      );
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not transfer leader"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const startPrivateLobby = async () => {
    if (!privateLobby?.id || !auth.accessToken) return;
    setLobbyBusy(true);
    setLobbyError("");
    try {
      const assignment = await startLobby(
        config,
        privateLobby.id,
        auth.accessToken,
      );
      handledLobbyMatchRef.current = assignment.matchId;
      await matchController.resumeResolvedMatch(assignment, {
        playMatchFoundSfx: true,
      });
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not start lobby"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const updatePrivateLobbySettings = async (matchConfig: MatchConfig) => {
    if (!privateLobby?.id || !auth.accessToken) return;
    setLobbyBusy(true);
    setLobbyError("");
    try {
      setPrivateLobby(
        await requestUpdateLobbySettings(
          config,
          privateLobby.id,
          auth.accessToken,
          matchConfig,
        ),
      );
    } catch (error) {
      setLobbyError(getErrorMessage(error, "Could not update lobby settings"));
    } finally {
      setLobbyBusy(false);
    }
  };

  const reportPlayer = async (
    reportedUserId: string,
    category = "cheating",
    reason = "",
  ) => {
    const snapshot = matchController.getState().snapshot;
    const session = await sessionController.ensureFreshSession(60_000);
    if (!session?.accessToken || !snapshot?.matchId || !reportedUserId) {
      throw new Error("Report unavailable");
    }
    await requestMatchReport(
      config,
      session.accessToken,
      snapshot.matchId,
      reportedUserId,
      category,
      reason,
    );
  };

  const dismissNotification = async (notificationId: number) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
    if (!auth.accessToken) return;
    await markUserNotificationRead(config, auth.accessToken, notificationId);
  };

  return {
    view,
    actions: {
      joinQueue: matchController.joinQueue,
      startSingleplayer: matchController.startSingleplayer,
      cancelQueue: matchController.cancelQueue,
      createInviteLobby,
      joinInviteLobby,
      leavePrivateLobby,
      kickLobbyMember,
      transferLobbyOwner,
      startPrivateLobby,
      updatePrivateLobbySettings,
      placeGuess: gameController.placeGuess,
      finalizeGuess: gameController.finalizeGuess,
      advanceRound: gameController.advanceRound,
      forfeitMatch: gameController.forfeitMatch,
      leaveGame: gameController.leaveGame,
      sendChatMessage: matchController.sendChatMessage,
      sendChatEmote: matchController.sendChatEmote,
      reportPlayer,
      devLogin,
      triggerGoogleSignIn,
      loadLeaderboard: lobbyData.loadLeaderboard,
      clearAuthSession: logout,
      submitOnboardingNickname,
      submitProfileNickname,
      setNicknameInput: sessionController.setNicknameInputAndClearError,
      dismissNotification,
    },
  };
}
