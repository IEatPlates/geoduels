import { Hammer } from "lucide-react";

type Props = {
  className?: string;
};

export default function AdminBadge({ className = "" }: Props) {
  return (
    <span
      aria-label="Admin player"
      title="Admin player"
      className={`inline-flex items-center justify-center rounded-full text-[#2ad18f] ${className}`.trim()}
    >
      <Hammer className="h-3.5 w-3.5" strokeWidth={2.2} />
    </span>
  );
}
