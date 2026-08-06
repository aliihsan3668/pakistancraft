"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Redesigned touch controls for phones & iPads.
// - Dynamic joystick: appears wherever you touch on the left half.
// - Look pad: right half, drag to look, tap to break, double-tap to place.
// - Action buttons: bottom-right, large touch targets.
// - Touch hotbar: tap slots to select.
export function TouchControls({
  onMove,
  onLook,
  onJump,
  onSprint,
  onSneak,
  onBreakStart,
  onBreakEnd,
  onTapBreak,
  onPlace,
  onFly,
  onInventory,
  hotbar,
  selectedSlot,
  onSelectSlot,
}: {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onJump: (down: boolean) => void;
  onSprint: (down: boolean) => void;
  onSneak: (down: boolean) => void;
  onBreakStart: () => void;
  onBreakEnd: () => void;
  onTapBreak: () => void;
  onPlace: () => void;
  onFly: () => void;
  onInventory: () => void;
  hotbar: number[];
  selectedSlot: number;
  onSelectSlot: (i: number) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <DynamicJoystick onMove={onMove} />
      <LookPad
        onLook={onLook}
        onTapBreak={onTapBreak}
        onTapPlace={onPlace}
      />
      {/* Action buttons — right side, large for thumbs */}
      <div className="pointer-events-auto absolute bottom-[96px] right-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <TouchBtn label="🎒" onTap={onInventory} className="bg-slate-700/85" />
          <TouchBtn label="✈" onTap={onFly} className="bg-amber-600/85" />
        </div>
        <div className="flex gap-2">
          <TouchBtn
            label="⛏"
            onDown={onBreakStart}
            onUp={onBreakEnd}
            className="bg-red-700/90 h-[68px] w-[68px] text-3xl"
          />
          <TouchBtn
            label="▦"
            onTap={onPlace}
            className="bg-emerald-700/90 h-[68px] w-[68px] text-3xl"
          />
        </div>
      </div>
      {/* Jump + Sprint — left of actions */}
      <div className="pointer-events-auto absolute bottom-[96px] right-[162px] flex flex-col gap-2">
        <TouchBtn
          label="⇪"
          onDown={onSprint}
          className="bg-cyan-700/85 h-[50px] w-[50px] text-xl"
        />
        <TouchBtn
          label="▲"
          onDown={onJump}
          className="bg-indigo-700/90 h-[68px] w-[68px] text-2xl"
        />
      </div>
      {/* Touch hotbar — centered bottom, tappable */}
      <TouchHotbar
        hotbar={hotbar}
        selectedSlot={selectedSlot}
        onSelect={onSelectSlot}
      />
    </div>
  );
}

// Dynamic joystick: appears wherever the player touches on the left 45% of screen.
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
// double-tap to place. Uses direct callbacks for one-shot actions.
function LookPad({
  onLook,
  onTapBreak,
  onTapPlace,
}: {
  onLook: (dx: number, dy: number) => void;
  onTapBreak: () => void;
  onTapPlace: () => void;
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
      // quick tap without much movement → action
      if (moved.current < 10 && dt < 280) {
        const now = performance.now();
        if (now - lastTap.current < 320) {
          // double tap → place
          onTapPlace();
          lastTap.current = 0;
        } else {
          // single tap → break (immediate one-shot)
          onTapBreak();
          lastTap.current = now;
        }
      }
    },
    [onTapBreak, onTapPlace]
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

// Touch-friendly hotbar: centered at bottom, tappable slots.
function TouchHotbar({
  hotbar,
  selectedSlot,
  onSelect,
}: {
  hotbar: number[];
  selectedSlot: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2">
      <div className="flex gap-1 rounded-lg border-2 border-black/50 bg-black/50 p-1 backdrop-blur">
        {hotbar.map((blockId, i) => (
          <button
            key={i}
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(i);
            }}
            className={`relative h-11 w-11 rounded-md border-2 transition active:scale-90 ${
              i === selectedSlot
                ? "border-white bg-white/20"
                : "border-white/15 bg-black/40"
            }`}
            style={{ touchAction: "none" }}
          />
        ))}
      </div>
    </div>
  );
}

function TouchBtn({
  label,
  onDown,
  onUp,
  onTap,
  className = "",
}: {
  label: string;
  onDown?: () => void;
  onUp?: () => void;
  onTap?: () => void;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        onDown?.();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        setActive(false);
        onUp?.();
        onTap?.();
      }}
      onPointerCancel={() => {
        setActive(false);
        onUp?.();
      }}
      onPointerLeave={() => {
        if (active) {
          setActive(false);
          onUp?.();
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
