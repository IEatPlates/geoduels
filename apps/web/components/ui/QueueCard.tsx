import { useEffect, useState } from 'react';

type Props = {
  connected: boolean;
  accessToken: string;
  status: string;
  joinQueue: () => void;
  cancelQueue: () => void;
  queueError: string;
};

function formatQueueElapsed(ms: number) {
  const totalSeconds = ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function QueueCard({ connected, accessToken, status, joinQueue, cancelQueue, queueError }: Props) {
  const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const disabled = !accessToken || status === 'queueing';
  const isQueueing = status === 'queueing';
  const showConnectionError = !connected && queueError.toLowerCase() === 'connection error';
  const primaryLabel = showConnectionError ? 'Connection Error' : isQueueing ? 'Finding Opponent...' : 'PLAY';
  const queueElapsedLabel = formatQueueElapsed(queueStartedAt ? nowMs - queueStartedAt : 0);

  useEffect(() => {
    if (!isQueueing) {
      setQueueStartedAt(null);
      return;
    }
    setQueueStartedAt((current) => current ?? Date.now());
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isQueueing]);

  return (
    <section className="relative w-full max-w-[540px] overflow-hidden rounded-[34px] border border-emerald-200/28 bg-[#21453d]/40 p-6 text-ink shadow-[0_32px_80px_rgba(0,0,0,0.44)] backdrop-blur-xl md:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(90,190,152,0.3)_0%,rgba(26,56,54,0.38)_40%,rgba(8,18,17,0.66)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(133,247,211,0.24),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] bg-[linear-gradient(180deg,rgba(8,19,18,0.1)_0%,rgba(8,19,18,0.72)_100%),url('/mountains.svg')] bg-cover bg-center opacity-90" />

      <div className="relative z-10">
        <span className="text-[12px] font-semibold uppercase tracking-[0.26em] text-emerald-100/72">Ranked</span>
        <h3 className="mt-2 text-[clamp(2.5rem,7vw,4rem)] font-black leading-none tracking-tight text-white">Duel</h3>
        <p className="mt-2 text-[clamp(1.4rem,4.4vw,2.2rem)] leading-none text-emerald-100/92">Moving allowed</p>
        <button
          onClick={joinQueue}
          disabled={disabled}
          className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-pill border border-emerald-100/22 bg-[linear-gradient(90deg,#64c8ac_0%,#21c686_55%,#0fcf68_100%)] px-6 py-3 text-[clamp(1.45rem,4.8vw,2.3rem)] font-black uppercase tracking-[0.12em] text-white shadow-[0_20px_38px_rgba(16,204,123,0.38)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="text-[clamp(1rem,3vw,1.5rem)] leading-none">▶</span>
          {primaryLabel}
        </button>
        {isQueueing && (
          <button
            onClick={cancelQueue}
            className="mt-3 min-h-11 w-full rounded-pill border border-white/25 bg-slate-900/68 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-ink transition hover:bg-slate-800/80"
          >
            <span className="text-accentPrimary">{queueElapsedLabel}</span>
          </button>
        )}
        {queueError && <p className="mt-3 text-sm font-semibold text-red-300">{queueError}</p>}
      </div>
    </section>
  );
}
