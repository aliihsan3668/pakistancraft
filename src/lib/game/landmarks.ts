// PakistanCraft — Lahore landmarks: Badshahi Mosque, Minar-e-Pakistan,
// Shalimar Gardens, Walled City gates, Food Street, Orange Line Metro.
import { Block } from "./blocks";
import { mulberry32 } from "./constants";

type SetFn = (x: number, y: number, z: number, b: number) => void;
type GetFn = (x: number, y: number, z: number) => number;
type ColFn = (x: number, z: number) => number; // returns surface height

function rect(
  set: SetFn,
  x0: number,
  y0: number,
  z0: number,
  w: number,
  h: number,
  d: number,
  b: number
) {
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      for (let z = 0; z < d; z++) set(x0 + x, y0 + y, z0 + z, b);
}

function hollowBox(
  set: SetFn,
  x0: number,
  y0: number,
  z0: number,
  w: number,
  h: number,
  d: number,
  wall: number
) {
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      for (let z = 0; z < d; z++) {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1) {
          set(x0 + x, y0 + y, z0 + z, wall);
        }
      }
}

// Find the average surface height across a footprint (so structures sit on ground)
function avgHeight(col: ColFn, x0: number, z0: number, w: number, d: number): number {
  let sum = 0;
  let n = 0;
  for (let x = 0; x < w; x += 2)
    for (let z = 0; z < d; z += 2) {
      sum += col(x0 + x, z0 + z);
      n++;
    }
  return Math.floor(sum / Math.max(1, n));
}

// Flatten the ground under a footprint to a given height (fill missing, clear above)
function flatten(
  set: SetFn,
  get: GetFn,
  col: ColFn,
  x0: number,
  z0: number,
  w: number,
  d: number,
  targetY: number,
  fillBlock: number
) {
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const wx = x0 + x;
      const wz = z0 + z;
      // fill up to targetY
      for (let y = col(wx, wz); y < targetY; y++) {
        if (get(wx, y, wz) === Block.AIR) set(wx, y, wz, fillBlock);
      }
      // clear above
      for (let y = targetY + 1; y < targetY + 30; y++) {
        const b = get(wx, y, wz);
        if (b !== Block.AIR && b !== Block.WATER) set(wx, y, wz, Block.AIR);
      }
    }
}

