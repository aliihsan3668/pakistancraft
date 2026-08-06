// PakistanCraft — core engine constants

export const CHUNK_SIZE = 16; // X & Z dimension of a chunk
export const WORLD_HEIGHT = 64; // Y dimension of the world (full height)
export const SEA_LEVEL = 24; // water fills up to this Y

export const RENDER_DISTANCE = 4; // chunks around player to keep loaded (radius)
export const UNLOAD_DISTANCE = 5; // chunks beyond this get unloaded

// Player physics
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const PLAYER_RADIUS = 0.3;
export const GRAVITY = 28; // blocks/s^2
export const JUMP_VELOCITY = 9.2;
export const WALK_SPEED = 5.5;
export const SPRINT_SPEED = 9.5;
export const FLY_SPEED = 14;
export const FLY_SPRINT_SPEED = 26;

// Reach for placing/breaking blocks
export const REACH_DISTANCE = 6;

// Day length in seconds (full cycle)
export const DAY_LENGTH = 600; // 10 minutes

// Texture atlas
export const ATLAS_TILE = 16; // pixels per tile
export const ATLAS_COLS = 8; // tiles per row
export const ATLAS_ROWS = 8; // tiles per column

// Seedable RNG
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
