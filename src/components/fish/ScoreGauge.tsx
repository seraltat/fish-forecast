"use client";

import { cn } from "@/lib/utils";
import { biteColor } from "@/lib/forecast";

interface ScoreGaugeProps {
  value: number; // 0..100
  size?: number;
  label?: string;
  sublabel?: string;
  seasonLabel?: string; // when set & value is 0, show this instead of "0"
  className?: string;
}

export function ScoreGauge({ value, size = 200, label, sublabel, seasonLabel, className }: ScoreGaugeProps) {
  const v = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 12;
  const circ = 2 * Math.PI * radius;
  // Arc = 75% of circle (270°)
  const arcFraction = 0.75;
  const arcLen = circ * arcFraction;
  const dashOffset = arcLen * (1 - v / 100);
  const color = biteColor(v);
  const showSeasonLabel = seasonLabel && v === 0;

  // Tick marks
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className={cn("relative flex flex-col items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-135">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circ}`}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={showSeasonLabel ? "var(--destructive)" : color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circ}`}
          strokeDashoffset={showSeasonLabel ? arcLen : dashOffset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out, stroke 0.3s" }}
        />
        {/* Tick marks */}
        {ticks.map((t) => {
          const angle = (t / 100) * arcFraction * 2 * Math.PI;
          const x1 = size / 2 + Math.cos(angle) * (radius - 16);
          const y1 = size / 2 + Math.sin(angle) * (radius - 16);
          const x2 = size / 2 + Math.cos(angle) * (radius - 22);
          const y2 = size / 2 + Math.sin(angle) * (radius - 22);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--muted-foreground)"
              strokeWidth={t % 25 === 0 ? 2 : 1}
              opacity={0.5}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showSeasonLabel ? (
          <span className="text-xl font-bold text-destructive text-center px-2 leading-tight">
            {seasonLabel}
          </span>
        ) : (
          <>
            <span className="text-4xl font-bold tabular-nums" style={{ color }}>
              {Math.round(v)}
            </span>
            {label && <span className="text-sm font-medium mt-0.5">{label}</span>}
            {sublabel && <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{sublabel}</span>}
          </>
        )}
      </div>
    </div>
  );
}
