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

  constructor(world: World, camera: THREE.PerspectiveCamera, x: number, y: number, z: number) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(0, 0, 0);
  }

  // Find a safe spawn Y at given x,z (top of terrain, skipping trees/decoration)
  static spawnY(world: World, x: number, z: number): number {
    const nonSurface = new Set([
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
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.set(0, 0, 0);
  }

  update(dt: number) {
    // Determine if eye is in water
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
      const baseSpeed = this.input.sprint ? SPRINT_SPEED : WALK_SPEED;
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

    // bob
    if (this.onGround && (Math.abs(this.vel.x) + Math.abs(this.vel.z)) > 0.5) {
      this.bob += dt * (this.input.sprint ? 12 : 8);
    } else {
      this.bob *= 0.9;
    }

    // fall damage / void
    if (this.pos.y < -10) {
      this.pos.set(this.pos.x, 40, this.pos.z);
      this.vel.set(0, 0, 0);
      this.health = Math.max(0, this.health - 4);
    }

    // Update camera
    const bobY = Math.sin(this.bob) * 0.06;
    const bobX = Math.cos(this.bob * 0.5) * 0.04;
    this.camera.position.set(
      this.pos.x + bobX,
      this.pos.y + PLAYER_EYE + bobY,
      this.pos.z
    );
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    this.camera.quaternion.copy(q);
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    const p = this.pos;
    if (axis === "x") p.x += amount;
    else if (axis === "y") p.y += amount;
    else p.z += amount;

    // AABB
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
    // DDA voxel traversal
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    const distToBoundary = (o: number, s: number) => {
      if (s > 0) return Math.floor(o) + 1 - o;
      if (s < 0) return o - Math.floor(o);
      return Infinity;
    };
    let tMaxX = dir.x !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = dir.y !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = dir.z !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;

    let nx = 0,
      ny = 0,
      nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const b = this.world.getBlock(x, y, z);
      if (b !== Block.AIR && !isLiquid(b)) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }
}
