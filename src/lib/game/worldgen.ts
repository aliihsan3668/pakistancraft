// PakistanCraft — procedural world generation
import { Noise } from "./noise";
import { Block, isSolid } from "./blocks";
import { Biome, BiomeId, getBiome } from "./biomes";
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, mulberry32 } from "./constants";

// Determine biome from elevation/temperature/humidity
export function pickBiome(
  elev: number,
  temp: number,
  humid: number,
  river: number
): BiomeId {
  // Rivers carve through everything
  if (river > 0.5 && elev < 0.7) return Biome.RIVER_BANK;

  if (elev < 0.30) {
    // ocean / coast
    if (temp > 0.7 && humid > 0.6) return Biome.MANGROVE;
    return Biome.ARABIAN_BEACH;
  }
  if (elev < 0.335) {
    // shoreline
    if (temp > 0.8 && humid < 0.4) return Biome.SINDH_DESERT;
    return Biome.ARABIAN_BEACH;
  }

  // High elevations → mountains / snow
  if (elev > 0.82) {
    if (temp < 0.3) return Biome.GILGIT_SNOW;
    return Biome.BALOCHISTAN_MOUNTAINS;
  }
  if (elev > 0.70) {
    if (temp < 0.25) return Biome.GILGIT_SNOW;
    if (temp < 0.45 && humid > 0.5) return Biome.SWAT_FOREST;
    return Biome.BALOCHISTAN_MOUNTAINS;
  }

  // Mid elevations: pick by climate
  if (temp > 0.82) {
    if (humid < 0.35) return Biome.THAR_DESERT;
    return Biome.SINDH_DESERT;
  }
  if (temp < 0.32) {
    if (humid > 0.55) return Biome.SWAT_FOREST;
    if (humid > 0.4) return Biome.KHYBER_FOREST;
    return Biome.POTHOHAR;
  }
  if (temp < 0.5) {
    if (humid > 0.5) return Biome.KASHMIR_VALLEY;
    return Biome.POTHOHAR;
  }
  // temperate
  if (humid < 0.3) return Biome.POTHOHAR;
  if (humid > 0.65) return Biome.KASHMIR_VALLEY;
  return Biome.PUNJAB_PLAINS;
}

// Map elevation (0..1) to world Y
function elevToY(elev: number): number {
  return Math.max(1, Math.min(WORLD_HEIGHT - 2, Math.floor(8 + elev * 50)));
}

export interface GenColumn {
  biome: BiomeId;
  height: number;
  river: number;
  temp: number;
  humid: number;
}

