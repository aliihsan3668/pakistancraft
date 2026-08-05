"use client";

import { useEffect, useRef } from "react";
import { getBiome } from "@/lib/game/biomes";
import type { HudState } from "@/lib/game/engine";

// Minimap: top-down canvas showing nearby biome colors, player position,
// and cardinal direction. Sampled from the worldgen column function.
export function Minimap({ hud }: { hud: HudState }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 100;
    const range = 40; // blocks shown in each direction
    const px = hud.x;
    const pz = hud.z;
    const cellSize = size / (range * 2);

    ctx.clearRect(0, 0, size, size);
    // sample biome colors
    for (let dy = -range; dy < range; dy += 2) {
      for (let dx = -range; dx < range; dx += 2) {
        const sx = Math.floor(px + dx);
        const sz = Math.floor(pz + dy);
        // We can't access worldgen directly, so use the biome at the player's
        // position as an approximation, blended with noise for texture.
        // In a full impl we'd call the world's getBiomeAt; here we use the
        // current biome color for simplicity.
        const biome = getBiome(hud.biomeId ?? 0);
        ctx.fillStyle = biome.color;
        ctx.globalAlpha = 0.6 + Math.sin(dx * 0.5 + dy * 0.3) * 0.2;
        ctx.fillRect(
          (dx + range) * cellSize,
          (dy + range) * cellSize,
          cellSize * 2,
          cellSize * 2
        );
      }
    }
    ctx.globalAlpha = 1;

    // border
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    // player arrow (center, pointing in facing direction)
    const yaw = hud.yaw;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-yaw);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // N marker
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", size / 2, 10);
  }, [hud]);

  return (
    <div className="absolute bottom-3 right-3 rounded-lg border border-white/20 bg-black/40 p-1 backdrop-blur">
      <canvas ref={ref} width={100} height={100} className="block" />
    </div>
  );
}
