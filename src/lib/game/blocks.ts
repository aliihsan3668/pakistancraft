// PakistanCraft — block definitions and procedural texture atlas
import * as THREE from "three";
import { ATLAS_TILE, ATLAS_COLS } from "./constants";

// ---- Block IDs ----
export const Block = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  SAND: 3,
  SANDSTONE: 4,
  STONE: 5,
  COBBLE: 6,
  SNOW: 7,
  ICE: 8,
  WATER: 9,
  LOG_NEEM: 10,
  PLANKS: 11,
  LEAVES: 12,
  LOG_PALM: 13,
  LEAVES_PALM: 14,
  LEAVES_MANGO: 15,
  BRICK: 16,
  MARBLE: 17,
  SANDSTONE_BRICK: 18,
  MUD_BRICK: 19,
  CACTUS: 20,
  WHEAT: 21,
  SUGARCANE: 22,
  LAMP: 23,
  GLASS: 24,
  IRON: 25,
  GOLD: 26,
  CARPET_GREEN: 27,
  CONCRETE: 28,
  ASPHALT: 29,
  BEDROCK: 30,
  GRASS_DRY: 31,
  CLAY: 32,
  SALT: 33,
  PUMPKIN: 34,
  POPPY: 35,
  TORCH: 36,
  ROOF_TILE: 37, // terracotta roof
  MOSQUE_DOME: 38, // green/white dome
  RICE_CROP: 39,
  COTTON_CROP: 40,
} as const;

export type BlockId = number;

// Tile indices in the atlas (see atlas builder)
export const Tile = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  SAND: 3,
  SANDSTONE_TOP: 4,
  SANDSTONE_SIDE: 5,
  STONE: 6,
  COBBLE: 7,
  SNOW: 8,
  ICE: 9,
  WATER: 10,
  LOG_NEEM_SIDE: 11,
  LOG_NEEM_TOP: 12,
  PLANKS: 13,
  LEAVES: 14,
  LOG_PALM_SIDE: 15,
  LOG_PALM_TOP: 16,
  LEAVES_PALM: 17,
  LEAVES_MANGO: 18,
  BRICK: 19,
  MARBLE: 20,
  SANDSTONE_BRICK: 21,
  MUD_BRICK: 22,
  CACTUS_SIDE: 23,
  CACTUS_TOP: 24,
  WHEAT: 25,
  SUGARCANE: 26,
  LAMP: 27,
  GLASS: 28,
  IRON: 29,
  GOLD: 30,
  CARPET_GREEN: 31,
  CONCRETE: 32,
  ASPHALT: 33,
  BEDROCK: 34,
  GRASS_DRY_TOP: 35,
  GRASS_DRY_SIDE: 36,
  CLAY: 37,
  SALT: 38,
  PUMPKIN_SIDE: 39,
  PUMPKIN_TOP: 40,
  POPPY: 41,
  TORCH: 42,
  ROOF_TILE: 43,
  MOSQUE_DOME: 44,
  RICE: 45,
  COTTON: 46,
  COUNT: 47,
};

export interface BlockDef {
  id: BlockId;
  name: string;
  // tiles: [top, side, bottom]; if single number, same all around
  tiles: [number, number, number];
  solid: boolean; // collides with player
  transparent: boolean; // doesn't cull neighbor faces fully
  liquid: boolean;
  light: number; // 0..15 emitted light (visual only)
  breakable: boolean;
  // category for HUD icon background
  color: string; // hex string used as fallback / icon bg
}

function def(
  id: BlockId,
  name: string,
  tiles: number | [number, number, number],
  opts: Partial<BlockDef> = {}
): BlockDef {
  const t: [number, number, number] =
    typeof tiles === "number" ? [tiles, tiles, tiles] : tiles;
  return {
    id,
    name,
    tiles: t,
    solid: opts.solid ?? true,
    transparent: opts.transparent ?? false,
    liquid: opts.liquid ?? false,
    light: opts.light ?? 0,
    breakable: opts.breakable ?? true,
    color: opts.color ?? "#888888",
  };
}

