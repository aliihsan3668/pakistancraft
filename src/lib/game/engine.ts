// PakistanCraft — main engine: Three.js setup, render loop, input, interaction
import * as THREE from "three";
import { World } from "./world";
import { Player } from "./player";
import { Block, BLOCKS, buildAtlasTexture } from "./blocks";
import { getBiome } from "./biomes";
import {
  CHUNK_SIZE,
  RENDER_DISTANCE,
  REACH_DISTANCE,
  DAY_LENGTH,
  PLAYER_EYE,
  SEA_LEVEL,
} from "./constants";

export interface HudState {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  x: number;
  y: number;
  z: number;
  biome: string;
  biomeUrdu: string;
  fps: number;
  timeOfDay: number;
  flying: boolean;
  pointerLocked: boolean;
  selectedBlock: number;
  selectedName: string;
  selectedSlot: number;
  hotbar: number[];
  onGround: boolean;
}

export interface EngineCallbacks {
  onHud?: (s: HudState) => void;
  onReady?: () => void;
}

// Default hotbar: a curated Pakistani palette
const DEFAULT_HOTBAR: number[] = [
  Block.GRASS,
  Block.DIRT,
  Block.STONE,
  Block.COBBLE,
  Block.LOG_NEEM,
  Block.PLANKS,
  Block.BRICK,
  Block.MARBLE,
  Block.GLASS,
];

// Full creative palette (shown in inventory)
export const CREATIVE_PALETTE: number[] = [
  Block.GRASS,
  Block.DIRT,
  Block.SAND,
  Block.SANDSTONE,
  Block.STONE,
  Block.COBBLE,
  Block.SNOW,
  Block.ICE,
  Block.WATER,
  Block.LOG_NEEM,
  Block.PLANKS,
  Block.LEAVES,
  Block.LOG_PALM,
  Block.LEAVES_PALM,
  Block.LEAVES_MANGO,
  Block.BRICK,
  Block.MARBLE,
  Block.SANDSTONE_BRICK,
  Block.MUD_BRICK,
  Block.CACTUS,
  Block.WHEAT,
  Block.SUGARCANE,
  Block.LAMP,
  Block.GLASS,
  Block.IRON,
  Block.GOLD,
  Block.CARPET_GREEN,
  Block.CONCRETE,
  Block.ASPHALT,
  Block.GRASS_DRY,
  Block.CLAY,
  Block.SALT,
  Block.PUMPKIN,
  Block.POPPY,
  Block.TORCH,
  Block.ROOF_TILE,
  Block.MOSQUE_DOME,
  Block.RICE_CROP,
  Block.COTTON_CROP,
];

export class Engine {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: World;
  player: Player;
  callbacks: EngineCallbacks;

  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  clouds: THREE.Mesh | null = null;

  timeOfDay = 0.3; // start at morning
  running = false;
  lastTime = 0;
  fpsAccum = 0;
  fpsCount = 0;
  fps = 60;
  hudTimer = 0;

  hotbar: number[];
  selected = 0;

  pointerLocked = false;
  inputEnabled = true;
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  private breakCooldown = 0;
  private placeCooldown = 0;

  private materials: {
    solid: THREE.Material;
    cutout: THREE.Material;
    water: THREE.Material;
  };

