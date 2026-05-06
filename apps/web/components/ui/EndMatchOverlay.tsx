import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Flag, RotateCcw } from "lucide-react";
import { useState } from "react";
import AvatarBadge from "./AvatarBadge";
import PlayerNameWithBadge from "./PlayerNameWithBadge";
import type { RoundResult } from "./types";

const GuessMap = dynamic(() => import("../GuessMap"), { ssr: false });

type Props = {
  onLeaveGame: () => void;
  onPlayAgain?: () => Promise<string> | void;
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
  onReportPlayer?: (
    reportedUserId: string,
    category?: string,
    reason?: string,
  ) => Promise<void> | void;
  asPage?: boolean;
};

function formatDelta(value?: number) {
  if (value === undefined) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatGuessTime(ms?: number) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  return `${(ms / 1000).toFixed(1)}s`;
}

function getHeaderCopy(
  mode: "duel" | "singleplayer",
  outcome?: "win" | "lose" | "draw",
) {
  if (mode === "singleplayer") {
    return {
      eyebrow: "Run Complete",
      title: "Results",
      subtitle: "Your full run, score, and guesses in one place.",
    };
  }

  if (outcome === "win") {
    return {
      eyebrow: "Match Complete",
      title: "Victory",
      subtitle: "You won the duel.",
    };
  }
  if (outcome === "lose") {
    return {
      eyebrow: "Match Complete",
      title: "Defeat",
      subtitle: "Your opponent won the duel.",
    };
  }
  return {
    eyebrow: "Match Complete",
    title: "Draw",
    subtitle: "The duel finished level.",
  };
}

function getAccentColor(
  mode: "duel" | "singleplayer",
  outcome?: "win" | "lose" | "draw",
) {
  if (mode === "singleplayer") return "#60a5fa";
  if (outcome === "win") return "#2ad18f";
  if (outcome === "lose") return "#ff6d42";
  return "#a9bfd4";
}

