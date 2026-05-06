import React, { useState } from "react";
import PlayerNameWithBadge from "./PlayerNameWithBadge";

type Props = {
  name: string;
  elo: number;
  ratingPreview?: { win: number; lose: number; draw: number };
  avatarUrl?: string;
  fallback: string;
  isAdmin?: boolean;
};

export default function DuelPlayerProfile({
  name,
  elo,
  ratingPreview,
  avatarUrl,
  fallback,
  isAdmin = false,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Circle Profile Picture */}
      <div className="relative h-32 w-32 md:h-40 md:w-40 flex-shrink-0 overflow-hidden rounded-full border-[6px] border-white/20 bg-[#162130] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        {avatarUrl && !imgFailed ? (
          <img
            src={avatarUrl}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#1e3b2f] text-4xl font-black text-white">
            {fallback?.[0] || name?.[0] || "?"}
          </div>
        )}
      </div>

      {/* Name and ELO with trophy icon */}
      <div className="flex flex-col items-center">
        <PlayerNameWithBadge
          name={name || "Guest"}
          isAdmin={isAdmin}
          nameClassName="text-xl md:text-2xl font-black leading-tight text-white drop-shadow-md"
        />
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-sm md:text-base font-bold text-[#facc15] shadow-inner backdrop-blur-sm">
            <svg
              className="h-4 w-4 md:h-5 md:w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M19 4h-2V2H7v2H5C3.34 4 2 5.34 2 7v3c0 1.9 1.25 3.51 3 4.15V15c0 1.66 1.34 3 3 3h4c0 1.25-.84 2.33-2 2.8v2.2L12 24l2-1v-2.2c-1.16-.47-2-1.55-2-2.8h4c1.66 0 3-1.34 3-3v-.85c1.75-.64 3-2.25 3-4.15V7c0-1.66-1.34-3-3-3zM5 12c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h2v6H5zm14-1c0 .55-.45 1-1 1h-2V6h2c.55 0 1 .45 1 1v4z" />
            </svg>
            {elo}
          </div>
          {ratingPreview && (
            <div
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70"
              aria-label={`Rating change preview: win ${formatDelta(ratingPreview.win)}, lose ${formatDelta(ratingPreview.lose)}`}
            >
              <span className="text-[#2ad18f]">W {formatDelta(ratingPreview.win)}</span>
              <span className="text-white/25">/</span>
              <span className="text-[#ff6b6b]">L {formatDelta(ratingPreview.lose)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