export const BLOCKS: Record<number, BlockDef> = {
  [Block.AIR]: def(Block.AIR, "Air", 0, {
    solid: false,
    transparent: true,
    breakable: false,
    color: "#000000",
  }),
  [Block.GRASS]: def(Block.GRASS, "Punjab Grass", [Tile.GRASS_TOP, Tile.GRASS_SIDE, Tile.DIRT], {
    color: "#4a7d3a",
  }),
  [Block.DIRT]: def(Block.DIRT, "Dirt", Tile.DIRT, { color: "#7a5230" }),
  [Block.SAND]: def(Block.SAND, "Sindh Sand", Tile.SAND, { color: "#d9c178" }),
  [Block.SANDSTONE]: def(
    Block.SANDSTONE,
    "Sandstone",
    [Tile.SANDSTONE_TOP, Tile.SANDSTONE_SIDE, Tile.SANDSTONE_TOP],
    { color: "#c9a85a" }
  ),
  [Block.STONE]: def(Block.STONE, "Mountain Stone", Tile.STONE, { color: "#7d7d7d" }),
  [Block.COBBLE]: def(Block.COBBLE, "Cobblestone", Tile.COBBLE, { color: "#6a6a6a" }),
  [Block.SNOW]: def(Block.SNOW, "Gilgit Snow", Tile.SNOW, { color: "#f5f7fa" }),
  [Block.ICE]: def(Block.ICE, "Ice", Tile.ICE, { transparent: true, color: "#9fc7e8" }),
  [Block.WATER]: def(Block.WATER, "Indus Water", Tile.WATER, {
    solid: false,
    transparent: true,
    liquid: true,
    breakable: false,
    color: "#2f6fd0",
  }),
  [Block.LOG_NEEM]: def(
    Block.LOG_NEEM,
    "Neem Log",
    [Tile.LOG_NEEM_TOP, Tile.LOG_NEEM_SIDE, Tile.LOG_NEEM_TOP],
    { color: "#6b4a2b" }
  ),
  [Block.PLANKS]: def(Block.PLANKS, "Wood Planks", Tile.PLANKS, { color: "#b8895a" }),
  [Block.LEAVES]: def(Block.LEAVES, "Leaves", Tile.LEAVES, {
    transparent: true,
    color: "#3f6b2c",
  }),
  [Block.LOG_PALM]: def(
    Block.LOG_PALM,
    "Date Palm Log",
    [Tile.LOG_PALM_TOP, Tile.LOG_PALM_SIDE, Tile.LOG_PALM_TOP],
    { color: "#8a6a3a" }
  ),
  [Block.LEAVES_PALM]: def(Block.LEAVES_PALM, "Palm Fronds", Tile.LEAVES_PALM, {
    transparent: true,
    color: "#4f7a2a",
  }),
  [Block.LEAVES_MANGO]: def(Block.LEAVES_MANGO, "Mango Leaves", Tile.LEAVES_MANGO, {
    transparent: true,
    color: "#2f5a22",
  }),
  [Block.BRICK]: def(Block.BRICK, "Lahore Brick", Tile.BRICK, { color: "#9c3b22" }),
  [Block.MARBLE]: def(Block.MARBLE, "Islamabad Marble", Tile.MARBLE, { color: "#e8e6e0" }),
  [Block.SANDSTONE_BRICK]: def(Block.SANDSTONE_BRICK, "Multan Sandstone", Tile.SANDSTONE_BRICK, {
    color: "#c89a48",
  }),
  [Block.MUD_BRICK]: def(Block.MUD_BRICK, "Village Mud Brick", Tile.MUD_BRICK, {
    color: "#a07a44",
  }),
  [Block.CACTUS]: def(
    Block.CACTUS,
    "Thar Cactus",
    [Tile.CACTUS_TOP, Tile.CACTUS_SIDE, Tile.CACTUS_TOP],
    { color: "#4a7a3a" }
  ),
  [Block.WHEAT]: def(Block.WHEAT, "Wheat Crop", Tile.WHEAT, {
    transparent: true,
    solid: false,
    color: "#d9b54a",
  }),
  [Block.SUGARCANE]: def(Block.SUGARCANE, "Sugarcane", Tile.SUGARCANE, {
    transparent: true,
    solid: false,
    color: "#7a9a3a",
  }),
  [Block.LAMP]: def(Block.LAMP, "Street Lamp", Tile.LAMP, { light: 15, color: "#ffe08a" }),
  [Block.GLASS]: def(Block.GLASS, "Glass", Tile.GLASS, { transparent: true, color: "#cfe8f5" }),
  [Block.IRON]: def(Block.IRON, "Iron Block", Tile.IRON, { color: "#c8c8d0" }),
  [Block.GOLD]: def(Block.GOLD, "Gold Block", Tile.GOLD, { color: "#e8c14a" }),
  [Block.CARPET_GREEN]: def(Block.CARPET_GREEN, "Mosque Carpet", Tile.CARPET_GREEN, {
    color: "#1f7a4a",
  }),
  [Block.CONCRETE]: def(Block.CONCRETE, "Concrete", Tile.CONCRETE, { color: "#9a9a9a" }),
  [Block.ASPHALT]: def(Block.ASPHALT, "Road Asphalt", Tile.ASPHALT, { color: "#2a2a2e" }),
  [Block.BEDROCK]: def(Block.BEDROCK, "Bedrock", Tile.BEDROCK, {
    breakable: false,
    color: "#1a1a1e",
  }),
  [Block.GRASS_DRY]: def(
    Block.GRASS_DRY,
    "Dry Grass",
    [Tile.GRASS_DRY_TOP, Tile.GRASS_DRY_SIDE, Tile.DIRT],
    { color: "#b09040" }
  ),
  [Block.CLAY]: def(Block.CLAY, "Clay", Tile.CLAY, { color: "#b0a890" }),
  [Block.SALT]: def(Block.SALT, "Salt Range Crystal", Tile.SALT, {
    transparent: true,
    color: "#e8e0d0",
  }),
  [Block.PUMPKIN]: def(
    Block.PUMPKIN,
    "Pumpkin",
    [Tile.PUMPKIN_TOP, Tile.PUMPKIN_SIDE, Tile.PUMPKIN_TOP],
    { color: "#d97a1a" }
  ),
  [Block.POPPY]: def(Block.POPPY, "Poppy", Tile.POPPY, {
    transparent: true,
    solid: false,
    color: "#d8302a",
  }),
  [Block.TORCH]: def(Block.TORCH, "Torch", Tile.TORCH, {
    transparent: true,
    solid: false,
    light: 14,
    color: "#ffb83a",
  }),
  [Block.ROOF_TILE]: def(Block.ROOF_TILE, "Terracotta Roof", Tile.ROOF_TILE, {
    color: "#a8412a",
  }),
  [Block.MOSQUE_DOME]: def(Block.MOSQUE_DOME, "Mosque Dome", Tile.MOSQUE_DOME, {
    color: "#2a8a5a",
  }),
  [Block.RICE_CROP]: def(Block.RICE_CROP, "Rice Paddy", Tile.RICE, {
    transparent: true,
    solid: false,
    color: "#9ab84a",
  }),
  [Block.COTTON_CROP]: def(Block.COTTON_CROP, "Cotton Bush", Tile.COTTON, {
    transparent: true,
    solid: false,
    color: "#e8e8d8",
  }),
};