export default function EndMatchOverlay({
  onLeaveGame,
  mode,
  outcome,
  selfName,
  opponentName,
  opponentUserId,
  selfElo,
  opponentElo,
  selfEloDelta,
  opponentEloDelta,
  selfHP,
  oppHP,
  selfAvatarUrl,
  oppAvatarUrl,
  selfFallback,
  oppFallback,
  selfIsAdmin,
  opponentIsAdmin,
  totalScore,
  roundResults,
  resultPlayerNames,
  resultPlayerAvatars,
  resultPlayerFallbacks,
  onReportPlayer,
  onPlayAgain,
  asPage = false,
}: Props) {
  const [reportedUserIds, setReportedUserIds] = useState<
    Record<string, boolean>
  >({});
  const [reportBusyUserId, setReportBusyUserId] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportCategory, setReportCategory] = useState("cheating");
  const [reportReason, setReportReason] = useState("");
  const [pendingReport, setPendingReport] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const copy = getHeaderCopy(mode, outcome);
  const accentColor = getAccentColor(mode, outcome);
  const glowColor = `${accentColor}66`;
  const totalRounds = roundResults.length;
  const duelSummaryVisible =
    mode === "duel" && !!opponentName && !!oppFallback && oppHP !== undefined;
  const hasRoundResults = roundResults.length > 0;
  const playerIds = Object.keys(roundResults[0]?.players || {});
  const selfPlayerId =
    playerIds.find((id) => resultPlayerNames[id] === selfName) ||
    playerIds[0] ||
    "self";
  const opponentPlayerId = duelSummaryVisible
    ? playerIds.find(
        (id) => id !== selfPlayerId && resultPlayerNames[id] === opponentName,
      ) ||
      playerIds.find((id) => id !== selfPlayerId) ||
      "opp"
    : undefined;
  const winnerLabel =
    mode === "duel"
      ? outcome === "draw"
        ? "Draw"
        : outcome === "win"
          ? selfName
          : opponentName || "Opponent"
      : undefined;
  const backLabel = mode === "singleplayer" ? "Back To Home" : "Back To Lobby";
  const showPlayAgain = mode === "singleplayer" && !!onPlayAgain;

  async function handlePlayAgain() {
    if (!onPlayAgain || playAgainBusy) return;
    setPlayAgainBusy(true);
    try {
      await onPlayAgain();
    } finally {
      setPlayAgainBusy(false);
    }
  }

  function renderScoreCell(
    round: RoundResult,
    playerId: string | undefined,
    highlight = false,
  ) {
    if (!playerId) return <span className="text-white/35">-</span>;
    const player = round.players[playerId];
    if (!player) return <span className="text-white/35">-</span>;

    return (
      <div
        className={
          highlight ? "font-black text-white" : "font-bold text-[#dbe7ff]"
        }
      >
        <p>{player.score.toLocaleString()}</p>
        {formatGuessTime(player.guessMs) ? (
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8caab0]">
            {formatGuessTime(player.guessMs)}
          </p>
        ) : null}
      </div>
    );
  }

  function renderPlayerSummaryCard({
    name,
    avatarUrl,
    fallback,
    secondaryLine,
    metricValue,
    opponent = false,
    metricGlow = false,
    isAdmin = false,
    reportUserId,
  }: {
    name: string;
    avatarUrl?: string;
    fallback: string;
    secondaryLine: string;
    metricValue?: string | number;
    opponent?: boolean;
    metricGlow?: boolean;
    isAdmin?: boolean;
    reportUserId?: string;
  }) {
    const canReport =
      !!reportUserId && !!onReportPlayer && !reportedUserIds[reportUserId];
    return (
      <div className="glass-panel flex items-center gap-4 rounded-[20px] p-5">
        <AvatarBadge
          avatarUrl={avatarUrl}
          fallback={fallback}
          alt={name}
          size="lg"
          opponent={opponent}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <PlayerNameWithBadge
              name={name}
              isAdmin={isAdmin}
              nameClassName="truncate text-[1.25rem] font-black text-white"
            />
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.12em] text-[#9fd6bf]">
              {secondaryLine}
            </p>
            {reportUserId && onReportPlayer ? (
              <button
                type="button"
                title={
                  reportedUserIds[reportUserId]
                    ? "Report sent"
                    : "Report player"
                }
                disabled={!canReport || reportBusyUserId === reportUserId}
                onClick={() => {
                  setReportError("");
                  setReportCategory("cheating");
                  setReportReason("");
                  setPendingReport({ userId: reportUserId, name });
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-300/25 bg-red-500/12 text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Flag size={14} />
              </button>
            ) : null}
          </div>
        </div>
        {metricValue !== undefined ? (
          <div className="text-right">
            <p
              className={`mt-1 text-3xl font-black ${metricGlow ? "text-[#7dc3ff]" : "text-white"}`}
              style={
                metricGlow
                  ? {
                      textShadow:
                        "0 0 18px rgba(125,195,255,0.55), 0 0 36px rgba(125,195,255,0.28)",
                    }
                  : undefined
              }
            >
              {metricValue}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`px-4 ${asPage ? "h-screen overflow-hidden bg-[#0d1216] py-4 md:py-6" : "absolute inset-0 z-50 overflow-hidden bg-[#0d1216]/90 py-4 backdrop-blur-md md:py-6"}`}
    >
      <motion.div
        initial={{ scale: 0.96, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 28,
          delay: 0.05,
        }}
        className="mx-auto flex h-full w-full max-w-7xl flex-col"
      >
        <div className="grid shrink-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-start">
          <div className="glass-panel relative rounded-[32px] p-6 text-white md:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at top center, ${accentColor} 0%, transparent 70%)`,
              }}
            />
            <div className="relative z-10">
              <div className="text-center lg:text-left">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8cb0a1]">
                  {copy.eyebrow}
                </p>
                <h2
                  className="mt-3 text-5xl font-black uppercase tracking-tight md:text-6xl"
                  style={{ textShadow: `0 0 40px ${glowColor}` }}
                >
                  {copy.title}
                </h2>
                {/* <p className="mt-3 text-base text-[#a9bfd4]">{copy.subtitle}</p> */}
                {/* {mode === 'duel' && winnerLabel ? (
                  <div className="mt-5 inline-flex rounded-full border border-white/10 bg-black/30 px-5 py-2 text-sm font-bold uppercase tracking-[0.16em] text-[#dce6ff]">
                    Winner: {winnerLabel}
                  </div>
                ) : null} */}
              </div>

              <div
                className={`mt-6 grid gap-4 ${duelSummaryVisible ? "md:grid-cols-2" : "grid-cols-1"}`}
              >
                {renderPlayerSummaryCard({
                  name: selfName,
                  avatarUrl: selfAvatarUrl,
                  fallback: selfFallback,
                  secondaryLine:
                    mode === "singleplayer"
                      ? `${totalRounds} rounds played`
                      : `${selfElo ?? 0}${formatDelta(selfEloDelta) ? ` (${formatDelta(selfEloDelta)})` : ""}`,
                  metricValue:
                    mode === "singleplayer"
                      ? totalScore.toLocaleString()
                      : undefined,
                  metricGlow: mode === "singleplayer",
                  isAdmin: selfIsAdmin,
                })}

                {duelSummaryVisible
                  ? renderPlayerSummaryCard({
                      name: opponentName || "Opponent",
                      avatarUrl: oppAvatarUrl,
                      fallback: oppFallback || "O",
                      secondaryLine: `${opponentElo ?? 0}${formatDelta(opponentEloDelta) ? ` (${formatDelta(opponentEloDelta)})` : ""}`,
                      metricValue: undefined,
                      opponent: true,
                      isAdmin: opponentIsAdmin,
                      reportUserId: opponentUserId || opponentPlayerId,
                    })
                  : null}
              </div>
              {reportError ? (
                <p className="mt-3 text-sm font-semibold text-red-200">
                  {reportError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
                {showPlayAgain ? (
                  <button
                    type="button"
                    className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(135deg,#60a5fa_0%,#2563eb_100%)] px-8 py-4 font-black uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(96,165,250,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(96,165,250,0.5)] active:scale-95 disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100"
                    onClick={() => void handlePlayAgain()}
                    disabled={playAgainBusy}
                  >
                    <RotateCcw
                      size={18}
                      className={playAgainBusy ? "animate-spin" : ""}
                    />
                    <span className="relative z-10">
                      {playAgainBusy ? "Starting" : "Play Again"}
                    </span>
                    <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`group relative overflow-hidden rounded-full px-10 py-4 font-black uppercase tracking-[0.15em] text-white transition-all hover:scale-105 active:scale-95 ${
                    showPlayAgain
                      ? "border border-white/15 bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.08)] hover:bg-white/15"
                      : "bg-[linear-gradient(135deg,#2ad18f_0%,#12a86f_100%)] shadow-[0_0_20px_rgba(42,209,143,0.3)] hover:shadow-[0_0_30px_rgba(42,209,143,0.5)]"
                  }`}
                  onClick={onLeaveGame}
                >
                  <span className="relative z-10">{backLabel}</span>
                  <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel flex h-[300px] min-h-0 flex-col overflow-hidden rounded-[26px] md:h-[360px]">
            <div
              className={`grid items-center gap-4 border-b border-white/10 px-4 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8caab0] md:px-5 ${mode === "duel" ? "grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[90px_minmax(0,1fr)]"}`}
            >
              <span>Round</span>
              <span>{selfName}</span>
              {mode === "duel" ? (
                <span>{opponentName || "Opponent"}</span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/10">
              {hasRoundResults ? (
                roundResults.map((round) => (
                  <div
                    key={round.roundId}
                    className={`grid items-center gap-4 px-4 py-4 text-sm md:px-5 ${mode === "duel" ? "grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[90px_minmax(0,1fr)]"}`}
                  >
                    <span className="font-bold uppercase tracking-[0.12em] text-[#dce6ff]">
                      R{round.roundNumber}
                    </span>
                    {renderScoreCell(round, selfPlayerId, true)}
                    {mode === "duel"
                      ? renderScoreCell(round, opponentPlayerId)
                      : null}
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-[#a9bfd4] md:px-5">
                  No rounds were completed before the match ended.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="glass-panel mt-6 min-h-0 flex-1 overflow-hidden rounded-[26px]">
          {hasRoundResults ? (
            <GuessMap
              mode="result"
              results={roundResults}
              interactiveInResult
              resultPlayerAvatars={resultPlayerAvatars}
              resultPlayerFallbacks={resultPlayerFallbacks}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#a9bfd4]">
              The duel ended before any round results were recorded.
            </div>
          )}
        </div>
      </motion.div>
      {pendingReport ? (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#101922] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/25 bg-red-500/15 text-red-100">
                <Flag size={18} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-200">
                  Report Player
                </p>
                <h3 className="mt-1 text-xl font-black">
                  Report {pendingReport.name}?
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#c5d4e2]">
              Reports are for suspected cheating or abuse, including bad
              profiles, toxicity, or harassment.
            </p>
            <div className="mt-5 grid gap-2">
              {[
                ["cheating", "Cheating"],
                ["boosting", "Boosting / throwing"],
                ["harassment", "Harassment"],
                ["profile", "Offensive profile"],
                ["other", "Other"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReportCategory(value)}
                  className={`min-h-10 rounded-xl border px-3 text-left text-sm font-bold transition ${
                    reportCategory === value
                      ? "border-red-200/55 bg-red-500/25 text-red-50"
                      : "border-white/10 bg-white/5 text-[#c5d4e2] hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              maxLength={1000}
              placeholder="Optional details"
              className="mt-4 min-h-24 w-full resize-none rounded-xl border border-white/10 bg-[#0d141c] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6f8aa5] focus:border-red-200/50"
            />
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={reportBusyUserId === pendingReport.userId}
                onClick={() => {
                  setPendingReport(null);
                  setReportReason("");
                }}
                className="min-h-11 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reportBusyUserId === pendingReport.userId}
                onClick={async () => {
                  if (!onReportPlayer) return;
                  setReportError("");
                  setReportBusyUserId(pendingReport.userId);
                  try {
                    await onReportPlayer(
                      pendingReport.userId,
                      reportCategory,
                      reportReason,
                    );
                    setReportedUserIds((current) => ({
                      ...current,
                      [pendingReport.userId]: true,
                    }));
                    setPendingReport(null);
                    setReportReason("");
                  } catch (error) {
                    setReportError(
                      error instanceof Error
                        ? error.message
                        : "Failed to send report",
                    );
                  } finally {
                    setReportBusyUserId("");
                  }
                }}
                className="min-h-11 rounded-xl border border-red-300/35 bg-red-500/20 px-4 text-sm font-black text-red-50 transition hover:bg-red-500/30 disabled:opacity-60"
              >
                {reportBusyUserId === pendingReport.userId
                  ? "Sending..."
                  : "Send report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
