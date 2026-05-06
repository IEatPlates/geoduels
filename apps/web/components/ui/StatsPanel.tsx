type Props = {
  mmr: number;
  gamesPlayed: number;
  winsPct: number;
};

export default function StatsPanel({ mmr, gamesPlayed, winsPct }: Props) {
  return (
    <section className="rounded-panel border border-white/10 bg-slate-900/85 p-5 text-ink shadow-elev-2 backdrop-blur-hud">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-inkMuted">Profile Stats</h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-slate-800/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-inkMuted">Current Rating</p>
          <p className="mt-1 text-2xl font-black text-ink">{mmr}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-inkMuted">Total Games</p>
          <p className="mt-1 text-2xl font-black text-ink">{gamesPlayed}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-inkMuted">Win Rate</p>
          <p className="mt-1 text-2xl font-black text-ink">{winsPct}%</p>
        </div>
      </div>
    </section>
  );
}
