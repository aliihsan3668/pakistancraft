// PakistanCraft — chunk voxel storage + greedy-ish face-culled meshing
import * as THREE from "three";
import { Block, BLOCKS, isTransparent, isLiquid, tileUV } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from "./constants";
import { idx } from "./worldgen";

const FACES = [
  // dir, normal, corner offsets (4 verts), which tile face (0=top,1=side,2=bottom)
  {
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    tileFace: 1,
    shade: 0.6,
  },
  {
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
    tileFace: 1,
    shade: 0.6,
  },
  {
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    tileFace: 0,
    shade: 1.0,
  },
  {
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    tileFace: 2,
    shade: 0.5,
  },
  {
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
    tileFace: 1,
    shade: 0.8,
  },
  {
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    tileFace: 1,
    shade: 0.8,
  },
] as const;

function shouldRenderFace(cur: number, nb: number): boolean {
  if (cur === Block.AIR) return false;
  const curT = isTransparent(cur);
  const nbT = isTransparent(nb);
  if (!curT) {
    return nbT; // opaque: render toward transparent/air
  }
  // transparent current
  if (nb === cur) return false; // same type, cull
  if (!nbT) return false; // opaque neighbor hides face
  return true; // air or different transparent
}

export interface MeshLayer {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newLayer(): MeshLayer {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

export class Chunk {
  cx: number;
  cz: number;
  data: Uint8Array;
  biomeMap: Uint8Array;
  generated = false;
  decorated = false;
  dirty = true;

  solidMesh: THREE.Mesh | null = null;
  cutoutMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.biomeMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }

  getLocal(lx: number, y: number, lz: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.AIR;
    return this.data[idx(lx, y, lz)];
  }

  setLocal(lx: number, y: number, lz: number, b: number) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.data[idx(lx, y, lz)] = b;
    this.dirty = true;
  }

  // Build mesh geometry by face culling. getBlock reads world (absolute) coords.
  buildMesh(
    getBlock: (wx: number, wy: number, wz: number) => number,
    baseX: number,
    baseZ: number
  ) {
    const solid = newLayer();
    const cutout = newLayer();
    const water = newLayer();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const block = this.data[idx(lx, y, lz)];
          if (block === Block.AIR) continue;
          const def = BLOCKS[block];
          if (!def) continue;

          // pick target layer
          let layer: MeshLayer;
          if (def.liquid) layer = water;
          else if (def.transparent) layer = cutout;
          else layer = solid;

          const wx = baseX + lx;
          const wz = baseZ + lz;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];
            const nb = getBlock(nx, ny, nz);
            if (!shouldRenderFace(block, nb)) continue;

            const tile = def.tiles[face.tileFace];
            const uv = tileUV(tile);
            const shade = face.shade;
            // Slight AO: darken if block below neighbor is solid (simple)
            let ao = 1;
            if (face.tileFace === 0) {
              // top face: brighten near sun? keep flat
              ao = 1;
            }

            const start = layer.positions.length / 3;
            for (const c of face.corners) {
              layer.positions.push(wx + c[0], y + c[1], wz + c[2]);
              layer.normals.push(face.normal[0], face.normal[1], face.normal[2]);
              const cx = c[0];
              const cz = c[2];
              // UV mapping per corner (matches winding above)
              let u: number, v: number;
              if (f === 0) {
                // +X: corners (0,0),(0,1),(1,1),(1,0) in (z,y)
                u = cz;
                v = c[1];
              } else if (f === 1) {
                // -X
                u = cz;
                v = c[1];
              } else if (f === 2) {
                // +Y top
                u = cx;
                v = cz;
              } else if (f === 3) {
                // -Y bottom
                u = cx;
                v = cz;
              } else if (f === 4) {
                // +Z
                u = cx;
                v = c[1];
              } else {
                // -Z
                u = cx;
                v = c[1];
              }
              const uu = u === 0 ? uv.u0 : uv.u1;
              const vv = v === 0 ? uv.v0 : uv.v1;
              layer.uvs.push(uu, vv);
              layer.colors.push(shade * ao, shade * ao, shade * ao);
            }
            // two triangles
            layer.indices.push(start, start + 1, start + 2);
            layer.indices.push(start, start + 2, start + 3);
          }
        }
      }
    }

    return { solid, cutout, water };
  }
}

// Build a THREE.Mesh from a MeshLayer
export function buildMeshObject(
  layer: MeshLayer,
  material: THREE.Material
): THREE.Mesh | null {
  if (layer.indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(layer.positions, 3)
  );
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(layer.normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(layer.uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(layer.colors, 3));
  geo.setIndex(layer.indices);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = true;
  return mesh;
}

// Lower water top faces by 0.1 for a nicer look — handled at mesh time by
// checking if block is water and face is top. (kept simple here)
export function isWaterTop(block: number): boolean {
  return isLiquid(block);
}

export { SEA_LEVEL };
