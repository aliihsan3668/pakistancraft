"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Touch controls for phones & iPads.
// Uses refs inside effects so window listeners never churn on parent re-render.
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
      <LookPad onLook={onLook} onTapBreak={onTapBreak} onTapPlace={onPlace} />
      {/* Action buttons — right side */}
      <div className="pointer-events-auto absolute bottom-[100px] right-3 flex flex-col gap-2">
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
      {/* Jump (ascend) + Sprint + Descend — left of actions */}
      <div className="pointer-events-auto absolute bottom-[100px] right-[162px] flex flex-col gap-2">
        <TouchBtn
          label="⇪"
          onDown={() => onSprint(true)}
          onUp={() => onSprint(false)}
          className="bg-cyan-700/85 h-[50px] w-[50px] text-xl"
        />
        <TouchBtn
          label="▲"
          onDown={() => onJump(true)}
          onUp={() => onJump(false)}
          className="bg-indigo-700/90 h-[68px] w-[68px] text-2xl"
        />
      </div>
      {/* Descend button — below jump, for fly mode */}
      <div className="pointer-events-auto absolute bottom-[100px] right-[232px]">
        <TouchBtn
          label="▼"
          onDown={() => onSneak(true)}
          onUp={() => onSneak(false)}
          className="bg-purple-700/90 h-[50px] w-[50px] text-xl"
        />
      </div>
      {/* Touch hotbar */}
      <TouchHotbar
        hotbar={hotbar}
        selectedSlot={selectedSlot}
        onSelect={onSelectSlot}
      />
    </div>
  );
}

// Dynamic joystick — uses refs so window listeners are added ONCE.
function DynamicJoystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const baseRef = useRef<{ x: number; y: number } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });
  const RADIUS = 60;

  const updateKnob = useCallback((cx: number, cy: number) => {
    const b = baseRef.current;
    if (!b) return;
    let dx = cx - b.x;
    let dy = cy - b.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) {
      setKnob({ x: 0, y: 0 });
      onMoveRef.current(0, 0);
      return;
    }
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    onMoveRef.current(dx / RADIUS, -dy / RADIUS);
  }, []);

  // Window listeners added ONCE (empty deps) — uses refs for callbacks
  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      e.preventDefault();
      updateKnob(e.clientX, e.clientY);
    };
    const onUpEvt = (e: PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      touchId.current = null;
      baseRef.current = null;
      setBase(null);
      setKnob({ x: 0, y: 0 });
      onMoveRef.current(0, 0);
    };
    window.addEventListener("pointermove", onMoveEvt, { passive: false });
    window.addEventListener("pointerup", onUpEvt);
    window.addEventListener("pointercancel", onUpEvt);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUpEvt);
      window.removeEventListener("pointercancel", onUpEvt);
    };
  }, [updateKnob]);

  const start = useCallback(
    (e: React.PointerEvent) => {
      if (e.clientX > window.innerWidth * 0.45) return;
      if (touchId.current !== null) return;
      e.preventDefault();
      touchId.current = e.pointerId;
      baseRef.current = { x: e.clientX, y: e.clientY };
      setBase({ x: e.clientX, y: e.clientY });
      updateKnob(e.clientX, e.clientY);
    },
    [updateKnob]
  );

  return (
    <div
      onPointerDown={start}
      className="pointer-events-auto absolute bottom-0 left-0 top-0"
      style={{ width: "45%", touchAction: "none" }}
    >
      {base && (
        <>
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-black/30 backdrop-blur"
            style={{
              left: base.x - RADIUS,
              top: base.y - RADIUS,
              width: RADIUS * 2,
              height: RADIUS * 2,
            }}
          />
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/50 bg-white/30 backdrop-blur"
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

// Look pad — uses refs so window listeners are added ONCE (no churn).
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
  // refs to callbacks so the effect never re-runs
  const onLookRef = useRef(onLook);
  const onTapBreakRef = useRef(onTapBreak);
  const onTapPlaceRef = useRef(onTapPlace);
  useEffect(() => {
    onLookRef.current = onLook;
    onTapBreakRef.current = onTapBreak;
    onTapPlaceRef.current = onTapPlace;
  });

  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      moved.current += Math.abs(dx) + Math.abs(dy);
      onLookRef.current(dx, dy);
    };
    const onUpEvt = (e: PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      touchId.current = null;
      const dt = performance.now() - startTime.current;
      // quick tap without much movement → action
      if (moved.current < 12 && dt < 300) {
        const now = performance.now();
        if (now - lastTap.current < 350) {
          // double tap → place
          onTapPlaceRef.current();
          lastTap.current = 0;
        } else {
          // single tap → break
          onTapBreakRef.current();
          lastTap.current = now;
        }
      }
    };
    window.addEventListener("pointermove", onMoveEvt, { passive: false });
    window.addEventListener("pointerup", onUpEvt);
    window.addEventListener("pointercancel", onUpEvt);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUpEvt);
      window.removeEventListener("pointercancel", onUpEvt);
    };
    // EMPTY deps — listeners added once, never churn
  }, []);

  const start = useCallback((e: React.PointerEvent) => {
    if (touchId.current !== null) return;
    e.preventDefault();
    touchId.current = e.pointerId;
    last.current = { x: e.clientX, y: e.clientY };
    startTime.current = performance.now();
    startPos.current = { x: e.clientX, y: e.clientY };
    moved.current = 0;
  }, []);

  return (
    <div
      onPointerDown={start}
      className="pointer-events-auto absolute bottom-0 right-0 top-0"
      style={{ width: "55%", touchAction: "none" }}
    />
  );
}

// Touch-friendly hotbar
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
          >
            <span className="absolute bottom-0 right-0.5 font-mono text-[8px] text-white/60">
              {i + 1}
            </span>
          </button>
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
