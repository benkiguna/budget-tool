"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
export type AIBlobState = "idle" | "thinking" | "done";

interface AIBlobWidgetProps {
  /** Content rendered inside the expanded blob panel */
  children?: ReactNode;
  /** Current AI state — controls face expression */
  aiState?: AIBlobState;
  /** Dark mode toggle */
  darkMode?: boolean;
  /** Panel width when expanded (default 320) */
  panelWidth?: number;
  /** Panel height when expanded (default 420) */
  panelHeight?: number;
  /** Called when user opens the panel */
  onOpen?: () => void;
  /** Called when user closes the panel */
  onClose?: () => void;
  /** Bottom offset in px (default 24) — increase on mobile to clear a bottom nav bar */
  bottom?: number;
}

/* ─────────────────────────────────────────────
   Colour tokens (panel only — atom icon is self-coloured)
───────────────────────────────────────────── */
const LIGHT = { headerText: "#3f3f46" };
const DARK  = { headerText: "#d4d4d8" };

/* ─────────────────────────────────────────────
   AtomIcon — eye/orbital SVG (noun project: omeneko)
   Outer ring  → rotate CW  slow
   Middle ring → rotate CCW medium
   Inner iris  → rotate CW  fast
   Core        → static
   idle: dim single hue · hover/open: vivid atom palette
───────────────────────────────────────────── */
function AtomIcon({
  isOpen,
  isHovered,
  aiState,
}: {
  isOpen: boolean;
  isHovered: boolean;
  aiState: AIBlobState;
}) {
  const active     = isOpen || isHovered;
  const isThinking = aiState === "thinking";

  // Speed: faster while thinking
  const outerDur  = isThinking ? "3s"   : "14s";
  const middleDur = isThinking ? "2s"   : "9s";
  const innerDur  = isThinking ? "1.2s" : "6s";

  // Atom palette (active) vs dim single hue (idle)
  const cOuter  = active ? "#38bdf8" : "#818cf8";
  const cMiddle = active ? "#818cf8" : "#818cf8";
  const cInner  = active ? "#c084fc" : "#818cf8";
  const cCore   = active ? "#f472b6" : "#818cf8";
  const dimOpacity  = 0.35;
  const coreOpacity = active ? 1 : 0.5;

  // All orbital groups rotate around the eye centre (50, 50) in SVG user units
  const origin = "50px 50px";
  const tr = "fill 0.35s ease, opacity 0.35s ease";

  return (
    <svg
      width="68"
      height="68"
      viewBox="-5 -10 110 110"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <style>{`
          @keyframes ai-cw  { to { transform: rotate( 360deg); } }
          @keyframes ai-ccw { to { transform: rotate(-360deg); } }
        `}</style>
      </defs>

      {/* ── Outer ring: two large arc halves ── */}
      <g fill={cOuter} opacity={active ? 1 : dimOpacity}
         style={{ transformOrigin: origin, animation: `ai-cw ${outerDur} linear infinite`, transition: tr }}>
        <path d="m39.047 15.316c27.848-8.8086 54.555 17.441 45.637 45.637l8.418 3.0625v-0.003906c1.4688-4.5234 2.2148-9.2539 2.2109-14.012 0-25.023-20.289-45.312-45.312-45.312-4.7578-0.003906-9.4883 0.74219-14.012 2.2109z"/>
        <path d="m60.953 84.684c-27.93 8.8359-54.48-17.68-45.633-45.633l-8.418-3.0625h-0.003906c-1.4688 4.5234-2.2148 9.2539-2.2109 14.012 0 25.023 20.289 45.312 45.312 45.312 4.7578 0.003906 9.4883-0.74219 14.012-2.2109z"/>
      </g>

      {/* ── Middle ring: four arc segments ── */}
      <g fill={cMiddle} opacity={active ? 1 : dimOpacity}
         style={{ transformOrigin: origin, animation: `ai-ccw ${middleDur} linear infinite`, transition: tr }}>
        <path d="m25.426 23.215c3.1367-2.8828 6.7539-5.1914 10.688-6.8281l-3.0625-8.418c-5.1641 2.0859-9.8945 5.1055-13.965 8.9062z"/>
        <path d="m16.391 36.113c1.6328-3.9336 3.9492-7.5547 6.832-10.688l-6.3477-6.3398c-3.8008 4.0703-6.8203 8.8008-8.9062 13.965z"/>
        <path d="m83.609 63.887c-1.6328 3.9336-3.9414 7.5508-6.8242 10.688l6.3398 6.3398c3.8008-4.0703 6.8203-8.8008 8.9062-13.965z"/>
        <path d="m74.574 76.785c-3.1367 2.8828-6.7539 5.1914-10.688 6.8242l3.0625 8.4219c5.1641-2.0859 9.8945-5.1055 13.965-8.9062z"/>
      </g>

      {/* ── Inner iris: two complex orbital paths ── */}
      <g fill={cInner} opacity={active ? 1 : dimOpacity}
         style={{ transformOrigin: origin, animation: `ai-cw ${innerDur} linear infinite`, transition: tr }}>
        <path d="m34.805 73.336c-0.53516-0.51563-0.63281-1.3398-0.23438-1.9688l2.5391-4.0078v0.003906c-4.707-3.5039-7.7891-8.7734-8.5352-14.594-0.74609-5.8203 0.90625-11.695 4.5781-16.273s9.0469-7.4688 14.891-8.0039c5.8438-0.53906 11.656 1.3242 16.102 5.1562l2.457-2.4531-3.1641-4.7656c-0.38672-0.57813-0.33984-1.3477 0.11328-1.8789l2.9297-3.4219h-0.003907c-5.0156-2.875-10.695-4.3828-16.477-4.3711-18.328 0-33.242 14.914-33.242 33.242 0 13.809 8.4688 25.68 20.484 30.695l1.7695-3.332z"/>
        <path d="m40.203 81.773c3.1758 0.97656 6.4766 1.4727 9.7969 1.4688 18.328 0 33.242-14.914 33.242-33.242 0-10.816-5.2656-20.953-14.117-27.176l-2.4414 2.8594 3.2188 4.8438 0.003906 0.003906c0.41406 0.61719 0.33203 1.4414-0.19531 1.9688l-3.3594 3.3594c4.4492 5.1367 6.2188 12.066 4.7852 18.711-1.4336 6.6406-5.9062 12.223-12.078 15.07s-13.324 2.625-19.309-0.59766l-1.8594 2.9297 4.125 3.9609h0.007813c0.5 0.48438 0.62109 1.2422 0.29687 1.8594z"/>
      </g>

      {/* ── Core: iris ring + lens + pupil dot (static) ── */}
      <g fill={cCore} opacity={coreOpacity}
         style={{ transition: tr }}>
        <path d="m68.504 50c0-4.9062-1.9492-9.6133-5.418-13.086-3.4727-3.4688-8.1797-5.418-13.086-5.418s-9.6133 1.9492-13.086 5.418c-3.4688 3.4727-5.418 8.1797-5.418 13.086s1.9492 9.6133 5.418 13.086c3.4727 3.4688 8.1797 5.418 13.086 5.418 4.9062-0.003906 9.6094-1.957 13.078-5.4258s5.4219-8.1719 5.4258-13.078zm-28.09-0.72656c-3-2.1172-3.6172-6.5469-0.19531-9.9609 3.8555-3.8555 8.8125-2.5 10.5 1.1094 3.8789 0.29297 7.1992 2.8906 8.4141 6.5859 1.2109 3.6953 0.078126 7.7578-2.8672 10.289-2.9492 2.5352-7.1367 3.043-10.605 1.2891-3.4727-1.7539-5.543-5.4258-5.2461-9.3047z"/>
        <path d="m56.492 50c-0.003907-3.1055-2.2031-5.7734-5.25-6.3672-0.17969 1.5625-0.96094 3.0938-2.2812 4.4141-1.4805 1.4805-3.3594 2.4297-5.4414 2.3125 0.19141 3.5078 3.1445 6.2266 6.6602 6.1289 3.5117-0.097656 6.3125-2.9727 6.3125-6.4883z"/>
        <path d="m46.75 45.836c3.6719-3.6719-0.65625-7.9883-4.3203-4.3203-3.6641 3.6641 0.65625 7.9844 4.3203 4.3203z"/>
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function AIBlobWidget({
  children,
  aiState = "idle",
  darkMode = false,
  panelWidth = 320,
  panelHeight = 420,
  onOpen,
  onClose,
  bottom = 24,
}: AIBlobWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const colors = darkMode ? DARK : LIGHT;

  const open  = useCallback(() => { setIsOpen(true);  onOpen?.();  }, [onOpen]);
  const close = useCallback(() => { setIsOpen(false); onClose?.(); }, [onClose]);

  // Click-outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        iconRef.current && !iconRef.current.contains(e.target as Node)
      ) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  return (
    <div
      style={{
        position: "fixed",
        bottom,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        pointerEvents: "none", // children opt-in individually
      }}
    >
      {/* ── Expanded panel ── */}
      <div
        ref={panelRef}
        style={{
          width: panelWidth,
          height: panelHeight,
          maxHeight: "calc(100vh - 112px)",
          borderRadius: 18,
          background: "var(--color-surface-primary)",
          border: "1px solid var(--color-border-row)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          marginBottom: 12,
          transformOrigin: "bottom right",
          transform: isOpen ? "scale(1) translateY(0)" : "scale(0.35) translateY(60px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: isOpen
            ? "transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease"
            : "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="AI assistant panel"
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            background: "var(--color-surface-hover)",
            borderBottom: "1px solid var(--color-border-row)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#818cf8" }} aria-hidden="true">
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.headerText }}>
              AI Assistant
            </span>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{
              width: 26, height: 26,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: colors.headerText,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.45,
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.45")}
          >
            ✕
          </button>
        </div>

        {/* Children area */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>

      {/* ── Keyframes for click burst (rendered once, applies globally) ── */}
      <style>{`
        @keyframes ai-burst-ring {
          0%   { transform: scale(0.25); opacity: 0.85; }
          100% { transform: scale(2.6);  opacity: 0; }
        }
        @keyframes ai-icon-pop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.22); }
          65%  { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* ── Atom icon button ── always visible, acts as toggle ── */}
      <button
        ref={iconRef}
        onClick={() => {
          setBurstKey(k => k + 1);
          isOpen ? close() : open();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
        style={{
          position: "relative",
          width: 76,
          height: 76,
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          filter: "drop-shadow(0 4px 14px rgba(127,119,221,0.5))",
        }}
      >
        {/* Burst rings — re-keyed on every click to restart animation */}
        {burstKey > 0 && (
          <div key={burstKey} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {([
              { delay: "0ms",   color: "#38bdf8" },
              { delay: "90ms",  color: "#818cf8" },
              { delay: "180ms", color: "#c084fc" },
            ] as const).map(({ delay, color }, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 4,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  animation: `ai-burst-ring 550ms ease-out forwards`,
                  animationDelay: delay,
                  opacity: 0,
                }}
              />
            ))}
          </div>
        )}

        {/* Icon — pop scale on click */}
        <div
          key={`icon-${burstKey}`}
          style={{
            animation: burstKey > 0 ? "ai-icon-pop 420ms cubic-bezier(0.34,1.56,0.64,1) forwards" : "none",
          }}
        >
          <AtomIcon aiState={aiState} isOpen={isOpen} isHovered={isHovered} />
        </div>
      </button>
    </div>
  );
}
