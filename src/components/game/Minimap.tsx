"use client";

import { useEffect, useRef } from "react";
import { getBiome, Biome } from "@/lib/game/biomes";
import type { HudState } from "@/lib/game/engine";
import type { Engine } from "@/lib/game/engine";

// Minimap: top-down canvas showing real biome colors sampled from the world,
// player position arrow, and cardinal direction. Only redraws when the player
// moves by >= 1 block or rotates significantly.
export function Minimap({
  hud,
  engine,
}: {
  hud: HudState;
  engine: Engine | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lastX = useRef(999999);
  const lastZ = useRef(999999);
  const lastYaw = useRef(999999);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Only redraw if the player moved >= 1 block or rotated >= 5°
    const dx = Math.abs(hud.x - lastX.current);
    const dz = Math.abs(hud.z - lastZ.current);
    const dyaw = Math.abs(hud.yaw - lastYaw.current);
    if (dx < 1 && dz < 1 && dyaw < 0.08) return;
    lastX.current = hud.x;
    lastZ.current = hud.z;
    lastYaw.current = hud.yaw;

    const size = 110;
    const range = 35; // blocks shown in each direction
    const px = Math.floor(hud.x);
    const pz = Math.floor(hud.z);
    const cell = 4; // px per block
    const cellsPerSide = Math.floor(size / cell);

    ctx.clearRect(0, 0, size, size);

    // Sample real biomes in a grid
    for (let i = 0; i < cellsPerSide; i++) {
      for (let j = 0; j < cellsPerSide; j++) {
        const wx = px + (i - cellsPerSide / 2);
        const wz = pz + (j - cellsPerSide / 2);
        let biomeId = hud.biomeId;
        if (engine) {
          try {
            biomeId = engine.getBiomeAt(wx, wz);
          } catch {
            /* keep default */
          }
        }
        const biome = getBiome(biomeId);
        ctx.fillStyle = biome.color;
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }

    // player arrow (center, pointing in facing direction)
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-hud.yaw);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // border + N marker
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(size / 2 - 7, 0, 14, 12);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", size / 2, 10);
  }, [hud, engine]);

  return (
    <div className="absolute bottom-3 right-2 hidden rounded-lg border border-white/20 bg-black/40 p-1 backdrop-blur sm:right-3 sm:block">
      <canvas ref={ref} width={110} height={110} className="block" />
    </div>
  );
}

// re-export to satisfy unused import lint
export { Biome };
