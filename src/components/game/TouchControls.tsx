"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOCKS } from "@/lib/game/blocks";
import { makeBlockIcon } from "@/lib/game/icons";

// Touch controls using NATIVE touch events for maximum iOS Safari compatibility.
// Pointer events are unreliable on older iOS Safari — touchstart/touchmove/touchend work everywhere.
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
      <TouchMoveZone onMove={onMove} />
      <TouchLookZone onLook={onLook} onTapBreak={onTapBreak} onTapPlace={onPlace} />
      {/* Action buttons */}
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
      {/* Jump + Sprint + Descend */}
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
      <div className="pointer-events-auto absolute bottom-[100px] right-[232px]">
        <TouchBtn
          label="▼"
          onDown={() => onSneak(true)}
          onUp={() => onSneak(false)}
          className="bg-purple-700/90 h-[50px] w-[50px] text-xl"
        />
      </div>
      {/* Touch hotbar with block icons */}
      <TouchHotbar
        hotbar={hotbar}
        selectedSlot={selectedSlot}
        onSelect={onSelectSlot}
      />
    </div>
  );
}

// Movement zone (left 45%) — uses native touch events
function TouchMoveZone({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const baseRef = useRef<{ x: number; y: number } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; });
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

  useEffect(() => {
    const zone = (e: TouchEvent) => {
      // Only handle touches that start on the left 45%
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX <= window.innerWidth * 0.45) {
          if (e.type === "touchstart" && touchId.current === null) {
            touchId.current = t.identifier;
            baseRef.current = { x: t.clientX, y: t.clientY };
            setBase({ x: t.clientX, y: t.clientY });
            updateKnob(t.clientX, t.clientY);
          }
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchId.current) {
          e.preventDefault();
          updateKnob(t.clientX, t.clientY);
          break;
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
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
    };
    window.addEventListener("touchstart", zone, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", zone);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [updateKnob]);

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 top-0"
      style={{ width: "45%", touchAction: "none" }}
    >
      {base && (
        <>
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-black/30"
            style={{ left: base.x - RADIUS, top: base.y - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }}
          />
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/50 bg-white/30"
            style={{ left: base.x - 26 + knob.x, top: base.y - 26 + knob.y, width: 52, height: 52 }}
          />
        </>
      )}
    </div>
  );
}

// Look zone (right 55%) — uses native touch events
function TouchLookZone({
  onLook,
  onTapBreak,
  onTapPlace,
}: {
  onLook: (dx: number, dy: number) => void;
  onTapBreak: () => void;
  onTapPlace: () => void;
}) {
  const touchId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const startTime = useRef(0);
  const moved = useRef(0);
  const lastTap = useRef(0);
  const onLookRef = useRef(onLook);
  const onTapBreakRef = useRef(onTapBreak);
  const onTapPlaceRef = useRef(onTapPlace);
  useEffect(() => {
    onLookRef.current = onLook;
    onTapBreakRef.current = onTapBreak;
    onTapPlaceRef.current = onTapPlace;
  });

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        // Only handle touches on the right 55%
        if (t.clientX > window.innerWidth * 0.45 && touchId.current === null) {
          touchId.current = t.identifier;
          last.current = { x: t.clientX, y: t.clientY };
          startTime.current = performance.now();
          moved.current = 0;
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchId.current) {
          e.preventDefault();
          const dx = t.clientX - last.current.x;
          const dy = t.clientY - last.current.y;
          last.current = { x: t.clientX, y: t.clientY };
          moved.current += Math.abs(dx) + Math.abs(dy);
          onLookRef.current(dx, dy);
          break;
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchId.current) {
          touchId.current = null;
          const dt = performance.now() - startTime.current;
          // Quick tap without much movement → action
          if (moved.current < 15 && dt < 350) {
            const now = performance.now();
            if (now - lastTap.current < 400) {
              // Double tap → place
              onTapPlaceRef.current();
              lastTap.current = 0;
            } else {
              // Single tap → break
              onTapBreakRef.current();
              lastTap.current = now;
            }
          }
          break;
        }
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      className="pointer-events-auto absolute bottom-0 right-0 top-0"
      style={{ width: "55%", touchAction: "none" }}
    />
  );
}

// Touch hotbar with ACTUAL BLOCK ICONS
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
      <div className="flex gap-1 rounded-lg border-2 border-black/50 bg-black/60 p-1 backdrop-blur">
        {hotbar.map((blockId, i) => (
          <button
            key={i}
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(i);
            }}
            className={`relative h-11 w-11 overflow-hidden rounded-md border-2 transition active:scale-90 ${
              i === selectedSlot
                ? "border-white bg-white/20"
                : "border-white/15 bg-black/40"
            }`}
            style={{ touchAction: "none" }}
          >
            <HotbarBlockIcon blockId={blockId} />
            <span className="absolute bottom-0 right-0.5 font-mono text-[8px] text-white/70">
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
      <div
        className="absolute inset-1 rounded"
        style={{ background: BLOCKS[blockId]?.color ?? "#888" }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="pointer-events-none absolute inset-0 m-auto"
      style={{ width: 40, height: 40, imageRendering: "pixelated" }}
      draggable={false}
    />
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
  const activeRef = useRef(false);
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        activeRef.current = true;
        setActive(true);
        onDown?.();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        activeRef.current = false;
        setActive(false);
        onUp?.();
        onTap?.();
      }}
      onPointerCancel={() => {
        if (activeRef.current) {
          activeRef.current = false;
          setActive(false);
          onUp?.();
        }
      }}
      onPointerLeave={() => {
        if (activeRef.current) {
          activeRef.current = false;
          setActive(false);
          onUp?.();
        }
      }}
      className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white/30 font-bold text-white shadow-lg backdrop-blur transition active:scale-90 ${
        active ? "scale-90 bg-white/40" : ""
      } ${className}`}
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
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