  // bound handlers
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onWheel: (e: WheelEvent) => void;
  private _onPointerLockChange: () => void;
  private _onResize: () => void;
  private _onContext: (e: Event) => void;
  private _raf = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.hotbar = [...DEFAULT_HOTBAR];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#87b6e8");
    this.scene.fog = new THREE.Fog("#bcd8ee", CHUNK_SIZE * 2, CHUNK_SIZE * (RENDER_DISTANCE - 0.5));

    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.05,
      1000
    );

    // materials
    const atlas = buildAtlasTexture();
    this.materials = {
      solid: new THREE.MeshLambertMaterial({
        map: atlas,
        vertexColors: true,
      }),
      cutout: new THREE.MeshLambertMaterial({
        map: atlas,
        vertexColors: true,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      }),
      water: new THREE.MeshLambertMaterial({
        map: atlas,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };

    this.world = new World(this.scene, this.materials, 1337);

    // Spawn player at origin, find surface
    // Pre-generate spawn area so spawnY works
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureTerrain(dx, dz);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureDecorated(dx, dz);
    const spawnY = Player.spawnY(this.world, 8, 8);
    this.player = new Player(this.world, this.camera, 8.5, spawnY + 0.5, 8.5);

    // Lights
    this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a3a, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.0);
    this.sun.position.set(40, 80, 20);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.makeClouds();

    // bind handlers
    this._onKeyDown = (e) => this.onKeyDown(e);
    this._onKeyUp = (e) => this.onKeyUp(e);
    this._onMouseDown = (e) => this.onMouseDown(e);
    this._onMouseUp = (e) => this.onMouseUp(e);
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onWheel = (e) => this.onWheel(e);
    this._onPointerLockChange = () => this.onPointerLockChange();
    this._onResize = () => this.onResize();
    this._onContext = (e) => e.preventDefault();
  }

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("wheel", this._onWheel, { passive: false });
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    window.addEventListener("resize", this._onResize);
    this.canvas.addEventListener("contextmenu", this._onContext);
    this.lastTime = performance.now();
    this._raf = requestAnimationFrame(this.loop);
    this.callbacks.onReady?.();
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("mouseup", this._onMouseUp);
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("wheel", this._onWheel);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    window.removeEventListener("resize", this._onResize);
    this.canvas.removeEventListener("contextmenu", this._onContext);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.renderer.dispose();
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  setSeed(seed: number) {
    // rebuild world with new seed (used before start)
    this.world = new World(this.scene, this.materials, seed);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureTerrain(dx, dz);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureDecorated(dx, dz);
    const spawnY = Player.spawnY(this.world, 8, 8);
    this.player = new Player(this.world, this.camera, 8.5, spawnY + 0.5, 8.5);
  }

  teleportTo(x: number, z: number) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        this.world.ensureTerrain(
          Math.floor(x / CHUNK_SIZE) + dx,
          Math.floor(z / CHUNK_SIZE) + dz
        );
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        this.world.ensureDecorated(
          Math.floor(x / CHUNK_SIZE) + dx,
          Math.floor(z / CHUNK_SIZE) + dz
        );
    const y = Player.spawnY(this.world, Math.floor(x), Math.floor(z));
    this.player.pos.set(x + 0.5, y + 0.5, z + 0.5);
    this.player.vel.set(0, 0, 0);
  }

  setSelected(i: number) {
    this.selected = ((i % this.hotbar.length) + this.hotbar.length) % this.hotbar.length;
  }

  setHotbarSlot(slot: number, blockId: number) {
    if (slot < 0 || slot >= this.hotbar.length) return;
    this.hotbar[slot] = blockId;
  }

  getSelectedBlock(): number {
    return this.hotbar[this.selected];
  }

  // ---- input handlers ----
  private onKeyDown(e: KeyboardEvent) {
    const code = e.code;
    this.keys.add(code);
    // hotbar number keys
    if (code.startsWith("Digit")) {
      const n = parseInt(code.slice(5), 10);
      if (n >= 1 && n <= 9) {
        this.setSelected(n - 1);
      }
    }
    if (code === "KeyF") {
      this.player.toggleFly();
    }
    if (code === "Escape") {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
    // prevent scroll on space
    if (code === "Space") e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  private updateInputState() {
    const i = this.player.input;
    if (!this.inputEnabled) {
      i.forward = i.back = i.left = i.right = i.jump = i.sprint = i.sneak = false;
      return;
    }
    i.forward = this.keys.has("KeyW");
    i.back = this.keys.has("KeyS");
    i.left = this.keys.has("KeyA");
    i.right = this.keys.has("KeyD");
    i.jump = this.keys.has("Space");
    i.sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    i.sneak = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
  }

  private onMouseDown(e: MouseEvent) {
    this.mouseButtons.add(e.button);
    if (!this.pointerLocked) return;
    if (e.button === 0) {
      this.tryBreak();
      this.breakCooldown = 0.25;
    } else if (e.button === 2) {
      this.tryPlace();
      this.placeCooldown = 0.25;
    }
  }

  private onMouseUp(e: MouseEvent) {
    this.mouseButtons.delete(e.button);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.pointerLocked) return;
    this.player.setLookFromDelta(e.movementX, e.movementY);
  }

  private onWheel(e: WheelEvent) {
    if (!this.pointerLocked) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.setSelected(this.selected + dir);
  }

  private onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tryBreak() {
    const hit = this.player.raycast(REACH_DISTANCE);
    if (!hit) return;
    const b = this.world.getBlock(hit.x, hit.y, hit.z);
    if (b === Block.BEDROCK) return;
    this.world.setBlock(hit.x, hit.y, hit.z, Block.AIR);
    // remesh this chunk + neighbors if on border
    this.world.remeshAround(hit.x, hit.z);
    if (hit.nx !== 0) this.world.remeshAround(hit.x + hit.nx, hit.z);
    if (hit.nz !== 0) this.world.remeshAround(hit.x, hit.z + hit.nz);
  }

  private tryPlace() {
    const hit = this.player.raycast(REACH_DISTANCE);
    if (!hit) return;
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    // don't place inside the player
    const playerMinX = this.player.pos.x - 0.3;
    const playerMaxX = this.player.pos.x + 0.3;
    const playerMinY = this.player.pos.y;
    const playerMaxY = this.player.pos.y + 1.8;
    const playerMinZ = this.player.pos.z - 0.3;
    const playerMaxZ = this.player.pos.z + 0.3;
    if (
      px + 1 > playerMinX &&
      px < playerMaxX &&
      py + 1 > playerMinY &&
      py < playerMaxY &&
      pz + 1 > playerMinZ &&
      pz < playerMaxZ
    ) {
      // would intersect player
      const def = BLOCKS[this.getSelectedBlock()];
      if (def && def.solid) return;
    }
    const existing = this.world.getBlock(px, py, pz);
    if (existing !== Block.AIR && !BLOCKS[existing]?.liquid) return;
    this.world.setBlock(px, py, pz, this.getSelectedBlock());
    this.world.remeshAround(px, pz);
    if (hit.nx !== 0) this.world.remeshAround(px + hit.nx, pz);
    if (hit.nz !== 0) this.world.remeshAround(px, pz + hit.nz);
  }

  // ---- clouds ----
  private makeClouds() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    // procedural cloud blobs
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 20 + Math.random() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    const geo = new THREE.PlaneGeometry(2000, 2000);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      fog: false,
    });
    this.clouds = new THREE.Mesh(geo, mat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 90;
    this.scene.add(this.clouds);
  }

  // ---- day/night ----
  private updateSky(dt: number) {
    this.timeOfDay += dt / DAY_LENGTH;
    if (this.timeOfDay >= 1) this.timeOfDay -= 1;
    const t = this.timeOfDay;
    // sun angle: t=0.25 sunrise (east), 0.5 noon (top), 0.75 sunset (west)
    const ang = (t - 0.25) * Math.PI * 2;
    const sunY = Math.sin(ang);
    const sunX = Math.cos(ang);
    this.sun.position.set(sunX * 120, sunY * 120 + 10, 40);
    this.sun.target.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);

    // intensity
    const dayFactor = Math.max(0, sunY);
    this.sun.intensity = 0.2 + dayFactor * 1.0;
    this.ambient.intensity = 0.18 + dayFactor * 0.3;
    this.hemi.intensity = 0.25 + dayFactor * 0.45;

    // sun color: warm at sunrise/sunset
    const warmth = Math.max(0, 1 - Math.abs(sunY) * 2.2);
    const sunColor = new THREE.Color().lerpColors(
      new THREE.Color("#fff2d8"),
      new THREE.Color("#ff9a3a"),
      warmth
    );
    this.sun.color.copy(sunColor);

    // sky color
    const night = new THREE.Color("#0a1430");
    const day = new THREE.Color("#87b6e8");
    const sunset = new THREE.Color("#e89a5a");
    let sky: THREE.Color;
    if (sunY > 0.15) {
      sky = day.clone();
    } else if (sunY > -0.15) {
      // sunrise/sunset blend
      const k = (sunY + 0.15) / 0.3;
      sky = night.clone().lerp(day, k).lerp(sunset, (1 - Math.abs(sunY) / 0.15) * 0.6);
    } else {
      sky = night.clone();
    }
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);

    // clouds follow player and drift
    if (this.clouds) {
      this.clouds.position.x = this.player.pos.x;
      this.clouds.position.z = this.player.pos.z;
      (this.clouds.material as THREE.MeshBasicMaterial).opacity =
        0.3 + dayFactor * 0.4;
    }
  }

  // ---- main loop ----
  private loop = (now: number) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // fps
    this.fpsAccum += dt;
    this.fpsCount++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsCount = 0;
    }

    // input
    this.updateInputState();

    // continuous break/place while holding (creative style)
    if (this.pointerLocked) {
      this.breakCooldown -= dt;
      this.placeCooldown -= dt;
      if (this.mouseButtons.has(0) && this.breakCooldown <= 0) {
        this.tryBreak();
        this.breakCooldown = 0.22;
      }
      if (this.mouseButtons.has(2) && this.placeCooldown <= 0) {
        this.tryPlace();
        this.placeCooldown = 0.22;
      }
    }

    // player physics
    this.player.update(dt);

    // world streaming
    this.world.update(this.player.pos.x, this.player.pos.z, 3);

    // sky
    this.updateSky(dt);

    // render
    this.renderer.render(this.scene, this.camera);

    // HUD updates (throttled)
    this.hudTimer += dt;
    if (this.hudTimer >= 0.15) {
      this.hudTimer = 0;
      this.emitHud();
    }
  };

  private emitHud() {
    if (!this.callbacks.onHud) return;
    const biomeId = this.world.getBiomeAt(
      Math.floor(this.player.pos.x),
      Math.floor(this.player.pos.z)
    );
    const biome = getBiome(biomeId);
    const sel = this.getSelectedBlock();
    this.callbacks.onHud({
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      hunger: this.player.hunger,
      maxHunger: this.player.maxHunger,
      x: this.player.pos.x,
      y: this.player.pos.y,
      z: this.player.pos.z,
      biome: biome.name,
      biomeUrdu: biome.nameUrdu,
      fps: this.fps,
      timeOfDay: this.timeOfDay,
      flying: this.player.flying,
      pointerLocked: this.pointerLocked,
      selectedBlock: sel,
      selectedName: BLOCKS[sel]?.name ?? "?",
      selectedSlot: this.selected,
      hotbar: [...this.hotbar],
      onGround: this.player.onGround,
    });
  }
}

export { PLAYER_EYE, SEA_LEVEL };
