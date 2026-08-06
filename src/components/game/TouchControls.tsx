"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Redesigned touch controls for phones & iPads.
// - Dynamic joystick: appears wherever you touch on the left half.
// - Look pad: right half, drag to look, tap to break, double-tap to place.
// - Action buttons: bottom-right, large touch targets.
export function TouchControls({
  onMove,
  onLook,
  onJump,
  onSprint,
  onSneak,
  onBreak,
  onPlace,
  onFly,
  onInventory,
}: {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onJump: (down: boolean) => void;
  onSprint: (down: boolean) => void;
  onSneak: (down: boolean) => void;
  onBreak: (down: boolean) => void;
  onPlace: (down: boolean) => void;
  onFly: () => void;
  onInventory: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <DynamicJoystick onMove={onMove} />
      <LookPad onLook={onLook} onBreak={onBreak} onPlace={onPlace} />
      {/* Action buttons — bottom right, large for thumbs */}
      <div className="pointer-events-auto absolute bottom-[88px] right-4 flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          <TouchBtn label="🎒" onTap={onInventory} className="bg-slate-700/80" />
          <TouchBtn label="✈" onTap={onFly} className="bg-amber-600/80" />
        </div>
        <div className="flex gap-2.5">
          <TouchBtn
            label="⛏"
            onDown={onBreak}
            className="bg-red-700/85 h-[68px] w-[68px] text-3xl"
          />
          <TouchBtn
            label="▦"
            onDown={onPlace}
            className="bg-emerald-700/85 h-[68px] w-[68px] text-3xl"
          />
        </div>
      </div>
      {/* Jump + Sprint — bottom right, above actions */}
      <div className="pointer-events-auto absolute bottom-[88px] right-[160px] flex flex-col gap-2.5">
        <TouchBtn
          label="⇪"
          onDown={onSprint}
          className="bg-cyan-700/80 h-[50px] w-[50px] text-xl"
        />
        <TouchBtn
          label="▲"
          onDown={onJump}
          className="bg-indigo-700/85 h-[68px] w-[68px] text-2xl"
        />
      </div>
    </div>
  );
}

// Dynamic joystick: appears wherever the player touches on the left 45% of screen.
// The base stays fixed for the duration of the touch, then disappears on release.
function DynamicJoystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const baseRef = useRef<{ x: number; y: number } | null>(null);
  const RADIUS = 60;

  const updateKnob = useCallback(
    (cx: number, cy: number) => {
      const b = baseRef.current;
      if (!b) return;
      let dx = cx - b.x;
      let dy = cy - b.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      setKnob({ x: dx, y: dy });
      onMove(dx / RADIUS, -dy / RADIUS);
    },
    [onMove]
  );

  const start = useCallback(
    (e: React.PointerEvent) => {
      // Only respond on the left 45% of the screen
      if (e.clientX > window.innerWidth * 0.45) return;
      if (touchId.current !== null) return;
      touchId.current = e.pointerId;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      baseRef.current = { x: e.clientX, y: e.clientY };
      setBase({ x: e.clientX, y: e.clientY });
      updateKnob(e.clientX, e.clientY);
    },
    [updateKnob]
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      updateKnob(e.clientX, e.clientY);
    },
    [updateKnob]
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      touchId.current = null;
      baseRef.current = null;
      setBase(null);
      setKnob({ x: 0, y: 0 });
      onMove(0, 0);
    },
    [onMove]
  );

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="pointer-events-auto absolute bottom-0 left-0 top-0"
      style={{ width: "45%", touchAction: "none" }}
    >
      {base && (
        <>
          <div
            className="absolute rounded-full border-2 border-white/25 bg-black/30 backdrop-blur"
            style={{
              left: base.x - RADIUS,
              top: base.y - RADIUS,
              width: RADIUS * 2,
              height: RADIUS * 2,
            }}
          />
          <div
            className="absolute rounded-full border-2 border-white/50 bg-white/30 backdrop-blur"
            style={{
              left: base.x - 26 + knob.x,
              top: base.y - 26 + knob.y,
              width: 52,
              height: 52,
            }}
          />
        </>
      )}
    </div>
  );
}

// Look pad: right 55% of screen. Drag to look, tap (quick touch) to break,
// double-tap to place.
function LookPad({
  onLook,
  onBreak,
  onPlace,
}: {
  onLook: (dx: number, dy: number) => void;
  onBreak: (down: boolean) => void;
  onPlace: (down: boolean) => void;
}) {
  const last = useRef({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const startTime = useRef(0);
  const startPos = useRef({ x: 0, y: 0 });
  const moved = useRef(0);
  const lastTap = useRef(0);

  const start = useCallback((e: React.PointerEvent) => {
    if (touchId.current !== null) return;
    touchId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY };
    startTime.current = performance.now();
    startPos.current = { x: e.clientX, y: e.clientY };
    moved.current = 0;
  }, []);

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      moved.current += Math.abs(dx) + Math.abs(dy);
      onLook(dx, dy);
    },
    [onLook]
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      touchId.current = null;
      const dt = performance.now() - startTime.current;
      // quick tap without much movement → break block
      if (moved.current < 8 && dt < 250) {
        const now = performance.now();
        if (now - lastTap.current < 300) {
          // double tap → place
          onPlace(true);
          setTimeout(() => onPlace(false), 50);
          lastTap.current = 0;
        } else {
          // single tap → break
          onBreak(true);
          setTimeout(() => onBreak(false), 50);
          lastTap.current = now;
        }
      }
    },
    [onBreak, onPlace]
  );

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="pointer-events-auto absolute bottom-0 right-0 top-0"
      style={{ width: "55%", touchAction: "none" }}
    />
  );
}

function TouchBtn({
  label,
  onDown,
  onTap,
  className = "",
}: {
  label: string;
  onDown?: (down: boolean) => void;
  onTap?: () => void;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        onDown?.(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        setActive(false);
        onDown?.(false);
        onTap?.();
      }}
      onPointerCancel={() => {
        setActive(false);
        onDown?.(false);
      }}
      onPointerLeave={() => {
        if (active) {
          setActive(false);
          onDown?.(false);
        }
      }}
      className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white/30 font-bold text-white shadow-lg backdrop-blur transition active:scale-90 ${
        active ? "scale-90 bg-white/40" : ""
      } ${className}`}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {label}
    </button>
  );
}

// Hook to detect touch devices
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    );
  });
  useEffect(() => {
    const check = () =>
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;
    const r = check();
    queueMicrotask(() => setIsTouch(r));
  }, []);
  return isTouch;
}

// Hook to detect small screens (phones)
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}
