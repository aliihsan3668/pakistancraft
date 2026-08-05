// PakistanCraft — user settings (persisted to localStorage)
import { RENDER_DISTANCE as DEFAULT_RD } from "./constants";

export interface Settings {
  renderDistance: number; // chunk radius
  fov: number; // camera FOV degrees
  mouseSensitivity: number; // multiplier
  brightness: number; // 0.5..1.5
  vsync: boolean; // (cosmetic — always on via rAF)
  showFps: boolean;
  showCoords: boolean;
  renderClouds: boolean;
  renderStars: boolean;
  ao: boolean; // ambient occlusion toggle
  weather: boolean; // dynamic weather
  gameMode: "creative" | "survival";
  music: boolean; // (placeholder)
}

const STORAGE_KEY = "pakistancraft.settings";

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: DEFAULT_RD,
  fov: 72,
  mouseSensitivity: 1,
  brightness: 1,
  vsync: true,
  showFps: true,
  showCoords: true,
  renderClouds: true,
  renderStars: true,
  ao: true,
  weather: true,
  gameMode: "creative",
  music: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
