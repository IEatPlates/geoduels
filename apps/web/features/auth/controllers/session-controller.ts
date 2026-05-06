import type { RuntimeConfig } from "../../../lib/runtime-config";
import { ObservableStore } from "../../../lib/observable-store";
import { INITIAL_MMR, INITIAL_RATING_RD } from "../../../lib/elo";
import { decodeAccessTokenExpiry } from "../lib/token-expiry";
import {
  emptyAuthSession,
  hasPlayableSession,
  type AuthSessionSnapshot,
} from "../session";

type SessionUser = {
  id?: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  isGuest?: boolean;
  isAdmin?: boolean;
  isModerator?: boolean;
};

type AuthPopupPayload = {
  ok?: boolean;
  error?: string;
  accessToken?: string;
  onboardingRequired?: boolean;
  suggestedNickname?: string;
  user?: SessionUser;
};

type SessionNetworkHandlers = {
  bootstrapSession: () => Promise<AuthSessionSnapshot | null>;
  refreshSession: () => Promise<AuthSessionSnapshot | null>;
  getPlayableSession: () => Promise<AuthSessionSnapshot | null>;
};

type SessionPatch = Partial<
  Pick<
    SessionState,
    | "userEmail"
    | "displayName"
    | "userAvatar"
    | "isGuest"
    | "isAdmin"
    | "isModerator"
    | "mmr"
    | "ratingRd"
    | "gamesPlayed"
    | "wins"
    | "rankedGamesPlayed"
    | "rankedWins"
    | "leaderboard"
    | "authLoading"
    | "authError"
    | "nicknameError"
    | "nicknameSaving"
  >
>;

type ProfileSnapshot = {
  email?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  isGuest?: unknown;
  isAdmin?: unknown;
  isModerator?: unknown;
  isBanned?: unknown;
  banReason?: unknown;
  mmr?: unknown;
  ratingRd?: unknown;
  gamesPlayed?: unknown;
  wins?: unknown;
  rankedGamesPlayed?: unknown;
  rankedWins?: unknown;
};

export type SessionState = {
  userId: string;
  userEmail: string;
  displayName: string;
  userAvatar: string;
  isGuest: boolean;
  isAdmin: boolean;
  isModerator?: boolean;
  mmr: number;
  ratingRd: number;
  gamesPlayed: number;
  wins: number;
  rankedGamesPlayed: number;
  rankedWins: number;
  leaderboard: LeaderboardSummary | null;
  accessToken: string;
  onboardingRequired: boolean;
  nicknameInput: string;
  nicknameError: string;
  nicknameSaving: boolean;
  authLoading: boolean;
  authError: string;
  googleSignInEnabled: boolean;
  googleClientId: string;
};

export type LeaderboardEntrySummary = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string;
  mmr: number;
  gamesPlayed: number;
  wins: number;
};

export type LeaderboardSummary = {
  mode: string;
  season: string;
  selfRank: number;
  totalPlayers: number;
  entries: LeaderboardEntrySummary[];
};

const initialState: SessionState = {
  userId: "",
  userEmail: "",
  displayName: "",
  userAvatar: "",
  isGuest: false,
  isAdmin: false,
  isModerator: false,
  mmr: INITIAL_MMR,
  ratingRd: INITIAL_RATING_RD,
  gamesPlayed: 0,
  wins: 0,
  rankedGamesPlayed: 0,
  rankedWins: 0,
  leaderboard: null,
  accessToken: "",
  onboardingRequired: false,
  nicknameInput: "",
  nicknameError: "",
  nicknameSaving: false,
  authLoading: false,
  authError: "",
  googleSignInEnabled: false,
  googleClientId: "",
};

