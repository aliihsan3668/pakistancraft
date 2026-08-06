// PakistanCraft — TNT explosion system: fuses, explosions, chain reactions,
// crater formation, and particle bursts.
import { Block, BLOCKS } from "./blocks";
import { isSolid } from "./blocks";

export interface PendingTNT {
  x: number;
  y: number;
  z: number;
  fuse: number; // seconds remaining
}

const EXPLOSION_RADIUS = 4;
const FUSE_TIME = 3.0; // seconds

export class ExplosionSystem {
  pending: PendingTNT[] = [];
  // callback to remove a block and trigger remesh
  removeBlock: (x: number, y: number, z: number) => void;
  // callback to emit particles
  emitParticles: (x: number, y: number, z: number, block: number, count: number) => void;
  // callback to get a block
  getBlock: (x: number, y: number, z: number) => number;
  // explosion flash timer for screen feedback
  flashTimer = 0;

  constructor(opts: {
    removeBlock: (x: number, y: number, z: number) => void;
    emitParticles: (x: number, y: number, z: number, block: number, count: number) => void;
    getBlock: (x: number, y: number, z: number) => number;
  }) {
    this.removeBlock = opts.removeBlock;
    this.emitParticles = opts.emitParticles;
    this.getBlock = opts.getBlock;
  }

  // Ignite a TNT block at (x,y,z) — starts the fuse timer.
  ignite(x: number, y: number, z: number) {
    // avoid duplicate entries
    for (const p of this.pending) {
      if (p.x === x && p.y === y && p.z === z) return;
    }
    this.pending.push({ x, y, z, fuse: FUSE_TIME });
  }

  update(dt: number) {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.pending.length === 0) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.fuse -= dt;
      if (p.fuse <= 0) {
        this.explode(p.x, p.y, p.z);
        this.pending.splice(i, 1);
      }
    }
  }

  // Detonate: destroy blocks in a sphere, spawn particles, chain ignite nearby TNT.
  private explode(cx: number, cy: number, cz: number) {
    const r = EXPLOSION_RADIUS;
    const r2 = r * r;
    // flash for screen feedback
    this.flashTimer = 0.35;

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const dist2 = dx * dx + dy * dy + dz * dz;
          if (dist2 > r2) continue;
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          const b = this.getBlock(x, y, z);
          if (b === Block.AIR || b === Block.BEDROCK) continue;
          // randomize edges for a natural crater (not a perfect sphere)
          if (dist2 > r2 * 0.7 && Math.random() > 0.4) continue;
          // chain reaction: ignite nearby TNT instead of destroying instantly
          if (b === Block.TNT) {
            this.ignite(x, y, z);
            continue;
          }
          // spawn break particles for the destroyed block
          if (Math.random() < 0.5) {
            this.emitParticles(x, y, z, b, 4);
          }
          this.removeBlock(x, y, z);
        }
      }
    }
    // big explosion particle burst at center
    this.emitParticles(cx, cy, cz, Block.TNT, 40);
  }

  // Check if a position is currently a pending TNT (for rendering tint)
  isPending(x: number, y: number, z: number): boolean {
    for (const p of this.pending) {
      if (p.x === x && p.y === y && p.z === z) return true;
    }
    return false;
  }
}

export { EXPLOSION_RADIUS, FUSE_TIME, isSolid, BLOCKS };
