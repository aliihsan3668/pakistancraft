// PakistanCraft — main engine: Three.js setup, render loop, input, interaction,
// sky, particles, weather, settings, survival, save/load, explosions.
import * as THREE from "three";
import { World } from "./world";
import { Player } from "./player";
import { Block, BLOCKS, buildAtlasTexture } from "./blocks";
import { getBiome } from "./biomes";
import { Sky } from "./sky";
import { ParticleSystem } from "./particles";
import { ExplosionSystem } from "./explosions";
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
  inWater: boolean;
  yaw: number;
  heading: string; // N / NE / E / ...
  weather: "clear" | "rain";
  gameMode: "creative" | "survival";
  brightness: number;
  settings: Settings;
  raining: boolean;
  targetBlock: { x: number; y: number; z: number } | null;
  breakProgress: number;
  biomeId: number;
  flashTimer: number;
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
  Block.RED_SANDSTONE,
  Block.WHITE_DOME,
  Block.TILE_BLUE,
  Block.AWNING_RED,
  Block.AWNING_GREEN,
  Block.AWNING_YELLOW,
  Block.METAL_RAIL,
  Block.HEDGE,
  Block.FOUNTAIN,
  Block.LANTERN,
  Block.TNT,
];

const SAVE_KEY = "pakistancraft.save";

