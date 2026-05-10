type NicknameOnboardingModalProps = {
  open: boolean;
  nicknameInput: string;
  nicknameError: string;
  nicknameSaving: boolean;
  canMigrateGoogle?: boolean;
  migrationSaving?: boolean;
  onChangeNickname: (value: string) => void;
  onSubmit: () => void;
  onMigrateGoogle?: () => void;
};

export default function NicknameOnboardingModal({
  open,
  nicknameInput,
  nicknameError,
  nicknameSaving,
  canMigrateGoogle = false,
  migrationSaving = false,
  onChangeNickname,
  onSubmit,
  onMigrateGoogle
}: NicknameOnboardingModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-[26px] border border-white/10 bg-[#0d161a] p-6 text-[#f4f9ff] shadow-2xl overflow-hidden">
        <div className="absolute inset-x-0 -top-24 h-48 bg-[#2ad18f] opacity-[0.12] blur-[80px] pointer-events-none" />

        <div className="relative z-10 mb-6 flex items-center justify-between">
          <h2 className="text-[22px] font-black uppercase tracking-[0.12em] text-white">Choose Your Nickname</h2>
        </div>

        <div className="relative z-10 space-y-5">
          <p className="text-[15px] leading-relaxed text-[#a9bfd4] -mt-4">This will be your public in-game name.</p>
          <input
            value={nicknameInput}
            onChange={(e) => onChangeNickname(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white outline-none focus:border-[#2ad18f]/50 focus:bg-white/10 transition-colors placeholder:text-white/30"
            maxLength={14}
            placeholder="Enter nickname"
          />
          {nicknameError && <p className="text-xs font-semibold text-red-400">{nicknameError}</p>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={nicknameSaving}
            className="w-full flex items-center justify-center py-[14px] rounded-[16px] bg-[#22d385] hover:bg-[#2ae091] transition-all duration-200 shadow-[0_4px_16px_rgba(34,211,133,0.3)] hover:shadow-[0_6px_24px_rgba(34,211,133,0.4)] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(34,211,133,0.3)] hover:scale-[1.01] active:scale-[0.98] text-white font-extrabold text-[16px] tracking-[0.08em] uppercase"
          >
            {nicknameSaving ? 'Saving...' : 'Continue'}
          </button>
          {canMigrateGoogle && onMigrateGoogle ? (
            <button
              type="button"
              onClick={onMigrateGoogle}
              disabled={nicknameSaving || migrationSaving}
              className="w-full rounded-[16px] border border-white/10 bg-white/5 px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#d7e6f5] transition hover:bg-white/10 disabled:opacity-50"
            >
              {migrationSaving ? 'Opening Google...' : 'Migrate old Google account'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
