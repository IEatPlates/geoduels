import PlayerBadge, { type PlayerBadgeInfo } from "./PlayerBadge";

type Props = {
  name: string;
  isAdmin?: boolean;
  selectedBadge?: PlayerBadgeInfo | null;
  nameClassName?: string;
  wrapperClassName?: string;
};

export default function PlayerNameWithBadge({
  name,
  selectedBadge,
  nameClassName = "",
  wrapperClassName = "",
}: Props) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 ${wrapperClassName}`.trim()}
    >
      <span className={`truncate ${nameClassName}`.trim()}>{name}</span>
      <PlayerBadge badge={selectedBadge} size="sm" />
    </span>
  );
}
