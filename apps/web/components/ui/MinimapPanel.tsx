import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  children: ReactNode;
  onFinalize: () => void;
  canFinalizeGuess: boolean;
  guessSubmitted: boolean;
};

export default function MinimapPanel({ children, onFinalize, canFinalizeGuess, guessSubmitted }: Props) {
  const RIGHT_GUTTER_PX = 80;
  const GESTURE_MOVE_THRESHOLD_PX = 6;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activePointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const resizeLockedRef = useRef(false);
  const suppressNextPanelClickRef = useRef(false);
  const [desktopHovered, setDesktopHovered] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => {
      const desktop = mediaQuery.matches;
      setIsDesktop(desktop);
      if (desktop) setMobileExpanded(false);
    };

    syncViewport();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncViewport);
      return () => mediaQuery.removeEventListener('change', syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const releaseResizeLock = () => {
      resizeLockedRef.current = false;
      if (!isDesktop) return;

      const panel = panelRef.current;
      setDesktopHovered(Boolean(panel?.matches(':hover')));
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (resizeLockedRef.current && event.buttons === 0) releaseResizeLock();
    };

    window.addEventListener('pointerup', releaseResizeLock, true);
    window.addEventListener('pointercancel', releaseResizeLock, true);
    window.addEventListener('mouseup', releaseResizeLock, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('blur', releaseResizeLock);

    return () => {
      window.removeEventListener('pointerup', releaseResizeLock, true);
      window.removeEventListener('pointercancel', releaseResizeLock, true);
      window.removeEventListener('mouseup', releaseResizeLock, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('blur', releaseResizeLock);
    };
  }, [isDesktop]);

  const expanded = isDesktop ? desktopHovered : mobileExpanded;
  const reserveRightGutter = isDesktop || !mobileExpanded;
  const finalizeLabel = guessSubmitted ? 'Waiting for opponent...' : canFinalizeGuess ? 'Guess' : 'Place Pin';

  const beginPointerGesture = (event: ReactPointerEvent) => {
    activePointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    resizeLockedRef.current = true;
    suppressNextPanelClickRef.current = false;
  };

  const trackPointerGesture = (event: ReactPointerEvent) => {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.id !== event.pointerId) return;

    const dx = event.clientX - activePointer.x;
    const dy = event.clientY - activePointer.y;
    if (Math.hypot(dx, dy) > GESTURE_MOVE_THRESHOLD_PX) {
      suppressNextPanelClickRef.current = true;
    }
  };

  const endPointerGesture = (event: ReactPointerEvent) => {
    if (activePointerRef.current?.id === event.pointerId) activePointerRef.current = null;
  };

  const handlePanelClick = () => {
    if (suppressNextPanelClickRef.current) {
      suppressNextPanelClickRef.current = false;
      return;
    }
    if (!isDesktop) setMobileExpanded(true);
  };

  const handleBackdropClick = () => {
    if (suppressNextPanelClickRef.current) {
      suppressNextPanelClickRef.current = false;
      return;
    }
    setMobileExpanded(false);
  };

  const handleFinalizeClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFinalize();
  };

  return (
    <>
      {!isDesktop && mobileExpanded ? (
        <button
          type="button"
          aria-label="Collapse minimap"
          className="absolute inset-0 z-20 cursor-default bg-transparent"
          onPointerDown={beginPointerGesture}
          onPointerMove={trackPointerGesture}
          onPointerUp={endPointerGesture}
          onPointerCancel={endPointerGesture}
          onClick={handleBackdropClick}
        />
      ) : null}
      <div
        ref={panelRef}
        onMouseEnter={(event) => {
          if (!isDesktop) return;
          if (resizeLockedRef.current || event.buttons !== 0) {
            resizeLockedRef.current = true;
            return;
          }
          setDesktopHovered(true);
        }}
        onMouseLeave={(event) => {
          if (!isDesktop) return;
          if (resizeLockedRef.current || event.buttons !== 0) {
            resizeLockedRef.current = true;
            return;
          }
          setDesktopHovered(false);
        }}
        className={`absolute bottom-0 right-0 z-30 flex w-full flex-col gap-2 p-3 transition-[width,height] duration-150 ease-out md:bottom-4 md:right-4 md:p-0 md:w-[min(34vw,460px)] md:h-[min(33vh,360px)] ${expanded ? 'md:w-[min(90vw,800px)] md:h-[min(52vh,560px)]' : ''
          }`}
        style={{
          right: reserveRightGutter ? `${RIGHT_GUTTER_PX}px` : '0px',
          width: isDesktop ? undefined : reserveRightGutter ? `calc(100% - ${RIGHT_GUTTER_PX}px)` : '100%'
        }}
      >
        <div
          onClick={handlePanelClick}
          onPointerDown={beginPointerGesture}
          onPointerMove={trackPointerGesture}
          onPointerUp={endPointerGesture}
          onPointerCancel={endPointerGesture}
          className={`group relative min-h-0 w-full origin-bottom-right overflow-hidden rounded-panel border border-white/20 bg-slate-900/70 shadow-elev-4 transition-[height,opacity,box-shadow] duration-150 ease-out ${expanded
            ? 'h-[50vh] min-h-[280px] opacity-100 sm:h-[55vh] sm:min-h-[320px]'
            : 'h-[22vh] min-h-[150px] opacity-70 sm:h-[27vh] sm:min-h-[190px]'
            } md:h-auto md:min-h-0 md:flex-1 md:opacity-85 md:hover:opacity-100`}
        >
          {children}
        </div>
        <button
          className={`font-hud relative z-10 min-h-11 w-full rounded-pill border border-emerald-200/35 bg-cta-gradient px-6 py-2 text-center text-sm uppercase tracking-[0.15em] text-white shadow-elev-3 transition hover:brightness-110 disabled:cursor-not-allowed ${guessSubmitted ? 'opacity-45' : 'disabled:opacity-70'}`}
          onClick={handleFinalizeClick}
          disabled={!canFinalizeGuess}
        >
          {finalizeLabel}
        </button>
      </div>
    </>
  );
}
