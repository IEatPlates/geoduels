import { useEffect, useState } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseBannerProps = {
  clientId: string;
  slot: string;
  className?: string;
};

export default function AdSenseBanner({
  clientId,
  slot,
  className = "",
}: AdSenseBannerProps) {
  const [mounted, setMounted] = useState(false);
  const testMode = clientId === "test" || slot === "test";
  const enabled =
    mounted && (testMode || (clientId.startsWith("ca-pub-") && slot.length > 0));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ad blockers and fast tab changes can make AdSense reject a fill attempt.
    }
  }, [clientId, enabled, slot]);

  if (!enabled) return null;

  if (testMode) {
    return (
      <section
        aria-label="Advertisement test placement"
        className={`w-full max-w-[970px] rounded-[14px] border border-dashed border-[#2ad18f]/40 bg-[#10211a]/80 p-1 pointer-events-auto ${className}`}
      >
        <div className="flex min-h-[90px] items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,rgba(42,209,143,0.16),rgba(59,130,246,0.14))] px-4 text-center">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#7de3b7]">
            Test ad placement
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Advertisement"
      className={`w-full max-w-[970px] rounded-[14px] border border-white/[0.08] bg-white/[0.03] p-1 pointer-events-auto ${className}`}
    >
      <ins
        className="adsbygoogle block min-h-[90px] overflow-hidden rounded-[12px]"
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        style={{ display: "block" }}
      />
    </section>
  );
}