// ===== Badshahi Mosque =====
// Large red sandstone mosque with 4 corner minarets and 3 white domes.
export function placeBadshahiMosque(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn
) {
  const W = 30;
  const D = 30;
  const baseY = avgHeight(col, wx, wz, W, D);
  flatten(set, get, col, wx, wz, W, D, baseY, Block.RED_SANDSTONE);

  // Courtyard platform (red sandstone, 2 blocks high)
  rect(set, wx, baseY, wz, W, 2, D, Block.RED_SANDSTONE);

  // Prayer hall at the west end (back): raised, with 3 domes
  const hallX = wx + 2;
  const hallZ = wz + D - 12;
  const hallW = W - 4;
  const hallD = 10;
  const hallY = baseY + 2;
  // hall walls (red sandstone)
  hollowBox(set, hallX, hallY, hallZ, hallW, 6, hallD, Block.RED_SANDSTONE);
  // arched entrance (clear front center)
  for (let x = hallW / 2 - 2; x < hallW / 2 + 2; x++) {
    set(hallX + x, hallY + 1, hallZ, Block.AIR);
    set(hallX + x, hallY + 2, hallZ, Block.AIR);
  }
  // carpet inside
  for (let x = 1; x < hallW - 1; x++)
    for (let z = 1; z < hallD - 1; z++)
      set(hallX + x, hallY, hallZ + z, Block.CARPET_GREEN);

  // Three white domes on top of the hall
  const domeY = hallY + 6;
  const placeDome = (cx: number, cz: number, r: number) => {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > r) continue;
        const h = Math.round(Math.sqrt(r * r - dist * dist));
        for (let dy = 0; dy <= h; dy++) {
          set(cx + dx, domeY + dy, cz + dz, Block.WHITE_DOME);
        }
      }
    // finial
    set(cx, domeY + r + 1, cz, Block.GOLD);
  };
  placeDome(hallX + Math.floor(hallW * 0.25), hallZ + Math.floor(hallD / 2), 3);
  placeDome(hallX + Math.floor(hallW * 0.5), hallZ + Math.floor(hallD / 2), 4);
  placeDome(hallX + Math.floor(hallW * 0.75), hallZ + Math.floor(hallD / 2), 3);

  // Four tall minarets at the corners of the courtyard
  const minaretH = 22;
  const corners: [number, number][] = [
    [wx + 1, wz + 1],
    [wx + W - 2, wz + 1],
    [wx + 1, wz + D - 2],
    [wx + W - 2, wz + D - 2],
  ];
  for (const [mx, mz] of corners) {
    // shaft
    for (let y = 0; y < minaretH; y++) {
      set(mx, baseY + 2 + y, mz, Block.RED_SANDSTONE);
      set(mx + 1, baseY + 2 + y, mz, Block.RED_SANDSTONE);
      set(mx, baseY + 2 + y, mz + 1, Block.RED_SANDSTONE);
      set(mx + 1, baseY + 2 + y, mz + 1, Block.RED_SANDSTONE);
    }
    // balcony ring
    for (let y = minaretH - 3; y < minaretH; y++) {
      set(mx - 1, baseY + 2 + y, mz, Block.RED_SANDSTONE);
      set(mx + 2, baseY + 2 + y, mz, Block.RED_SANDSTONE);
      set(mx, baseY + 2 + y, mz - 1, Block.RED_SANDSTONE);
      set(mx, baseY + 2 + y, mz + 2, Block.RED_SANDSTONE);
    }
    // white dome top
    set(mx, baseY + 2 + minaretH, mz, Block.WHITE_DOME);
    set(mx + 1, baseY + 2 + minaretH, mz, Block.WHITE_DOME);
    set(mx, baseY + 2 + minaretH, mz + 1, Block.WHITE_DOME);
    set(mx + 1, baseY + 2 + minaretH, mz + 1, Block.WHITE_DOME);
    set(mx, baseY + 2 + minaretH + 1, mz, Block.GOLD);
  }

  // Grand entrance gate on the east side (facing away from prayer hall)
  const gateX = wx + Math.floor(W / 2);
  const gateZ = wz;
  for (let y = 0; y < 5; y++) {
    set(gateX - 1, baseY + 2 + y, gateZ, Block.RED_SANDSTONE);
    set(gateX + 1, baseY + 2 + y, gateZ, Block.RED_SANDSTONE);
  }
  // arch opening
  set(gateX, baseY + 2, gateZ, Block.AIR);
  set(gateX, baseY + 3, gateZ, Block.AIR);
  set(gateX, baseY + 4, gateZ, Block.AIR);
  set(gateX, baseY + 5, gateZ, Block.RED_SANDSTONE);
  set(gateX, baseY + 6, gateZ, Block.WHITE_DOME);
}

// ===== Minar-e-Pakistan =====
// Tall tapering tower on a raised star-shaped platform.
export function placeMinarEPakistan(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn
) {
  const baseY = avgHeight(col, wx, wz, 12, 12);
  flatten(set, get, col, wx, wz, 12, 12, baseY, Block.MARBLE);

  // Platform (marble, 2 blocks high, 10x10)
  rect(set, wx + 1, baseY, wz + 1, 10, 2, 10, Block.MARBLE);
  // decorative tile border
  for (let x = 1; x < 11; x++) {
    set(wx + x, baseY + 2, wz + 1, Block.TILE_BLUE);
    set(wx + x, baseY + 2, wz + 10, Block.TILE_BLUE);
    set(wx + 1, baseY + 2, wz + x, Block.TILE_BLUE);
    set(wx + 10, baseY + 2, wz + x, Block.TILE_BLUE);
  }

  // Tapering tower (concentric shrinking layers)
  const cx = wx + 6;
  const cz = wz + 6;
  let y = baseY + 2;
  const layers = [
    { r: 3, h: 6, b: Block.MARBLE },
    { r: 2, h: 8, b: Block.MARBLE },
    { r: 2, h: 6, b: Block.CONCRETE },
    { r: 1, h: 10, b: Block.CONCRETE },
    { r: 1, h: 6, b: Block.MARBLE },
  ];
  for (const layer of layers) {
    for (let dy = 0; dy < layer.h; dy++) {
      for (let dx = -layer.r; dx <= layer.r; dx++)
        for (let dz = -layer.r; dz <= layer.r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= layer.r + 1) {
            set(cx + dx, y + dy, cz + dz, layer.b);
          }
        }
    }
    y += layer.h;
  }
  // observation platform
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) set(cx + dx, y, cz + dz, Block.MARBLE);
  // crescent on top
  set(cx, y + 1, cz, Block.GOLD);
  set(cx, y + 2, cz, Block.GOLD);
  set(cx - 1, y + 2, cz, Block.GOLD);
  set(cx + 1, y + 2, cz, Block.GOLD);
}

