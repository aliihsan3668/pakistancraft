// PakistanCraft — chunk voxel storage + face-culled meshing with ambient occlusion
import * as THREE from "three";
import { Block, BLOCKS, isTransparent, isLiquid, tileUV } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from "./constants";
import { idx } from "./worldgen";

// Each face: normal dir, 4 corners (positions in unit cube), tileFace index,
// base directional shade, and the two tangent axes (u,v) used for AO sampling.
interface FaceDef {
  dir: [number, number, number];
  normal: [number, number, number];
  corners: [number, number, number][];
  tileFace: 0 | 1 | 2;
  shade: number;
  tu: [number, number, number];
  tv: [number, number, number];
}

const FACES: FaceDef[] = [
  // +X
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
    shade: 0.62,
    tu: [0, 1, 0],
    tv: [0, 0, 1],
  },
  // -X
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
    shade: 0.62,
    tu: [0, 1, 0],
    tv: [0, 0, 1],
  },
  // +Y (top)
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
    tu: [1, 0, 0],
    tv: [0, 0, 1],
  },
  // -Y (bottom)
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
    tu: [1, 0, 0],
    tv: [0, 0, 1],
  },
  // +Z
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
    tu: [1, 0, 0],
    tv: [0, 1, 0],
  },
  // -Z
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
    tu: [1, 0, 0],
    tv: [0, 1, 0],
  },
];

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

// A block occludes AO if it's opaque (solid, not transparent, not liquid)
function isOccluder(b: number): boolean {
  if (b === Block.AIR) return false;
  const d = BLOCKS[b];
  if (!d) return false;
  return !d.transparent && !d.liquid;
}

// AO brightness lookup: level 0..3 → 0..1 multiplier
const AO_TABLE = [0.45, 0.62, 0.8, 1.0];

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

  // Compute vertex AO level (0..3) for a face corner.
  private vertexAO(
    getBlock: (x: number, y: number, z: number) => number,
    x: number,
    y: number,
    z: number,
    face: FaceDef,
    su: number,
    sv: number
  ): number {
    // neighbor block in front of the face
    const fx = x + face.dir[0];
    const fy = y + face.dir[1];
    const fz = z + face.dir[2];
    const tu = face.tu;
    const tv = face.tv;
    const s1 = isOccluder(
      getBlock(fx + tu[0] * su, fy + tu[1] * su, fz + tu[2] * su)
    );
    const s2 = isOccluder(
      getBlock(fx + tv[0] * sv, fy + tv[1] * sv, fz + tv[2] * sv)
    );
    if (s1 && s2) return 0;
    const c = isOccluder(
      getBlock(
        fx + tu[0] * su + tv[0] * sv,
        fy + tu[1] * su + tv[1] * sv,
        fz + tu[2] * su + tv[2] * sv
      )
    );
    return 3 - (s1 ? 1 : 0) - (s2 ? 1 : 0) - (c ? 1 : 0);
  }

  // Build mesh geometry by face culling + ambient occlusion.
  buildMesh(
    getBlock: (wx: number, wy: number, wz: number) => number,
    baseX: number,
    baseZ: number,
    aoEnabled = true
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

            // compute AO for each of the 4 corners
            const ao: number[] = [];
            for (let ci = 0; ci < 4; ci++) {
              const c = face.corners[ci];
              const dotU = c[0] * face.tu[0] + c[1] * face.tu[1] + c[2] * face.tu[2];
              const dotV = c[0] * face.tv[0] + c[1] * face.tv[1] + c[2] * face.tv[2];
              const ssu = dotU > 0 ? 1 : -1;
              const ssv = dotV > 0 ? 1 : -1;
              ao.push(
                aoEnabled ? this.vertexAO(getBlock, wx, y, wz, face, ssu, ssv) : 3
              );
            }

            const start = layer.positions.length / 3;
            // emit 4 vertices
            for (let ci = 0; ci < 4; ci++) {
              const c = face.corners[ci];
              // water top face: lower by 0.12 for a nicer look
              const isTop = face.tileFace === 0;
              const yOff = def.liquid && isTop ? -0.12 : 0;
              layer.positions.push(wx + c[0], y + c[1] + yOff, wz + c[2]);
              layer.normals.push(
                face.normal[0],
                face.normal[1],
                face.normal[2]
              );
              // UV: project corner onto tu/tv for uv coords
              const dotU = c[0] * face.tu[0] + c[1] * face.tu[1] + c[2] * face.tu[2];
              const dotV = c[0] * face.tv[0] + c[1] * face.tv[1] + c[2] * face.tv[2];
              const uu = dotU > 0 ? uv.u1 : uv.u0;
              const vv = dotV > 0 ? uv.v1 : uv.v0;
              layer.uvs.push(uu, vv);
              const a = AO_TABLE[ao[ci]];
              const b = shade * a;
              layer.colors.push(b, b, b);
            }
            // flip quad diagonal if it produces smoother AO
            // (avoid the harsh diagonal through two dark corners)
            if (ao[0] + ao[2] > ao[1] + ao[3]) {
              layer.indices.push(start, start + 1, start + 2);
              layer.indices.push(start, start + 2, start + 3);
            } else {
              layer.indices.push(start + 1, start + 2, start + 3);
              layer.indices.push(start + 1, start + 3, start);
            }
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

export function isWaterTop(block: number): boolean {
  return isLiquid(block);
}

export { SEA_LEVEL };