// Custom water shader: animated vertex waves + specular shimmer + flowing texture,
// respects vertex color (AO/directional shade) and fog.
function makeWaterMaterial(atlas: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false, // we handle fog manually in the shader
    uniforms: {
      uAtlas: { value: atlas },
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color("#bcd8ee") },
      uFogNear: { value: 32 },
      uFogFar: { value: 72 },
      uOpacity: { value: 0.82 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color("#fff0c0") },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vFogDepth;
      varying float vIsTop;
      uniform float uTime;
      void main() {
        vUv = uv;
        vColor = color;
        vec3 pos = position;
        vIsTop = normal.y > 0.5 ? 1.0 : 0.0;
        // wave displacement on top faces
        if (vIsTop > 0.5) {
          float w = sin(pos.x * 0.8 + uTime * 1.5) * 0.05
                  + cos(pos.z * 0.6 + uTime * 1.2) * 0.05
                  + sin((pos.x + pos.z) * 0.4 + uTime * 0.8) * 0.03;
          pos.y += w;
        }
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uOpacity;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vFogDepth;
      varying float vIsTop;
      void main() {
        // scroll UVs for a flowing feel
        vec2 uv = vUv + vec2(uTime * 0.012, uTime * 0.018);
        vec4 tex = texture2D(uAtlas, uv);
        vec3 col = tex.rgb * vColor;
        // specular shimmer on top faces (sun glint)
        if (vIsTop > 0.5) {
          // approximate normal from wave derivatives
          vec3 n = normalize(vec3(
            cos(vWorldPos.x * 0.8 + uTime * 1.5) * 0.3,
            1.0,
            sin(vWorldPos.z * 0.6 + uTime * 1.2) * 0.3
          ));
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(normalize(uSunDir) + viewDir);
          float spec = pow(max(dot(n, halfDir), 0.0), 32.0);
          col += uSunColor * spec * 0.6;
          // slight depth-based color shift (deeper = darker)
          col *= 0.85 + 0.15 * smoothstep(0.0, 0.5, vColor.r);
        }
        // fog
        float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fogFactor);
        float alpha = uOpacity * (1.0 - fogFactor * 0.2);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    vertexColors: true,
  });
}

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
  explosions: ExplosionSystem;
  rain: THREE.Points | null = null;
  rainVel: Float32Array | null = null;
  selectionBox: THREE.LineSegments | null = null;
  // cached colors (avoid per-frame allocation)
  private C_SUN_WARM = new THREE.Color("#fff2d8");
  private C_SUN_SUNSET = new THREE.Color("#ff9a3a");
  private _sunColor = new THREE.Color();
  // cached raycast result (reused for selection box + break progress)
  private _frameRaycast: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;

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

  // touch input (written by React layer via setTouchInput)
  touchInput = {
    moveX: 0, // -1..1
    moveY: 0, // -1..1
    lookDX: 0, // pixels delta this frame
    lookDY: 0,
    jump: false,
    sprint: false,
    sneak: false,
    breakBtn: false,
    placeBtn: false,
  };
  // targeted block for crack overlay
  targetBlock: { x: number; y: number; z: number } | null = null;
  breakProgress = 0; // 0..1

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

    // Auto-detect mobile devices and reduce render distance + pixel ratio for perf
    const isMobile =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
      window.matchMedia("(pointer: coarse)").matches;
    if (isMobile) {
      this.settings = {
        ...this.settings,
        renderDistance: Math.min(this.settings.renderDistance, 4),
      };
    }

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
    // Cap pixel ratio lower on mobile for performance
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5)
    );
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
      water: makeWaterMaterial(atlas),
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
    this.explosions = new ExplosionSystem({
      removeBlock: (x, y, z) => {
        this.world.setBlock(x, y, z, Block.AIR);
        this.edits.set(`${x},${y},${z}`, Block.AIR);
        this.world.remeshAround(x, z);
        if (x & 15 === 0) this.world.remeshAround(x - 1, z);
        if (x & 15 === 15) this.world.remeshAround(x + 1, z);
        if (z & 15 === 0) this.world.remeshAround(x, z - 1);
        if (z & 15 === 15) this.world.remeshAround(x, z + 1);
      },
      emitParticles: (x, y, z, block, count) => {
        this.particles.emitBlockBreak(x, y, z, block, count);
      },
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
    });
    this.makeRain();
    this.makeSelectionBox();

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
    // Expose for debugging (dev only)
    if (typeof window !== "undefined") {
      (window as unknown as { __engine?: Engine }).__engine = this;
    }
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
    // dispose all subsystems to prevent GPU memory leaks
    this.world.dispose();
    this.sky.dispose();
    this.particles.dispose();
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.geometry.dispose();
      (this.clouds.material as THREE.Material).dispose();
    }
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      (this.rain.material as THREE.Material).dispose();
    }
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      (this.selectionBox.material as THREE.Material).dispose();
    }
    this.materials.solid.dispose();
    this.materials.cutout.dispose();
    this.materials.water.dispose();
    this.renderer.dispose();
  }

  private initSpawn() {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) this.world.ensureTerrain(dx, dz);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) this.world.ensureDecorated(dx, dz);
    // Spawn the player at the Lahore city center, elevated for a panoramic view.
    const spawnX = 40;
    const spawnZ = 40;
    const groundY = Player.spawnY(this.world, spawnX, spawnZ);
    this.player.pos.set(spawnX + 0.5, groundY + 8.5, spawnZ + 0.5);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = 0.7; // face toward the mosque entrance
    this.player.pitch = -0.15;
    (this.player as unknown as { _targetYaw: number })._targetYaw = 0.7;
    (this.player as unknown as { _targetPitch: number })._targetPitch = -0.15;
    // start in creative fly so the player doesn't fall
    this.player.gameMode = "creative";
    this.player.flying = true;
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

  // Sample biome at world coords for minimap (returns BiomeId)
  getBiomeAt(wx: number, wz: number): number {
    return this.world.getBiomeAt(wx, wz);
  }

  // Sample terrain height at world coords for minimap
  getHeightAt(wx: number, wz: number): number {
    return this.world.gen.column(wx, wz).height;
  }

  // React touch layer writes touch deltas/state here.
  setTouchInput(partial: Partial<typeof this.touchInput>) {
    Object.assign(this.touchInput, partial);
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
        (this.player as unknown as { _targetYaw: number })._targetYaw = p.yaw ?? 0;
        (this.player as unknown as { _targetPitch: number })._targetPitch = p.pitch ?? 0;
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
      // rain toggle
      this.raining = !this.raining;
      this.weatherTimer = 120;
    }
    if (code === "KeyT") {
      this.setTimeOfDay(0.5); // noon
    }
    if (code === "KeyN") {
      this.setTimeOfDay(0.0); // night
    }
    if (code === "KeyH") {
      // teleport to Lahore city center
      this.teleportTo(40, 40);
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
    // keyboard
    i.forward = this.keys.has("KeyW");
    i.back = this.keys.has("KeyS");
    i.left = this.keys.has("KeyA");
    i.right = this.keys.has("KeyD");
    i.jump = this.keys.has("Space");
    i.sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    i.sneak = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    // touch joystick merge (analog: treat >0.3 as pressed)
    const t = this.touchInput;
    if (Math.abs(t.moveY) > 0.15) {
      if (t.moveY > 0) i.forward = true;
      else i.back = true;
    }
    if (Math.abs(t.moveX) > 0.15) {
      if (t.moveX > 0) i.right = true;
      else i.left = true;
    }
    if (t.jump) i.jump = true;
    if (t.sprint) i.sprint = true;
    if (t.sneak) i.sneak = true;
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

  // Public for touch tap gestures (one-shot, not continuous)
  breakBlock() {
    this.tryBreak();
  }

  placeBlock() {
    this.tryPlace();
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
    // If looking at TNT, ignite it instead of placing
    const lookedAt = this.world.getBlock(hit.x, hit.y, hit.z);
    if (lookedAt === Block.TNT) {
      this.explosions.ignite(hit.x, hit.y, hit.z);
      return;
    }
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

  // ---- selection box (block highlight + break progress) ----
  private makeSelectionBox() {
    // wireframe box slightly larger than a block
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthTest: true,
    });
    this.selectionBox = new THREE.LineSegments(edges, mat);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
  }

  private updateSelectionBox() {
    if (!this.selectionBox) return;
    // reuse the per-frame raycast computed in the loop (no new DDA)
    const hit = this._frameRaycast;
    if (hit) {
      this.selectionBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.selectionBox.visible = true;
      // color shifts from black → red as break progress increases
      const mat = this.selectionBox.material as THREE.LineBasicMaterial;
      const p = this.breakProgress;
      mat.color.setRGB(p, 0, 0);
      mat.opacity = 0.4 + p * 0.4;
    } else {
      this.selectionBox.visible = false;
    }
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
    const sunColor = this._sunColor.lerpColors(this.C_SUN_WARM, this.C_SUN_SUNSET, warmth);
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

    // water shader uniforms
    const wmat = this.materials.water as THREE.ShaderMaterial;
    wmat.uniforms.uTime.value += dt;
    wmat.uniforms.uFogColor.value.copy(this.sky.fogColor);
    wmat.uniforms.uFogNear.value = CHUNK_SIZE * 2;
    wmat.uniforms.uFogFar.value = CHUNK_SIZE * (this.settings.renderDistance - 0.5);
    // sun direction for specular shimmer
    const wAng = (this.timeOfDay - 0.25) * Math.PI * 2;
    (wmat.uniforms.uSunDir.value as THREE.Vector3).set(
      Math.cos(wAng), Math.sin(wAng), 0.3
    ).normalize();
    (wmat.uniforms.uSunColor.value as THREE.Color).copy(this.sun.color);
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

    // look: touch + arrow keys + mouse (mouse handled in onMouseMove)
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
      // touch look — higher sensitivity than mouse for responsive feel
      if (this.touchInput.lookDX !== 0 || this.touchInput.lookDY !== 0) {
        this.player.setLookFromDelta(
          this.touchInput.lookDX,
          this.touchInput.lookDY,
          0.006 * this.settings.mouseSensitivity
        );
        this.touchInput.lookDX = 0;
        this.touchInput.lookDY = 0;
      }
    }

    // continuous break/place (mouse + touch buttons)
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
      // touch break button
      if (this.touchInput.breakBtn && this.breakCooldown <= 0) {
        this.tryBreak();
        this.breakCooldown = 0.22;
      }
      // touch place button
      if (this.touchInput.placeBtn && this.placeCooldown <= 0) {
        this.tryPlace();
        this.placeCooldown = 0.22;
      }
    }

    // block-break progress tracking + selection box: ONE raycast per frame
    if (this.inputEnabled) {
      const hit = this.player.raycast(REACH_DISTANCE);
      this._frameRaycast = hit;
      const breaking =
        (this.pointerLocked && this.mouseButtons.has(0)) ||
        this.touchInput.breakBtn;
      if (hit && breaking) {
        if (
          this.targetBlock &&
          this.targetBlock.x === hit.x &&
          this.targetBlock.y === hit.y &&
          this.targetBlock.z === hit.z
        ) {
          this.breakProgress = Math.min(1, this.breakProgress + dt * 2);
        } else {
          this.targetBlock = { x: hit.x, y: hit.y, z: hit.z };
          this.breakProgress = 0;
        }
      } else {
        this.targetBlock = null;
        this.breakProgress = 0;
      }
    } else {
      this._frameRaycast = null;
      this.targetBlock = null;
      this.breakProgress = 0;
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
    this.explosions.update(dt);
    this.updateSelectionBox();

    // FOV kick (sprint) — smooth apply to camera
    const targetFov = this.settings.fov + this.player.fovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.pow(0.001, dt));
      this.camera.updateProjectionMatrix();
    }

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
      inWater: this.player.inWater,
      yaw: this.player.yaw,
      heading: headingFromYaw(this.player.yaw),
      weather: this.raining ? "rain" : "clear",
      gameMode: this.player.gameMode,
      brightness: this.settings.brightness,
      settings: { ...this.settings },
      raining: this.raining,
      targetBlock: this.targetBlock,
      breakProgress: this.breakProgress,
      biomeId: biomeId,
      flashTimer: this.explosions.flashTimer,
    });
  }
}

export { PLAYER_EYE, SEA_LEVEL, DEFAULT_SETTINGS };