export function isSolid(id: BlockId): boolean {
  const b = BLOCKS[id];
  return b ? b.solid : false;
}
export function isTransparent(id: BlockId): boolean {
  const b = BLOCKS[id];
  return b ? b.transparent : true;
}
export function isLiquid(id: BlockId): boolean {
  const b = BLOCKS[id];
  return b ? b.liquid : false;
}

// ---- Procedural texture atlas ----
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

function fill(ctx: CanvasRenderingContext2D, x0: number, y0: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x0, y0, ATLAS_TILE, ATLAS_TILE);
}

function shade(hex: string, amt: number): string {
  // amt -1..1, negative darkens
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const to2 = (v: number) => f(v).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function noisy(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  base: string,
  variance: number,
  seed: number
) {
  const r = rng(seed);
  const h = base.replace("#", "");
  const br = parseInt(h.substring(0, 2), 16);
  const bg = parseInt(h.substring(2, 4), 16);
  const bb = parseInt(h.substring(4, 6), 16);
  for (let y = 0; y < ATLAS_TILE; y++) {
    for (let x = 0; x < ATLAS_TILE; x++) {
      const n = (r() - 0.5) * 2 * variance;
      const f = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v + n * 255)))
          .toString(16)
          .padStart(2, "0");
      px(ctx, x0 + x, y0 + y, `#${f(br)}${f(bg)}${f(bb)}`);
    }
  }
}

