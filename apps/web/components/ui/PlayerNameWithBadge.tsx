import AdminBadge from "./AdminBadge";

type Props = {
  name: string;
  isAdmin?: boolean;
  nameClassName?: string;
  wrapperClassName?: string;
};

export default function PlayerNameWithBadge({
  name,
  isAdmin = false,
  nameClassName = "",
  wrapperClassName = "",
}: Props) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 ${wrapperClassName}`.trim()}
    >
      <span className={`truncate ${nameClassName}`.trim()}>{name}</span>
      {isAdmin ? <AdminBadge /> : null}
    </span>
  );
}
