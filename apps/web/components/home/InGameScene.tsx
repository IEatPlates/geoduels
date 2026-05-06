import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, LogOut, RotateCcw, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import GameHUD from '../ui/GameHUD';
import MinimapPanel from '../ui/MinimapPanel';
import PlayerHPCard from '../ui/PlayerHPCard';
import RoundResultOverlay from '../ui/RoundResultOverlay';
import GameStartOverlay from '../ui/GameStartOverlay';
import IntroCountdownText from '../ui/IntroCountdownText';
import { motionPresetClass } from '../ui/motion';
import { ResultDistanceBar } from '../ui/RoundResultOverlay';
import type { RatingDeltaPreview, RoundResultOverlayProps, UIPhase } from '../ui/types';

type InGameSceneProps = {
  uiPhase: UIPhase;
  streetViewSrc: string;
  showResultStage: boolean;
  isSingleplayer: boolean;
  resultOverlay?: RoundResultOverlayProps;
  selfName: string;
  selfAvatarUrl?: string;
  selfFallback: string;
  selfIsAdmin: boolean;
  opponentName: string;
  opponentIsAdmin: boolean;
  opponentDisconnected: boolean;
  oppAvatarUrl?: string;
  oppFallback: string;
  hpPct: (hp: number) => string;
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
  onForfeit: () => boolean;
  onAdvanceRound: () => boolean;
  onLeaveGame: () => void;
  canFinalizeGuess: boolean;
  canAdvanceRound: boolean;
  onFinalizeGuess: () => void;
  guessMapNode: ReactNode;
  resultMapNode?: ReactNode;
  selfElo: number;
  opponentElo: number;
  selfRatingPreview?: RatingDeltaPreview;
  damageMultiplier: number;
  guessSubmitted: boolean;
  opponentGuessAlert: boolean;
  connectionIssue: string;
  roundNumber?: number;
  totalRounds?: number;
  modeName?: string;
  mapName?: string;
};

