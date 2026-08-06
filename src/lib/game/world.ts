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
  ao = true; // ambient occlusion toggle (re-meshes chunks when changed)
  renderDistance = RENDER_DISTANCE;

  constructor(scene: THREE.Scene, materials: ChunkMaterials, seed: number) {
    this.scene = scene;
    this.materials = materials;
    this.gen = new WorldGen(seed);
  }

  setAo(v: boolean) {
    if (this.ao === v) return;
    this.ao = v;
    for (const c of this.chunks.values()) c.dirty = true;
  }

  setRenderDistance(v: number) {
    this.renderDistance = v;
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

  // Read block at world coords (optimized: bitwise ops for power-of-2 chunk size)
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return Block.BEDROCK;
    if (wy >= WORLD_HEIGHT) return Block.AIR;
    // CHUNK_SIZE=16 → use >> 4 and & 15 (faster than floor/div)
    const cx = wx >> 4;
    const cz = wz >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.generated) return Block.AIR;
    const lx = wx & 15;
    const lz = wz & 15;
    return c.data[(wy * 16 + lz) * 16 + lx];
  }

  // Write block during generation (no scene remesh yet)
  private setBlockRaw(wx: number, wy: number, wz: number, b: number) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = wx >> 4;
    const cz = wz >> 4;
    const c = this.getOrCreateChunk(cx, cz);
    if (!c.generated) this.ensureTerrain(cx, cz);
    const lx = wx & 15;
    const lz = wz & 15;
    c.data[(wy * 16 + lz) * 16 + lx] = b;
    c.dirty = true;
  }

  // Player-placed/broken block: also marks neighbor chunks dirty if on border
  setBlock(wx: number, wy: number, wz: number, b: number) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = wx >> 4;
    const cz = wz >> 4;
    const c = this.getOrCreateChunk(cx, cz);
    if (!c.generated) this.ensureTerrain(cx, cz);
    if (!c.decorated) this.ensureDecorated(cx, cz);
    const lx = wx & 15;
    const lz = wz & 15;
    c.data[(wy * 16 + lz) * 16 + lx] = b;
    c.dirty = true;
    // mark neighbor dirty if on border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === 15) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  getBiomeAt(wx: number, wz: number): BiomeId {
    const cx = wx >> 4;
    const cz = wz >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.generated) {
      // compute on the fly
      return this.gen.column(wx, wz).biome;
    }
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return c.biomeMap[lz * CHUNK_SIZE + lx];
  }

  // cached spiral load list — only rebuilt when player crosses chunk boundary
  private _lastPcx = 999999;
  private _lastPcz = 999999;
  private _cachedToLoad: Array<{ cx: number; cz: number; dist: number }> = [];

  // Load chunks around player, unload far ones. Returns number of new meshes built.
  update(px: number, pz: number, budget = 2): number {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const rd = this.renderDistance;

    // Only rebuild the spiral list when the player crosses into a new chunk
    if (pcx !== this._lastPcx || pcz !== this._lastPcz) {
      this._lastPcx = pcx;
      this._lastPcz = pcz;
      const toLoad = this._cachedToLoad;
      toLoad.length = 0;
      for (let dx = -rd; dx <= rd; dx++) {
        for (let dz = -rd; dz <= rd; dz++) {
          const d = dx * dx + dz * dz;
          if (d > rd * rd) continue;
          toLoad.push({ cx: pcx + dx, cz: pcz + dz, dist: d });
        }
      }
      toLoad.sort((a, b) => a.dist - b.dist);
    }
    const toLoad = this._cachedToLoad;

    let built = 0;
    // Strict per-frame budget: at most 1 terrain gen, 1 decorate, 2 remeshes.
    // This spreads work across frames to avoid jank spikes.
    // Phase 1: ensure terrain for the closest not-yet-terrain chunk (max 1/frame)
    for (const job of toLoad) {
      if (built >= 1) break;
      const c = this.getOrCreateChunk(job.cx, job.cz);
      if (!c.generated) {
        this.ensureTerrain(job.cx, job.cz);
        built++;
      }
    }
    // Phase 2: decorate the closest not-decorated chunk (max 1/frame)
    for (const job of toLoad) {
      if (built >= 2) break;
      const c = this.getChunk(job.cx, job.cz);
      if (c && c.generated && !c.decorated) {
        this.ensureDecorated(job.cx, job.cz);
        built++;
      }
    }

    // Phase 3: remesh dirty chunks (closest first), max 2/frame
    let remeshed = 0;
    for (const job of toLoad) {
      if (remeshed >= 2) break;
      const c = this.getChunk(job.cx, job.cz);
      if (!c || !c.generated || !c.decorated) continue;
      if (!c.dirty) continue;
      // ensure immediate neighbors generated so border face culling is correct
      this.ensureTerrain(job.cx - 1, job.cz);
      this.ensureTerrain(job.cx + 1, job.cz);
      this.ensureTerrain(job.cx, job.cz - 1);
      this.ensureTerrain(job.cx, job.cz + 1);
      this.buildChunkMesh(c);
      c.dirty = false;
      remeshed++;
      built++;
    }

    // Unload distant chunks
    const unload: string[] = [];
    const unloadDist = rd + 2;
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      if (Math.abs(dx) > unloadDist || Math.abs(dz) > unloadDist) {
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
      baseZ,
      this.ao
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

  // Dispose all chunks (geometry + voxel data) — called on engine teardown
  dispose() {
    for (const c of this.chunks.values()) {
      this.disposeChunkMeshes(c);
    }
    this.chunks.clear();
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
