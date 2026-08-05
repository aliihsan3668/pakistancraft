// PakistanCraft — main engine: Three.js setup, render loop, input, interaction,
// sky, particles, weather, settings, survival, save/load.
import * as THREE from "three";
import { World } from "./world";
import { Player } from "./player";
import { Block, BLOCKS, buildAtlasTexture } from "./blocks";
import { getBiome } from "./biomes";
import { Sky } from "./sky";
import { ParticleSystem } from "./particles";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
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
  yaw: number;
  heading: string; // N / NE / E / ...
  weather: "clear" | "rain";
  gameMode: "creative" | "survival";
  brightness: number;
  settings: Settings;
  raining: boolean;
}

export interface EngineCallbacks {
  onHud?: (s: HudState) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;
}

export interface EngineOptions extends EngineCallbacks {
  seed: number;
  settings?: Settings;
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

const SAVE_KEY = "pakistancraft.save";

function headingFromYaw(yaw: number): string {
  // yaw=0 → looking -Z (north). Normalize to 0..2π.
  let a = (-yaw) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  const deg = (a / (Math.PI * 2)) * 360;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

export class Engine {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: World;
  player: Player;
  callbacks: EngineCallbacks;
  settings: Settings;

  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  clouds: THREE.Mesh | null = null;
  sky: Sky;
  particles: ParticleSystem;
  rain: THREE.Points | null = null;
  rainVel: Float32Array | null = null;

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
  // drag-to-look fallback
  private dragLook = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private clickStartX = 0;
  private clickStartY = 0;
  private clickStartT = 0;
  private clickMoved = 0;
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  private breakCooldown = 0;
  private placeCooldown = 0;

  // weather
  private weatherTimer = 60; // seconds until next weather change
  raining = false;

  // edits tracking for save
  private edits = new Map<string, number>();

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

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas;
    this.callbacks = opts;
    this.settings = opts.settings ?? loadSettings();
    this.hotbar = [...DEFAULT_HOTBAR];

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch (e) {
      opts.onError?.(
        "WebGL could not be initialized. Make sure hardware acceleration is enabled in your browser settings."
      );
      throw e;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#87b6e8");
    this.scene.fog = new THREE.Fog(
      "#bcd8ee",
      CHUNK_SIZE * 2,
      CHUNK_SIZE * (this.settings.renderDistance - 0.5)
    );

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
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
        opacity: 0.78,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };

    this.world = new World(this.scene, this.materials, opts.seed);
    this.world.ao = this.settings.ao;
    this.world.renderDistance = this.settings.renderDistance;

    // Placeholder player; real spawn position is computed in initSpawn()
    this.player = new Player(this.world, this.camera, 8.5, 50, 8.5);
    this.player.gameMode = this.settings.gameMode;

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
    this.sky = new Sky(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.makeRain();

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
    try {
      this.initSpawn();
    } catch (e) {
      this.callbacks.onError?.(
        "Failed to generate world: " + (e as Error).message
      );
      throw e;
    }
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

  private initSpawn() {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureTerrain(dx, dz);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.world.ensureDecorated(dx, dz);
    const spawnY = Player.spawnY(this.world, 8, 8);
    this.player.pos.set(8.5, spawnY + 0.5, 8.5);
    this.player.vel.set(0, 0, 0);
  }

  requestPointerLock() {
    try {
      const r = this.canvas.requestPointerLock() as unknown as
        | Promise<void>
        | undefined;
      if (r && typeof r.then === "function") {
        r.catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  // ---- settings ----
  setSettings(partial: Partial<Settings>) {
    this.settings = { ...this.settings, ...partial };
    saveSettings(this.settings);
    // apply live
    if (partial.fov !== undefined) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }
    if (partial.renderDistance !== undefined) {
      const f = this.scene.fog as THREE.Fog;
      f.far = CHUNK_SIZE * (this.settings.renderDistance - 0.5);
      this.world.setRenderDistance(this.settings.renderDistance);
    }
    if (partial.ao !== undefined) {
      this.world.setAo(this.settings.ao);
    }
    if (partial.renderClouds !== undefined && this.clouds) {
      this.clouds.visible = this.settings.renderClouds;
    }
    if (partial.renderStars !== undefined) {
      this.sky.stars.visible = this.settings.renderStars;
    }
    if (partial.gameMode !== undefined) {
      this.player.gameMode = this.settings.gameMode;
      if (this.settings.gameMode === "creative") {
        this.player.flying = false; // let user toggle fly manually
      }
    }
  }

  setGameMode(mode: "creative" | "survival") {
    this.setSettings({ gameMode: mode });
    this.player.gameMode = mode;
  }

  setTimeOfDay(t: number) {
    this.timeOfDay = ((t % 1) + 1) % 1;
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
    this.selected =
      ((i % this.hotbar.length) + this.hotbar.length) % this.hotbar.length;
  }

  setHotbarSlot(slot: number, blockId: number) {
    if (slot < 0 || slot >= this.hotbar.length) return;
    this.hotbar[slot] = blockId;
  }

  getSelectedBlock(): number {
    return this.hotbar[this.selected];
  }

  // ---- save / load ----
  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  saveState(seed: number) {
    try {
      const editsArr: [number, number, number, number][] = [];
      for (const [k, v] of this.edits) {
        const [x, y, z] = k.split(",").map(Number);
        editsArr.push([x, y, z, v]);
      }
      const data = {
        seed,
        time: this.timeOfDay,
        player: {
          x: this.player.pos.x,
          y: this.player.pos.y,
          z: this.player.pos.z,
          yaw: this.player.yaw,
          pitch: this.player.pitch,
          health: this.player.health,
          hunger: this.player.hunger,
          flying: this.player.flying,
          gameMode: this.player.gameMode,
        },
        hotbar: this.hotbar,
        selected: this.selected,
        edits: editsArr,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  loadState(): { seed: number } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // restore edits
      if (Array.isArray(data.edits)) {
        for (const [x, y, z, b] of data.edits) {
          this.world.setBlock(x, y, z, b);
          this.edits.set(`${x},${y},${z}`, b);
        }
      }
      // restore player
      const p = data.player;
      if (p) {
        this.player.pos.set(p.x, p.y, p.z);
        this.player.vel.set(0, 0, 0);
        this.player.yaw = p.yaw ?? 0;
        this.player.pitch = p.pitch ?? 0;
        this.player.health = p.health ?? 20;
        this.player.hunger = p.hunger ?? 20;
        this.player.flying = p.flying ?? false;
        this.player.gameMode = p.gameMode ?? "creative";
      }
      if (Array.isArray(data.hotbar)) this.hotbar = data.hotbar;
      if (typeof data.selected === "number") this.selected = data.selected;
      if (typeof data.time === "number") this.timeOfDay = data.time;
      return { seed: data.seed };
    } catch {
      return null;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ---- input handlers ----
  private onKeyDown(e: KeyboardEvent) {
    const code = e.code;
    this.keys.add(code);
    if (code.startsWith("Digit")) {
      const n = parseInt(code.slice(5), 10);
      if (n >= 1 && n <= 9) this.setSelected(n - 1);
    }
    if (code === "KeyF") {
      // fly toggle — creative only
      if (this.player.gameMode === "creative") this.player.toggleFly();
    }
    if (code === "KeyG") {
      // toggle game mode
      this.setGameMode(
        this.player.gameMode === "creative" ? "survival" : "creative"
      );
    }
    if (code === "KeyR") {
      // rain toggle (debug / fun)
      this.raining = !this.raining;
      this.weatherTimer = 120;
    }
    if (code === "KeyT") {
      // set time to noon
      this.setTimeOfDay(0.5);
    }
    if (code === "KeyN") {
      // set time to night
      this.setTimeOfDay(0.0);
    }
    if (code === "Escape") {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
    if (code === "Space" || code.startsWith("Arrow")) e.preventDefault();
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
    i.sprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    i.sneak =
      this.keys.has("ControlLeft") || this.keys.has("ControlRight");
  }

  private onMouseDown(e: MouseEvent) {
    this.mouseButtons.add(e.button);
    if (!this.inputEnabled) return;
    if (this.pointerLocked) {
      if (e.button === 0) {
        this.tryBreak();
        this.breakCooldown = 0.25;
      } else if (e.button === 2) {
        this.tryPlace();
        this.placeCooldown = 0.25;
      }
    } else {
      if (e.button === 0) {
        this.dragLook = true;
        this.dragLastX = e.clientX;
        this.dragLastY = e.clientY;
        this.clickStartX = e.clientX;
        this.clickStartY = e.clientY;
        this.clickStartT = performance.now();
        this.clickMoved = 0;
      } else if (e.button === 2) {
        this.tryPlace();
        this.placeCooldown = 0.25;
      }
    }
  }

  private onMouseUp(e: MouseEvent) {
    this.mouseButtons.delete(e.button);
    if (!this.inputEnabled) {
      this.dragLook = false;
      return;
    }
    if (!this.pointerLocked && e.button === 0 && this.dragLook) {
      const dt = performance.now() - this.clickStartT;
      if (this.clickMoved < 6 && dt < 300) {
        this.tryBreak();
        this.breakCooldown = 0.25;
      }
      this.dragLook = false;
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.inputEnabled) return;
    const sens = 0.0022 * this.settings.mouseSensitivity;
    if (this.pointerLocked) {
      this.player.setLookFromDelta(e.movementX, e.movementY, sens);
    } else if (this.dragLook && this.mouseButtons.has(0)) {
      const dx = e.clientX - this.dragLastX;
      const dy = e.clientY - this.dragLastY;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
      this.clickMoved += Math.abs(dx) + Math.abs(dy);
      this.player.setLookFromDelta(dx, dy, 0.005 * this.settings.mouseSensitivity);
    }
  }

  private onWheel(e: WheelEvent) {
    if (!this.inputEnabled) return;
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
    this.edits.set(`${hit.x},${hit.y},${hit.z}`, Block.AIR);
    this.particles.emitBlockBreak(hit.x, hit.y, hit.z, b, 16);
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
      const def = BLOCKS[this.getSelectedBlock()];
      if (def && def.solid) return;
    }
    const existing = this.world.getBlock(px, py, pz);
    if (existing !== Block.AIR && !BLOCKS[existing]?.liquid) return;
    const placed = this.getSelectedBlock();
    this.world.setBlock(px, py, pz, placed);
    this.edits.set(`${px},${py},${pz}`, placed);
    this.particles.emitBlockBreak(px, py, pz, placed, 6);
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
    this.clouds.visible = this.settings.renderClouds;
    this.scene.add(this.clouds);
  }

  // ---- rain ----
  private makeRain() {
    const count = 4000;
    const positions = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      vel[i * 3] = 0;
      vel[i * 3 + 1] = -20 - Math.random() * 10;
      vel[i * 3 + 2] = -2;
    }
    this.rainVel = vel;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaac4dd,
      size: 0.12,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private updateRain(dt: number) {
    if (!this.rain || !this.rainVel) return;
    this.rain.visible = this.raining;
    if (!this.raining) return;
    this.rain.position.set(
      this.player.pos.x,
      this.player.pos.y,
      this.player.pos.z
    );
    const posAttr = this.rain.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += this.rainVel[i] * dt;
      arr[i + 1] += this.rainVel[i + 1] * dt;
      arr[i + 2] += this.rainVel[i + 2] * dt;
      if (arr[i + 1] < -20) {
        arr[i] = (Math.random() - 0.5) * 60;
        arr[i + 1] = 30 + Math.random() * 10;
        arr[i + 2] = (Math.random() - 0.5) * 60;
      }
    }
    posAttr.needsUpdate = true;
  }

  private updateWeather(dt: number) {
    if (!this.settings.weather) {
      this.raining = false;
      return;
    }
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.raining = !this.raining;
      this.weatherTimer = this.raining ? 60 + Math.random() * 60 : 120 + Math.random() * 180;
    }
  }

  // ---- day/night + sky ----
  private updateSky(dt: number) {
    this.timeOfDay += dt / DAY_LENGTH;
    if (this.timeOfDay >= 1) this.timeOfDay -= 1;

    this.sky.update(
      this.timeOfDay,
      this.player.pos.x,
      this.player.pos.y,
      this.player.pos.z
    );

    const ang = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(ang);
    const sunX = Math.cos(ang);
    this.sun.position.set(
      this.player.pos.x + sunX * 120,
      this.player.pos.y + sunY * 120 + 10,
      this.player.pos.z + 40
    );
    this.sun.target.position.copy(this.player.pos);

    const dayFactor = Math.max(0, sunY);
    let sunI = 0.2 + dayFactor * 1.0;
    let ambI = 0.18 + dayFactor * 0.3;
    let hemiI = 0.25 + dayFactor * 0.45;

    // weather dimming
    if (this.raining) {
      sunI *= 0.45;
      ambI *= 0.7;
      hemiI *= 0.6;
    }

    const warmth = Math.max(0, 1 - Math.abs(sunY) * 2.2);
    const sunColor = new THREE.Color().lerpColors(
      new THREE.Color("#fff2d8"),
      new THREE.Color("#ff9a3a"),
      warmth
    );
    if (this.raining) sunColor.multiplyScalar(0.7);
    this.sun.color.copy(sunColor);
    this.sun.intensity = sunI * this.settings.brightness;
    this.ambient.intensity = ambI * this.settings.brightness;
    this.hemi.intensity = hemiI * this.settings.brightness;

    // background + fog follow sky horizon color
    (this.scene.background as THREE.Color).copy(this.sky.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.sky.fogColor);
    if (this.raining) {
      (this.scene.background as THREE.Color).multiplyScalar(0.6);
      (this.scene.fog as THREE.Fog).color.multiplyScalar(0.7);
    }

    // clouds follow player
    if (this.clouds) {
      this.clouds.position.x = this.player.pos.x;
      this.clouds.position.z = this.player.pos.z;
      const cm = this.clouds.material as THREE.MeshBasicMaterial;
      let cloudOp = 0.3 + dayFactor * 0.4;
      if (this.raining) cloudOp = 0.7;
      cm.opacity = cloudOp;
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

    // arrow-key look
    if (this.inputEnabled) {
      const lr = 1.4 * dt;
      if (this.keys.has("ArrowLeft"))
        this.player.setLookFromDelta(-lr, 0, 1);
      if (this.keys.has("ArrowRight"))
        this.player.setLookFromDelta(lr, 0, 1);
      if (this.keys.has("ArrowUp"))
        this.player.setLookFromDelta(0, -lr, 1);
      if (this.keys.has("ArrowDown"))
        this.player.setLookFromDelta(0, lr, 1);
    }

    // continuous break/place
    if (this.inputEnabled) {
      this.breakCooldown -= dt;
      this.placeCooldown -= dt;
      if (
        this.pointerLocked &&
        this.mouseButtons.has(0) &&
        this.breakCooldown <= 0
      ) {
        this.tryBreak();
        this.breakCooldown = 0.22;
      }
      if (this.mouseButtons.has(2) && this.placeCooldown <= 0) {
        this.tryPlace();
        this.placeCooldown = 0.22;
      }
    }

    // player physics + survival
    this.player.update(dt);

    // world streaming (budget scales modestly with render distance)
    const budget = Math.max(2, Math.floor(this.settings.renderDistance / 2));
    this.world.update(this.player.pos.x, this.player.pos.z, budget);

    // weather + sky + particles
    this.updateWeather(dt);
    this.updateRain(dt);
    this.updateSky(dt);
    this.particles.update(dt);

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
      yaw: this.player.yaw,
      heading: headingFromYaw(this.player.yaw),
      weather: this.raining ? "rain" : "clear",
      gameMode: this.player.gameMode,
      brightness: this.settings.brightness,
      settings: { ...this.settings },
      raining: this.raining,
    });
  }
}

export { PLAYER_EYE, SEA_LEVEL, DEFAULT_SETTINGS };