export function drawTile(ctx: CanvasRenderingContext2D, tile: number, x0: number, y0: number) {
  switch (tile) {
    case Tile.GRASS_TOP:
      noisy(ctx, x0, y0, "#4f8a3a", 0.08, 11);
      // speckles
      for (let i = 0; i < 18; i++) {
        const r = rng(i + 99);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#3c6e2a");
      }
      break;
    case Tile.GRASS_SIDE: {
      noisy(ctx, x0, y0, "#7a5230", 0.07, 21);
      // green top strip
      for (let x = 0; x < 16; x++) {
        const r = rng(x + 5);
        const h = 3 + Math.floor(r() * 2);
        for (let y = 0; y < h; y++) {
          px(ctx, x0 + x, y0 + y, r() > 0.5 ? "#4f8a3a" : "#3c6e2a");
        }
      }
      break;
    }
    case Tile.DIRT:
      noisy(ctx, x0, y0, "#7a5230", 0.09, 31);
      break;
    case Tile.SAND:
      noisy(ctx, x0, y0, "#e0c878", 0.06, 41);
      break;
    case Tile.SANDSTONE_TOP:
      noisy(ctx, x0, y0, "#d9b85a", 0.05, 51);
      break;
    case Tile.SANDSTONE_SIDE: {
      noisy(ctx, x0, y0, "#c9a85a", 0.05, 61);
      ctx.fillStyle = "#a88438";
      ctx.fillRect(x0, y0 + 4, 16, 1);
      ctx.fillRect(x0, y0 + 10, 16, 1);
      break;
    }
    case Tile.STONE:
      noisy(ctx, x0, y0, "#7d7d7d", 0.07, 71);
      break;
    case Tile.COBBLE: {
      noisy(ctx, x0, y0, "#6a6a6a", 0.05, 81);
      ctx.strokeStyle = "#454545";
      ctx.lineWidth = 1;
      // cobble cracks
      ctx.beginPath();
      ctx.moveTo(x0 + 3, y0 + 0);
      ctx.lineTo(x0 + 3, y0 + 5);
      ctx.lineTo(x0 + 8, y0 + 7);
      ctx.lineTo(x0 + 8, y0 + 12);
      ctx.lineTo(x0 + 13, y0 + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + 0, y0 + 9);
      ctx.lineTo(x0 + 5, y0 + 11);
      ctx.stroke();
      break;
    }
    case Tile.SNOW:
      noisy(ctx, x0, y0, "#f6f8fb", 0.03, 91);
      break;
    case Tile.ICE:
      noisy(ctx, x0, y0, "#9fc7e8", 0.06, 101);
      // cracks
      ctx.strokeStyle = "#bcd8f0";
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 3);
      ctx.lineTo(x0 + 9, y0 + 7);
      ctx.lineTo(x0 + 14, y0 + 4);
      ctx.stroke();
      break;
    case Tile.WATER:
      noisy(ctx, x0, y0, "#2f6fd0", 0.05, 111);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x0, y0 + i * 4 + 1, 16, 1);
      }
      break;
    case Tile.LOG_NEEM_SIDE: {
      noisy(ctx, x0, y0, "#6b4a2b", 0.06, 121);
      ctx.strokeStyle = "#4a3219";
      ctx.lineWidth = 1;
      for (let x = 0; x < 16; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x0 + x, y0);
        ctx.lineTo(x0 + x + 1, y0 + 16);
        ctx.stroke();
      }
      break;
    }
    case Tile.LOG_NEEM_TOP: {
      noisy(ctx, x0, y0, "#8a6a3a", 0.05, 131);
      ctx.strokeStyle = "#5a4022";
      for (let r = 2; r < 8; r += 2) {
        ctx.beginPath();
        ctx.arc(x0 + 8, y0 + 8, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case Tile.PLANKS: {
      noisy(ctx, x0, y0, "#b8895a", 0.05, 141);
      ctx.strokeStyle = "#7a5a30";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + 5);
      ctx.lineTo(x0 + 16, y0 + 5);
      ctx.moveTo(x0, y0 + 10);
      ctx.lineTo(x0 + 16, y0 + 10);
      ctx.stroke();
      break;
    }
    case Tile.LEAVES:
      noisy(ctx, x0, y0, "#3f6b2c", 0.12, 151);
      for (let i = 0; i < 20; i++) {
        const r = rng(i + 200);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#2c4a1c");
      }
      break;
    case Tile.LOG_PALM_SIDE:
      noisy(ctx, x0, y0, "#8a6a3a", 0.05, 161);
      ctx.strokeStyle = "#5a4022";
      for (let x = 1; x < 16; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x0 + x, y0);
        ctx.lineTo(x0 + x - 1, y0 + 16);
        ctx.stroke();
      }
      break;
    case Tile.LOG_PALM_TOP:
      noisy(ctx, x0, y0, "#b08a4a", 0.05, 171);
      ctx.strokeStyle = "#6a4a22";
      ctx.beginPath();
      ctx.arc(x0 + 8, y0 + 8, 6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case Tile.LEAVES_PALM:
      noisy(ctx, x0, y0, "#4f7a2a", 0.1, 181);
      for (let i = 0; i < 24; i++) {
        const r = rng(i + 220);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#3a5a1c");
      }
      break;
    case Tile.LEAVES_MANGO:
      noisy(ctx, x0, y0, "#2f5a22", 0.1, 191);
      for (let i = 0; i < 16; i++) {
        const r = rng(i + 240);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#5a8a2a");
      }
      break;
    case Tile.BRICK: {
      noisy(ctx, x0, y0, "#9c3b22", 0.05, 201);
      ctx.fillStyle = "#d9b89a";
      // mortar lines
      ctx.fillRect(x0, y0 + 7, 16, 1);
      ctx.fillRect(x0, y0 + 15, 16, 1);
      ctx.fillRect(x0 + 7, y0, 1, 8);
      ctx.fillRect(x0 + 3, y0 + 8, 1, 8);
      ctx.fillRect(x0 + 11, y0 + 8, 1, 8);
      break;
    }
    case Tile.MARBLE: {
      noisy(ctx, x0, y0, "#e8e6e0", 0.02, 211);
      ctx.strokeStyle = "#b8b4a8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 0, y0 + 4);
      ctx.bezierCurveTo(x0 + 6, y0 + 2, x0 + 10, y0 + 8, x0 + 16, y0 + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 12);
      ctx.bezierCurveTo(x0 + 8, y0 + 10, x0 + 12, y0 + 14, x0 + 16, y0 + 11);
      ctx.stroke();
      break;
    }
    case Tile.SANDSTONE_BRICK: {
      noisy(ctx, x0, y0, "#c89a48", 0.04, 221);
      ctx.strokeStyle = "#9a7430";
      ctx.beginPath();
      ctx.moveTo(x0, y0 + 7);
      ctx.lineTo(x0 + 16, y0 + 7);
      ctx.moveTo(x0 + 7, y0);
      ctx.lineTo(x0 + 7, y0 + 7);
      ctx.moveTo(x0 + 3, y0 + 7);
      ctx.lineTo(x0 + 3, y0 + 16);
      ctx.moveTo(x0 + 11, y0 + 7);
      ctx.lineTo(x0 + 11, y0 + 16);
      ctx.stroke();
      break;
    }
    case Tile.MUD_BRICK:
      noisy(ctx, x0, y0, "#a07a44", 0.08, 231);
      ctx.strokeStyle = "#7a5a30";
      ctx.beginPath();
      ctx.moveTo(x0, y0 + 8);
      ctx.lineTo(x0 + 16, y0 + 8);
      ctx.stroke();
      break;
    case Tile.CACTUS_SIDE: {
      noisy(ctx, x0, y0, "#4a7a3a", 0.05, 241);
      ctx.fillStyle = "#2c4a1c";
      ctx.fillRect(x0 + 1, y0, 1, 16);
      ctx.fillRect(x0 + 14, y0, 1, 16);
      // spines
      for (let y = 2; y < 16; y += 4) {
        px(ctx, x0 + 0, y0 + y, "#d8d8c0");
        px(ctx, x0 + 15, y0 + y, "#d8d8c0");
      }
      break;
    }
    case Tile.CACTUS_TOP: {
      noisy(ctx, x0, y0, "#4a7a3a", 0.05, 251);
      ctx.strokeStyle = "#2c4a1c";
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, 15, 15);
      break;
    }
    case Tile.WHEAT: {
      fill(ctx, x0, y0, "rgba(0,0,0,0)");
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#d9b54a";
      // wheat stalks
      for (let x = 2; x < 16; x += 4) {
        ctx.fillRect(x0 + x, y0 + 4, 1, 10);
      }
      ctx.fillStyle = "#e8c860";
      for (let x = 2; x < 16; x += 4) {
        ctx.fillRect(x0 + x - 1, y0 + 3, 3, 2);
        ctx.fillRect(x0 + x - 1, y0 + 5, 3, 1);
        ctx.fillRect(x0 + x - 1, y0 + 7, 3, 1);
      }
      break;
    }
    case Tile.SUGARCANE: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#7a9a3a";
      ctx.fillRect(x0 + 5, y0, 2, 16);
      ctx.fillRect(x0 + 9, y0 + 2, 2, 14);
      ctx.fillStyle = "#9ab84a";
      ctx.fillRect(x0 + 4, y0 + 2, 1, 3);
      ctx.fillRect(x0 + 7, y0 + 2, 1, 3);
      ctx.fillRect(x0 + 8, y0 + 5, 1, 3);
      ctx.fillRect(x0 + 11, y0 + 5, 1, 3);
      break;
    }
    case Tile.LAMP: {
      noisy(ctx, x0, y0, "#ffe08a", 0.04, 261);
      ctx.fillStyle = "#fff4c0";
      ctx.fillRect(x0 + 5, y0 + 5, 6, 6);
      break;
    }
    case Tile.GLASS: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.strokeStyle = "rgba(200,230,245,0.9)";
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, 15, 15);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 2);
      ctx.lineTo(x0 + 6, y0 + 2);
      ctx.moveTo(x0 + 2, y0 + 2);
      ctx.lineTo(x0 + 2, y0 + 6);
      ctx.stroke();
      break;
    }
    case Tile.IRON:
      noisy(ctx, x0, y0, "#c8c8d0", 0.04, 271);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(x0 + 2, y0 + 2, 5, 1);
      break;
    case Tile.GOLD:
      noisy(ctx, x0, y0, "#e8c14a", 0.05, 281);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(x0 + 2, y0 + 2, 5, 1);
      break;
    case Tile.CARPET_GREEN: {
      noisy(ctx, x0, y0, "#1f7a4a", 0.04, 291);
      ctx.strokeStyle = "#0f4a2a";
      ctx.strokeRect(x0 + 2.5, y0 + 2.5, 11, 11);
      ctx.beginPath();
      ctx.moveTo(x0 + 8, y0 + 4);
      ctx.lineTo(x0 + 12, y0 + 8);
      ctx.lineTo(x0 + 8, y0 + 12);
      ctx.lineTo(x0 + 4, y0 + 8);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case Tile.CONCRETE:
      noisy(ctx, x0, y0, "#9a9a9a", 0.04, 301);
      break;
    case Tile.ASPHALT:
      noisy(ctx, x0, y0, "#2a2a2e", 0.05, 311);
      for (let i = 0; i < 8; i++) {
        const r = rng(i + 330);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#444448");
      }
      break;
    case Tile.BEDROCK:
      noisy(ctx, x0, y0, "#1a1a1e", 0.06, 321);
      for (let i = 0; i < 6; i++) {
        const r = rng(i + 340);
        px(ctx, x0 + Math.floor(r() * 16), y0 + Math.floor(r() * 16), "#3a3a3e");
      }
      break;
    case Tile.GRASS_DRY_TOP:
      noisy(ctx, x0, y0, "#b09040", 0.07, 331);
      break;
    case Tile.GRASS_DRY_SIDE: {
      noisy(ctx, x0, y0, "#7a5230", 0.07, 341);
      for (let x = 0; x < 16; x++) {
        const r = rng(x + 7);
        const h = 2 + Math.floor(r() * 2);
        for (let y = 0; y < h; y++) {
          px(ctx, x0 + x, y0 + y, r() > 0.5 ? "#b09040" : "#8a7030");
        }
      }
      break;
    }
    case Tile.CLAY:
      noisy(ctx, x0, y0, "#b0a890", 0.04, 351);
      break;
    case Tile.SALT:
      noisy(ctx, x0, y0, "#e8e0d0", 0.05, 361);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      px(ctx, x0 + 3, y0 + 4, "#ffffff");
      px(ctx, x0 + 9, y0 + 6, "#ffffff");
      px(ctx, x0 + 5, y0 + 11, "#ffffff");
      px(ctx, x0 + 12, y0 + 12, "#ffffff");
      break;
    case Tile.PUMPKIN_SIDE: {
      noisy(ctx, x0, y0, "#d97a1a", 0.05, 371);
      ctx.strokeStyle = "#a85810";
      for (let x = 2; x < 16; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x0 + x, y0);
        ctx.lineTo(x0 + x, y0 + 16);
        ctx.stroke();
      }
      break;
    }
    case Tile.PUMPKIN_TOP: {
      noisy(ctx, x0, y0, "#d97a1a", 0.05, 381);
      ctx.strokeStyle = "#6a4a10";
      ctx.fillStyle = "#5a8a2a";
      ctx.fillRect(x0 + 6, y0 + 6, 4, 4);
      break;
    }
    case Tile.POPPY: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#3f6b2c";
      ctx.fillRect(x0 + 7, y0 + 8, 1, 7);
      ctx.fillStyle = "#d8302a";
      ctx.fillRect(x0 + 6, y0 + 6, 4, 3);
      ctx.fillStyle = "#ffd038";
      px(ctx, x0 + 8, y0 + 7, "#ffd038");
      break;
    }
    case Tile.TORCH: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(x0 + 7, y0 + 8, 2, 7);
      ctx.fillStyle = "#ffb83a";
      ctx.fillRect(x0 + 6, y0 + 5, 4, 3);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(x0 + 7, y0 + 6, 2, 1);
      break;
    }
    case Tile.ROOF_TILE: {
      noisy(ctx, x0, y0, "#a8412a", 0.05, 391);
      ctx.strokeStyle = "#7a2a18";
      for (let y = 0; y < 16; y += 4) {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + y);
        ctx.lineTo(x0 + 16, y0 + y);
        ctx.stroke();
      }
      for (let x = 0; x < 16; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x0 + x, y0);
        ctx.lineTo(x0 + x, y0 + 16);
        ctx.stroke();
      }
      break;
    }
    case Tile.MOSQUE_DOME: {
      noisy(ctx, x0, y0, "#2a8a5a", 0.05, 401);
      ctx.fillStyle = "#1a5a3a";
      ctx.beginPath();
      ctx.arc(x0 + 8, y0 + 8, 5, 0, Math.PI * 2);
      ctx.stroke();
      px(ctx, x0 + 8, y0 + 3, "#ffe08a");
      break;
    }
    case Tile.RICE: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#9ab84a";
      for (let x = 2; x < 16; x += 3) {
        ctx.fillRect(x0 + x, y0 + 6, 1, 9);
        ctx.fillRect(x0 + x - 1, y0 + 4, 1, 4);
        ctx.fillRect(x0 + x + 1, y0 + 4, 1, 4);
      }
      break;
    }
    case Tile.COTTON: {
      ctx.clearRect(x0, y0, 16, 16);
      ctx.fillStyle = "#7a9a3a";
      ctx.fillRect(x0 + 7, y0 + 6, 2, 9);
      ctx.fillStyle = "#f0f0e0";
      ctx.fillRect(x0 + 5, y0 + 4, 2, 2);
      ctx.fillRect(x0 + 9, y0 + 4, 2, 2);
      ctx.fillRect(x0 + 7, y0 + 2, 2, 2);
      break;
    }
    default:
      fill(ctx, x0, y0, "#ff00ff");
  }
}

let cachedAtlas: THREE.Texture | null = null;

export function buildAtlasTexture(): THREE.Texture {
  if (cachedAtlas) return cachedAtlas;
  const size = ATLAS_TILE * ATLAS_COLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < Tile.COUNT; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    drawTile(ctx, i, col * ATLAS_TILE, row * ATLAS_TILE);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  cachedAtlas = tex;
  return tex;
}

// UV rect for a given tile index, with a tiny inset to avoid bleeding
export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const s = 1 / ATLAS_COLS;
  const inset = 0.001;
  return {
    u0: col * s + inset,
    u1: (col + 1) * s - inset,
    // flip V (texture origin top-left, UV origin bottom-left)
    v0: 1 - (row + 1) * s + inset,
    v1: 1 - row * s - inset,
  };
}