export class SessionController extends ObservableStore<SessionState> {
  private readonly config: RuntimeConfig;
  private state: SessionState = initialState;
  private session: AuthSessionSnapshot = emptyAuthSession();
  private refreshPromise: Promise<AuthSessionSnapshot | null> | null = null;
  private bootstrapPromise: Promise<AuthSessionSnapshot | null> | null = null;
  private mounted = true;
  private started = false;
  private networkHandlers: SessionNetworkHandlers = {
    bootstrapSession: async () => null,
    refreshSession: async () => null,
    getPlayableSession: async () => null,
  };
  private readonly onResetSession: () => void;
  private readonly messageHandler: (event: MessageEvent) => void;

  constructor(params: { config: RuntimeConfig; onResetSession: () => void }) {
    super();
    this.config = params.config;
    this.state = {
      ...initialState,
      googleSignInEnabled: !!params.config.googleClientId,
      googleClientId: params.config.googleClientId,
    };
    this.onResetSession = params.onResetSession;
    this.messageHandler = (event: MessageEvent) => {
      const expectedOrigin = (() => {
        try {
          return new URL(this.config.apiURL).origin;
        } catch {
          return "";
        }
      })();
      if (expectedOrigin && event.origin !== expectedOrigin) return;
      if (!event.data || event.data.type !== "geoduels:google-auth") return;
      const payload = (event.data.payload || {}) as AuthPopupPayload;
      if (!payload.ok) {
        this.patchState({
          authLoading: false,
          authError: payload.error || "Login failed",
        });
        return;
      }
      void this.applyLoginPayload(payload);
    };
  }

  start() {
    if (this.started || typeof window === "undefined") return;
    this.mounted = true;
    this.started = true;
    this.syncGoogleState();
    window.addEventListener("message", this.messageHandler);
    this.emit();
  }

  destroy() {
    const wasStarted = this.started;
    this.mounted = false;
    this.started = false;
    if (wasStarted && typeof window !== "undefined") {
      window.removeEventListener("message", this.messageHandler);
    }
  }

  getState() {
    return this.state;
  }

  setNetworkHandlers(handlers: Partial<SessionNetworkHandlers>) {
    this.networkHandlers = {
      ...this.networkHandlers,
      ...handlers,
    };
  }

