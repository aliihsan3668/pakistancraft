// PakistanCraft — isometric block icons for the HUD/inventory
import { Block, BLOCKS, Tile, drawTile } from "./blocks";

const TILE = 16;
let tileCanvas: HTMLCanvasElement | null = null;
let tileCtx: CanvasRenderingContext2D | null = null;

function ensureTiles() {
  if (tileCanvas) return;
  tileCanvas = document.createElement("canvas");
  tileCanvas.width = Tile.COUNT * TILE;
  tileCanvas.height = TILE;
  tileCtx = tileCanvas.getContext("2d")!;
  tileCtx.imageSmoothingEnabled = false;
  for (let i = 0; i < Tile.COUNT; i++) {
    drawTile(tileCtx, i, i * TILE, 0);
  }
}

const iconCache = new Map<number, string>();

// Draw an isometric cube icon and return a data URL.
export function makeBlockIcon(blockId: number, size = 48): string {
  if (iconCache.has(blockId)) return iconCache.get(blockId)!;
  ensureTiles();
  const def = BLOCKS[blockId];
  if (!def) return "";
  const topTile = def.tiles[0];
  const sideTile = def.tiles[1];

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);

  // isometric cube vertices (centered)
  const cx = size / 2;
  const cy = size * 0.58;
  const hw = size * 0.42; // half width
  const hh = size * 0.21; // half height (iso ratio)
  const top = size * 0.14;

  // top face polygon
  const topPoly = [
    [cx, cy - hh - top],
    [cx + hw, cy - top],
    [cx, cy + hh - top],
    [cx - hw, cy - top],
  ];
  // left face
  const leftPoly = [
    [cx - hw, cy - top],
    [cx, cy + hh - top],
    [cx, cy + hh + hh + (size * 0.16) - top],
    [cx - hw, cy + hh + (size * 0.16) - top],
  ];
  // right face
  const rightPoly = [
    [cx, cy + hh - top],
    [cx + hw, cy - top],
    [cx + hw, cy + hh + (size * 0.16) - top],
    [cx, cy + hh + hh + (size * 0.16) - top],
  ];

  // helper: clip polygon and draw tile scaled, then tint
  function drawFace(poly: number[][], tile: number, tint: string) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    ctx.clip();
    // draw the tile texture filling bounding box
    const bx = poly.reduce((m, p) => Math.min(m, p[0]), Infinity);
    const by = poly.reduce((m, p) => Math.min(m, p[1]), Infinity);
    const bX = poly.reduce((m, p) => Math.max(m, p[0]), -Infinity);
    const bY = poly.reduce((m, p) => Math.max(m, p[1]), -Infinity);
    ctx.drawImage(
      tileCanvas!,
      tile * TILE,
      0,
      TILE,
      TILE,
      bx,
      by,
      bX - bx,
      bY - by
    );
    ctx.fillStyle = tint;
    ctx.fillRect(bx, by, bX - bx, bY - by);
    ctx.restore();
    // outline
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    ctx.stroke();
  }

  drawFace(leftPoly, sideTile, "rgba(0,0,0,0.30)");
  drawFace(rightPoly, sideTile, "rgba(0,0,0,0.12)");
  drawFace(topPoly, topTile, "rgba(255,255,255,0.04)");

  const url = canvas.toDataURL();
  iconCache.set(blockId, url);
  return url;
}

// A flat 2D tile preview (used for some UI)
export function makeTileIcon(tile: number, size = 32): string {
  ensureTiles();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas!, tile * TILE, 0, TILE, TILE, 0, 0, size, size);
  return canvas.toDataURL();
}

export function blockColor(blockId: number): string {
  return BLOCKS[blockId]?.color ?? "#888888";
}
