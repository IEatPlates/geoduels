import React, { useState, useEffect, type ReactNode } from "react";
import {
  HelpCircle,
  Play,
  X,
  Loader2,
  Pencil,
  Check,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  ArrowUpRight,
  Shield,
  UserPlus,
  Copy,
  Crown,
  LogOut,
  UserMinus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { LeaderboardSummary } from "../../features/auth/controllers/session-controller";
import type { LobbySnapshot } from "../../features/lobby/lib/lobby-client";
import type { MaintenanceStatus } from "../../features/matchmaking/lib/queue-client";
import { getRuntimeConfig } from "../../lib/runtime-config";
import AdSenseBanner from "./AdSenseBanner";

type LobbyModal = "help" | "profile" | "invite" | null;

type PrivateLobbyView = {
  snapshot: LobbySnapshot | null;
  inviteCode: string;
  isMember: boolean;
  isOwner: boolean;
  busy: boolean;
  error: string;
};

type Props = {
  userId: string;
  userEmail: string;
  displayName: string;
  userAvatar?: string;
  isGuest: boolean;
  connected: boolean;
  mmr: number;
  gamesPlayed: number;
  winsPct: number;
  leaderboard: LeaderboardSummary | null;
  leaderboardLoading: boolean;
  status: string;
  queueStartedAt: number | null;
  joinQueue: () => void;
  startSingleplayer: () => void | Promise<string>;
  cancelQueue: () => void;
  privateLobby?: PrivateLobbyView;
  createInviteLobby?: () => Promise<void>;
  joinInviteLobby?: (inviteCode?: string) => Promise<void>;
  leavePrivateLobby?: () => Promise<void>;
  kickLobbyMember?: (userId: string) => Promise<void>;
  transferLobbyOwner?: (userId: string) => Promise<void>;
  startPrivateLobby?: () => Promise<void>;
  queueError: string;
  onlinePlayers: number;
  maintenance: MaintenanceStatus | null;
  googleClientId: string;
  appVersion: string;
  isAdmin: boolean;
  changelogEyebrow: string;
  changelogTitle: string;
  changelogMarkdown: string;
  devLogin: () => void;
  onGoogleSignIn: () => void;
  onBrowseLeaderboard: () => void;
  authLoading: boolean;
  authError: string;
  nicknameInput: string;
  nicknameError: string;
  nicknameSaving: boolean;
  onChangeNickname: (value: string) => void;
  onSaveNickname: () => Promise<boolean>;
  onLogout: () => void;
};

const defaultPrivateLobby: PrivateLobbyView = {
  snapshot: null,
  inviteCode: "",
  isMember: false,
  isOwner: false,
  busy: false,
  error: "",
};

const TABS = ["FRIENDS", "PLAY", "TOP"];

const tabPanelMotion = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.97,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.97,
  },
  transition: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
  },
};

function parseTime(value?: string) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatRelativeDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

