import { useState } from "react";

export interface ChartPoint {
  label: string;
  values: number[];
}

export function TrendChart({
  points,
  series,
}: {
  points: ChartPoint[];
  series: { name: string; color: string; format?: (value: number) => string }[];
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) {
    return <p className="text-sm text-[#64748b]">No records in this range.</p>;
  }
  const width = 640;
  const height = 220;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const max = Math.max(...points.flatMap((point) => point.values), 1);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (index: number) => pad.l + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => pad.t + innerH - (value / max) * innerH;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img">
        {[0, 0.5, 1].map((step) => (
          <line key={step} x1={pad.l} x2={width - pad.r} y1={y(max * step)} y2={y(max * step)} stroke="#E2E8F0" />
        ))}
        {series.map((item, seriesIndex) => {
          const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.values[seriesIndex] ?? 0)}`).join(" ");
          const area = `${d} L ${x(points.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
          return (
            <g key={item.name}>
              <path d={area} fill={item.color} opacity="0.16" />
              <path d={d} fill="none" stroke={item.color} strokeWidth="2.5" />
            </g>
          );
        })}
        {points.map((point, index) => (
          <rect
            key={point.label}
            x={x(index) - innerW / points.length / 2}
            y={pad.t}
            width={innerW / points.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            <title>
              {point.label}
              {series.map((item, seriesIndex) => `\n${item.name}: ${(item.format ?? String)(point.values[seriesIndex] ?? 0)}`).join("")}
            </title>
          </rect>
        ))}
      </svg>
      {active !== null && points[active] && (
        <p className="mt-2 text-sm text-[#111827]">
          <span className="font-medium">{points[active].label}</span>
          {series.map((item, seriesIndex) => (
            <span key={item.name} className="ml-3 text-[#64748b]">
              {item.name}: {(item.format ?? String)(points[active].values[seriesIndex] ?? 0)}
            </span>
          ))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#64748b]">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