// ===== Shalimar Gardens =====
// Three terraced levels with water channels and cypress trees.
export function placeShalimarGardens(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn
) {
  const W = 36;
  const D = 24;
  const baseY = avgHeight(col, wx, wz, W, D);
  flatten(set, get, col, wx, wz, W, D, baseY, Block.GRASS);

  // Three terraces (descending)
  const terraces = [
    { z: 0, d: 8, h: 0 },
    { z: 8, d: 8, h: -2 },
    { z: 16, d: 8, h: -4 },
  ];
  for (const t of terraces) {
    const ty = baseY + t.h;
    // floor
    for (let x = 0; x < W; x++)
      for (let z = 0; z < t.d; z++)
        set(wx + x, ty, wz + t.z + z, Block.MARBLE);
    // central water channel
    for (let z = 0; z < t.d; z++) {
      set(wx + Math.floor(W / 2) - 1, ty, wz + t.z + z, Block.WATER);
      set(wx + Math.floor(W / 2), ty, wz + t.z + z, Block.WATER);
    }
    // fountains along the channel
    for (let z = 1; z < t.d; z += 3) {
      set(wx + Math.floor(W / 2) - 1, ty + 1, wz + t.z + z, Block.FOUNTAIN);
      set(wx + Math.floor(W / 2), ty + 1, wz + t.z + z, Block.FOUNTAIN);
    }
    // hedges along edges
    for (let x = 0; x < W; x += 2) {
      set(wx + x, ty + 1, wz + t.z, Block.HEDGE);
      set(wx + x, ty + 1, wz + t.z + t.d - 1, Block.HEDGE);
    }
  }
  // retaining walls between terraces
  for (let x = 0; x < W; x++) {
    set(wx + x, baseY - 2, wz + 8, Block.RED_SANDSTONE);
    set(wx + x, baseY - 2, wz + 16, Block.RED_SANDSTONE);
    set(wx + x, baseY - 1, wz + 8, Block.RED_SANDSTONE);
    set(wx + x, baseY - 1, wz + 16, Block.RED_SANDSTONE);
  }
  // cypress trees (tall thin) at corners
  const treeSpots: [number, number][] = [
    [wx + 2, wz + 2],
    [wx + W - 3, wz + 2],
    [wx + 2, wz + D - 3],
    [wx + W - 3, wz + D - 3],
    [wx + 2, wz + 11],
    [wx + W - 3, wz + 11],
  ];
  for (const [tx, tz] of treeSpots) {
    const ty = col(tx, tz);
    for (let i = 0; i < 8; i++) set(tx, ty + 1 + i, tz, Block.LOG_NEEM);
    for (let i = 4; i < 9; i++) {
      set(tx - 1, ty + i, tz, Block.LEAVES);
      set(tx + 1, ty + i, tz, Block.LEAVES);
      set(tx, ty + i, tz - 1, Block.LEAVES);
      set(tx, ty + i, tz + 1, Block.LEAVES);
    }
    set(tx, ty + 9, tz, Block.LEAVES);
  }
}

