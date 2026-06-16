import React from "react";

type Point = { x: number; y: number };
type Series = {
  id: string;
  label: string;
  color: string;
  points: Point[];
  dashed?: boolean;
  width?: number;
};
type Scatter = {
  id: string;
  label: string;
  color: string;
  points: Point[];
  radius?: number;
};

function formatPath(points: Point[], mapX: (x: number) => number, mapY: (y: number) => number) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`)
    .join(" ");
}

function extent(values: number[]) {
  return [Math.min(...values), Math.max(...values)] as const;
}

export function AxisChart({
  className = "",
  title,
  subtitle,
  xLabel,
  yLabel,
  series,
  scatter = [],
  yDomain,
}: {
  className?: string;
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  series: Series[];
  scatter?: Scatter[];
  yDomain?: [number, number];
}) {
  const allPoints = [...series.flatMap((item) => item.points), ...scatter.flatMap((item) => item.points)];
  const plotPoints = allPoints.length > 0 ? allPoints : [{ x: -180, y: 0 }, { x: 180, y: 1 }];
  const [xMin, rawXMax] = extent(plotPoints.map((point) => point.x));
  const [computedYMin, computedYMax] = extent(plotPoints.map((point) => point.y));
  const yMin = yDomain?.[0] ?? Math.min(0, computedYMin);
  const rawYMax = yDomain?.[1] ?? computedYMax * 1.08;
  const xMax = rawXMax === xMin ? xMin + 1 : rawXMax;
  const yMax = rawYMax === yMin ? yMin + 1 : rawYMax;

  const width = 760;
  const height = 420;
  const pad = { left: 62, right: 28, top: 34, bottom: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const mapX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const mapY = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * innerH;
  const xTicks = [-180, -120, -60, 0, 60, 120, 180].filter((tick) => tick >= xMin && tick <= xMax);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);

  return (
    <div className={`chart-panel ${className}`}>
      <div className="panel-heading compact">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} rx="4" className="chart-bg" />
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line x1={mapX(tick)} x2={mapX(tick)} y1={pad.top} y2={pad.top + innerH} className="grid-line" />
            <text x={mapX(tick)} y={height - 24} className="tick" textAnchor="middle">
              {tick}
            </text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={pad.left} x2={pad.left + innerW} y1={mapY(tick)} y2={mapY(tick)} className="grid-line" />
            <text x={pad.left - 12} y={mapY(tick) + 4} className="tick" textAnchor="end">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} className="axis-line" />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + innerH} className="axis-line" />
        {series.map((item) => (
          <path
            key={item.id}
            d={formatPath(item.points, mapX, mapY)}
            fill="none"
            stroke={item.color}
            strokeWidth={item.width ?? 2}
            strokeDasharray={item.dashed ? "8 7" : undefined}
            strokeLinecap="round"
          />
        ))}
        {scatter.map((item) => (
          <g key={item.id}>
            {item.points.map((point, index) => (
              <circle
                key={`${item.id}-${index}`}
                cx={mapX(point.x)}
                cy={mapY(point.y)}
                r={item.radius ?? 4}
                fill="#fff"
                stroke={item.color}
                strokeWidth="2.5"
              />
            ))}
          </g>
        ))}
        <text x={pad.left + innerW / 2} y={height - 5} className="axis-label" textAnchor="middle">
          {xLabel}
        </text>
        <text x="16" y={pad.top + innerH / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 16 ${pad.top + innerH / 2})`}>
          {yLabel}
        </text>
      </svg>
      <div className="legend">
        {series.map((item) => (
          <span key={item.id}>
            <i style={{ background: item.color }} className={item.dashed ? "dash" : ""} />
            {item.label}
          </span>
        ))}
        {scatter.map((item) => (
          <span key={item.id}>
            <i style={{ borderColor: item.color }} className="dot" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
