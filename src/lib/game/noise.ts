// PakistanCraft — seeded noise helpers (wrapping simplex-noise)
import { createNoise2D, createNoise3D } from "simplex-noise";
import { mulberry32 } from "./constants";

export class Noise {
  private elev: (x: number, y: number) => number;
  private elevDetail: (x: number, y: number) => number;
  private mountain: (x: number, y: number) => number;
  private temp: (x: number, y: number) => number;
  private humid: (x: number, y: number) => number;
  private river: (x: number, y: number) => number;
  private cave: (x: number, y: number, z: number) => number;
  private ore: (x: number, y: number, z: number) => number;
  private tree: (x: number, y: number) => number;

  constructor(seed: number) {
    const r1 = mulberry32(seed);
    const r2 = mulberry32(seed ^ 0x9e3779b9);
    const r3 = mulberry32(seed ^ 0x85ebca6b);
    const r4 = mulberry32(seed ^ 0xc2b2ae35);
    const r5 = mulberry32(seed ^ 0x27d4eb2f);
    const r6 = mulberry32(seed ^ 0x165667b1);
    const r7 = mulberry32(seed ^ 0x85ebca77);
    const r8 = mulberry32(seed ^ 0xc2b2ae88);
    this.elev = createNoise2D(r1);
    this.elevDetail = createNoise2D(r2);
    this.mountain = createNoise2D(r3);
    this.temp = createNoise2D(r4);
    this.humid = createNoise2D(r5);
    this.river = createNoise2D(r6);
    this.cave = createNoise3D(r7);
    this.ore = createNoise3D(r8);
    this.tree = createNoise2D(mulberry32(seed ^ 0x12345678));
  }

  // Fractal 2D noise (fBm)
  private fbm(
    fn: (x: number, y: number) => number,
    x: number,
    y: number,
    octaves: number,
    lacunarity = 2,
    gain = 0.5
  ): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * fn(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Continental elevation in 0..1 (0 = deep ocean, 1 = high mountain)
  elevation(x: number, z: number): number {
    const base = this.fbm(this.elev, x * 0.0028, z * 0.0028, 5);
    let e = (base + 1) * 0.5; // 0..1
    // detail
    const detail = this.fbm(this.elevDetail, x * 0.02, z * 0.02, 3);
    e += detail * 0.04;
    // mountain boosting: only where elevation is already high
    const m = this.fbm(this.mountain, x * 0.0016, z * 0.0016, 4);
    const mountainFactor = Math.max(0, (e - 0.55) / 0.45);
    e += Math.max(0, m) * 0.55 * mountainFactor;
    return Math.max(0, Math.min(1, e));
  }

  temperature(x: number, z: number): number {
    const t = this.fbm(this.temp, x * 0.0012, z * 0.0012, 3);
    return (t + 1) * 0.5; // 0 cold .. 1 hot
  }

  humidity(x: number, z: number): number {
    const h = this.fbm(this.humid, x * 0.0015, z * 0.0015, 3);
    return (h + 1) * 0.5; // 0 dry .. 1 wet
  }

  // River factor: 0 = no river, 1 = river center. Uses ridged noise.
  riverFactor(x: number, z: number): number {
    const n = this.river(x * 0.004, z * 0.004);
    // sharp valleys where |n| is near 0
    const v = 1 - Math.abs(n);
    return Math.pow(Math.max(0, v - 0.78) / 0.22, 2);
  }

  caveDensity(x: number, y: number, z: number): number {
    const n = this.cave(x * 0.05, y * 0.05, z * 0.05);
    return (n + 1) * 0.5;
  }

  oreNoise(x: number, y: number, z: number): number {
    return (this.ore(x * 0.1, y * 0.1, z * 0.1) + 1) * 0.5;
  }

  treeJitter(x: number, z: number): number {
    return this.tree(x * 0.5, z * 0.5);
  }
}