// ===== Walled City Gate =====
// A section of the old city wall with an arched gateway and turrets.
export function placeWalledCityGate(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn,
  r: () => number
) {
  const len = 24;
  const baseY = avgHeight(col, wx, wz, len, 4);
  flatten(set, get, col, wx, wz, len, 4, baseY, Block.DIRT);

  // Wall (brick, 6 high, 2 thick)
  for (let x = 0; x < len; x++) {
    for (let y = 0; y < 6; y++) {
      set(wx + x, baseY + 1 + y, wz, Block.BRICK);
      set(wx + x, baseY + 1 + y, wz + 1, Block.BRICK);
    }
    // crenellations
    if (x % 2 === 0) {
      set(wx + x, baseY + 7, wz, Block.BRICK);
      set(wx + x, baseY + 7, wz + 1, Block.BRICK);
    }
  }
  // Central arched gateway
  const gx = wx + Math.floor(len / 2);
  for (let y = 0; y < 5; y++) {
    set(gx - 1, baseY + 1 + y, wz, Block.AIR);
    set(gx, baseY + 1 + y, wz, Block.AIR);
    set(gx + 1, baseY + 1 + y, wz, Block.AIR);
    set(gx - 1, baseY + 1 + y, wz + 1, Block.AIR);
    set(gx, baseY + 1 + y, wz + 1, Block.AIR);
    set(gx + 1, baseY + 1 + y, wz + 1, Block.AIR);
  }
  // arch top
  set(gx - 1, baseY + 6, wz, Block.BRICK);
  set(gx, baseY + 6, wz, Block.BRICK);
  set(gx + 1, baseY + 6, wz, Block.BRICK);
  // turret on each side of the gate
  for (const tx of [gx - 3, gx + 3]) {
    for (let y = 0; y < 9; y++) {
      set(tx, baseY + 1 + y, wz - 1, Block.BRICK);
      set(tx, baseY + 1 + y, wz, Block.BRICK);
      set(tx, baseY + 1 + y, wz + 1, Block.BRICK);
      set(tx, baseY + 1 + y, wz + 2, Block.BRICK);
    }
    set(tx, baseY + 10, wz, Block.MOSQUE_DOME);
    set(tx, baseY + 11, wz, Block.GOLD);
  }
  // lamp
  set(gx, baseY + 6, wz + 1, Block.LAMP);
  void r;
}

// ===== Food Street =====
// Narrow street of brick buildings with colorful awnings and hanging lanterns.
export function placeFoodStreet(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn,
  r: () => number
) {
  const len = 28;
  const baseY = avgHeight(col, wx, wz, len, 8);
  flatten(set, get, col, wx, wz, len, 8, baseY, Block.ASPHALT);

  // Street (asphalt, 3 wide in the middle)
  for (let x = 0; x < len; x++) {
    for (let z = 2; z < 6; z++) set(wx + x, baseY, wz + z, Block.ASPHALT);
  }
  // Buildings on both sides
  const awnings = [Block.AWNING_RED, Block.AWNING_GREEN, Block.AWNING_YELLOW];
  for (let x = 0; x < len; x += 5) {
    // left building
    const lh = 4 + Math.floor(r() * 3);
    hollowBox(set, wx + x, baseY + 1, wz, 4, lh, 2, Block.BRICK);
    // door
    set(wx + x + 1, baseY + 1, wz + 2, Block.AIR);
    set(wx + x + 1, baseY + 2, wz + 2, Block.AIR);
    // window
    set(wx + x + 2, baseY + 2, wz + 2, Block.GLASS);
    // awning
    const la = awnings[Math.floor(r() * awnings.length)];
    for (let i = 0; i < 4; i++) set(wx + x + i, baseY + 3, wz + 2, la);
    // lantern
    set(wx + x + 1, baseY + 4, wz + 2, Block.LANTERN);
    // roof
    for (let i = 0; i < 4; i++) set(wx + x + i, baseY + lh + 1, wz, Block.ROOF_TILE);

    // right building
    const rh = 4 + Math.floor(r() * 3);
    hollowBox(set, wx + x, baseY + 1, wz + 6, 4, rh, 2, Block.BRICK);
    set(wx + x + 1, baseY + 1, wz + 5, Block.AIR);
    set(wx + x + 1, baseY + 2, wz + 5, Block.AIR);
    set(wx + x + 2, baseY + 2, wz + 5, Block.GLASS);
    const ra = awnings[Math.floor(r() * awnings.length)];
    for (let i = 0; i < 4; i++) set(wx + x + i, baseY + 3, wz + 5, ra);
    set(wx + x + 1, baseY + 4, wz + 5, Block.LANTERN);
    for (let i = 0; i < 4; i++) set(wx + x + i, baseY + rh + 1, wz + 6, Block.ROOF_TILE);
  }
  // string lights across the street
  for (let x = 2; x < len; x += 4) {
    set(wx + x, baseY + 5, wz + 1, Block.LANTERN);
    set(wx + x, baseY + 5, wz + 6, Block.LANTERN);
  }
}

