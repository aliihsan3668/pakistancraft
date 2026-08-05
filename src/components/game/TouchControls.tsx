"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// On-screen touch controls for mobile / iframe play.
// Left: virtual joystick for movement.
// Right: look pad (drag to look).
// Buttons: jump, break, place, fly.
export function TouchControls({
  onMove,
  onLook,
  onJump,
  onSprint,
  onSneak,
  onBreak,
  onPlace,
  onFly,
}: {
  onMove: (x: number, y: number) => void; // -1..1
  onLook: (dx: number, dy: number) => void; // pixel deltas
  onJump: (down: boolean) => void;
  onSprint: (down: boolean) => void;
  onSneak: (down: boolean) => void;
  onBreak: (down: boolean) => void;
  onPlace: (down: boolean) => void;
  onFly: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <Joystick onMove={onMove} />
      <LookPad onLook={onLook} />
      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <TouchBtn label="FLY" onTap={onFly} className="bg-amber-600/70" />
          <TouchBtn
            label="⇪"
            onDown={onSprint}
            className="bg-cyan-700/70"
          />
        </div>
        <div className="flex gap-2">
          <TouchBtn
            label="⛏"
            onDown={onBreak}
            className="bg-red-700/80 h-16 w-16 text-2xl"
          />
          <TouchBtn
            label="▦"
            onDown={onPlace}
            className="bg-emerald-700/80 h-16 w-16 text-2xl"
          />
        </div>
        <TouchBtn
          label="JUMP"
          onDown={onJump}
          className="bg-indigo-700/80 w-full"
        />
      </div>
    </div>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });

  const radius = 55;

  const updateKnob = useCallback(
    (cx: number, cy: number) => {
      let dx = cx - center.current.x;
      let dy = cy - center.current.y;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      setKnob({ x: dx, y: dy });
      onMove(dx / radius, -dy / radius);
    },
    [onMove]
  );

  const start = useCallback(
    (e: React.PointerEvent) => {
      const rect = ref.current!.getBoundingClientRect();
      center.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      touchId.current = e.pointerId;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActive(true);
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
      setActive(false);
      setKnob({ x: 0, y: 0 });
      onMove(0, 0);
    },
    [onMove]
  );

  return (
    <div
      ref={ref}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="pointer-events-auto absolute bottom-6 left-6 flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/20 bg-black/30 backdrop-blur"
      style={{ touchAction: "none" }}
    >
      <div
        className="h-14 w-14 rounded-full border-2 border-white/40 bg-white/20"
        style={{
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transition: active ? "none" : "transform 0.15s ease-out",
        }}
      />
    </div>
  );
}

function LookPad({ onLook }: { onLook: (dx: number, dy: number) => void }) {
  const last = useRef({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);

  const start = useCallback((e: React.PointerEvent) => {
    touchId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY };
  }, []);

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (touchId.current !== e.pointerId) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      onLook(dx, dy);
    },
    [onLook]
  );

  const end = useCallback((e: React.PointerEvent) => {
    if (touchId.current !== e.pointerId) return;
    touchId.current = null;
  }, []);

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="pointer-events-auto absolute right-2 top-2 bottom-28 left-40"
      style={{ touchAction: "none" }}
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
      className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 border-white/30 font-bold text-white backdrop-blur transition active:scale-95 ${
        active ? "scale-95 bg-white/30" : ""
      } ${className}`}
      style={{ touchAction: "none" }}
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