function formatApproximateTime(ms: number) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0
      ? `about ${hours} hour${hours === 1 ? "" : "s"}`
      : `about ${hours}h ${minutes}m`;
  }
  return `about ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
}

function formatQueueElapsed(ms: number) {
  const totalSeconds = ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function renderMarkdownInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`md-link-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="text-[#77f0be] underline decoration-[#77f0be]/40 underline-offset-4 transition hover:text-white"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      nodes.push(
        <strong
          key={`md-strong-${match.index}`}
          className="font-semibold text-white"
        >
          {match[4]}
        </strong>,
      );
    } else if (match[5]) {
      nodes.push(
        <em key={`md-em-${match.index}`} className="italic text-[#c5d8e8]">
          {match[5]}
        </em>,
      );
    } else if (match[6]) {
      nodes.push(
        <code
          key={`md-code-${match.index}`}
          className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.95em] text-[#d9e7f5]"
        >
          {match[6]}
        </code>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const text = paragraphLines.join(" ").trim();
    if (text) {
      blocks.push(
        <p
          key={`md-p-${blocks.length}`}
          className="text-[14px] leading-relaxed text-[#a9bfd4]"
        >
          {renderMarkdownInline(text)}
        </p>,
      );
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(
      <ul
        key={`md-ul-${blocks.length}`}
        className="space-y-2 pl-5 text-[14px] leading-relaxed text-[#a9bfd4]"
      >
        {listItems.map((item, index) => (
          <li key={`md-li-${index}`} className="list-disc">
            {renderMarkdownInline(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3
          key={`md-h3-${blocks.length}`}
          className="text-xl font-bold text-white"
        >
          {renderMarkdownInline(line.slice(4))}
        </h3>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2
          key={`md-h2-${blocks.length}`}
          className="text-2xl font-bold text-white"
        >
          {renderMarkdownInline(line.slice(3))}
        </h2>,
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1
          key={`md-h1-${blocks.length}`}
          className="text-3xl font-extrabold text-white"
        >
          {renderMarkdownInline(line.slice(2))}
        </h1>,
      );
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function LobbyModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-0 z-[2200] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[26px] p-5 text-[#f4f9ff] sm:rounded-[26px] sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between sm:mb-6">
          <h2 className="text-[18px] font-black uppercase tracking-[0.12em] text-white sm:text-[22px]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div>{children}</div>
      </motion.div>
    </motion.div>
  );
}

export default function LobbyScreen({
  userId,
  userEmail,
  displayName,
  userAvatar,
  isGuest,
  connected,
  mmr,
  gamesPlayed,
  winsPct,
  leaderboard,
  leaderboardLoading,
  status,
  queueStartedAt,
  joinQueue,
  startSingleplayer,
  cancelQueue,
  privateLobby = defaultPrivateLobby,
  createInviteLobby = async () => { },
  joinInviteLobby = async () => { },
  leavePrivateLobby = async () => { },
  kickLobbyMember = async () => { },
  transferLobbyOwner = async () => { },
  startPrivateLobby = async () => { },
  queueError,
  googleClientId,
  devLogin,
  onGoogleSignIn,
  onBrowseLeaderboard,
  authLoading,
  authError,
  nicknameInput,
  nicknameError,
  nicknameSaving,
  onChangeNickname,
  onSaveNickname,
  maintenance,
  onlinePlayers,
  appVersion,
  isAdmin,
  changelogEyebrow,
  changelogTitle,
  changelogMarkdown,
  onLogout,
}: Props) {
  const runtimeConfig = getRuntimeConfig();
  const [activeTab, setActiveTab] = useState(1);
  const [openModal, setOpenModal] = useState<LobbyModal>(null);
  const [isEditingProfileName, setIsEditingProfileName] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [isBlogExpanded, setIsBlogExpanded] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userAvatar]);

  useEffect(() => {
    if (TABS[activeTab] === "TOP") {
      onBrowseLeaderboard();
    }
  }, [activeTab, onBrowseLeaderboard]);

  useEffect(() => {
    if (privateLobby.snapshot || privateLobby.inviteCode) {
      setActiveTab(1);
    }
  }, [privateLobby.inviteCode, privateLobby.snapshot]);

  useEffect(() => {
    if (!maintenance && status !== "queueing") {
      return;
    }
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [maintenance, status]);

  const isQueueing = status === "queueing";
  const queueElapsedLabel = formatQueueElapsed(
    queueStartedAt ? nowMs - queueStartedAt : 0,
  );
  const isRankedAccount = !!userId && !isGuest;
  const showConnectionError =
    !connected && queueError.toLowerCase() === "connection error";
  const primaryButtonLabel = showConnectionError ? "Connection Error" : "Play";
  const duelModeLabel = isQueueing
    ? "Searching..."
    : isRankedAccount
      ? "Ranked"
      : "Unranked";
  const userAvatarFallback = !userEmail
    ? "?"
    : (displayName || userEmail || "P").slice(0, 1).toUpperCase();
  const duelHelperText = isQueueing
    ? "Finding an opponent"
    : isRankedAccount
      ? "Moving allowed"
      : "Log In to play Ranked";
  const showGoogleButton = !!googleClientId;
  const maintenanceStartMs = parseTime(maintenance?.startsAt);
  const maintenanceEndMs = parseTime(maintenance?.endsAt);
  const maintenanceIsWarning = maintenance?.phase === "warning";
  const maintenanceIsActive = maintenance?.phase === "active";
  const queuePaused = !!maintenance?.queuePaused;
  const playPaused = !!maintenance?.playPaused;
  const maintenanceMessage = maintenance?.message?.trim() || "";
  const warningCountdown =
    maintenanceIsWarning && maintenanceStartMs && maintenanceStartMs > nowMs
      ? formatRelativeDuration(maintenanceStartMs - nowMs)
      : "";
  const activeEta =
    maintenanceIsActive && maintenanceEndMs && maintenanceEndMs > nowMs
      ? formatApproximateTime(maintenanceEndMs - nowMs)
      : "";
  const duelDisabled =
    authLoading ||
    nicknameSaving ||
    queuePaused ||
    playPaused ||
    maintenanceIsActive;
  const singleplayerDisabled =
    isQueueing ||
    authLoading ||
    nicknameSaving ||
    playPaused ||
    maintenanceIsActive;

  const googleSignInButton = showGoogleButton ? (
    <button
      type="button"
      onClick={onGoogleSignIn}
      disabled={authLoading}
      className="glass-panel glass-panel-interactive group inline-flex items-center justify-center gap-3 rounded-[20px] px-3 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#111827] shadow-sm">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.805 10.023h-9.81v3.955h5.627c-.242 1.272-.967 2.35-2.06 3.073v2.55h3.332c1.95-1.796 3.073-4.44 3.073-7.578 0-.662-.06-1.298-.162-1.999Z"
          />
          <path
            fill="#34A853"
            d="M11.995 22c2.79 0 5.132-.924 6.842-2.5l-3.332-2.55c-.924.62-2.102.987-3.51.987-2.699 0-4.985-1.822-5.805-4.272H2.758v2.63A10.329 10.329 0 0 0 11.995 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.19 13.665a6.214 6.214 0 0 1-.324-1.967c0-.684.118-1.347.324-1.967v-2.63H2.758A10.329 10.329 0 0 0 1.663 11.7c0 1.66.398 3.232 1.095 4.598l3.432-2.633Z"
          />
          <path
            fill="#EA4335"
            d="M11.995 5.463c1.518 0 2.88.523 3.95 1.55l2.962-2.962C17.122 2.397 14.782 1.4 11.995 1.4 7.958 1.4 4.47 3.707 2.758 7.101l3.432 2.63c.82-2.45 3.106-4.268 5.805-4.268Z"
          />
        </svg>
      </span>
      {authLoading ? (
        "Signing In..."
      ) : (
        <>
          <span className="sm:hidden">Sign In</span>
          <span className="hidden sm:inline">Sign In</span>
        </>
      )}
    </button>
  ) : (
    <button
      type="button"
      onClick={devLogin}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-white transition hover:bg-white/10"
    >
      {authLoading ? "Signing In..." : "Dev Login"}
    </button>
  );

  const newsPanel = (
    <div
      className="glass-panel glass-panel-interactive lobby-feature-card group w-full rounded-[20px] p-5"
      style={{ animationDelay: "-3s" }}
    >
      <button
        type="button"
        onClick={() => setIsBlogExpanded((prev) => !prev)}
        className="block w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.16em] text-[#2ad18f] drop-shadow-sm">
              {changelogEyebrow}
            </span>
            <h2 className="text-[20px] font-extrabold leading-tight tracking-tight text-white drop-shadow-md">
              {changelogTitle}
            </h2>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 transition-colors group-hover:bg-white/10 group-hover:text-white">
            {isBlogExpanded ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </div>
        </div>
        <AnimatePresence>
          {isBlogExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 space-y-4 border-t border-white/[0.06] pt-5">
                {renderMarkdownBlocks(changelogMarkdown)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );

  const discordCard = (
    <a
      href="https://discord.gg/xxz8V9UU7Z"
      target="_blank"
      rel="noreferrer"
      className="glass-panel glass-panel-interactive lobby-feature-card group flex w-full items-center gap-4 rounded-[20px] p-5"
      style={{ animationDelay: "-1s" }}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#5865f2]/14 text-[#8fa3ff]">
        <MessageCircle size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.16em] text-[#6b8b80]">
          Community
        </span>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-extrabold tracking-tight text-white">
              Discord Server
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#a9bfd4]">
              Join to chat with other GeoDuels players!
            </p>
          </div>
          <ArrowUpRight
            size={18}
            className="shrink-0 text-white/50 transition-colors group-hover:text-white"
          />
        </div>
      </div>
    </a>
  );

  const onlineStatusCard = (
    <div
      className="glass-panel lobby-feature-card flex w-full items-center gap-3 rounded-[20px] px-[20px] py-3"
      style={{ animationDelay: "-0.5s" }}
    >
      <div className="status-dot-wrap relative flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2ad18f]" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#2ad18f] transition-colors">
          {onlinePlayers} Playing
        </p>
      </div>
    </div>
  );

  const lobbyInviteURL =
    typeof window !== "undefined" && privateLobby.inviteCode
      ? `${window.location.origin}/lobby/${privateLobby.inviteCode}`
      : "";
  const privateLobbyActive = !!privateLobby.snapshot;
  const lobbyMembers = privateLobby.snapshot?.members || [];
  const missingLobbyMembers = lobbyMembers.filter((member) => !member.connected);
  const canStartPrivateLobby =
    privateLobby.isOwner &&
    privateLobby.snapshot?.state === "open" &&
    lobbyMembers.length === 2 &&
    missingLobbyMembers.length === 0;
  const copyInvite = () => {
    if (!lobbyInviteURL) return;
    void navigator.clipboard?.writeText(lobbyInviteURL);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1600);
  };

  const privateLobbyPanel = privateLobbyActive ? (
    <motion.div
      key="private-lobby"
      {...tabPanelMotion}
      className="w-full max-w-[980px] pointer-events-auto"
    >
      <div className="glass-panel overflow-hidden rounded-[24px]">
        <div className="relative min-h-[220px] p-5 sm:p-7">
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(42,209,143,0.16)_0%,rgba(10,23,26,0.74)_100%)]" />
          <div className="relative z-10 flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="mb-2 block text-[12px] font-black uppercase tracking-[0.16em] text-[#77f0be]">
                  CUSTOM
                </span>
                <h2 className="text-[34px] font-black leading-tight tracking-tight text-white sm:text-[42px]">
                  Private Lobby
                </h2>
                <p className="mt-2 max-w-[48ch] text-[14px] leading-6 text-[#a9bfd4]">
                  Share the invite, wait for one opponent, then the leader starts the match.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {privateLobby.inviteCode ? (
                  <button
                    type="button"
                    onClick={copyInvite}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.08] px-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white transition hover:bg-white/[0.12]"
                  >
                    <Copy className="mr-2 text-[#77f0be]" size={16} />
                    {inviteCopied ? "Copied" : "Copy Invite"}
                  </button>
                ) : null}
                {privateLobby.isMember ? (
                  <button
                    type="button"
                    onClick={() => void leavePrivateLobby()}
                    disabled={privateLobby.busy}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.08] px-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white transition hover:bg-white/[0.12] disabled:opacity-50"
                  >
                    <LogOut className="mr-2" size={16} />
                    Leave
                  </button>
                ) : null}
              </div>
            </div>

            {privateLobby.inviteCode ? (
              <div className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b8b80]">
                  Invite Code
                </p>
                <p className="mt-1 font-mono text-[26px] font-black tracking-[0.18em] text-white">
                  {privateLobby.inviteCode}
                </p>
              </div>
            ) : null}

            {!privateLobby.isMember ? (
              <div className="rounded-[18px] border border-white/10 bg-black/20 p-4">
                {!userId ? (
                  <div className="mb-3 space-y-2">
                    <input
                      value={nicknameInput}
                      onChange={(e) => onChangeNickname(e.target.value)}
                      disabled={authLoading || nicknameSaving || privateLobby.busy}
                      className="w-full rounded-[14px] border border-white/10 bg-[#101a20]/80 px-4 py-3 text-[15px] font-semibold text-white outline-none transition focus:border-[#2ad18f]/60"
                      placeholder="Enter nickname"
                      maxLength={14}
                    />
                    {authError ? (
                      <p className="text-xs font-semibold text-red-300">
                        {authError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void joinInviteLobby()}
                  disabled={privateLobby.busy || authLoading || nicknameSaving}
                  className="inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] bg-[#22d385] px-5 text-[14px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(34,211,133,0.3)] transition hover:bg-[#2ae091] disabled:opacity-60"
                >
                  {privateLobby.busy ? (
                    <Loader2 className="mr-2 animate-spin" size={18} />
                  ) : (
                    <UserPlus className="mr-2" size={18} />
                  )}
                  Join Lobby
                </button>
              </div>
            ) : null}

            {privateLobby.snapshot ? (
              <div className="grid gap-3">
                {lobbyMembers.map((member) => {
                  const isLeader = member.userId === privateLobby.snapshot?.ownerUserId;
                  const isSelf = member.userId === userId;
                  const lobbyStatus = member.connected
                    ? "in lobby"
                    : "not in lobby";
                  return (
                    <div
                      key={member.userId}
                      className="flex min-h-[72px] flex-col gap-3 rounded-[16px] border border-white/10 bg-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[16px] font-extrabold text-white">
                            {member.displayName || member.userId}
                          </p>
                          {isLeader ? (
                            <span className="inline-flex items-center rounded-full bg-[#22d385]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#77f0be]">
                              <Crown className="mr-1" size={12} />
                              Leader
                            </span>
                          ) : null}
                        </div>
                        <p
                          className={`mt-1 text-[12px] font-semibold uppercase tracking-[0.12em] ${member.connected ? "text-[#77f0be]" : "text-[#f0c777]"
                            }`}
                        >
                          {isSelf ? "You · " : ""}
                          {lobbyStatus}
                        </p>
                      </div>
                      {privateLobby.isOwner && !isSelf ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void transferLobbyOwner(member.userId)}
                            disabled={privateLobby.busy}
                            className="inline-flex min-h-[36px] items-center rounded-[10px] border border-white/10 bg-white/[0.08] px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white transition hover:bg-white/[0.12] disabled:opacity-50"
                          >
                            <Crown className="mr-1.5" size={14} />
                            Make Leader
                          </button>
                          <button
                            type="button"
                            onClick={() => void kickLobbyMember(member.userId)}
                            disabled={privateLobby.busy}
                            className="inline-flex min-h-[36px] items-center rounded-[10px] border border-red-300/20 bg-red-400/10 px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-red-100 transition hover:bg-red-400/15 disabled:opacity-50"
                          >
                            <UserMinus className="mr-1.5" size={14} />
                            Kick
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {privateLobby.isOwner ? (
              <button
                type="button"
                onClick={() => void startPrivateLobby()}
                disabled={!canStartPrivateLobby || privateLobby.busy}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[16px] bg-[#22d385] px-5 text-[15px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(34,211,133,0.3)] transition hover:bg-[#2ae091] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {privateLobby.busy ? (
                  <Loader2 className="mr-2 animate-spin" size={18} />
                ) : (
                  <Play className="mr-2" size={18} fill="currentColor" />
                )}
                Start Duel
              </button>
            ) : privateLobby.isMember ? (
              <div className="rounded-[16px] border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-semibold text-[#a9bfd4]">
                Waiting for the leader to start.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  ) : null;

  const maintenanceBanner = maintenanceIsWarning ? (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mb-4 rounded-[24px] border border-[#f3cf68]/40 bg-[linear-gradient(135deg,rgba(242,197,67,0.22),rgba(115,75,0,0.28))] px-5 py-4 text-[#fff6d8] shadow-[0_12px_40px_rgba(91,63,7,0.24)] backdrop-blur-sm"
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffe69a]">
            Maintenance
          </p>
          <p className="mt-1 text-[15px] font-semibold text-white">
            {maintenanceMessage || "Queueing has been paused."}
          </p>
        </div>
        <p className="text-[15px] font-semibold text-[#ffefb5]">
          {warningCountdown ? `${warningCountdown}` : "Soon"}
        </p>
      </div>
    </motion.div>
  ) : null;

  const maintenanceOverlay = maintenanceIsActive ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="fixed inset-0 z-[2100] flex items-center justify-center overflow-hidden px-4 py-8"
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,248,212,0.12),transparent_35%),linear-gradient(180deg,rgba(7,13,18,0.48),rgba(7,13,18,0.9))]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[32px] bg-[#081118]/78 p-7 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[#f4c84c]/30 bg-[#f4c84c]/10">
            <Loader2 size={30} className="animate-spin text-[#f4c84c]" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f4d98a]">
            Maintenance Break
          </p>
          <h2 className="mt-3 text-[30px] font-black tracking-tight text-white sm:text-[38px]">
            We&apos;ll Be Back Shortly
          </h2>
          <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-[#d9e7f5]">
            {maintenanceMessage ||
              "GeoDuels is temporarily offline while we finish a scheduled upgrade."}
          </p>
          <div className="mt-6 rounded-[20px] border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a9bfd4]">
              Approximate Time
            </p>
            <p className="mt-2 text-[18px] font-extrabold text-white">
              {activeEta || "A few minutes"}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  ) : null;

  const legalCard = (
    <div className="pointer-events-auto flex w-full items-center justify-center px-1 py-1">
      <div className="flex items-center gap-6">
        <Link
          href="/privacy"
          className="text-[12px] font-semibold text-[#6b8b80] transition-colors hover:text-white"
        >
          Privacy Policy
        </Link>
        <div className="h-1 w-1 rounded-full bg-[#6b8b80]/40" />
        <Link
          href="/terms"
          className="text-[12px] font-semibold text-[#6b8b80] transition-colors hover:text-white"
        >
          Terms of Service
        </Link>
        <div className="h-1 w-1 rounded-full bg-[#6b8b80]/40" />
        <span className="text-[12px] font-semibold text-[#6b8b80]">
          {appVersion}
        </span>
      </div>
    </div>
  );

  const leaderboardPanel = (
    <div className="glass-panel flex w-full max-w-[980px] flex-col gap-5 rounded-[24px] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.16em] text-[#2ad18f]">
            Season Ladder
          </span>
          <h2 className="text-[28px] font-extrabold tracking-tight text-white">
            Leaderboard
          </h2>
          <p className="mt-2 text-[14px] text-[#a9bfd4]">
            {leaderboardLoading
              ? "Loading ranked players..."
              : leaderboard?.totalPlayers
                ? `${leaderboard.totalPlayers} ranked players`
                : "No ranked players yet."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b8b80]">
              Your Rank
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {leaderboard?.selfRank ? `#${leaderboard.selfRank}` : "--"}
            </p>
          </div>
          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b8b80]">
              Rating
            </p>
            <p className="mt-2 text-3xl font-black text-white">{mmr}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px]">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_90px] gap-3 border-b border-white/[0.06] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b8b80] sm:grid-cols-[72px_minmax(0,1fr)_110px_110px]">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">MMR</span>
          <span className="hidden text-right sm:block">Win Rate</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {(leaderboard?.entries || []).map((entry) => {
            const isSelf = entry.userId === userId;
            const winsValue =
              entry.gamesPlayed > 0
                ? Math.round((entry.wins / entry.gamesPlayed) * 100)
                : 0;
            return (
              <div
                key={`${entry.rank}-${entry.userId}`}
                className={`grid grid-cols-[72px_minmax(0,1fr)_90px] gap-3 px-4 py-3 text-sm sm:grid-cols-[72px_minmax(0,1fr)_110px_110px] ${isSelf ? "bg-[#18382e]/70" : "bg-transparent"}`}
              >
                <div className="flex items-center">
                  <span
                    className={`inline-flex min-w-[48px] items-center justify-center rounded-full px-3 py-1 text-[12px] font-black ${entry.rank <= 3 ? "bg-[#2ad18f]/16 text-[#77f0be]" : "bg-white/[0.05] text-white"}`}
                  >
                    #{entry.rank}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">
                    {entry.displayName || entry.userId}
                  </p>
                  <p className="truncate text-[12px] text-[#8caab0]">
                    {isSelf ? "You" : `${entry.gamesPlayed} games`}
                  </p>
                </div>
                <div className="flex items-center justify-end font-black text-white">
                  {entry.mmr}
                </div>
                <div className="hidden items-center justify-end text-[#a9bfd4] sm:flex">
                  {winsValue}%
                </div>
              </div>
            );
          })}
          {leaderboardLoading ? (
            <div className="px-4 py-10 text-center text-[14px] text-[#a9bfd4]">
              Loading leaderboard...
            </div>
          ) : !leaderboard || leaderboard.entries.length === 0 ? (
            <div className="px-4 py-10 text-center text-[14px] text-[#a9bfd4]">
              No ranked players yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Modal Renderers inside LobbyScreen
  const renderHelpModal = () => (
    <LobbyModalShell title="Help" onClose={() => setOpenModal(null)}>
      <div className="space-y-5 text-[15px] leading-relaxed text-[#a9bfd4]">
        <div className="glass-panel rounded-xl p-4">
          <h3 className="mb-2 font-bold text-white tracking-wide">
            1. Rules of the Game
          </h3>
          <p>
            You and your opponent will be dropped into the same random street
            view location somewhere in the world. Your goal is to figure out
            where you are and place your guess on the map.
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <h3 className="mb-2 font-bold text-white tracking-wide">
            2. How to Join
          </h3>
          <p>
            Click "PLAY" on the main menu to enter the matchmaking queue. We'll
            automatically find you an opponent with a similar skill rating
            (MMR).
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <h3 className="mb-2 font-bold text-white tracking-wide">
            3. How Duels Work
          </h3>
          <p>
            Both players start with 6,000 HP. The first person to guess starts a
            countdown timer. When the round ends, whoever is closer to the
            actual location deals damage to the other player based on the
            distance difference. The game ends when a player's HP hits 0!
          </p>
        </div>
      </div>
    </LobbyModalShell>
  );

  const renderInviteLobbyModal = () => {
    const normalizedInviteCode = inviteCodeInput.trim().toUpperCase();
    const inviteActionsDisabled =
      privateLobby.busy || authLoading || nicknameSaving || maintenanceIsActive;

    return (
      <LobbyModalShell title="Private Lobby" onClose={() => setOpenModal(null)}>
        <div className="space-y-4">
          {!userId ? (
            <div className="space-y-2">
              <input
                value={nicknameInput}
                onChange={(e) => onChangeNickname(e.target.value)}
                disabled={authLoading || nicknameSaving || privateLobby.busy}
                className="w-full rounded-[14px] border border-white/10 bg-[#101a20]/80 px-4 py-3 text-[15px] font-semibold text-white outline-none transition focus:border-[#2ad18f]/60"
                placeholder="Enter nickname"
                maxLength={14}
              />
              {authError ? (
                <p className="text-xs font-semibold text-red-300">
                  {authError}
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void (async () => {
                await createInviteLobby();
                setOpenModal(null);
              })();
            }}
            disabled={inviteActionsDisabled || playPaused}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-[#22d385] px-5 text-[14px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(34,211,133,0.3)] transition hover:bg-[#2ae091] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {privateLobby.busy ? (
              <Loader2 className="mr-2 animate-spin" size={18} />
            ) : (
              <UserPlus className="mr-2" size={18} />
            )}
            Create Lobby
          </button>

          <div className="rounded-[18px] border border-white/10 bg-black/20 p-4">
            <label
              htmlFor="invite-code-input"
              className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b8b80]"
            >
              Join With Code
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="invite-code-input"
                value={inviteCodeInput}
                onChange={(event) =>
                  setInviteCodeInput(event.target.value.toUpperCase())
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !normalizedInviteCode) return;
                  void (async () => {
                    await joinInviteLobby(normalizedInviteCode);
                    setOpenModal(null);
                  })();
                }}
                disabled={inviteActionsDisabled}
                className="min-h-[46px] min-w-0 flex-1 rounded-[14px] border border-white/10 bg-[#101a20]/80 px-4 font-mono text-[15px] font-black uppercase tracking-[0.16em] text-white outline-none transition focus:border-[#2ad18f]/60 disabled:opacity-60"
                placeholder="CODE"
                maxLength={16}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await joinInviteLobby(normalizedInviteCode);
                    setOpenModal(null);
                  })();
                }}
                disabled={inviteActionsDisabled || !normalizedInviteCode}
                className="inline-flex min-h-[46px] items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.08] px-5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>

        </div>
      </LobbyModalShell>
    );
  };

  const renderProfileModal = () => (
    <LobbyModalShell
      title="Profile"
      onClose={() => {
        setOpenModal(null);
        setIsEditingProfileName(false);
      }}
    >
      <div className="glass-panel flex items-center gap-4 rounded-2xl p-5">
        <div className="h-14 w-14 overflow-hidden rounded-full border border-white/20 bg-[#162130]">
          {userAvatar && !avatarLoadFailed ? (
            <img
              src={userAvatar}
              alt="Avatar"
              className="h-full w-full object-cover"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#223d32] text-xl font-bold text-white">
              {userAvatarFallback}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isEditingProfileName ? (
              <input
                value={nicknameInput}
                onChange={(e) => onChangeNickname(e.target.value)}
                disabled={nicknameSaving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void (async () => {
                      const saved = await onSaveNickname();
                      if (saved) {
                        setIsEditingProfileName(false);
                      }
                    })();
                  }
                  if (e.key === "Escape") {
                    setIsEditingProfileName(false);
                    onChangeNickname(displayName || userEmail || "");
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101a20] px-3 py-2 text-base font-bold text-white outline-none transition focus:border-[#2ad18f]/60"
                placeholder="Enter nickname"
                maxLength={14}
                autoFocus
              />
            ) : (
              <p className="truncate text-xl font-bold text-white">
                {displayName || userEmail || "Guest"}
              </p>
            )}
            {userId ? (
              <button
                type="button"
                onClick={() => {
                  if (isEditingProfileName) {
                    void (async () => {
                      const saved = await onSaveNickname();
                      if (saved) {
                        setIsEditingProfileName(false);
                      }
                    })();
                    return;
                  }
                  onChangeNickname(displayName || userEmail || "");
                  setIsEditingProfileName(true);
                }}
                disabled={nicknameSaving}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={
                  isEditingProfileName ? "Save nickname" : "Edit nickname"
                }
              >
                {nicknameSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isEditingProfileName ? (
                  <Check size={16} />
                ) : (
                  <Pencil size={16} />
                )}
              </button>
            ) : null}
          </div>
          <p className="text-sm text-[#a9bfd4]">
            {userEmail || "Offline Mode"}
          </p>
          {nicknameError ? (
            <p className="mt-2 text-xs font-semibold text-red-400">
              {nicknameError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-center uppercase tracking-wider text-[#a9bfd4] sm:grid-cols-3">
        <div className="glass-panel rounded-xl p-3 py-4">
          <p className="text-[11px] font-bold">MMR</p>
          <p className="mt-1.5 text-2xl font-black text-white">{mmr}</p>
        </div>
        <div className="glass-panel rounded-xl p-3 py-4">
          <p className="text-[11px] font-bold">Games</p>
          <p className="mt-1.5 text-2xl font-black text-white">{gamesPlayed}</p>
        </div>
        <div className="glass-panel rounded-xl p-3 py-4">
          <p className="text-[11px] font-bold">Winrate</p>
          <p className="mt-1.5 text-2xl font-black text-white">{winsPct}%</p>
        </div>
      </div>
      {userId && !userEmail ? (
        <div className="glass-panel mt-6 rounded-xl p-4">
          <p className="mb-3 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8cb0a1]">
            Save Progress
          </p>
          <div className="flex justify-center">{googleSignInButton}</div>
        </div>
      ) : null}

      {userId ? (
        <button
          type="button"
          onClick={() => {
            setOpenModal(null);
            onLogout();
          }}
          className="mt-6 w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-[14px] font-bold uppercase tracking-wider text-red-400 transition hover:bg-red-500/20"
        >
          Sign Out
        </button>
      ) : null}
    </LobbyModalShell>
  );

  const inviteLobbyCard = (
    <button
      type="button"
      onClick={() => setOpenModal("invite")}
      disabled={authLoading || nicknameSaving || playPaused || maintenanceIsActive}
      className="glass-panel glass-panel-interactive lobby-feature-card group flex w-full items-center gap-4 rounded-[20px] p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2ad18f]/14 text-[#77f0be]">
        <UserPlus size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.16em] text-[#6b8b80]">
          CUSTOM
        </span>
        <h3 className="text-[18px] font-extrabold tracking-tight text-white">
          Private Lobby
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#a9bfd4]">
          Create a lobby or join your friend
        </p>
      </div>
      <ArrowUpRight
        size={18}
        className="shrink-0 text-white/50 transition-colors group-hover:text-white"
      />
    </button>
  );

  const privateLobbyErrorNotice = privateLobby.error ? (
    <div
      role="alert"
      className="mb-4 flex w-full max-w-[1160px] items-start gap-3 rounded-[18px] border border-red-300/20 bg-red-500/10 px-4 py-3 text-left text-sm font-semibold leading-6 text-red-100 shadow-[0_14px_40px_rgba(0,0,0,0.22)] pointer-events-auto sm:px-5"
    >
      <Shield className="mt-0.5 shrink-0 text-red-200" size={18} />
      <span>{privateLobby.error}</span>
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden font-sans text-[#f4f9ff] selection:bg-accentPrimary/30">
      <AnimatePresence>{maintenanceOverlay}</AnimatePresence>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34, 61, 50, 0.58), rgba(0, 0, 0, 1.0)), url('/bg.jpg')",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            transform: "scale(1.06)",
          }}
        />
      </div>
      <AnimatePresence>
        {openModal === "help" && renderHelpModal()}
        {openModal === "profile" && renderProfileModal()}
        {openModal === "invite" && renderInviteLobbyModal()}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-20 px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5 lg:px-8 lg:pb-6 lg:pt-6">
        <AnimatePresence>{maintenanceBanner}</AnimatePresence>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 lg:gap-6">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={() => setOpenModal("help")}
              className="text-[#a9bfd4] transition-colors hover:text-white"
              aria-label="Help"
            >
              <HelpCircle
                size={20}
                strokeWidth={2}
                className="sm:h-[22px] sm:w-[22px]"
              />
            </button>
            {isAdmin ? (
              <Link
                href="/admin"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-full border border-[#2ad18f]/35 bg-[#2ad18f]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#b9f5da] transition hover:bg-[#2ad18f]/18 sm:text-[12px]"
              >
                <Shield size={14} />
                Admin
              </Link>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center justify-center">
            <Link href="/" aria-label="GeoDuels home" className="inline-flex">
              <img
                src="/logo-dark.png"
                alt="GeoDuels"
                width={140}
                height={38}
                className="h-auto w-[112px] sm:w-[140px]"
              />
            </Link>
          </div>

          {userId && userEmail ? (
            <div
              className="group flex min-w-0 items-center justify-self-end gap-2.5 cursor-pointer sm:gap-3"
              onClick={() => {
                setIsEditingProfileName(false);
                setOpenModal("profile");
              }}
            >
              <div className="flex min-w-0 max-w-[7.5rem] flex-col items-end justify-center sm:max-w-none">
                <span className="truncate text-[12px] font-bold leading-tight text-white transition-colors group-hover:text-emerald-100 sm:text-[15px]">
                  {displayName || userEmail || "Player"}
                </span>
                <div className="mt-0.5 flex items-center text-[10px] font-bold text-[#2ad18f] sm:text-[12px]">
                  <svg
                    className="mr-1 h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19 4h-2V2H7v2H5C3.34 4 2 5.34 2 7v3c0 1.9 1.25 3.51 3 4.15V15c0 1.66 1.34 3 3 3h4c0 1.25-.84 2.33-2 2.8v2.2L12 24l2-1v-2.2c-1.16-.47-2-1.55-2-2.8h4c1.66 0 3-1.34 3-3v-.85c1.75-.64 3-2.25 3-4.15V7c0-1.66-1.34-3-3-3zM5 12c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h2v6H5zm14-1c0 .55-.45 1-1 1h-2V6h2c.55 0 1 .45 1 1v4z" />
                  </svg>
                  {mmr}
                </div>
              </div>
              <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border-[1.5px] border-white/20 bg-[#162130] transition-colors group-hover:border-white/40 sm:h-[42px] sm:w-[42px]">
                {userAvatar && !avatarLoadFailed ? (
                  <img
                    src={userAvatar}
                    alt="User avatar"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#1e3b2f] font-bold text-white">
                    {userAvatarFallback}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto justify-self-end">
              {googleSignInButton}
            </div>
          )}
        </div>

        {!privateLobbyActive ? (
          <div className="flex justify-center pt-5 sm:pt-6">
            <div className="relative flex h-9 w-full max-w-[340px] items-center justify-center pointer-events-auto sm:h-10 sm:max-w-[400px] lg:max-w-[440px]">
              {TABS.map((tab, idx) => {
                const isActive = idx === activeTab;
                const offset = idx - activeTab;

                return (
                  <motion.button
                    key={tab}
                    onClick={() => !isQueueing && setActiveTab(idx)}
                    initial={false}
                    animate={{
                      x: offset * 104,
                      scale: isActive ? 1.05 : 0.95,
                      opacity: isActive ? 1 : 0.4,
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 35 }}
                    className={`absolute font-bold text-[15px] tracking-[0.18em] transition-colors duration-200 sm:text-[16px] lg:text-[17px] ${isQueueing ? "cursor-not-allowed text-[#a9bfd4]/50" : "cursor-pointer"}`}
                    style={{
                      color: isActive
                        ? isQueueing
                          ? "#8cb0a1"
                          : "#ffffff"
                        : "#a9bfd4",
                      transformOrigin: "center",
                    }}
                    disabled={isQueueing}
                  >
                    {tab}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pb-10 pt-4 pointer-events-none sm:px-6 sm:pb-12 sm:pt-8">
        {privateLobbyErrorNotice}

        <AnimatePresence mode="popLayout">
          {privateLobbyActive ? privateLobbyPanel : null}

          {!privateLobbyActive && TABS[activeTab] === "PLAY" && (
            <motion.div
              key="play"
              {...tabPanelMotion}
              className="flex w-full max-w-[1160px] flex-col items-center gap-5 pointer-events-auto lg:grid lg:grid-cols-[minmax(0,480px)_minmax(280px,360px)] lg:items-start lg:justify-center lg:gap-6"
            >
              <div className="flex w-full max-w-[480px] flex-col gap-5 lg:max-w-none">
                <div className="glass-panel lobby-feature-card relative flex min-h-[240px] w-full flex-col justify-between rounded-[20px] p-5 transition-colors duration-500 sm:min-h-[260px] sm:p-8">
                  <div
                    className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${isQueueing ? "opacity-95" : "opacity-80"} bg-[linear-gradient(180deg,rgba(72,128,106,0.28)_0%,rgba(22,42,34,0.78)_100%)]`}
                  />

                  {/* Decorative background mountains */}
                  <div
                    className={`absolute inset-x-0 bottom-0 pointer-events-none h-full transition-opacity duration-500 ${isQueueing ? "opacity-[0.24]" : "opacity-[0.32]"}`}
                  >
                    <img
                      src="/mountains.svg"
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      style={{ objectPosition: "center bottom" }}
                    />
                  </div>

                  {/* Content over background */}
                  <div className="relative z-10 mt-1 flex flex-col sm:mt-2">
                    <span className="mb-1 text-[12px] font-bold uppercase tracking-[0.16em] text-[#8cb0a1] drop-shadow-sm">
                      {duelModeLabel}
                    </span>
                    <h2 className="mb-2 text-[36px] font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-[44px]">
                      Duel
                    </h2>
                    <span className="text-[15px] font-medium text-white/90 drop-shadow-sm sm:text-[16px]">
                      {duelHelperText}
                    </span>
                  </div>

                  <div className="relative z-10 mx-auto mt-5 flex h-full w-full flex-col justify-end px-0 pb-1 sm:mt-6 sm:px-2">
                    {queueError && (
                      <p className="mb-3 text-center text-xs font-semibold text-red-300">
                        {queueError}
                      </p>
                    )}
                    {!userId ? (
                      <div className="mb-3 space-y-3">
                        <input
                          value={nicknameInput}
                          onChange={(e) => onChangeNickname(e.target.value)}
                          disabled={authLoading || nicknameSaving}
                          className="w-full rounded-[14px] border border-white/10 bg-[#101a20]/80 px-4 py-3 text-[15px] font-semibold text-white outline-none transition focus:border-[#2ad18f]/60"
                          placeholder="Enter nickname"
                          maxLength={14}
                        />
                        {authError ? (
                          <p className="text-center text-xs font-semibold text-red-300">
                            {authError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {!isQueueing ? (
                      <button
                        onClick={joinQueue}
                        disabled={duelDisabled}
                        className="w-full flex items-center justify-center rounded-[16px] bg-[#22d385] py-[14px] text-[16px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(34,211,133,0.3)] transition-all duration-200 hover:scale-[1.01] hover:bg-[#2ae091] hover:shadow-[0_6px_24px_rgba(34,211,133,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-[#22d385] disabled:hover:shadow-[0_4px_16px_rgba(34,211,133,0.3)]"
                      >
                        <Play
                          fill="currentColor"
                          size={20}
                          className="mr-2.5"
                        />
                        {queuePaused || playPaused || maintenanceIsActive
                          ? "Paused"
                          : primaryButtonLabel}
                      </button>
                    ) : (
                      <button
                        onClick={cancelQueue}
                        className="group w-full flex items-center justify-center rounded-[16px] border border-white/[0.1] bg-white/[0.08] py-[14px] text-[14px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white/[0.12]"
                      >
                        <Loader2
                          size={18}
                          className="mr-3 animate-spin text-[#2ad18f] transition-colors group-hover:text-[#3deb9e]"
                        />
                        <span className="text-accentPrimary">{queueElapsedLabel}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="glass-panel lobby-feature-card relative flex min-h-[240px] w-full flex-col justify-between rounded-[20px] p-5 transition-colors duration-500 sm:min-h-[260px] sm:p-8"
                  style={{ animationDelay: "-2s" }}
                >
                  <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(72,106,128,0.28)_0%,rgba(22,34,42,0.85)_100%)] opacity-80 transition-opacity duration-500" />

                  {/* Decorative background mountains */}
                  <div className="absolute inset-x-0 bottom-0 h-full pointer-events-none opacity-[0.25] transition-opacity duration-500">
                    <img
                      src="/mountains.svg"
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover object-center opacity-50"
                      style={{
                        objectPosition: "center bottom",
                        filter: "hue-rotate(190deg)",
                      }}
                    />
                  </div>

                  {/* Content over background */}
                  <div className="relative z-10 mt-1 flex flex-col sm:mt-2">
                    <span className="mb-1 text-[12px] font-bold uppercase tracking-[0.16em] text-[#8caab0] drop-shadow-sm">
                      Casual
                    </span>
                    <h2 className="mb-2 text-[36px] font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-[44px]">
                      Singleplayer
                    </h2>
                    <span className="text-[15px] font-medium text-white/90 drop-shadow-sm sm:text-[16px]">
                      Practice indefinitely
                    </span>
                  </div>

                  <div className="relative z-10 mx-auto mt-5 flex h-full w-full flex-col justify-end px-0 pb-1 sm:mt-6 sm:px-2">
                    <button
                      onClick={startSingleplayer}
                      disabled={singleplayerDisabled}
                      className="w-full flex items-center justify-center rounded-[16px] bg-[#3b82f6] py-[14px] text-[16px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] transition-all duration-200 hover:scale-[1.01] hover:bg-[#4b8df8] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                    >
                      <Play fill="currentColor" size={20} className="mr-2.5" />
                      {playPaused || maintenanceIsActive ? "Paused" : "Play"}
                    </button>
                  </div>
                </div>

              </div>

              <div className="flex w-full max-w-[480px] flex-col gap-5 lg:sticky lg:top-8 lg:max-w-none">
                {onlineStatusCard}
                {newsPanel}
                {discordCard}
              </div>
            </motion.div>
          )}

          {!privateLobbyActive && TABS[activeTab] === "TOP" && (
            <motion.div
              key="top"
              {...tabPanelMotion}
              className="flex w-full justify-center pointer-events-auto"
            >
              {leaderboardPanel}
            </motion.div>
          )}

          {!privateLobbyActive && TABS[activeTab] === "FRIENDS" && (
            <motion.div
              key="friends"
              {...tabPanelMotion}
              className="flex w-full max-w-[480px] flex-col gap-5 pointer-events-auto"
            >
              {inviteLobbyCard}
            </motion.div>
          )}
        </AnimatePresence>

        {!privateLobbyActive && TABS[activeTab] === "PLAY" ? (
          <AdSenseBanner
            clientId={runtimeConfig.adsenseClientId}
            slot={runtimeConfig.adsensePlaySlot}
            className="mt-6"
          />
        ) : null}

        {!privateLobbyActive ? (
          <>
            <section
              aria-labelledby="geoduels-seo-heading"
              className="glass-panel mt-8 w-full max-w-[1220px] rounded-[24px] p-6 pointer-events-auto sm:mt-[156px] sm:p-8"
            >
              <div className="space-y-6 text-left">
                <div className="max-w-3xl space-y-3">
                  <span className="inline-flex rounded-full border border-[#2ad18f]/30 bg-[#2ad18f]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7de3b7]">
                    Tutorial
                  </span>
                  <h1
                    id="geoduels-seo-heading"
                    className="text-[30px] font-extrabold leading-tight tracking-tight text-white sm:text-[40px]"
                  >
                    GeoDuels
                  </h1>
                  <p className="text-[15px] leading-7 text-[#a9bfd4] sm:text-[16px]">
                    A free GeoGuessr-inspired Street View game. Queue for ranked
                    matches against other players, with friends, or jump into singleplayer.
                  </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-3">
                  <section className="glass-panel rounded-[18px] p-5">
                    <h2 className="text-[18px] font-extrabold tracking-tight text-white">
                      100% Free (seriously)
                    </h2>
                    <p className="mt-3 text-[14px] leading-7 text-[#a9bfd4]">
                      No subscriptions to play, no pay-to-win, making it one of the free alternatives to GeoGuessr.
                    </p>
                  </section>
                  <section className="glass-panel rounded-[18px] p-5">
                    <h2 className="text-[18px] font-extrabold tracking-tight text-white">
                      How to Play?
                    </h2>
                    <p className="mt-3 text-[14px] leading-7 text-[#a9bfd4]">
                      Find the location, place your guess. The closer you are, the
                      more points you get.
                    </p>
                  </section>

                  <section className="glass-panel rounded-[18px] p-5">
                    <h2 className="text-[18px] font-extrabold tracking-tight text-white">
                      Ranked & Casual
                    </h2>
                    <p className="mt-3 text-[14px] leading-7 text-[#a9bfd4]">
                      Climb the ladder or practice in casual mode, play GeoDuels as a free alternative to GeoGuessr.
                    </p>
                  </section>
                </div>
              </div>
            </section>
            <div className="mt-4 w-full max-w-[1220px] px-6 sm:px-8">
              {legalCard}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
