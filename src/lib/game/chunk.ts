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
    const data = this.data;
    const CS = CHUNK_SIZE;
    const WH = WORLD_HEIGHT;

    for (let lx = 0; lx < CS; lx++) {
      for (let lz = 0; lz < CS; lz++) {
        for (let y = 0; y < WH; y++) {
          // inline idx: (y*CS + lz)*CS + lx
          const block = data[(y * CS + lz) * CS + lx];
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
            const nb = getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            if (!shouldRenderFace(block, nb)) continue;

            const tile = def.tiles[face.tileFace];
            const uv = tileUV(tile);
            const shade = face.shade;
            const isTop = face.tileFace === 0;
            const yOff = def.liquid && isTop ? -0.12 : 0;

            // compute AO for 4 corners using named locals (no array alloc)
            let ao0: number, ao1: number, ao2: number, ao3: number;
            if (aoEnabled) {
              const c0 = face.corners[0];
              const c1 = face.corners[1];
              const c2 = face.corners[2];
              const c3 = face.corners[3];
              const tu = face.tu, tv = face.tv;
              const su0 = c0[0]*tu[0]+c0[1]*tu[1]+c0[2]*tu[2] > 0 ? 1 : -1;
              const sv0 = c0[0]*tv[0]+c0[1]*tv[1]+c0[2]*tv[2] > 0 ? 1 : -1;
              const su1 = c1[0]*tu[0]+c1[1]*tu[1]+c1[2]*tu[2] > 0 ? 1 : -1;
              const sv1 = c1[0]*tv[0]+c1[1]*tv[1]+c1[2]*tv[2] > 0 ? 1 : -1;
              const su2 = c2[0]*tu[0]+c2[1]*tu[1]+c2[2]*tu[2] > 0 ? 1 : -1;
              const sv2 = c2[0]*tv[0]+c2[1]*tv[1]+c2[2]*tv[2] > 0 ? 1 : -1;
              const su3 = c3[0]*tu[0]+c3[1]*tu[1]+c3[2]*tu[2] > 0 ? 1 : -1;
              const sv3 = c3[0]*tv[0]+c3[1]*tv[1]+c3[2]*tv[2] > 0 ? 1 : -1;
              ao0 = this.vertexAO(getBlock, wx, y, wz, face, su0, sv0);
              ao1 = this.vertexAO(getBlock, wx, y, wz, face, su1, sv1);
              ao2 = this.vertexAO(getBlock, wx, y, wz, face, su2, sv2);
              ao3 = this.vertexAO(getBlock, wx, y, wz, face, su3, sv3);
            } else {
              ao0 = ao1 = ao2 = ao3 = 3;
            }

            const start = layer.positions.length / 3;
            const corners = face.corners;
            const tu = face.tu, tv = face.tv;
            // emit 4 vertices
            for (let ci = 0; ci < 4; ci++) {
              const c = corners[ci];
              layer.positions.push(wx + c[0], y + c[1] + yOff, wz + c[2]);
              layer.normals.push(face.normal[0], face.normal[1], face.normal[2]);
              const dotU = c[0]*tu[0] + c[1]*tu[1] + c[2]*tu[2];
              const dotV = c[0]*tv[0] + c[1]*tv[1] + c[2]*tv[2];
              const uu = dotU > 0 ? uv.u1 : uv.u0;
              const vv = dotV > 0 ? uv.v1 : uv.v0;
              layer.uvs.push(uu, vv);
              const a = AO_TABLE[ci === 0 ? ao0 : ci === 1 ? ao1 : ci === 2 ? ao2 : ao3];
              const b = shade * a;
              layer.colors.push(b, b, b);
            }
            // flip quad diagonal if it produces smoother AO
            if (ao0 + ao2 > ao1 + ao3) {
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
