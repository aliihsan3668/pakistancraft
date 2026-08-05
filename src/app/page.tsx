"use client";

import dynamic from "next/dynamic";

// Load the game client-side only (it uses canvas/Three.js/WebGL)
const PakistanCraft = dynamic(() => import("@/components/game/PakistanCraft"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#01411C] text-white">
      <div className="font-mono text-sm text-white/70">Loading PakistanCraft…</div>
    </div>
  ),
});

export default function Home() {
  return <PakistanCraft />;
}
