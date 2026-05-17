import type { PlayerBadgeInfo } from "./PlayerBadge";
import { PlayerIdentityCard, type ParticipantIdentityView } from "./PlayerIdentity";

type Props = {
  name: string;
  elo: number;
  ratingPreview?: { win: number; lose: number; draw: number };
  avatarUrl?: string;
  fallback: string;
  isAdmin?: boolean;
  selectedBadge?: PlayerBadgeInfo | null;
};

export default function DuelPlayerProfile({
  name,
  elo,
  ratingPreview,
  avatarUrl,
  fallback,
  isAdmin = false,
  selectedBadge,
}: Props) {
  const participant: ParticipantIdentityView = {
    kind: "player",
    id: name,
    name: name || "Guest",
    avatarUrl,
    avatarFallback: fallback,
    isAdmin,
    selectedBadge,
    rating: elo,
    ratingPreview,
  };

  return (
    <PlayerIdentityCard
      participant={participant}
      rating={elo}
      ratingPreview={ratingPreview}
      avatarClassName="h-32 w-32 border-[6px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] md:h-40 md:w-40"
      nameClassName="text-xl font-black leading-tight text-white drop-shadow-md md:text-2xl"
      className="gap-4"
    />
  );
}
