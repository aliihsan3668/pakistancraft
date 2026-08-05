"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Engine,
  CREATIVE_PALETTE,
  DEFAULT_SETTINGS,
  type HudState,
} from "@/lib/game/engine";
import { BLOCKS } from "@/lib/game/blocks";
import { makeBlockIcon } from "@/lib/game/icons";
import { hashSeed } from "@/lib/game/constants";
import {
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/game/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { HeartIcon, FoodIcon, SunIcon, MoonIcon } from "./icons";
import { TouchControls, useIsTouchDevice } from "./TouchControls";
import { Minimap } from "./Minimap";

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
  const seedRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("start");
  const [hud, setHud] = useState<HudState | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [showInventory, setShowInventory] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSave, setHasSave] = useState(() =>
    typeof window !== "undefined" ? Engine.hasSave() : false
  );
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window !== "undefined" ? loadSettings() : DEFAULT_SETTINGS
  );
  const [toast, setToast] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<Engine | null>(null);
  const isTouch = useIsTouchDevice();

  // refresh save flag when returning to start screen
  useEffect(() => {
    if (phase === "start") {
      const flag = Engine.hasSave();
      queueMicrotask(() => setHasSave(flag));
    }
  }, [phase]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const startGame = useCallback(
    (seedStr: string, loadSave: boolean) => {
      const seedNum = seedStr ? hashSeed(seedStr) : Math.floor(Math.random() * 1e9);
      seedRef.current = seedNum;
      setHud(null);
      setError(null);
      setPaused(false);
      setShowSettings(false);
      setShowInventory(false);
      setPhase("playing");
      // stash whether to load save (handled in mount effect)
      if (loadSave) {
        sessionStorage.setItem("pc.loadsave", "1");
      } else {
        sessionStorage.removeItem("pc.loadsave");
      }
    },
    []
  );

  // mount engine when entering playing phase
  useEffect(() => {
    if (phase !== "playing" || !canvasRef.current) return;
    const s = loadSettings();
    queueMicrotask(() => setSettings(s));
    const wantLoad = sessionStorage.getItem("pc.loadsave") === "1";
    sessionStorage.removeItem("pc.loadsave");
    let eng: Engine | null = null;
    try {
      eng = new Engine(canvasRef.current, {
        seed: seedRef.current,
        settings: s,
        onHud: (st) => setHud(st),
        onError: (m) => setError(m),
      });
    } catch (e) {
      const msg =
        "Failed to start the game engine. " +
        (e instanceof Error ? e.message : String(e));
      queueMicrotask(() => setError(msg));
      return;
    }
    engineRef.current = eng;
    setEngineState(eng);
    const raf2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          eng?.start();
          if (wantLoad && Engine.hasSave()) {
            const r = eng.loadState();
            if (r) {
              seedRef.current = r.seed;
              showToast("World loaded");
            }
          }
        } catch (e) {
          const msg =
            "Failed to generate world. " +
            (e instanceof Error ? e.message : String(e));
          queueMicrotask(() => setError(msg));
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf2);
      eng?.dispose();
      engineRef.current = null;
      setEngineState(null);
    };
  }, [phase, showToast]);

  // keyboard: E inventory, Esc pause/settings
  useEffect(() => {
    if (phase !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyE") {
        e.preventDefault();
        if (showSettings || paused) return;
        setShowInventory((v) => {
          const next = !v;
          const eng = engineRef.current;
          if (eng) {
            eng.inputEnabled = !next;
            if (next && document.pointerLockElement) document.exitPointerLock();
          }
          return next;
        });
      } else if (e.code === "Escape") {
        if (showInventory) {
          setShowInventory(false);
          const eng = engineRef.current;
          if (eng) eng.inputEnabled = true;
        } else if (showSettings) {
          setShowSettings(false);
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
  }, [phase, showInventory, paused, showSettings]);

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

  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const onSaveGame = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const ok = eng.saveState(seedRef.current);
    if (ok) {
      setHasSave(true);
      showToast("Game saved");
    } else {
      showToast("Save failed");
    }
  }, [showToast]);

  const onQuitToMenu = useCallback(() => {
    const eng = engineRef.current;
    eng?.dispose();
    engineRef.current = null;
    setPhase("start");
    setPaused(false);
    setShowSettings(false);
    setShowInventory(false);
    setHud(null);
    setHasSave(Engine.hasSave());
  }, []);

  const onDeleteSave = useCallback(() => {
    Engine.clearSave();
    setHasSave(false);
    showToast("Save deleted");
  }, [showToast]);

  const onCanvasClick = useCallback(() => {
    if (showInventory || paused || showSettings) return;
    engineRef.current?.requestPointerLock();
  }, [showInventory, paused, showSettings]);

  const pickBlock = useCallback(
    (blockId: number) => {
      const eng = engineRef.current;
      if (!eng || !hud) return;
      eng.setHotbarSlot(eng.selected, blockId);
    },
    [hud]
  );

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    const eng = engineRef.current;
    if (eng) {
      eng.setSettings(partial);
      setSettings({ ...eng.settings });
    } else {
      const next = { ...loadSettings(), ...partial };
      saveSettings(next);
      setSettings(next);
    }
  }, []);

  if (error) {
    return <ErrorScreen message={error} onBack={() => setPhase("start")} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      {phase === "playing" && (
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="absolute inset-0 block h-full w-full touch-none"
        />
      )}

      {phase === "start" && (
        <StartScreen
          onPlay={(s) => startGame(s, false)}
          onContinue={() => startGame("", true)}
          hasSave={hasSave}
          onDeleteSave={onDeleteSave}
          settings={settings}
          onUpdateSettings={updateSettings}
        />
      )}

      {phase === "playing" && !hud && <LoadingScreen />}

      {phase === "playing" && hud && (
        <>
          <Hud hud={hud} />
          <Minimap hud={hud} engine={engineState} />
          {isTouch && !paused && !showSettings && !showInventory && (
            <TouchControls
              onMove={(x, y) => engineRef.current?.setTouchInput({ moveX: x, moveY: y })}
              onLook={(dx, dy) => engineRef.current?.setTouchInput({ lookDX: dx, lookDY: dy })}
              onJump={(d) => engineRef.current?.setTouchInput({ jump: d })}
              onSprint={(d) => engineRef.current?.setTouchInput({ sprint: d })}
              onSneak={(d) => engineRef.current?.setTouchInput({ sneak: d })}
              onBreak={(d) => engineRef.current?.setTouchInput({ breakBtn: d })}
              onPlace={(d) => engineRef.current?.setTouchInput({ placeBtn: d })}
              onFly={() => {
                const eng = engineRef.current;
                if (!eng) return;
                if (eng.player.gameMode !== "creative") eng.setGameMode("creative");
                eng.player.toggleFly();
              }}
            />
          )}
          {paused && !showSettings && (
            <PauseOverlay
              onResume={resume}
              onSettings={openSettings}
              onSave={onSaveGame}
              onQuit={onQuitToMenu}
              hasSave={hasSave}
            />
          )}
          {showSettings && (
            <SettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              onClose={closeSettings}
              inGame
            />
          )}
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

      {toast && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/15 bg-black/80 px-4 py-2 font-mono text-sm text-emerald-300 backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- Error Screen ----------
function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
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
function StartScreen({
  onPlay,
  onContinue,
  hasSave,
  onDeleteSave,
  settings,
  onUpdateSettings,
}: {
  onPlay: (seed: string) => void;
  onContinue: () => void;
  hasSave: boolean;
  onDeleteSave: () => void;
  settings: Settings;
  onUpdateSettings: (p: Partial<Settings>) => void;
}) {
  const [seed, setSeed] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-[#01411C]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_25px,transparent_25px),linear-gradient(0deg,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_25px,transparent_25px)] [background-size:25px_25px]" />
      <div className="pointer-events-none absolute right-[8%] top-[12%] h-40 w-40 rounded-full border-[14px] border-white/15" />
      <div className="pointer-events-none absolute right-[14%] top-[14%] h-28 w-28 rounded-full bg-[#01411C]" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 [background-image:linear-gradient(135deg,#0a3d20_25%,transparent_25%),linear-gradient(225deg,#0a3d20_25%,transparent_25%),linear-gradient(45deg,#0a3d20_25%,transparent_25%),linear-gradient(315deg,#0a3d20_25%,transparent_25%)] [background-size:48px_48px] opacity-40" />

      <div className="relative z-10 flex flex-col items-center px-4 py-10 text-center">
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
                animation: `pc-float 2.5s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>

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
          snow peaks. Now with ambient occlusion, dynamic weather, survival
          mode, sun/moon/stars, block-break particles, and save/load.
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
            ▶ New World
          </Button>
          {hasSave && (
            <div className="mt-2 flex gap-2">
              <Button
                onClick={onContinue}
                variant="outline"
                className="flex-1 border-white/20 bg-white/5 text-white hover:bg-white/15"
              >
                ↺ Continue Save
              </Button>
              <Button
                onClick={onDeleteSave}
                variant="ghost"
                className="text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
              >
                Delete
              </Button>
            </div>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="mt-3 w-full text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
          >
            ⚙ Settings
          </button>
        </div>

        <div className="mt-6 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-1 text-left text-xs text-white/60 sm:grid-cols-3">
          <Control k="WASD" v="Move" />
          <Control k="Drag / Mouse" v="Look around" />
          <Control k="Arrows" v="Look (alt)" />
          <Control k="Space" v="Jump / Swim" />
          <Control k="Shift" v="Sprint" />
          <Control k="Ctrl" v="Sneak / Descend" />
          <Control k="F" v="Toggle fly" />
          <Control k="G" v="Creative / Survival" />
          <Control k="R" v="Toggle rain" />
          <Control k="T / N" v="Noon / Night" />
          <Control k="H" v="Teleport to Lahore" />
          <Control k="Click" v="Break block" />
          <Control k="R-Click" v="Place block" />
          <Control k="1–9 / Wheel" v="Select hotbar" />
          <Control k="E" v="Inventory" />
          <Control k="Esc" v="Pause menu" />
        </div>

        <p className="mt-4 max-w-lg rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
          Tip: in the preview iframe, drag to look, click to break, right-click
          to place. Arrow keys also turn the camera. Press G for survival mode.
        </p>

        <p className="mt-6 max-w-lg text-[11px] leading-relaxed text-white/40">
          Browser voxel sandbox · Three.js · 13 biomes · day/night · weather ·
          AO lighting · particles · save/load · single &amp; creative modes.
        </p>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={onUpdateSettings}
          onClose={() => setShowSettings(false)}
          inGame={false}
        />
      )}
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
function PauseOverlay({
  onResume,
  onSettings,
  onSave,
  onQuit,
  hasSave,
}: {
  onResume: () => void;
  onSettings: () => void;
  onSave: () => void;
  onQuit: () => void;
  hasSave: boolean;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(420px,92vw)] rounded-2xl border border-white/15 bg-[#01411C]/90 p-7 text-center">
        <h2 className="text-3xl font-black text-white">Paused</h2>
        <p className="mt-1 text-sm text-white/60">Take a breath, traveller.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={onResume}
            className="bg-[#e8c14a] font-bold text-[#01411C] hover:bg-[#f0d060]"
          >
            ▶ Resume
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={onSettings}
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/15"
            >
              ⚙ Settings
            </Button>
            <Button
              onClick={onSave}
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/15"
            >
              💾 Save
            </Button>
          </div>
          <Button
            onClick={onQuit}
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            Quit to Menu {hasSave ? "(save kept)" : ""}
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-left text-[10px] text-white/50">
          <Control k="WASD" v="Move" />
          <Control k="Drag" v="Look" />
          <Control k="Space" v="Jump" />
          <Control k="Shift" v="Sprint" />
          <Control k="Ctrl" v="Sneak" />
          <Control k="F" v="Fly" />
          <Control k="G" v="Mode" />
          <Control k="R" v="Rain" />
          <Control k="T/N" v="Time" />
          <Control k="H" v="Lahore" />
          <Control k="Click" v="Break" />
          <Control k="R-Click" v="Place" />
          <Control k="E" v="Inventory" />
          <Control k="1–9" v="Hotbar" />
        </div>
      </div>
    </div>
  );
}

// ---------- Settings Panel ----------
function SettingsPanel({
  settings,
  onUpdate,
  onClose,
  inGame,
}: {
  settings: Settings;
  onUpdate: (p: Partial<Settings>) => void;
  onClose: () => void;
  inGame: boolean;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-h-[88vh] w-[min(520px,94vw)] overflow-hidden rounded-2xl border border-white/15 bg-[#0a2a18] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-lg font-bold text-white">⚙ Settings</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white/80 hover:bg-white/10 hover:text-white"
          >
            Close ✕
          </Button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-5">
          {/* Graphics */}
          <Section title="Graphics">
            <SliderRow
              label="Render Distance"
              value={settings.renderDistance}
              min={2}
              max={8}
              step={1}
              suffix=" chunks"
              onChange={(v) => onUpdate({ renderDistance: v })}
            />
            <SliderRow
              label="Field of View"
              value={settings.fov}
              min={60}
              max={100}
              step={1}
              suffix="°"
              onChange={(v) => onUpdate({ fov: v })}
            />
            <SliderRow
              label="Brightness"
              value={Math.round(settings.brightness * 100)}
              min={60}
              max={140}
              step={5}
              suffix="%"
              onChange={(v) => onUpdate({ brightness: v / 100 })}
            />
            <SliderRow
              label="Mouse Sensitivity"
              value={Math.round(settings.mouseSensitivity * 100)}
              min={20}
              max={200}
              step={5}
              suffix="%"
              onChange={(v) => onUpdate({ mouseSensitivity: v / 100 })}
            />
          </Section>

          <Section title="Toggles">
            <ToggleRow
              label="Ambient Occlusion"
              checked={settings.ao}
              onChange={(v) => onUpdate({ ao: v })}
            />
            <ToggleRow
              label="Clouds"
              checked={settings.renderClouds}
              onChange={(v) => onUpdate({ renderClouds: v })}
            />
            <ToggleRow
              label="Stars at night"
              checked={settings.renderStars}
              onChange={(v) => onUpdate({ renderStars: v })}
            />
            <ToggleRow
              label="Dynamic weather"
              checked={settings.weather}
              onChange={(v) => onUpdate({ weather: v })}
            />
            <ToggleRow
              label="Show FPS"
              checked={settings.showFps}
              onChange={(v) => onUpdate({ showFps: v })}
            />
            <ToggleRow
              label="Show coordinates"
              checked={settings.showCoords}
              onChange={(v) => onUpdate({ showCoords: v })}
            />
          </Section>

          <Section title="Game Mode">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={settings.gameMode === "creative"}
                onClick={() => onUpdate({ gameMode: "creative" })}
                title="Creative"
                desc="Fly, infinite blocks"
              />
              <ModeButton
                active={settings.gameMode === "survival"}
                onClick={() => onUpdate({ gameMode: "survival" })}
                title="Survival"
                desc="Hunger, fall damage"
              />
            </div>
            {inGame && (
              <p className="mt-2 text-[11px] text-white/50">
                Press <span className="font-mono text-white/70">G</span> in-game
                to toggle mode instantly.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300/80">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-sm text-white/80">{label}</Label>
        <span className="font-mono text-xs text-amber-200">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm text-white/80">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${
        active
          ? "border-amber-400 bg-amber-400/15"
          : "border-white/15 bg-black/30 hover:bg-white/10"
      }`}
    >
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="text-[11px] text-white/60">{desc}</div>
    </button>
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
  const showStats = hud.gameMode === "survival";

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Crosshair — dot + ring, scales subtly with break progress */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-6 w-6">
          <div
            className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white mix-blend-difference"
          />
          <div
            className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 mix-blend-difference"
            style={{
              transform: `translate(-50%, -50%) scale(${1 + hud.breakProgress * 0.8})`,
              borderColor: hud.breakProgress > 0 ? `rgba(255,${Math.round(255 - hud.breakProgress * 200)},0,0.9)` : undefined,
            }}
          />
        </div>
      </div>

      {/* Selected block name tooltip (above hotbar) */}
      <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-black/60 px-3 py-1 font-mono text-[11px] text-amber-200 backdrop-blur">
        {hud.selectedName}
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
        {hud.settings.showCoords && (
          <div className="mt-1 text-white/80">
            X {hud.x.toFixed(1)}  Y {hud.y.toFixed(1)}  Z {hud.z.toFixed(1)}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-white/70">
          {isDay ? <SunIcon /> : <MoonIcon />}
          <span>{timeStr}</span>
          <span className="text-white/40">·</span>
          <span className="text-cyan-300 font-bold">{hud.heading}</span>
          {hud.settings.showFps && (
            <>
              <span className="text-white/40">·</span>
              <span className={hud.fps >= 50 ? "text-emerald-300" : hud.fps >= 30 ? "text-amber-300" : "text-red-300"}>{hud.fps} fps</span>
            </>
          )}
          {hud.flying && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-amber-300">FLY</span>
            </>
          )}
          {hud.raining && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-sky-300">RAIN</span>
            </>
          )}
        </div>
        <div className="mt-0.5">
          <span
            className={
              hud.gameMode === "creative" ? "text-emerald-300 font-bold" : "text-orange-300 font-bold"
            }
          >
            {hud.gameMode === "creative" ? "CREATIVE" : "SURVIVAL"}
          </span>
        </div>
      </div>

      {/* Top-right hint */}
      <div className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[11px] text-white/70 backdrop-blur">
        <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5">E</span>{" "}
        Inventory{"  "}
        <span className="ml-2 rounded border border-white/20 bg-white/10 px-1.5 py-0.5">Esc</span>{" "}
        Pause
      </div>

      {/* Drag-mode hint */}
      {!hud.pointerLocked && (
        <div className="absolute left-1/2 top-14 -translate-x-1/2 rounded-full border border-amber-400/30 bg-black/60 px-4 py-1.5 text-center font-mono text-[11px] text-amber-200/90 backdrop-blur">
          drag to look · click to break · right-click to place · arrows to look
        </div>
      )}

      {/* Bottom: health, hunger, hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {showStats && (
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
        )}
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
              isSel ? "border-white bg-white/15" : "border-white/15 bg-black/40"
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
            <h2 className="text-lg font-bold text-white">Block Palette</h2>
            <p className="text-xs text-white/60">
              Click a block to put it in hotbar slot{" "}
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
