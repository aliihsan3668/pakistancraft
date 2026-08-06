"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCKS } from "@/lib/game/blocks";
import { makeBlockIcon } from "@/lib/game/icons";

// Minecraft PE-style touch controls.
// Left half: movement joystick (appears where you touch).
// Right half: look (drag), tap to PLACE, hold to BREAK.
// Bottom center: hotbar (tap to select).
// Right side: jump + fly up/down buttons.
export function TouchControls({
  onMove,
  onLook,
  onJump,
  onSprint,
  onSneak,
  onTapPlace,
  onHoldBreakStart,
  onHoldBreakEnd,
  onFly,
  onInventory,
  hotbar,
  selectedSlot,
  onSelectSlot,
  flying,
}: {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onJump: (down: boolean) => void;
  onSprint: (down: boolean) => void;
  onSneak: (down: boolean) => void;
  onTapPlace: () => void;
  onHoldBreakStart: () => void;
  onHoldBreakEnd: () => void;
  onFly: () => void;
  onInventory: () => void;
  hotbar: number[];
  selectedSlot: number;
  onSelectSlot: (i: number) => void;
  flying: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-20 select-none"
      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <MoveJoystick onMove={onMove} />
      <LookBreakPlaceZone
        onLook={onLook}
        onTapPlace={onTapPlace}
        onHoldBreakStart={onHoldBreakStart}
        onHoldBreakEnd={onHoldBreakEnd}
      />
      {/* Jump / Fly up button */}
      <div className="absolute bottom-[88px] right-3 z-30">
        <HoldBtn
          label="▲"
          onDown={() => onJump(true)}
          onUp={() => onJump(false)}
          className="bg-indigo-700/90 h-[64px] w-[64px] text-2xl"
        />
      </div>
      {/* Fly down button (only when flying) */}
      {flying && (
        <div className="absolute bottom-[88px] right-[78px] z-30">
          <HoldBtn
            label="▼"
            onDown={() => onSneak(true)}
            onUp={() => onSneak(false)}
            className="bg-purple-700/90 h-[64px] w-[64px] text-2xl"
          />
        </div>
      )}
      {/* Inventory + Fly toggle (top right) */}
      <div className="absolute right-3 top-14 z-30 flex gap-2">
        <TapBtn label="🎒" onTap={onInventory} className="bg-slate-700/85" />
        <TapBtn label="✈" onTap={onFly} className="bg-amber-600/85" />
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

// Movement joystick — left half of screen. Appears where you touch.
function MoveJoystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const baseRef = useRef<{ x: number; y: number } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; });
  const RADIUS = 55;

  const update = useCallback((cx: number, cy: number) => {
    const b = baseRef.current;
    if (!b) return;
    let dx = cx - b.x;
    let dy = cy - b.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) {
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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const t = e.changedTouches[0];
    if (t.clientX > window.innerWidth * 0.45) return; // only left half
    e.preventDefault();
    touchId.current = t.identifier;
    baseRef.current = { x: t.clientX, y: t.clientY };
    setBase({ x: t.clientX, y: t.clientY });
    update(t.clientX, t.clientY);
  }, [update]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier === touchId.current) {
        e.preventDefault();
        update(t.clientX, t.clientY);
        break;
      }
    }
  }, [update]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId.current) {
        touchId.current = null;
        baseRef.current = null;
        setBase(null);
        setKnob({ x: 0, y: 0 });
        onMoveRef.current(0, 0);
        break;
      }
    }
  }, []);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className="absolute bottom-0 left-0 top-0"
      style={{ width: "45%", touchAction: "none" }}
    >
      {base && (
        <>
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-black/30"
            style={{ left: base.x - RADIUS, top: base.y - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }}
          />
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/60 bg-white/40"
            style={{ left: base.x - 24 + knob.x, top: base.y - 24 + knob.y, width: 48, height: 48 }}
          />
        </>
      )}
    </div>
  );
}

