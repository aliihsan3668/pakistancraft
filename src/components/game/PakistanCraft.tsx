"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Engine, CREATIVE_PALETTE, type HudState } from "@/lib/game/engine";
import { BLOCKS } from "@/lib/game/blocks";
import { makeBlockIcon } from "@/lib/game/icons";
import { hashSeed } from "@/lib/game/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeartIcon, FoodIcon, SunIcon, MoonIcon } from "./icons";

type Phase = "start" | "playing";

const SEED_PRESETS = [
  { label: "Lahore", seed: "lahore" },
  { label: "Karachi Coast", seed: "karachi" },
  { label: "Hunza Valley", seed: "hunza" },
  { label: "Thar Desert", seed: "thar" },
  { label: "Swat Forests", seed: "swat" },
];

export default function PakistanCraft() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("start");
  const [hud, setHud] = useState<HudState | null>(null);
  const [seed, setSeed] = useState("");
  const [showInventory, setShowInventory] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback((seedStr: string) => {
    setSeed(seedStr);
    setHud(null);
    setError(null);
    setPaused(false);
    setPhase("playing");
  }, []);

  // mount engine when entering playing phase
  useEffect(() => {
    if (phase !== "playing" || !canvasRef.current) return;
    const seedNum = seed ? hashSeed(seed) : Math.floor(Math.random() * 1e9);
    let eng: Engine | null = null;
    try {
      eng = new Engine(canvasRef.current, {
        seed: seedNum,
        onHud: (s) => setHud(s),
        onError: (m) => setError(m),
      });
    } catch (e) {
      const msg =
        "Failed to start the game engine. " +
        (e instanceof Error ? e.message : String(e));
      // defer so we don't setState synchronously inside the effect body
      queueMicrotask(() => setError(msg));
      return;
    }
    engineRef.current = eng;
    // Defer heavy world generation so the "Generating…" loading screen
    // actually paints before the main thread blocks.
    const raf2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          eng?.start();
        } catch (e) {
          setError(
            "Failed to generate world. " +
              (e instanceof Error ? e.message : String(e))
          );
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf2);
      eng?.dispose();
      engineRef.current = null;
    };
  }, [phase, seed]);

  // 'E' toggles inventory, 'Escape' pauses / closes inventory
  useEffect(() => {
    if (phase !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyE") {
        e.preventDefault();
        setShowInventory((v) => {
          const next = !v;
          const eng = engineRef.current;
          if (eng) {
            eng.inputEnabled = !next;
            if (next && document.pointerLockElement) document.exitPointerLock();
          }
          if (next) setPaused(false);
          return next;
        });
      } else if (e.code === "Escape") {
        if (showInventory) {
          setShowInventory(false);
          const eng = engineRef.current;
          if (eng) eng.inputEnabled = true;
        } else {
          setPaused((p) => {
            const next = !p;
            const eng = engineRef.current;
            if (eng) eng.inputEnabled = !next;
            if (next && document.pointerLockElement) document.exitPointerLock();
            return next;
          });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, showInventory]);

  const closeInventory = useCallback(() => {
    setShowInventory(false);
    const eng = engineRef.current;
    if (eng) {
      eng.inputEnabled = true;
      eng.requestPointerLock();
    }
  }, []);

  const resume = useCallback(() => {
    setPaused(false);
    const eng = engineRef.current;
    if (eng) {
      eng.inputEnabled = true;
      eng.requestPointerLock();
    }
  }, []);

  const onCanvasClick = useCallback(() => {
    if (showInventory || paused) return;
    // best-effort pointer lock; the game is fully playable via
    // drag-to-look if the iframe blocks pointer lock.
    engineRef.current?.requestPointerLock();
  }, [showInventory, paused]);

  const pickBlock = useCallback(
    (blockId: number) => {
      const eng = engineRef.current;
      if (!eng || !hud) return;
      eng.setHotbarSlot(eng.selected, blockId);
    },
    [hud]
  );

  if (error) {
    return <ErrorScreen message={error} onBack={() => setPhase("start")} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      {/* Canvas mounted during playing */}
      {phase === "playing" && (
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="absolute inset-0 block h-full w-full touch-none"
        />
      )}

      {phase === "start" && <StartScreen onPlay={startGame} />}

      {phase === "playing" && !hud && <LoadingScreen />}

      {phase === "playing" && hud && (
        <>
          <Hud hud={hud} />
          {paused && <PauseOverlay onResume={resume} />}
          {showInventory && (
            <Inventory
              selectedSlot={hud.selectedSlot}
              hotbar={hud.hotbar}
              onPick={pickBlock}
              onClose={closeInventory}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------- Error Screen ----------
function ErrorScreen({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#1a0a0a] p-6">
      <div className="max-w-md rounded-xl border border-red-500/30 bg-black/50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-2xl">
          ⚠
        </div>
        <h2 className="text-xl font-bold text-red-300">Couldn&apos;t start game</h2>
        <p className="mt-2 text-sm text-white/70">{message}</p>
        <Button
          onClick={onBack}
          className="mt-5 bg-[#e8c14a] font-bold text-[#01411C] hover:bg-[#f0d060]"
        >
          ← Back to menu
        </Button>
      </div>
    </div>
  );
}

// ---------- Start Screen ----------
function StartScreen({ onPlay }: { onPlay: (seed: string) => void }) {
  const [seed, setSeed] = useState("");
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto">
      {/* Pakistan-flag-inspired backdrop */}
      <div className="absolute inset-0 bg-[#01411C]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_25px,transparent_25px),linear-gradient(0deg,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_25px,transparent_25px)] [background-size:25px_25px]" />
      {/* white crescent accent */}
      <div className="pointer-events-none absolute right-[8%] top-[12%] h-40 w-40 rounded-full border-[14px] border-white/15" />
      <div className="pointer-events-none absolute right-[14%] top-[14%] h-28 w-28 rounded-full bg-[#01411C]" />
      {/* voxel floor */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 [background-image:linear-gradient(135deg,#0a3d20_25%,transparent_25%),linear-gradient(225deg,#0a3d20_25%,transparent_25%),linear-gradient(45deg,#0a3d20_25%,transparent_25%),linear-gradient(315deg,#0a3d20_25%,transparent_25%)] [background-size:48px_48px] opacity-40" />

      <div className="relative z-10 flex flex-col items-center px-4 py-10 text-center">
        {/* Logo: stacked voxel cubes */}
        <div className="mb-4 flex items-end gap-1.5">
          {[
            ["#4f8a3a", "#3c6e2a", 64],
            ["#b8895a", "#8a6a3a", 80],
            ["#9c3b22", "#7a2a18", 56],
            ["#2f6fd0", "#1f4a8a", 72],
            ["#e8c14a", "#b8902a", 60],
          ].map(([c1, c2, h], i) => (
            <div
              key={i}
              className="w-9 rounded-sm shadow-lg"
              style={{
                height: `${h}px`,
                background: `linear-gradient(180deg, ${c1} 0 18%, ${c2} 18% 100%)`,
                border: `2px solid rgba(0,0,0,0.3)`,
              }}
            />
          ))}
        </div>

        <h1
          className="text-5xl font-black tracking-tight text-white sm:text-7xl"
          style={{ textShadow: "4px 4px 0 rgba(0,0,0,0.4)" }}
        >
          Pakistan<span className="text-[#e8c14a]">Craft</span>
        </h1>
        <p className="mt-2 font-mono text-lg text-white/80 sm:text-2xl" dir="rtl">
          پاکستان کرافٹ
        </p>
        <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
          An original voxel sandbox set across Pakistan — explore Punjab plains,
          Sindh deserts, Balochistan mountains, Khyber forests &amp; the Gilgit
          snow peaks. Build, mine, and craft your own corner of the homeland.
        </p>

        <div className="mt-8 w-full max-w-md rounded-xl border border-white/15 bg-black/30 p-5 backdrop-blur">
          <label className="mb-2 block text-left text-xs font-semibold uppercase tracking-wider text-white/60">
            World Seed
          </label>
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="enter a seed (or leave blank for random)"
            className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {SEED_PRESETS.map((p) => (
              <button
                key={p.seed}
                onClick={() => setSeed(p.seed)}
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/15"
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button
            onClick={() => onPlay(seed)}
            className="mt-5 w-full bg-[#e8c14a] text-lg font-bold text-[#01411C] hover:bg-[#f0d060]"
            size="lg"
          >
            ▶ Play
          </Button>
        </div>

        <div className="mt-6 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-1 text-left text-xs text-white/60 sm:grid-cols-3">
          <Control k="WASD" v="Move" />
          <Control k="Drag / Mouse" v="Look around" />
          <Control k="Arrows" v="Look (alt)" />
          <Control k="Space" v="Jump / Swim" />
          <Control k="Shift" v="Sprint" />
          <Control k="Ctrl" v="Descend (fly)" />
          <Control k="F" v="Toggle fly" />
          <Control k="Click" v="Break block" />
          <Control k="R-Click" v="Place block" />
          <Control k="1–9 / Wheel" v="Select hotbar" />
          <Control k="E" v="Inventory" />
          <Control k="Esc" v="Pause" />
        </div>

        <p className="mt-4 max-w-lg rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
          Tip: if your mouse can&apos;t lock (common in preview iframes), just
          drag to look, click to break, right-click to place. Use arrow keys to
          look around too.
        </p>

        <p className="mt-8 max-w-lg text-[11px] leading-relaxed text-white/40">
          A browser-based voxel sandbox built with Three.js. Procedural infinite
          world, 13 biomes, day/night cycle, trees, villages &amp; mosques.
          Single-player creative mode.
        </p>
      </div>
    </div>
  );
}

function Control({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">
        {k}
      </span>
      <span>{v}</span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#01411C] text-white">
      <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[#e8c14a]" />
      <p className="font-mono text-base text-white/80">Generating Pakistan…</p>
      <p className="mt-2 font-mono text-[11px] text-white/40">
        carving biomes, rivers, villages &amp; mosques
      </p>
      <p className="mt-6 max-w-xs text-center text-[11px] leading-relaxed text-white/30">
        First load builds the world seed — this only happens once per world.
      </p>
    </div>
  );
}

// ---------- Pause Overlay ----------
function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onResume}
    >
      <div
        className="rounded-2xl border border-white/15 bg-[#01411C]/90 p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-black text-white">Paused</h2>
        <p className="mt-2 text-sm text-white/70">
          Press Resume to keep playing
        </p>
        <Button
          onClick={onResume}
          className="mt-5 bg-[#e8c14a] font-bold text-[#01411C] hover:bg-[#f0d060]"
        >
          Resume
        </Button>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-[11px] text-white/60">
          <Control k="WASD" v="Move" />
          <Control k="Drag" v="Look around" />
          <Control k="Arrows" v="Look (alt)" />
          <Control k="Space" v="Jump" />
          <Control k="Shift" v="Sprint" />
          <Control k="F" v="Fly" />
          <Control k="Click" v="Break" />
          <Control k="R-Click" v="Place" />
          <Control k="E" v="Inventory" />
          <Control k="1–9" v="Hotbar" />
        </div>
      </div>
    </div>
  );
}

// ---------- HUD ----------
function Hud({ hud }: { hud: HudState }) {
  const hours = Math.floor(hud.timeOfDay * 24);
  const minutes = Math.floor((hud.timeOfDay * 24 * 60) % 60);
  const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
  const isDay = hud.timeOfDay > 0.25 && hud.timeOfDay < 0.75;
  const hearts = Math.ceil(hud.health / 2);
  const foods = Math.ceil(hud.hunger / 2);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-5 w-5">
          <div className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-white/80 mix-blend-difference" />
          <div className="absolute top-1/2 left-0 h-0.5 w-5 -translate-y-1/2 bg-white/80 mix-blend-difference" />
        </div>
      </div>

      {/* Top-left info panel */}
      <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2 font-mono text-[11px] leading-relaxed text-white backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-bold text-emerald-300">{hud.biome}</span>
          <span className="text-white/50" dir="rtl">
            {hud.biomeUrdu}
          </span>
        </div>
        <div className="mt-1 text-white/80">
          X {hud.x.toFixed(1)}  Y {hud.y.toFixed(1)}  Z {hud.z.toFixed(1)}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-white/70">
          {isDay ? <SunIcon /> : <MoonIcon />}
          <span>{timeStr}</span>
          <span className="text-white/40">·</span>
          <span>{hud.fps} fps</span>
          {hud.flying && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-amber-300">FLY</span>
            </>
          )}
        </div>
      </div>

      {/* Top-right hint */}
      <div className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[11px] text-white/70 backdrop-blur">
        <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5">E</span>{" "}
        Inventory{"  "}
        <span className="ml-2 rounded border border-white/20 bg-white/10 px-1.5 py-0.5">Esc</span>{" "}
        Pause
      </div>

      {/* Drag-mode hint (shown when pointer lock isn't active) */}
      {!hud.pointerLocked && (
        <div className="absolute left-1/2 top-14 -translate-x-1/2 rounded-full border border-amber-400/30 bg-black/60 px-4 py-1.5 text-center font-mono text-[11px] text-amber-200/90 backdrop-blur">
          drag to look · click to break · right-click to place · arrows to look
        </div>
      )}

      {/* Bottom: health, hunger, hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {/* stats */}
        <div className="flex gap-4">
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <HeartIcon key={i} filled={i < hearts} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <FoodIcon key={i} filled={i < foods} />
            ))}
          </div>
        </div>
        {/* hotbar */}
        <Hotbar hud={hud} />
      </div>
    </div>
  );
}

function Hotbar({ hud }: { hud: HudState }) {
  return (
    <div className="flex gap-1 rounded-lg border-2 border-black/40 bg-black/40 p-1 backdrop-blur">
      {hud.hotbar.map((blockId, i) => {
        const isSel = i === hud.selectedSlot;
        return (
          <div
            key={i}
            className={`relative h-12 w-12 rounded-md border-2 ${
              isSel
                ? "border-white bg-white/15"
                : "border-white/15 bg-black/40"
            }`}
          >
            <BlockIcon blockId={blockId} size={44} />
            <span className="absolute bottom-0 right-0.5 font-mono text-[9px] text-white/70">
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BlockIcon({ blockId, size }: { blockId: number; size: number }) {
  const src = useMemo(() => {
    try {
      return makeBlockIcon(blockId, size + 8);
    } catch {
      return "";
    }
  }, [blockId, size]);
  if (!src) {
    return (
      <div
        className="m-0.5 rounded"
        style={{
          width: size - 4,
          height: size - 4,
          background: BLOCKS[blockId]?.color ?? "#888",
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={BLOCKS[blockId]?.name ?? ""}
      className="pointer-events-none absolute inset-0 m-auto"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      draggable={false}
    />
  );
}

// ---------- Inventory ----------
function Inventory({
  selectedSlot,
  hotbar,
  onPick,
  onClose,
}: {
  selectedSlot: number;
  hotbar: number[];
  onPick: (b: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-h-[88vh] w-[min(680px,92vw)] overflow-hidden rounded-2xl border border-white/15 bg-[#0a2a18] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">Creative Inventory</h2>
            <p className="text-xs text-white/60">
              Click a block to place it in hotbar slot{" "}
              <span className="font-mono text-amber-300">{selectedSlot + 1}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white/80 hover:bg-white/10 hover:text-white"
          >
            Close ✕
          </Button>
        </div>

        {/* current hotbar preview */}
        <div className="flex justify-center gap-1 border-b border-white/10 px-5 py-3">
          {hotbar.map((b, i) => (
            <div
              key={i}
              className={`relative h-11 w-11 rounded-md border-2 ${
                i === selectedSlot
                  ? "border-amber-400 bg-white/15"
                  : "border-white/15 bg-black/40"
              }`}
            >
              <BlockIcon blockId={b} size={40} />
              <span className="absolute bottom-0 right-0.5 font-mono text-[9px] text-white/70">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* palette grid */}
        <div className="max-h-[52vh] overflow-y-auto p-4">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {CREATIVE_PALETTE.map((b) => (
              <button
                key={b}
                onClick={() => onPick(b)}
                title={BLOCKS[b]?.name}
                className="group relative flex aspect-square items-center justify-center rounded-md border border-white/10 bg-black/40 transition hover:border-amber-400 hover:bg-white/10"
              >
                <BlockIcon blockId={b} size={42} />
                <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 font-mono text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  {BLOCKS[b]?.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