export default function InGameScene({
  uiPhase,
  streetViewSrc,
  showResultStage,
  isSingleplayer,
  resultOverlay,
  selfName,
  selfAvatarUrl,
  selfFallback,
  selfIsAdmin,
  opponentName,
  opponentIsAdmin,
  opponentDisconnected,
  oppAvatarUrl,
  oppFallback,
  hpPct,
  mm,
  ss,
  isRoundTimerRunning,
  timerProgressPct,
  isTimerCritical,
  isTimerPulseActive,
  showHudStatus,
  hudStatusLabel,
  resultMode,
  selfHP,
  oppHP,
  totalScore,
  currentRoundScore,
  currentRoundDistanceKm,
  onForfeit,
  onAdvanceRound,
  onLeaveGame,
  canFinalizeGuess,
  canAdvanceRound,
  onFinalizeGuess,
  guessMapNode,
  resultMapNode,
  selfElo,
  opponentElo,
  selfRatingPreview,
  damageMultiplier,
  guessSubmitted,
  opponentGuessAlert,
  connectionIssue,
  roundNumber = 1,
  totalRounds,
  modeName = 'Moving',
  mapName = 'A Source World'
}: InGameSceneProps) {
  const showGuessAlertBorder = opponentGuessAlert;
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [forfeitRequested, setForfeitRequested] = useState(false);
  const [streetViewResetCount, setStreetViewResetCount] = useState(0);
  const canShowForfeit = uiPhase !== 'match_end';

  const countdownSec = (parseInt(ss, 10) || 0) + (parseInt(mm, 10) || 0) * 60;
  const showCountdown = !isSingleplayer && uiPhase === 'prematch_countdown' && countdownSec > 0 && countdownSec <= 3;

  useEffect(() => {
    document.documentElement.classList.add('game-active');
    return () => document.documentElement.classList.remove('game-active');
  }, []);

  useEffect(() => {
    if (canShowForfeit) return;
    setConfirmForfeit(false);
    setForfeitRequested(false);
  }, [canShowForfeit]);

  useEffect(() => {
    setStreetViewResetCount(0);
  }, [streetViewSrc]);

  const handleForfeitConfirm = () => {
    const sent = onForfeit();
    if (!sent) {
      setConfirmForfeit(false);
      return;
    }
    if (isSingleplayer) {
      setConfirmForfeit(false);
      setForfeitRequested(false);
      onLeaveGame();
      return;
    }
    setForfeitRequested(true);
  };

  return (
    <section className={`fixed inset-0 overflow-hidden ${motionPresetClass.reveal}`}>
      {(uiPhase === 'live_round' || uiPhase === 'prematch_countdown') && (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            key={`${streetViewSrc}-${streetViewResetCount}`}
            title="Street View"
            src={streetViewSrc}
            className="absolute left-0 top-[-75px] h-[calc(100%+75px)] w-full border-0"
            allowFullScreen
            loading="eager"
          />
        </div>
      )}

      <AnimatePresence>
        {showResultStage && resultOverlay && <RoundResultOverlay {...resultOverlay} />}
      </AnimatePresence>

      <AnimatePresence>
        {connectionIssue && (
          <motion.div
            key="connection-issue-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="font-hud pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-full border border-red-400/30 bg-[#2a1010]/90 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-red-100 shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
          >
            {connectionIssue}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCountdown && roundNumber === 1 && (
          <GameStartOverlay
            roundNumber={roundNumber}
            modeName={modeName}
            mapName={mapName}
            countdownSec={countdownSec}
            selfName={selfName}
            selfElo={selfElo}
            selfRatingPreview={selfRatingPreview}
            selfAvatarUrl={selfAvatarUrl}
            selfFallback={selfFallback}
            selfIsAdmin={selfIsAdmin}
            oppName={opponentName}
            oppElo={opponentElo}
            oppAvatarUrl={oppAvatarUrl}
            oppFallback={oppFallback}
            oppIsAdmin={opponentIsAdmin}
          />
        )}
        {showCountdown && roundNumber > 1 && (
          <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center">
            <IntroCountdownText countdownSec={countdownSec} />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uiPhase === 'live_round' && !isSingleplayer && (
          <motion.div
            key="game-hud"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <GameHUD
              mm={mm}
              ss={ss}
              isRoundTimerRunning={isRoundTimerRunning}
              damageMultiplier={damageMultiplier}
              timerProgressPct={timerProgressPct}
              isTimerCritical={isTimerCritical}
              isTimerPulseActive={isTimerPulseActive}
              showHudStatus={showHudStatus}
              hudStatusLabel={hudStatusLabel}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isSingleplayer ? (
        <div className="absolute right-3 top-3 z-30 flex items-center gap-5 rounded-[18px] border border-white/10 bg-hudBg px-4 py-3 text-white shadow-elev-2 backdrop-blur-hud md:right-4 md:top-4">
          <div>
            <p className="font-hud text-[10px] uppercase tracking-[0.16em] text-white/60">Round</p>
            <p className="mt-1 text-2xl font-black text-white">
              {roundNumber}
              {totalRounds ? `/${totalRounds}` : ''}
            </p>
          </div>
          <div>
            <p className="font-hud text-[10px] uppercase tracking-[0.16em] text-white/60">Points</p>
            <p className="mt-1 text-2xl font-black text-white">{totalScore.toLocaleString()}</p>
          </div>
        </div>
      ) : (
        <>
          <PlayerHPCard
            side="left"
            name={selfName}
            elo={selfElo}
            hp={selfHP}
            hpPct={hpPct(selfHP)}
            avatarUrl={selfAvatarUrl}
            fallback={selfFallback}
            isAdmin={selfIsAdmin}
          />
          <PlayerHPCard
            side="right"
            name={opponentName}
            elo={opponentElo}
            hp={oppHP}
            hpPct={hpPct(oppHP)}
            avatarUrl={oppAvatarUrl}
            fallback={oppFallback}
            isAdmin={opponentIsAdmin}
            opponent
            disconnected={opponentDisconnected}
          />
        </>
      )}

      <AnimatePresence>
        {canShowForfeit && (
          <motion.div
            key="forfeit-control"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute left-3 top-24 z-40 pointer-events-auto md:bottom-4 md:left-4 md:top-auto"
          >
            {confirmForfeit ? (
              <div className="glass-panel w-[min(calc(100vw-1.5rem),19rem)] rounded-[22px] p-3 text-white md:w-[19rem]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-red-300/15 bg-red-500/12 text-red-200">
                    <AlertTriangle size={18} strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-hud text-[11px] uppercase tracking-[0.16em] text-red-200/85">Forfeit Match</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {isSingleplayer ? 'This ends the current practice run.' : 'This counts as a loss and ends the duel now.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmForfeit(false);
                      setForfeitRequested(false);
                    }}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-white/65 transition hover:bg-white/10 hover:text-white"
                    aria-label="Cancel forfeit"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmForfeit(false);
                      setForfeitRequested(false);
                    }}
                    className="font-hud min-h-11 flex-1 rounded-pill border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    Keep Playing
                  </button>
                  <button
                    type="button"
                    onClick={handleForfeitConfirm}
                    disabled={forfeitRequested}
                    className="font-hud min-h-11 flex-1 rounded-pill border border-red-200/25 bg-[linear-gradient(135deg,rgba(255,109,66,0.96)_0%,rgba(196,57,35,0.96)_100%)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white shadow-[0_10px_24px_rgba(196,57,35,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-75"
                  >
                    {forfeitRequested ? 'Forfeiting...' : 'Confirm'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStreetViewResetCount((count) => count + 1)}
                  aria-label="Return to spawn location"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-hudBg text-white/80 shadow-elev-2 backdrop-blur-hud transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw size={16} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmForfeit(true)}
                  aria-label="Forfeit match"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-hudBg text-white/80 shadow-elev-2 backdrop-blur-hud transition hover:bg-white/10 hover:text-white"
                >
                  <LogOut size={16} strokeWidth={2.4} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {uiPhase === 'live_round' && (
        <MinimapPanel onFinalize={onFinalizeGuess} canFinalizeGuess={canFinalizeGuess}>
          {guessMapNode}
        </MinimapPanel>
      )}

      {isSingleplayer && (uiPhase === 'round_result' || uiPhase === 'match_end') && (
        <>
          <div className="absolute left-1/2 top-10 z-30 flex w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 flex-col items-center md:top-12">
            <motion.div
              initial={{ y: 36, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="font-hud font-bold text-center text-[clamp(3rem,10vw,4.8rem)] leading-none text-white drop-shadow-[0_6px_12px_rgba(59,130,246,0.95)]"
            >
              {currentRoundScore}
            </motion.div>
            <motion.div
              initial={{ y: -18, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, delay: 0.06 }}
              className="relative mt-5"
            >
              <ResultDistanceBar selfDistanceKm={currentRoundDistanceKm} compact />
            </motion.div>
          </div>
          <div className="absolute inset-x-3 bottom-3 top-44 z-20 flex flex-col gap-3 md:inset-x-4 md:bottom-4 md:top-48">
            <div className="min-h-0 flex-1">
              {resultMapNode}
            </div>
            <motion.button
              type="button"
              initial={{ y: 20, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut', delay: 0.12 }}
              onClick={canAdvanceRound ? onAdvanceRound : onLeaveGame}
              className="mx-auto inline-flex items-center justify-center rounded-[16px] bg-[#22d385] px-8 py-[16px] text-[16px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_16px_rgba(34,211,133,0.3)] transition-all duration-200 hover:scale-[1.01] hover:bg-[#2ae091] hover:shadow-[0_6px_24px_rgba(34,211,133,0.4)] active:scale-[0.98]"
            >
              {canAdvanceRound ? 'Next Round' : 'Back To Lobby'}
            </motion.button>
          </div>
        </>
      )}

      <AnimatePresence>
        {showGuessAlertBorder && (
          <motion.div
            key="opponent-guess-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              boxShadow:
                'inset 0 0 120px rgba(239, 68, 68, 0.2), inset 0 0 100px rgba(239, 68, 68, 0.35), inset 0 0 0 2px rgba(248, 113, 113, 0.35)'
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