// Look + break + place zone — right 55% of screen.
// Drag = look. Quick tap (< 250ms, < 15px move) = place. Hold (> 250ms, < 15px move) = break.
function LookBreakPlaceZone({
  onLook,
  onTapPlace,
  onHoldBreakStart,
  onHoldBreakEnd,
}: {
  onLook: (dx: number, dy: number) => void;
  onTapPlace: () => void;
  onHoldBreakStart: () => void;
  onHoldBreakEnd: () => void;
}) {
  const touchId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0 });
  const startTime = useRef(0);
  const moved = useRef(0);
  const isBreaking = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const onLookRef = useRef(onLook);
  const onTapPlaceRef = useRef(onTapPlace);
  const onHoldBreakStartRef = useRef(onHoldBreakStart);
  const onHoldBreakEndRef = useRef(onHoldBreakEnd);
  useEffect(() => {
    onLookRef.current = onLook;
    onTapPlaceRef.current = onTapPlace;
    onHoldBreakStartRef.current = onHoldBreakStart;
    onHoldBreakEndRef.current = onHoldBreakEnd;
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchId.current !== null) return;
    const t = e.changedTouches[0];
    if (t.clientX <= window.innerWidth * 0.45) return; // only right half
    e.preventDefault();
    touchId.current = t.identifier;
    last.current = { x: t.clientX, y: t.clientY };
    start.current = { x: t.clientX, y: t.clientY };
    startTime.current = performance.now();
    moved.current = 0;
    isBreaking.current = false;
    // After 250ms of holding without much movement, start breaking
    holdTimer.current = window.setTimeout(() => {
      if (touchId.current !== null && moved.current < 15) {
        isBreaking.current = true;
        onHoldBreakStartRef.current();
      }
    }, 250);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier === touchId.current) {
        e.preventDefault();
        const dx = t.clientX - last.current.x;
        const dy = t.clientY - last.current.y;
        last.current = { x: t.clientX, y: t.clientY };
        moved.current += Math.abs(dx) + Math.abs(dy);
        // If moved too much, cancel the hold-to-break timer
        if (moved.current > 15 && holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
          if (isBreaking.current) {
            isBreaking.current = false;
            onHoldBreakEndRef.current();
          }
        }
        onLookRef.current(dx, dy);
        break;
      }
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId.current) {
        touchId.current = null;
        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
        if (isBreaking.current) {
          isBreaking.current = false;
          onHoldBreakEndRef.current();
        } else {
          // Quick tap without much movement → place block
          const dt = performance.now() - startTime.current;
          if (moved.current < 15 && dt < 250) {
            onTapPlaceRef.current();
          }
        }
        break;
      }
    }
  }, []);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className="absolute bottom-0 right-0 top-0"
      style={{ width: "55%", touchAction: "none" }}
    />
  );
}

// Touch hotbar with block icons — always visible at bottom center
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
    <div className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2">
      <div className="flex gap-1 rounded-lg border-2 border-black/60 bg-black/60 p-1 backdrop-blur">
        {hotbar.map((blockId, i) => (
          <button
            key={i}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(i);
            }}
            className={`relative h-12 w-12 overflow-hidden rounded-md border-2 transition active:scale-90 ${
              i === selectedSlot
                ? "border-white bg-white/25"
                : "border-white/20 bg-black/50"
            }`}
            style={{ touchAction: "none" }}
          >
            <HotbarBlockIcon blockId={blockId} />
            <span className="absolute bottom-0 right-0.5 font-mono text-[8px] text-white/80">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HotbarBlockIcon({ blockId }: { blockId: number }) {
  const src = useMemo(() => {
    try { return makeBlockIcon(blockId, 48); } catch { return ""; }
  }, [blockId]);
  if (!src) {
    return (
      <div className="absolute inset-1 rounded" style={{ background: BLOCKS[blockId]?.color ?? "#888" }} />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="pointer-events-none absolute inset-0 m-auto"
      style={{ width: 42, height: 42, imageRendering: "pixelated" }}
      draggable={false}
    />
  );
}

// Hold button (for jump, fly up/down)
function HoldBtn({
  label,
  onDown,
  onUp,
  className = "",
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  return (
    <button
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activeRef.current = true;
        setActive(true);
        onDown();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeRef.current) {
          activeRef.current = false;
          setActive(false);
          onUp();
        }
      }}
      onTouchCancel={() => {
        if (activeRef.current) {
          activeRef.current = false;
          setActive(false);
          onUp();
        }
      }}
      className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 font-bold text-white shadow-lg backdrop-blur transition active:scale-90 ${
        active ? "scale-90 bg-white/50" : ""
      } ${className}`}
      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      {label}
    </button>
  );
}

// Tap button (for inventory, fly toggle)
function TapBtn({
  label,
  onTap,
  className = "",
}: {
  label: string;
  onTap: () => void;
  className?: string;
}) {
  return (
    <button
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTap();
      }}
      className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/30 font-bold text-white shadow-lg backdrop-blur transition active:scale-90 ${className}`}
      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
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
