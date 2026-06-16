import React from "react";

function colorRamp(value: number) {
  const stops = [
    [15, 23, 42],
    [79, 70, 229],
    [219, 39, 119],
    [245, 158, 11],
    [250, 250, 210],
  ];
  const scaled = Math.max(0, Math.min(1, value)) * (stops.length - 1);
  const index = Math.floor(scaled);
  const t = scaled - index;
  const a = stops[index];
  const b = stops[Math.min(index + 1, stops.length - 1)];
  return a.map((channel, channelIndex) => Math.round(channel + (b[channelIndex] - channel) * t));
}

export function HeatmapCanvas({
  x,
  y,
  z,
  xLabel,
  yLabel,
}: {
  x: number[];
  y: number[];
  z: number[][];
  xLabel: string;
  yLabel: string;
}) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const max = Math.max(...z.flat());
  const min = Math.min(...z.flat());

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const padLeft = 48;
    const padTop = 18;
    const padRight = 18;
    const padBottom = 38;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;
    const rows = z.length;
    const cols = z[0]?.length ?? 0;
    const cellW = innerW / cols;
    const cellH = innerH / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const normalized = (z[row][col] - min) / (max - min || 1);
        const [r, g, b] = colorRamp(normalized);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(padLeft + col * cellW, padTop + (rows - row - 1) * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, innerW, innerH);
    ctx.fillStyle = "#475569";
    ctx.font = '12px "楷体"';
    ctx.textAlign = "center";
    ctx.fillText(xLabel, padLeft + innerW / 2, height - 8);
    ctx.save();
    ctx.translate(14, padTop + innerH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.textAlign = "right";
    ctx.fillText(`${x[0]}`, padLeft + 8, height - 22);
    ctx.textAlign = "left";
    ctx.fillText(`${x[x.length - 1]}`, padLeft + innerW - 8, height - 22);
  }, [x, y, z, min, max, xLabel, yLabel]);

  return (
    <div className="heatmap-wrap">
      <canvas ref={ref} aria-label="xOy magnetic field heatmap" />
      <div className="heatmap-scale">
        <span>{min.toFixed(2)} mT</span>
        <b />
        <span>{max.toFixed(2)} mT</span>
      </div>
    </div>
  );
}
