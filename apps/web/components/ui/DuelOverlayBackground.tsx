import React, { ReactNode } from 'react';

type Props = {
    children?: ReactNode;
    variant?: "duel" | "points";
};

export default function DuelOverlayBackground({ children, variant = "duel" }: Props) {
    const isPoints = variant === "points";
    return (
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#03080c] pointer-events-none">
            {isPoints ? (
                <div className="absolute inset-0 bg-[linear-gradient(180deg,#0d1924_0%,#05090e_100%)]" />
            ) : (
                <>
                    {/* Left Player Side (Green / Ranked theme) */}
                    <div
                        className="absolute inset-0 bg-[linear-gradient(180deg,#0D774D_0%,#053C26_100%)]"
                        style={{ clipPath: 'polygon(0 0, 68% 0, 52% 50%, 45% 50%, 31% 100%, 0 100%)' }}
                    />

                    {/* Right Player Side (Blue / Casual theme) */}
                    <div
                        className="absolute inset-0 bg-[linear-gradient(180deg,#002B47_0%,#03080C_100%)]"
                        style={{ clipPath: 'polygon(68% 0, 100% 0, 100% 100%, 31% 100%, 45% 50%, 52% 50%)' }}
                    />
                </>
            )}

            {/* Content wrapper */}
            <div className="absolute inset-0 z-10">{children}</div>
        </div>
    );
}