// ===== Orange Line Metro (elevated rail) =====
// Elevated concrete track on pillars, running in a straight line.
export function placeOrangeLine(
  wx: number,
  wz: number,
  length: number,
  dir: "x" | "z",
  set: SetFn,
  get: GetFn,
  col: ColFn
) {
  const pillarH = 8;
  for (let i = 0; i < length; i++) {
    const p = dir === "x" ? wx + i : wx;
    const q = dir === "x" ? wz : wz + i;
    const groundY = col(p, q);
    if (groundY <= 0) continue;
    const topY = Math.max(groundY, pillarH);
    // pillar
    for (let y = groundY; y < topY; y++) {
      set(p, y + 1, q, Block.CONCRETE);
      if (dir === "x") set(p, y + 1, q + 1, Block.CONCRETE);
      else set(p + 1, y + 1, q, Block.CONCRETE);
    }
    // track beam
    set(p, topY + 1, q, Block.CONCRETE);
    if (dir === "x") set(p, topY + 1, q + 1, Block.CONCRETE);
    else set(p + 1, topY + 1, q, Block.CONCRETE);
    // rail
    set(p, topY + 2, q, Block.METAL_RAIL);
    if (dir === "x") set(p, topY + 2, q + 1, Block.METAL_RAIL);
    else set(p + 1, topY + 2, q, Block.METAL_RAIL);
  }
}

// ===== Lahore residential house (DHA / Model Town style) =====
export function placeLahoreHouse(
  wx: number,
  wz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn,
  r: () => number
) {
  const w = 6 + Math.floor(r() * 3);
  const d = 6 + Math.floor(r() * 3);
  const h = 4 + Math.floor(r() * 2);
  const baseY = col(wx, wz);
  if (baseY <= 0) return;
  // walls
  const wall = r() > 0.5 ? Block.CONCRETE : Block.BRICK;
  hollowBox(set, wx, baseY + 1, wz, w, h, d, wall);
  // flat roof
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) set(wx + x, baseY + 1 + h, wz + z, Block.CONCRETE);
  // parapet
  for (let x = 0; x < w; x++) {
    set(wx + x, baseY + 2 + h, wz, wall);
    set(wx + x, baseY + 2 + h, wz + d - 1, wall);
  }
  for (let z = 0; z < d; z++) {
    set(wx, baseY + 2 + h, wz + z, wall);
    set(wx + w - 1, baseY + 2 + h, wz + z, wall);
  }
  // door
  set(wx + Math.floor(w / 2), baseY + 1, wz, Block.AIR);
  set(wx + Math.floor(w / 2), baseY + 2, wz, Block.AIR);
  set(wx + Math.floor(w / 2) - 1, baseY + 2, wz, Block.AIR);
  // windows
  set(wx, baseY + 2, wz + Math.floor(d / 2), Block.GLASS);
  set(wx, baseY + 3, wz + Math.floor(d / 2), Block.GLASS);
  set(wx + w - 1, baseY + 2, wz + Math.floor(d / 2), Block.GLASS);
  set(wx + w - 1, baseY + 3, wz + Math.floor(d / 2), Block.GLASS);
  // gate
  set(wx + Math.floor(w / 2), baseY + 3, wz, Block.IRON);
}

// Place a full Lahore city cluster around a center point.
export function placeLahoreCity(
  cx: number,
  cz: number,
  set: SetFn,
  get: GetFn,
  col: ColFn,
  seed: number
) {
  const rng = mulberry32(seed ^ 0x4c6f6168);
  // Badshahi Mosque at center
  placeBadshahiMosque(cx - 15, cz - 15, set, get, col);
  // Minar-e-Pakistan to the east
  placeMinarEPakistan(cx + 24, cz + 4, set, get, col);
  // Shalimar Gardens to the north
  placeShalimarGardens(cx - 18, cz + 22, set, get, col);
  // Walled City Gate to the south
  placeWalledCityGate(cx + 6, cz - 22, set, get, col, rng);
  // Food Street to the west
  placeFoodStreet(cx - 36, cz + 8, set, get, col, rng);
  // Orange Line metro running east-west
  placeOrangeLine(cx - 50, cz + 16, 100, "x", set, get, col);
  // scatter residential houses
  for (let i = 0; i < 14; i++) {
    const hx = cx + Math.floor((rng() - 0.5) * 80);
    const hz = cz + Math.floor((rng() - 0.5) * 80);
    placeLahoreHouse(hx, hz, set, get, col, rng);
  }
}
