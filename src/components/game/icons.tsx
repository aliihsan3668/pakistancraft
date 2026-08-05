// Small inline SVG icons for the PakistanCraft HUD
import type { SVGProps } from "react";

export function HeartIcon({ filled, ...props }: { filled: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" {...props}>
      <path
        d="M8 14s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 7c0 3.8-5 7-5 7z"
        fill={filled ? "#e23b3b" : "rgba(0,0,0,0.35)"}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function FoodIcon({ filled, ...props }: { filled: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" {...props}>
      <path
        d="M3 4c0-1.5 1-2.5 2.5-2.5S8 2.5 8 4v3h1V4c0-1.5 1-2.5 2.5-2.5S14 2.5 14 4c0 3-2 6-5.5 6S3 7 3 4z"
        transform="translate(-1 2)"
        fill={filled ? "#c8742a" : "rgba(0,0,0,0.35)"}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...props}>
      <circle cx="12" cy="12" r="4.5" fill="#ffd84a" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 12 + Math.cos(a) * 7;
        const y1 = 12 + Math.sin(a) * 7;
        const x2 = 12 + Math.cos(a) * 10;
        const y2 = 12 + Math.sin(a) * 10;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#ffd84a"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...props}>
      <path d="M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z" fill="#d8e0f0" />
    </svg>
  );
}