export class WorldGen {
  noise: Noise;
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
    this.noise = new Noise(seed);
  }

  // Sample column info (used for both terrain and decorations)
  column(x: number, z: number): GenColumn {
    const elev = this.noise.elevation(x, z);
    const temp = this.noise.temperature(x, z);
    const humid = this.noise.humidity(x, z);
    const river = this.noise.riverFactor(x, z);
    let height = elevToY(elev);
    // River carving: lower terrain near rivers down toward sea level
    if (river > 0.5 && elev < 0.7) {
      const target = SEA_LEVEL - 2;
      height = Math.floor(height * (1 - river) + target * river);
      height = Math.max(target, height);
    }
    const biome = pickBiome(elev, temp, humid, river);
    return { biome, height, river, temp, humid };
  }

  // Generate terrain voxel data for a chunk
  // data: Uint8Array of size CHUNK_SIZE*WORLD_HEIGHT*CHUNK_SIZE
  // biomeMap: Uint8Array of size CHUNK_SIZE*CHUNK_SIZE (top biome)
  generateTerrain(
    cx: number,
    cz: number,
    data: Uint8Array,
    biomeMap: Uint8Array
  ) {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const col = this.column(wx, wz);
        const biome = getBiome(col.biome);
        biomeMap[lz * CHUNK_SIZE + lx] = col.biome;

        const h = col.height;
        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          let block: number = Block.STONE;
          if (y === 0) {
            block = Block.BEDROCK;
          } else if (y === h) {
            // surface
            if (col.river > 0.5 && h <= SEA_LEVEL) {
              block = Block.SAND;
            } else if (h <= SEA_LEVEL + 1 && biome.surface === Block.GRASS) {
              block = Block.SAND; // beaches near water
            } else {
              block = biome.surface;
            }
            // snow caps on high cold mountains
            if (col.biome === Biome.GILGIT_SNOW && h > SEA_LEVEL + 18) {
              block = Block.SNOW;
            }
          } else if (y >= h - 3) {
            block = biome.subsurface;
          } else {
            block = biome.filler;
            // ore generation
            if (y < 12) {
              const o = this.noise.oreNoise(wx, y, wz);
              if (o > 0.88) block = Block.IRON;
              if (o > 0.96 && y < 8) block = Block.GOLD;
            }
            // salt in salt range
            if (col.biome === Biome.SALT_RANGE && y < h - 4) {
              const s = this.noise.oreNoise(wx + 100, y, wz);
              if (s > 0.82) block = Block.SALT;
            }
            // clay pockets
            if (y < h - 2 && y > h - 6 && col.biome === Biome.MANGROVE) {
              const c = this.noise.oreNoise(wx, y, wz + 100);
              if (c > 0.8) block = Block.CLAY;
            }
          }

          // cave carving
          if (y > 1 && y < h - 1 && block !== Block.BEDROCK) {
            const cave = this.noise.caveDensity(wx, y, wz);
            if (cave > 0.82) {
              block = Block.AIR;
            }
          }

          data[idx(lx, y, lz)] = block;
        }

        // Water fill up to sea level
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            data[idx(lx, y, lz)] = biome.waterBlock;
          }
        }
        // Ice on top of water in cold biomes
        if (col.biome === Biome.GILGIT_SNOW && h < SEA_LEVEL) {
          data[idx(lx, SEA_LEVEL, lz)] = Block.ICE;
        }
      }
    }
  }

  // Generate decorations (trees, cacti, crops) for a chunk.
  // We scan a region slightly larger than the chunk so trees near borders
  // still get placed correctly; only blocks inside this chunk are written.
  generateDecorations(
    cx: number,
    cz: number,
    data: Uint8Array,
    setBlock: (wx: number, wy: number, wz: number, b: number) => void,
    getBlock: (wx: number, wy: number, wz: number) => number
  ) {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    // padding of 3 blocks for tree overhang
    const pad = 3;
    for (let lx = -pad; lx < CHUNK_SIZE + pad; lx++) {
      for (let lz = -pad; lz < CHUNK_SIZE + pad; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        // Use a hash-based deterministic RNG per column
        const r = mulberry32(this.seed ^ ((wx * 73856093) ^ (wz * 19349663)));
        const col = this.column(wx, wz);
        const biome = getBiome(col.biome);
        const surfaceY = col.height;
        if (surfaceY <= SEA_LEVEL) continue; // underwater
        const surfaceBlock = getBlock(wx, surfaceY, wz);
        if (surfaceBlock !== biome.surface && surfaceBlock !== Block.SAND)
          continue;

        // Trees
        if (biome.treeDensity > 0 && r() < biome.treeDensity) {
          // avoid clustering: use noise gate
          const gate = this.noise.treeJitter(wx, wz);
          if (gate > 0.1) {
            this.placeTree(wx, surfaceY + 1, wz, biome.treeType, r, setBlock);
            continue;
          }
        }

        // Cacti
        if (biome.cactusDensity > 0 && r() < biome.cactusDensity) {
          const ch = 2 + Math.floor(r() * 3);
          for (let i = 0; i < ch; i++) {
            setBlock(wx, surfaceY + 1 + i, wz, Block.CACTUS);
          }
          continue;
        }

        // Crops (small patches)
        if (biome.cropDensity > 0 && r() < biome.cropDensity) {
          const cropType =
            biome.id === Biome.RIVER_BANK
              ? Block.RICE_CROP
              : biome.id === Biome.PUNJAB_PLAINS
                ? Block.WHEAT
                : Block.COTTON_CROP;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              if (r() < 0.6) {
                const gy = this.column(wx + dx, wz + dz).height;
                setBlock(wx + dx, gy + 1, wz + dz, cropType);
              }
            }
          }
          continue;
        }

        // Tall grass / flowers
        if (biome.grassDensity > 0 && r() < biome.grassDensity) {
          if (r() < 0.2) {
            setBlock(wx, surfaceY + 1, wz, Block.POPPY);
          }
          continue;
        }
      }
    }

    // Occasionally place a small village or mosque
    const villageR = mulberry32(this.seed ^ ((cx * 374761393) ^ (cz * 668265263)));
    if (villageR() < 0.012) {
      const vx = baseX + 2 + Math.floor(villageR() * (CHUNK_SIZE - 6));
      const vz = baseZ + 2 + Math.floor(villageR() * (CHUNK_SIZE - 6));
      this.placeVillage(vx, vz, setBlock, getBlock);
    }
  }

  private placeTree(
    wx: number,
    wy: number,
    wz: number,
    type: string,
    r: () => number,
    set: (x: number, y: number, z: number, b: number) => void
  ) {
    let trunk: number = Block.LOG_NEEM;
    let leaves: number = Block.LEAVES;
    let height = 4 + Math.floor(r() * 3);
    if (type === "palm") {
      trunk = Block.LOG_PALM;
      leaves = Block.LEAVES_PALM;
      height = 5 + Math.floor(r() * 3);
    } else if (type === "mango") {
      trunk = Block.LOG_NEEM;
      leaves = Block.LEAVES_MANGO;
      height = 3 + Math.floor(r() * 2);
    } else if (type === "pine") {
      trunk = Block.LOG_NEEM;
      leaves = Block.LEAVES;
      height = 6 + Math.floor(r() * 4);
    } else if (type === "mixed") {
      const pick = Math.floor(r() * 3);
      if (pick === 0) {
        trunk = Block.LOG_PALM;
        leaves = Block.LEAVES_PALM;
        height = 5 + Math.floor(r() * 3);
      } else if (pick === 1) {
        leaves = Block.LEAVES_MANGO;
        height = 3 + Math.floor(r() * 2);
      } else {
        height = 6 + Math.floor(r() * 4);
      }
    }

    // Trunk
    for (let i = 0; i < height; i++) {
      set(wx, wy + i, wz, trunk);
    }
    const topY = wy + height;

    if (type === "palm" || (type === "mixed" && trunk === Block.LOG_PALM)) {
      // Palm: star-shaped fronds on top
      set(wx, topY, wz, leaves);
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        set(wx + dx, topY, wz + dz, leaves);
        set(wx + dx, topY - 1, wz + dz, leaves);
      }
      set(wx + 1, topY, wz + 1, leaves);
      set(wx - 1, topY, wz - 1, leaves);
    } else if (type === "pine") {
      // Tapering layers
      let layer = 2;
      for (let y = topY - 1; y >= wy + 1; y--) {
        for (let dx = -layer; dx <= layer; dx++) {
          for (let dz = -layer; dz <= layer; dz++) {
            if (Math.abs(dx) === layer && Math.abs(dz) === layer) continue;
            set(wx + dx, y, wz + dz, leaves);
          }
        }
        layer = layer === 2 ? 1 : 2;
      }
      set(wx, topY, wz, leaves);
    } else {
      // Rounded canopy
      for (let dy = -1; dy <= 1; dy++) {
        const r2 = dy === 0 ? 2 : 2;
        for (let dx = -r2; dx <= r2; dx++) {
          for (let dz = -r2; dz <= r2; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            set(wx + dx, topY + dy, wz + dz, leaves);
          }
        }
      }
      set(wx, topY + 2, wz, leaves);
    }
  }

  // Place a small Pakistani village cluster: mud-brick houses, a mosque, paths
  private placeVillage(
    wx: number,
    wz: number,
    set: (x: number, y: number, z: number, b: number) => void,
    get: (x: number, y: number, z: number) => number
  ) {
    const groundY = this.column(wx, wz).height;
    if (groundY <= SEA_LEVEL + 1) return;
    // determine if desert (sandstone village) or plains (brick)
    const biome = getBiome(this.column(wx, wz).biome);
    const isDesert = biome.id === Biome.SINDH_DESERT || biome.id === Biome.THAR_DESERT;
    const wallBlock = isDesert ? Block.SANDSTONE_BRICK : Block.MUD_BRICK;
    const floorBlock = isDesert ? Block.SANDSTONE : Block.PLANKS;
    const roofBlock = isDesert ? Block.SANDSTONE_BRICK : Block.ROOF_TILE;

    const r = mulberry32(this.seed ^ ((wx * 2246822519) ^ (wz * 3266489917)));

    // 2-3 houses
    const houseCount = 2 + Math.floor(r() * 2);
    for (let i = 0; i < houseCount; i++) {
      const hx = wx + Math.floor((r() - 0.5) * 8);
      const hz = wz + Math.floor((r() - 0.5) * 8);
      const hy = this.column(hx, hz).height;
      if (hy <= SEA_LEVEL + 1) continue;
      this.buildHouse(hx, hy + 1, hz, wallBlock, floorBlock, roofBlock, set, r);
    }

    // Small mosque with a dome
    const mx = wx + Math.floor((r() - 0.5) * 6);
    const mz = wz + Math.floor((r() - 0.5) * 6);
    const my = this.column(mx, mz).height;
    if (my > SEA_LEVEL + 1) {
      this.buildMosque(mx, my + 1, mz, set, r);
    }

    // A street lamp
    const lx = wx + Math.floor((r() - 0.5) * 6);
    const lz = wz + Math.floor((r() - 0.5) * 6);
    const ly = this.column(lx, lz).height;
    if (ly > SEA_LEVEL) {
      set(lx, ly + 1, lz, Block.LOG_NEEM);
      set(lx, ly + 2, lz, Block.LOG_NEEM);
      set(lx, ly + 3, lz, Block.LOG_NEEM);
      set(lx, ly + 4, lz, Block.LAMP);
    }
  }

  private buildHouse(
    wx: number,
    wy: number,
    wz: number,
    wall: number,
    floor: number,
    roof: number,
    set: (x: number, y: number, z: number, b: number) => void,
    r: () => number
  ) {
    const w = 4 + Math.floor(r() * 2);
    const d = 4 + Math.floor(r() * 2);
    const h = 3;
    // floor
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < d; dz++) set(wx + dx, wy - 1, wz + dz, floor);
    // walls
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        set(wx + dx, wy + dy, wz, wall);
        set(wx + dx, wy + dy, wz + d - 1, wall);
      }
    }
    for (let dz = 0; dz < d; dz++) {
      for (let dy = 0; dy < h; dy++) {
        set(wx, wy + dy, wz + dz, wall);
        set(wx + w - 1, wy + dy, wz + dz, wall);
      }
    }
    // door
    set(wx + Math.floor(w / 2), wy, wz, Block.AIR);
    set(wx + Math.floor(w / 2), wy + 1, wz, Block.AIR);
    // windows
    set(wx, wy + 1, wz + Math.floor(d / 2), Block.GLASS);
    set(wx + w - 1, wy + 1, wz + Math.floor(d / 2), Block.GLASS);
    // roof
    for (let dx = -1; dx <= w; dx++)
      for (let dz = -1; dz <= d; dz++) set(wx + dx, wy + h, wz + dz, roof);
  }

  private buildMosque(
    wx: number,
    wy: number,
    wz: number,
    set: (x: number, y: number, z: number, b: number) => void,
    r: () => number
  ) {
    const w = 5;
    const d = 5;
    const h = 4;
    // base
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < d; dz++) set(wx + dx, wy - 1, wz + dz, Block.MARBLE);
    // walls (marble)
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        set(wx + dx, wy + dy, wz, Block.MARBLE);
        set(wx + dx, wy + dy, wz + d - 1, Block.MARBLE);
      }
    }
    for (let dz = 0; dz < d; dz++) {
      for (let dy = 0; dy < h; dy++) {
        set(wx, wy + dy, wz + dz, Block.MARBLE);
        set(wx + w - 1, wy + dy, wz + dz, Block.MARBLE);
      }
    }
    // door (arched feel)
    set(wx + 2, wy, wz, Block.AIR);
    set(wx + 2, wy + 1, wz, Block.AIR);
    set(wx + 2, wy + 2, wz, Block.MARBLE);
    // carpet inside
    for (let dx = 1; dx < w - 1; dx++)
      for (let dz = 1; dz < d - 1; dz++) set(wx + dx, wy, wz + dz, Block.CARPET_GREEN);
    // dome on top
    const cx = wx + 2;
    const cz = wz + 2;
    set(cx, wy + h, cz, Block.MOSQUE_DOME);
    set(cx, wy + h + 1, cz, Block.MOSQUE_DOME);
    set(cx, wy + h + 2, cz, Block.GOLD);
    // minarets at corners
    for (const [mx, mz] of [
      [wx, wz],
      [wx + w - 1, wz],
      [wx, wz + d - 1],
      [wx + w - 1, wz + d - 1],
    ]) {
      for (let i = 0; i < h + 3; i++) set(mx, wy + i, mz, Block.MARBLE);
      set(mx, wy + h + 3, mz, Block.MOSQUE_DOME);
      set(mx, wy + h + 4, mz, Block.GOLD);
    }
  }
}

// Index into chunk voxel data
export function idx(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}
