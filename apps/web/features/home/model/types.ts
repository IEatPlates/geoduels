import type { LeaderboardSummary } from "../../auth/controllers/session-controller";
import type { LobbySnapshot } from "../../lobby/lib/lobby-client";
import type { MaintenanceStatus } from "../../matchmaking/lib/queue-client";
import type { GameRuleset, MatchConfig } from "../../matchmaking/lib/queue-client";
import type {
  ChatEmote,
  ChatMessage,
  RatingDeltaPreview,
  RoundResult,
  RoundResultOverlayProps,
  UIPhase,
} from "../../../components/ui/types";

export type HomeAuthView = {
  userId: string;
  accessToken: string;
  userEmail: string;
  displayName: string;
  userAvatar: string;
  onboardingRequired: boolean;
  isAdmin: boolean;
  isModerator?: boolean;
  isGuest: boolean;
  nicknameInput: string;
  nicknameError: string;
  nicknameSaving: boolean;
  authLoading: boolean;
  authError: string;
  googleSignInEnabled: boolean;
  googleClientId: string;
};

export type HomeLobbyView = {
  inGame: boolean;
  connected: boolean;
  mmr: number;
  gamesPlayed: number;
  winsPct: number;
  leaderboard: LeaderboardSummary | null;
  leaderboardLoading: boolean;
  status: string;
  queueStartedAt: number | null;
  queueError: string;
  onlinePlayers: number;
  canStartSingleplayer: boolean;
  maintenance: MaintenanceStatus | null;
  changelogEyebrow: string;
  changelogTitle: string;
  changelogMarkdown: string;
  privateLobby: {
    snapshot: LobbySnapshot | null;
    inviteCode: string;
    isMember: boolean;
    isOwner: boolean;
    busy: boolean;
    error: string;
  };
};

export type HomeGameView = {
  inGame: boolean;
  mode: "duel" | "singleplayer";
  isSingleplayer: boolean;
  uiPhase: UIPhase;
  showResultStage: boolean;
  showMatchEndPage: boolean;
  streetViewSrc: string;
  roundResult?: RoundResult;
  roundResults: RoundResult[];
  resultOverlay?: Omit<RoundResultOverlayProps, "mapNode">;
  resultPlayerAvatars: Record<string, string | undefined>;
  resultPlayerFallbacks: Record<string, string | undefined>;
  selfName: string;
  selfAvatarUrl?: string;
  selfFallback: string;
  selfIsAdmin: boolean;
  opponentName: string;
  opponentIsAdmin: boolean;
  opponentDisconnected: boolean;
  oppAvatarUrl?: string;
  oppFallback: string;
  mm: string;
  ss: string;
  isRoundTimerRunning: boolean;
  timerProgressPct: number;
  isTimerCritical: boolean;
  isTimerPulseActive: boolean;
  showHudStatus: boolean;
  hudStatusLabel: string;
  resultMode: boolean;
  selfHP: number;
  oppHP: number;
  totalScore: number;
  currentRoundScore: number;
  currentRoundDistanceKm: number;
  canFinalizeGuess: boolean;
  canAdvanceRound: boolean;
  guess: { lat: number; lng: number } | undefined;
  currentRoundId: string;
  currentRoundNumber: number;
  totalRounds?: number;
  userAvatar: string;
  selfElo: number;
  opponentElo: number;
  selfRatingPreview?: RatingDeltaPreview;
  opponentRatingPreview?: RatingDeltaPreview;
  damageMultiplier: number;
  guessSubmitted: boolean;
  opponentGuessAlert: boolean;
  connectionIssue: string;
  modeName: string;
  mapName: string;
  streetViewInteractive: boolean;
  chatMessages: ChatMessage[];
  selfUserId: string;
};

export type HomeOverlaysView = {
  onboardingOpen: boolean;
  endMatch:
    | {
        open: true;
        mode: "duel" | "singleplayer";
        outcome?: "win" | "lose" | "draw";
        selfName: string;
        opponentName?: string;
        opponentUserId?: string;
        selfElo?: number;
        opponentElo?: number;
        selfEloDelta?: number;
        opponentEloDelta?: number;
        selfHP: number;
        oppHP?: number;
        selfAvatarUrl?: string;
        oppAvatarUrl?: string;
        selfFallback: string;
        oppFallback?: string;
        selfIsAdmin: boolean;
        opponentIsAdmin?: boolean;
        totalScore: number;
        roundResults: RoundResult[];
        resultPlayerNames: Record<string, string | undefined>;
        resultPlayerAvatars: Record<string, string | undefined>;
        resultPlayerFallbacks: Record<string, string | undefined>;
      }
    | { open: false };
};

export type HomeViewModel = {
  auth: HomeAuthView;
  lobby: HomeLobbyView;
  game: HomeGameView;
  overlays: HomeOverlaysView;
  meta: {
    activeMatchId: string;
    sourceLobbyInviteCode: string;
    appVersion: string;
    maxHP: number;
  };
};

export type HomeActions = {
  joinQueue: (rulesets?: GameRuleset[]) => void;
  startSingleplayer: () => Promise<string>;
  cancelQueue: () => void;
  createInviteLobby: () => Promise<void>;
  joinInviteLobby: (inviteCode?: string) => Promise<void>;
  leavePrivateLobby: () => Promise<void>;
  kickLobbyMember: (userId: string) => Promise<void>;
  transferLobbyOwner: (userId: string) => Promise<void>;
  startPrivateLobby: () => Promise<void>;
  updatePrivateLobbySettings: (config: MatchConfig) => Promise<void>;
  placeGuess: (lat: number, lng: number) => void;
  finalizeGuess: () => void;
  advanceRound: () => boolean;
  forfeitMatch: () => boolean;
  leaveGame: () => void;
  sendChatMessage: (body: string) => boolean;
  sendChatEmote: (emote: ChatEmote) => boolean;
  reportPlayer: (
    reportedUserId: string,
    category?: string,
    reason?: string,
  ) => Promise<void>;
  devLogin: () => Promise<unknown>;
  triggerGoogleSignIn: () => Promise<void>;
  loadLeaderboard: () => void;
  clearAuthSession: (message?: string) => void;
  submitOnboardingNickname: () => Promise<void>;
  submitProfileNickname: () => Promise<boolean>;
  setNicknameInput: (value: string) => void;
};

export type HomeModel = {
  view: HomeViewModel;
  actions: HomeActions;
};
