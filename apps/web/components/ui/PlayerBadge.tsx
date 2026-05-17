export type PlayerBadgeInfo = {
  id: string;
  kind: string;
  label: string;
  description: string;
  imageUrl: string;
  seasonId?: string;
  rank?: number;
  owned?: boolean;
};

type PlayerBadgeProps = {
  badge?: PlayerBadgeInfo | null;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  showTooltip?: boolean;
  className?: string;
};

const sizeClass = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-14 w-14",
};

const rankTextClass = {
  sm: "text-[10px]",
  md: "text-[12px]",
  lg: "text-[18px]",
};

export function badgeTitle(badge?: PlayerBadgeInfo | null) {
  if (!badge) return "";
  return `${badge.label}${badge.description ? ` - ${badge.description}` : ""}`;
}

export default function PlayerBadge({
  badge,
  size = "sm",
  muted = false,
  showTooltip = true,
  className = "",
}: PlayerBadgeProps) {
  if (!badge) return null;
  const rankLabel =
    badge.kind === "season_rank" && badge.rank ? `#${badge.rank}` : "";
  return (
    <span
      className={`group/badge relative inline-flex shrink-0 items-center justify-center ${sizeClass[size]} ${muted ? "grayscale opacity-45" : ""} ${className}`.trim()}
      title={showTooltip ? badgeTitle(badge) : undefined}
      aria-label={badgeTitle(badge)}
    >
      <img
        src={badge.imageUrl}
        alt=""
        className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
      />
      {rankLabel ? (
        <span
          className={`font-hud absolute inset-0 flex items-center justify-center font-black leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${rankTextClass[size]}`}
        >
          {rankLabel}
        </span>
      ) : null}
      {showTooltip ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-[200] mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-[#071018]/95 p-3 text-left shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur group-hover/badge:block">
          <span className="block text-xs font-black text-white">{badge.label}</span>
          <span className="mt-1 block text-[11px] leading-snug text-[#a9bfd4]">
            {badge.description}
          </span>
        </span>
      ) : null}
    </span>
  );
}
