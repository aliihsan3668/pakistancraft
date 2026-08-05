// PakistanCraft — world manager: chunk lifecycle, meshing, block access
import * as THREE from "three";
import { Chunk, buildMeshObject } from "./chunk";
import { WorldGen } from "./worldgen";
import { Block, isTransparent } from "./blocks";
import { getBiome, BiomeId } from "./biomes";
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  RENDER_DISTANCE,
  UNLOAD_DISTANCE,
} from "./constants";

export interface ChunkMaterials {
  solid: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

function key(cx: number, cz: number): string {
  return cx + "," + cz;
}

export class World {
  scene: THREE.Scene;
  materials: ChunkMaterials;
  gen: WorldGen;
  chunks = new Map<string, Chunk>();
  // queue of chunks needing mesh rebuild
  remeshQueue: string[] = [];

  constructor(scene: THREE.Scene, materials: ChunkMaterials, seed: number) {
    this.scene = scene;
    this.materials = materials;
    this.gen = new WorldGen(seed);
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(key(cx, cz));
  }

  getOrCreateChunk(cx: number, cz: number): Chunk {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
    }
    return c;
  }

  ensureTerrain(cx: number, cz: number) {
    const c = this.getOrCreateChunk(cx, cz);
    if (c.generated) return;
    this.gen.generateTerrain(cx, cz, c.data, c.biomeMap);
    c.generated = true;
    c.dirty = true;
  }

  ensureDecorated(cx: number, cz: number) {
    const c = this.getOrCreateChunk(cx, cz);
    if (c.decorated) return;
    // ensure 3x3 neighborhood terrain exists (for cross-border structures)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.ensureTerrain(cx + dx, cz + dz);
    this.gen.generateDecorations(
      cx,
      cz,
      c.data,
      (wx, wy, wz, b) => this.setBlockRaw(wx, wy, wz, b),
      (wx, wy, wz) => this.getBlock(wx, wy, wz)
    );
    c.decorated = true;
    c.dirty = true;
    // mark neighbors dirty too since structures may have crossed borders
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const nc = this.getChunk(cx + dx, cz + dz);
        if (nc && nc.generated) nc.dirty = true;
      }
  }

  // Read block at world coords
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return Block.BEDROCK;
    if (wy >= WORLD_HEIGHT) return Block.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    if (!c || !c.generated) return Block.AIR;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return c.data[idxLocal(lx, wy, lz)];
  }

  // Write block during generation (no scene remesh yet)
  private setBlockRaw(wx: number, wy: number, wz: number, b: number) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = this.getOrCreateChunk(cx, cz);
    if (!c.generated) this.ensureTerrain(cx, cz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    c.data[idxLocal(lx, wy, lz)] = b;
    c.dirty = true;
  }

  // Player-placed/broken block: also marks neighbor chunks dirty if on border
  setBlock(wx: number, wy: number, wz: number, b: number) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = this.getOrCreateChunk(cx, cz);
    if (!c.generated) this.ensureTerrain(cx, cz);
    if (!c.decorated) this.ensureDecorated(cx, cz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    c.data[idxLocal(lx, wy, lz)] = b;
    c.dirty = true;
    // mark neighbor dirty if on border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  getBiomeAt(wx: number, wz: number): BiomeId {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    if (!c || !c.generated) {
      // compute on the fly
      return this.gen.column(wx, wz).biome;
    }
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return c.biomeMap[lz * CHUNK_SIZE + lx];
  }

  // Load chunks around player, unload far ones. Returns number of new meshes built.
  update(px: number, pz: number, budget = 2): number {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    // Determine load order: spiral from center
    const toLoad: Array<{ cx: number; cz: number; dist: number }> = [];
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const d = dx * dx + dz * dz;
        if (d > RENDER_DISTANCE * RENDER_DISTANCE) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const c = this.getChunk(cx, cz);
        if (!c || !c.generated || (!c.decorated && c.dirty === false)) {
          // need generation
        }
        toLoad.push({ cx, cz, dist: d });
      }
    }
    toLoad.sort((a, b) => a.dist - b.dist);

    let built = 0;
    // Phase 1: ensure terrain for the closest not-yet-terrain chunks (small budget)
    for (const job of toLoad) {
      if (built >= budget) break;
      const c = this.getOrCreateChunk(job.cx, job.cz);
      if (!c.generated) {
        this.ensureTerrain(job.cx, job.cz);
        built++;
      }
    }
    // Phase 2: decorate closest not-decorated chunks
    for (const job of toLoad) {
      if (built >= budget + 1) break;
      const c = this.getChunk(job.cx, job.cz);
      if (c && c.generated && !c.decorated) {
        this.ensureDecorated(job.cx, job.cz);
        built++;
      }
    }

    // Phase 3: remesh dirty chunks (closest first), within budget
    for (const job of toLoad) {
      if (built >= budget + 3) break;
      const c = this.getChunk(job.cx, job.cz);
      if (!c || !c.generated || !c.decorated) continue;
      if (!c.dirty) continue;
      // ensure neighbors generated so border face culling is correct
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          this.ensureTerrain(job.cx + dx, job.cz + dz);
      this.buildChunkMesh(c);
      c.dirty = false;
      built++;
    }

    // Unload distant chunks
    const unload: string[] = [];
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      if (Math.abs(dx) > UNLOAD_DISTANCE || Math.abs(dz) > UNLOAD_DISTANCE) {
        unload.push(k);
      }
    }
    for (const k of unload) {
      const c = this.chunks.get(k)!;
      this.disposeChunkMeshes(c);
      this.chunks.delete(k);
    }

    return built;
  }

  private buildChunkMesh(c: Chunk) {
    const baseX = c.cx * CHUNK_SIZE;
    const baseZ = c.cz * CHUNK_SIZE;
    const layers = c.buildMesh(
      (wx, wy, wz) => this.getBlock(wx, wy, wz),
      baseX,
      baseZ
    );
    // dispose old
    this.disposeChunkMeshes(c);
    c.solidMesh = buildMeshObject(layers.solid, this.materials.solid);
    c.cutoutMesh = buildMeshObject(layers.cutout, this.materials.cutout);
    c.waterMesh = buildMeshObject(layers.water, this.materials.water);
    if (c.solidMesh) this.scene.add(c.solidMesh);
    if (c.cutoutMesh) this.scene.add(c.cutoutMesh);
    if (c.waterMesh) this.scene.add(c.waterMesh);
  }

  private disposeChunkMeshes(c: Chunk) {
    for (const m of [c.solidMesh, c.cutoutMesh, c.waterMesh]) {
      if (m) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    c.solidMesh = null;
    c.cutoutMesh = null;
    c.waterMesh = null;
  }

  // Force immediate mesh rebuild for a chunk (used after edits)
  remeshAround(wx: number, wz: number) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    if (c && c.generated && c.decorated) {
      this.buildChunkMesh(c);
      c.dirty = false;
    }
  }
}

function idxLocal(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

// re-export for engine
export { getBiome, isTransparent };
