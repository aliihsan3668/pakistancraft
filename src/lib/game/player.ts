// PakistanCraft — player controller: physics, collision, mouse look
import * as THREE from "three";
import { World } from "./world";
import { isSolid, isLiquid, Block } from "./blocks";
import {
  PLAYER_HEIGHT,
  PLAYER_EYE,
  PLAYER_RADIUS,
  GRAVITY,
  JUMP_VELOCITY,
  WALK_SPEED,
  SPRINT_SPEED,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
} from "./constants";

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
}

export class Player {
  world: World;
  camera: THREE.PerspectiveCamera;
  // feet position
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  inWater = false;
  input: InputState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    sneak: false,
  };
  // survival stats
  health = 20;
  maxHealth = 20;
  hunger = 20;
  maxHunger = 20;
  bob = 0;
  gameMode: "creative" | "survival" = "creative";
  private fallStart = 0; // y where the fall began
  private wasOnGround = true;
  private hungerTimer = 0;
  private regenTimer = 0;
  // cached math objects (avoid per-frame allocation)
  private _camQuat = new THREE.Quaternion();
  private _camEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private _rayOrigin = new THREE.Vector3();
  private _rayDir = new THREE.Vector3();

  constructor(world: World, camera: THREE.PerspectiveCamera, x: number, y: number, z: number) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(0, 0, 0);
  }

  // Find a safe spawn Y at given x,z (top of terrain, skipping trees/decoration)
  static spawnY(world: World, x: number, z: number): number {
    const nonSurface = new Set<number>([
      Block.LOG_NEEM,
      Block.LOG_PALM,
      Block.LEAVES,
      Block.LEAVES_PALM,
      Block.LEAVES_MANGO,
      Block.CACTUS,
      Block.WHEAT,
      Block.SUGARCANE,
      Block.RICE_CROP,
      Block.COTTON_CROP,
      Block.POPPY,
      Block.TORCH,
      Block.LAMP,
      Block.WATER,
      Block.ICE,
    ]);
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let y = 60; y > 0; y--) {
      const b = world.getBlock(ix, y, iz);
      if (isSolid(b) && !nonSurface.has(b)) return y + 1;
    }
    return 30;
  }

  setLookFromDelta(dx: number, dy: number, sensitivity = 0.0022) {
    // smoothed look: blend target into current for buttery camera
    this._targetYaw -= dx * sensitivity;
    this._targetPitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this._targetPitch = Math.max(-lim, Math.min(lim, this._targetPitch));
  }

  private _targetYaw = 0;
  private _targetPitch = 0;
  // sneak: camera height interpolates down for a crouch effect
  private _eyeHeight = PLAYER_EYE;
  private _targetEyeHeight = PLAYER_EYE;
  // FOV kick on sprint
  fovKick = 0;
  private _targetFovKick = 0;

  toggleFly() {
    this.flying = !this.flying;
    this.vel.set(0, 0, 0);
  }

  update(dt: number) {
    // Smooth look: frame-rate-independent exponential decay.
    // Same effective smoothing at any FPS (30, 60, 120, 144 Hz).
    const lookLerp = 1 - Math.exp(-30 * dt);
    this.yaw += (this._targetYaw - this.yaw) * lookLerp;
    this.pitch += (this._targetPitch - this.pitch) * lookLerp;

    // Determine if eye is in water — use Math.floor (correct for negative coords)
    const eyeBlock = this.world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + PLAYER_EYE),
      Math.floor(this.pos.z)
    );
    this.inWater = isLiquid(eyeBlock);

    // Build wish direction in world space from yaw
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = -Z when yaw=0; with yaw rotation
    let fx = -sin;
    let fz = -cos;
    // right = +X
    let rx = cos;
    let rz = -sin;

    let wishX = 0;
    let wishZ = 0;
    if (this.input.forward) {
      wishX += fx;
      wishZ += fz;
    }
    if (this.input.back) {
      wishX -= fx;
      wishZ -= fz;
    }
    if (this.input.right) {
      wishX += rx;
      wishZ += rz;
    }
    if (this.input.left) {
      wishX -= rx;
      wishZ -= rz;
    }
    const wlen = Math.hypot(wishX, wishZ);
    if (wlen > 0) {
      wishX /= wlen;
      wishZ /= wlen;
    }

    if (this.flying) {
      const speed = this.input.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;
      this.vel.x = wishX * speed;
      this.vel.z = wishZ * speed;
      let vy = 0;
      if (this.input.jump) vy += 1;
      if (this.input.sneak) vy -= 1;
      this.vel.y = vy * speed;
    } else {
      const canSprint =
        this.input.sprint &&
        !this.input.sneak &&
        (this.gameMode === "creative" || this.hunger > 0);
      let baseSpeed = canSprint ? SPRINT_SPEED : WALK_SPEED;
      if (this.input.sneak) baseSpeed *= 0.45; // crouch is slow
      const speed = this.inWater ? baseSpeed * 0.5 : baseSpeed;
      // horizontal: accelerate toward wish
      const targetVx = wishX * speed;
      const targetVz = wishZ * speed;
      const accel = this.onGround ? 14 : 6;
      this.vel.x += (targetVx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (targetVz - this.vel.z) * Math.min(1, accel * dt);
      // gravity
      if (this.inWater) {
        this.vel.y -= GRAVITY * 0.28 * dt;
        // swim up when holding jump
        if (this.input.jump) this.vel.y = 4;
        // buoyancy damp
        this.vel.y *= 0.92;
      } else {
        this.vel.y -= GRAVITY * dt;
      }
      // jump
      if (this.input.jump && this.onGround && !this.inWater) {
        this.vel.y = JUMP_VELOCITY;
        this.onGround = false;
      }
    }

    // Move axis by axis with collision
    this.moveAxis("x", this.vel.x * dt);
    this.moveAxis("z", this.vel.z * dt);
    const groundBefore = this.onGround;
    this.onGround = false;
    this.moveAxis("y", this.vel.y * dt);

    // track fall distance for fall damage (survival only)
    if (this.gameMode === "survival") {
      if (this.onGround) {
        if (!this.wasOnGround) {
          // just landed
          const fallDist = this.fallStart - this.pos.y;
          if (fallDist > 3.5) {
            const dmg = Math.floor((fallDist - 3) * 1.2);
            this.health = Math.max(0, this.health - dmg);
          }
          this.fallStart = this.pos.y;
        }
      } else {
        // falling — track the PEAK (highest point before the fall).
        // Only update if current y exceeds stored peak (not every frame).
        if (this.vel.y < -2 && this.pos.y > this.fallStart) {
          this.fallStart = this.pos.y;
        }
      }
      this.wasOnGround = this.onGround;
    }

    // bob
    if (this.onGround && (Math.abs(this.vel.x) + Math.abs(this.vel.z)) > 0.5) {
      this.bob += dt * (this.input.sprint ? 12 : 8);
    } else {
      this.bob *= 0.9;
    }

    // ---- survival stats ----
    if (this.gameMode === "survival") {
      // hunger drains over time (per second, applied every frame for smoothness)
      const drainPerSec = this.input.sprint ? 0.25 : 0.08;
      this.hunger = Math.max(0, this.hunger - drainPerSec * dt);
      // regen health when hunger is high enough
      if (this.hunger >= 16 && this.health < this.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer > 3) {
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.hunger = Math.max(0, this.hunger - 0.5);
          this.regenTimer = 0;
        }
      } else {
        this.regenTimer = 0;
      }
      // starvation
      if (this.hunger <= 0) {
        this.regenTimer += dt;
        if (this.regenTimer > 4) {
          this.health = Math.max(0, this.health - 1);
          this.regenTimer = 0;
        }
      }
    } else {
      // creative: full health, no hunger drain
      this.health = this.maxHealth;
      this.hunger = this.maxHunger;
    }

    // fall damage / void
    if (this.pos.y < -10) {
      this.pos.set(this.pos.x, 40, this.pos.z);
      this.vel.set(0, 0, 0);
      this.health = Math.max(0, this.health - 4);
    }

    // sneak lowers eye height (crouch), frame-rate-independent smoothing
    const sneakLerp = 1 - Math.exp(-12 * dt);
    this._targetEyeHeight = this.input.sneak && !this.flying ? PLAYER_EYE - 0.3 : PLAYER_EYE;
    this._eyeHeight += (this._targetEyeHeight - this._eyeHeight) * sneakLerp;

    // FOV kick on sprint (smooth)
    this._targetFovKick = this.input.sprint && (Math.abs(this.vel.x) + Math.abs(this.vel.z)) > 1 ? 6 : 0;
    this.fovKick += (this._targetFovKick - this.fovKick) * (1 - Math.exp(-10 * dt));

    // Update camera
    const bobY = Math.sin(this.bob) * 0.06;
    const bobX = Math.cos(this.bob * 0.5) * 0.04;
    this.camera.position.set(
      this.pos.x + bobX,
      this.pos.y + this._eyeHeight + bobY,
      this.pos.z
    );
    const q = this._camQuat;
    const e = this._camEuler.set(this.pitch, this.yaw, 0, "YXZ");
    q.setFromEuler(e);
    this.camera.quaternion.copy(q);
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    const p = this.pos;
    if (axis === "x") p.x += amount;
    else if (axis === "y") p.y += amount;
    else p.z += amount;

    // AABB — use Math.floor (correct for negative coordinates)
    const minX = p.x - PLAYER_RADIUS;
    const maxX = p.x + PLAYER_RADIUS;
    const minY = p.y;
    const maxY = p.y + PLAYER_HEIGHT;
    const minZ = p.z - PLAYER_RADIUS;
    const maxZ = p.z + PLAYER_RADIUS;

    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);

    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          if (!isSolid(this.world.getBlock(x, y, z))) continue;
          // collision: push out along axis
          if (axis === "x") {
            if (amount > 0) p.x = x - PLAYER_RADIUS - 1e-4;
            else p.x = x + 1 + PLAYER_RADIUS + 1e-4;
            this.vel.x = 0;
            return;
          } else if (axis === "y") {
            if (amount > 0) {
              p.y = y - PLAYER_HEIGHT - 1e-4;
              this.vel.y = 0;
            } else {
              p.y = y + 1 + 1e-4;
              this.vel.y = 0;
              this.onGround = true;
            }
            return;
          } else {
            if (amount > 0) p.z = z - PLAYER_RADIUS - 1e-4;
            else p.z = z + 1 + PLAYER_RADIUS + 1e-4;
            this.vel.z = 0;
            return;
          }
        }
  }

  // Raycast for block selection. Returns hit {x,y,z, face} or null.
  raycast(maxDist: number): {
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
  } | null {
    // DDA voxel traversal — compute origin/direction from player state directly
    // (avoids stale camera matrix when called outside the render loop)
    const origin = this._rayOrigin.set(
      this.pos.x,
      this.pos.y + this._eyeHeight,
      this.pos.z
    );
    const dir = this._rayDir;
    // forward direction from yaw/pitch:
    // yaw=0 → -Z, pitch=0 → horizontal; pitch>0 → looking down
    const cp = Math.cos(this.pitch);
    dir.set(
      -Math.sin(this.yaw) * cp,
      -Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    );

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    // inline distToBoundary (avoid closure allocation)
    const ox = origin.x, oy = origin.y, oz = origin.z;
    let tMaxX: number;
    if (stepX > 0) tMaxX = (Math.floor(ox) + 1 - ox) * tDeltaX;
    else if (stepX < 0) tMaxX = (ox - Math.floor(ox)) * tDeltaX;
    else tMaxX = Infinity;
    let tMaxY: number;
    if (stepY > 0) tMaxY = (Math.floor(oy) + 1 - oy) * tDeltaY;
    else if (stepY < 0) tMaxY = (oy - Math.floor(oy)) * tDeltaY;
    else tMaxY = Infinity;
    let tMaxZ: number;
    if (stepZ > 0) tMaxZ = (Math.floor(oz) + 1 - oz) * tDeltaZ;
    else if (stepZ < 0) tMaxZ = (oz - Math.floor(oz)) * tDeltaZ;
    else tMaxZ = Infinity;

    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const b = this.world.getBlock(x, y, z);
      if (b !== Block.AIR && b !== Block.WATER && b !== Block.ICE) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }
}