  private patchState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    if (this.mounted) {
      this.emit();
    }
  }

  private setSessionSnapshot(patch: Partial<AuthSessionSnapshot>) {
    this.session = this.normalizeSessionSnapshot({ ...this.session, ...patch });
  }

  private normalizeSessionSnapshot(
    session: AuthSessionSnapshot,
  ): AuthSessionSnapshot {
    const expiresAt =
      typeof session.expiresAt === "number" && session.expiresAt > 0
        ? session.expiresAt
        : decodeAccessTokenExpiry(session.accessToken);
    return { ...session, expiresAt };
  }

  private syncGoogleState() {
    if (typeof window === "undefined") return;
    if (!this.config.googleClientId) {
      this.patchState({ googleSignInEnabled: false });
      return;
    }
    const currentOrigin = window.location.origin;
    if (this.config.googleAllowedOrigins.length === 0) {
      const isLocalHost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if (isLocalHost) {
        this.patchState({
          googleSignInEnabled: false,
          authError: `Google Sign-In is disabled on ${currentOrigin} until NEXT_PUBLIC_GOOGLE_ALLOWED_ORIGINS is set.`,
        });
        return;
      }
      this.patchState({ googleSignInEnabled: true });
      return;
    }
    const allowed = this.config.googleAllowedOrigins.includes(currentOrigin);
    this.patchState({
      googleSignInEnabled: allowed,
      authError: allowed
        ? this.state.authError
        : `Google Sign-In is disabled for ${currentOrigin}. Add this origin to Google OAuth and NEXT_PUBLIC_GOOGLE_ALLOWED_ORIGINS.`,
    });
  }

  clearAuthSession = (message?: string) => {
    this.onResetSession();
    this.session = emptyAuthSession();
    this.patchState({
      ...initialState,
      googleSignInEnabled: this.state.googleSignInEnabled,
      googleClientId: this.config.googleClientId,
      authError: message || "",
    });
  };

  bootstrapSession = async (): Promise<AuthSessionSnapshot | null> => {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }
    this.bootstrapPromise = (async () => {
      try {
        return await this.networkHandlers.bootstrapSession();
      } catch {
        return null;
      } finally {
        this.bootstrapPromise = null;
      }
    })();
    return this.bootstrapPromise;
  };

  refreshSession = async (): Promise<AuthSessionSnapshot | null> => {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = (async () => {
      try {
        return await this.networkHandlers.refreshSession();
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  };

  private async applyLoginPayload(data: AuthPopupPayload) {
    const displayName =
      data.user?.display_name || data.suggestedNickname || "Player";
    const sessionSnapshot: AuthSessionSnapshot = {
      userId: data.user?.id || "",
      accessToken: data.accessToken || "",
      onboardingRequired: !!data?.onboardingRequired,
      nicknameInput: data.suggestedNickname || displayName,
    };
    this.applySessionSnapshot(sessionSnapshot, {
      userEmail: data.user?.email || "",
      displayName,
      userAvatar: data.user?.avatar_url || "",
      isGuest:
        typeof data.user?.isGuest === "boolean" ? data.user.isGuest : false,
      isAdmin:
        typeof data.user?.isAdmin === "boolean" ? data.user.isAdmin : false,
      isModerator:
        typeof data.user?.isModerator === "boolean"
          ? data.user.isModerator
          : false,
      nicknameError: "",
      authError: "",
      authLoading: false,
      mmr: INITIAL_MMR,
      ratingRd: INITIAL_RATING_RD,
      gamesPlayed: 0,
      wins: 0,
      rankedGamesPlayed: 0,
      rankedWins: 0,
      leaderboard: null,
    });
  }

  setNicknameInputAndClearError = (value: string) => {
    this.setSessionSnapshot({ nicknameInput: value });
    this.patchState({
      nicknameInput: value,
      nicknameError: "",
    });
  };

  setMmr = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function" ? update(this.state.mmr) : update;
    this.patchState({ mmr: value });
  };

  setRatingRd = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function" ? update(this.state.ratingRd) : update;
    this.patchState({ ratingRd: value });
  };

  setGamesPlayed = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function" ? update(this.state.gamesPlayed) : update;
    this.patchState({ gamesPlayed: value });
  };

  setWins = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function" ? update(this.state.wins) : update;
    this.patchState({ wins: value });
  };

  setRankedGamesPlayed = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function"
        ? update(this.state.rankedGamesPlayed)
        : update;
    this.patchState({ rankedGamesPlayed: value });
  };

  setRankedWins = (update: number | ((value: number) => number)) => {
    const value =
      typeof update === "function" ? update(this.state.rankedWins) : update;
    this.patchState({ rankedWins: value });
  };

  getSessionSnapshot = (): AuthSessionSnapshot | null => {
    return hasPlayableSession(this.session) ? this.session : null;
  };

  async ensureFreshSession(
    minValidityMs = 60_000,
    options?: { allowOnboarding?: boolean; forceRefresh?: boolean },
  ): Promise<AuthSessionSnapshot | null> {
    const allowOnboarding = !!options?.allowOnboarding;
    const forceRefresh = !!options?.forceRefresh;
    if (!this.session.userId || !this.session.accessToken) {
      return null;
    }
    if (!allowOnboarding && this.session.onboardingRequired) {
      return null;
    }

    const expiresAt =
      typeof this.session.expiresAt === "number" ? this.session.expiresAt : 0;
    if (
      !forceRefresh &&
      expiresAt > 0 &&
      Date.now() + minValidityMs < expiresAt
    ) {
      return this.session;
    }

    const refreshed = await this.refreshSession();
    if (refreshed) {
      return this.normalizeSessionSnapshot(refreshed);
    }

    if (!forceRefresh && expiresAt > 0 && Date.now() < expiresAt) {
      return this.session;
    }
    return null;
  }

  getPlayableSession = async (): Promise<AuthSessionSnapshot | null> => {
    if (hasPlayableSession(this.session)) {
      const fresh = await this.ensureFreshSession();
      if (fresh && hasPlayableSession(fresh)) {
        return fresh;
      }
    }
    if (this.session.onboardingRequired) {
      return null;
    }
    return this.networkHandlers.getPlayableSession();
  };

  setAuthPending(
    patch: Pick<
      Partial<SessionState>,
      "authLoading" | "authError" | "nicknameSaving" | "nicknameError"
    >,
  ) {
    this.patchState(patch);
  }

  applySessionSnapshot(session: AuthSessionSnapshot, patch: SessionPatch) {
    this.session = this.normalizeSessionSnapshot(session);
    this.patchState({
      userId: this.session.userId,
      accessToken: this.session.accessToken,
      onboardingRequired: this.session.onboardingRequired,
      nicknameInput: this.session.nicknameInput,
      ...patch,
    });
  }

  applyProfileSnapshot(profile: ProfileSnapshot) {
    const nextDisplayName =
      typeof profile.display_name === "string" && profile.display_name
        ? profile.display_name
        : this.state.displayName;
    this.patchState({
      userEmail:
        typeof profile.email === "string"
          ? profile.email
          : this.state.userEmail,
      displayName: nextDisplayName,
      userAvatar:
        typeof profile.avatar_url === "string"
          ? profile.avatar_url
          : this.state.userAvatar,
      isGuest:
        typeof profile.isGuest === "boolean"
          ? profile.isGuest
          : this.state.isGuest,
      isAdmin:
        typeof profile.isAdmin === "boolean"
          ? profile.isAdmin
          : this.state.isAdmin,
      isModerator:
        typeof profile.isModerator === "boolean"
          ? profile.isModerator
          : this.state.isModerator,
      mmr: typeof profile.mmr === "number" ? profile.mmr : this.state.mmr,
      ratingRd:
        typeof profile.ratingRd === "number"
          ? profile.ratingRd
          : this.state.ratingRd,
      gamesPlayed:
        typeof profile.gamesPlayed === "number"
          ? profile.gamesPlayed
          : this.state.gamesPlayed,
      wins: typeof profile.wins === "number" ? profile.wins : this.state.wins,
      rankedGamesPlayed:
        typeof profile.rankedGamesPlayed === "number"
          ? profile.rankedGamesPlayed
          : this.state.rankedGamesPlayed,
      rankedWins:
        typeof profile.rankedWins === "number"
          ? profile.rankedWins
          : this.state.rankedWins,
      nicknameInput: this.state.nicknameInput || nextDisplayName,
    });
  }

  applyLeaderboardSummary(summary: unknown) {
    this.patchState({
      leaderboard: normalizeLeaderboardSummary(summary),
    });
  }
}

function normalizeLeaderboardSummary(
  value: unknown,
): LeaderboardSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map((entry) => normalizeLeaderboardEntry(entry))
        .filter((entry): entry is LeaderboardEntrySummary => entry !== null)
    : [];
  return {
    mode: typeof raw.mode === "string" ? raw.mode : "duel",
    season: typeof raw.season === "string" ? raw.season : "s2",
    selfRank: typeof raw.selfRank === "number" ? raw.selfRank : 0,
    totalPlayers:
      typeof raw.totalPlayers === "number" ? raw.totalPlayers : entries.length,
    entries,
  };
}

function normalizeLeaderboardEntry(
  value: unknown,
): LeaderboardEntrySummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    rank: typeof raw.rank === "number" ? raw.rank : 0,
    userId: typeof raw.userId === "string" ? raw.userId : "",
    displayName: typeof raw.displayName === "string" ? raw.displayName : "",
    avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : "",
    mmr: typeof raw.mmr === "number" ? raw.mmr : INITIAL_MMR,
    gamesPlayed: typeof raw.gamesPlayed === "number" ? raw.gamesPlayed : 0,
    wins: typeof raw.wins === "number" ? raw.wins : 0,
  };
}
