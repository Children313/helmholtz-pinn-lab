export type AxisPoint = {
  x: number;
  b: number;
};

const MU0 = 4 * Math.PI * 1e-7;

export function hallVoltageToField({
  v1,
  v2,
  v3,
  v4,
  kh,
  hallCurrentMa,
}: {
  v1: number;
  v2: number;
  v3: number;
  v4: number;
  kh: number;
  hallCurrentMa: number;
}) {
  const vh = (v1 - v2 + v3 - v4) / 4;
  return vh / (kh * hallCurrentMa);
}

export function biotSavartAxis(
  xMm: number,
  dRatio: number,
  effectiveCurrentA: number,
  radiusMm = 100,
) {
  const r = radiusMm / 1000;
  const x = xMm / 1000;
  const d = dRatio * r;
  const left = 1 / Math.pow(r * r + Math.pow(x - d / 2, 2), 1.5);
  const right = 1 / Math.pow(r * r + Math.pow(x + d / 2, 2), 1.5);
  return (MU0 * effectiveCurrentA * r * r * 0.5 * (left + right)) * 1000;
}

export function fitEffectiveCurrent(points: AxisPoint[], dRatio: number, radiusMm = 100) {
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    const unit = biotSavartAxis(point.x, dRatio, 1, radiusMm);
    numerator += point.b * unit;
    denominator += unit * unit;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

export function rSquared(points: AxisPoint[], predictions: number[]) {
  if (points.length === 0) return 0;
  const mean = points.reduce((sum, point) => sum + point.b, 0) / points.length;
  const ssRes = points.reduce((sum, point, index) => sum + (point.b - predictions[index]) ** 2, 0);
  const ssTot = points.reduce((sum, point) => sum + (point.b - mean) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : 1;
}

export function residualRmse(points: AxisPoint[], predictions: number[]) {
  if (points.length === 0) return 0;
  const mse = points.reduce((sum, point, index) => sum + (point.b - predictions[index]) ** 2, 0) / points.length;
  return Math.sqrt(mse);
}

export function centralUniformity(points: AxisPoint[], windowMm = 50) {
  const selected = points.filter((point) => Math.abs(point.x) <= windowMm);
  if (selected.length < 2) return null;
  const values = selected.map((point) => point.b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < 1e-9) return null;
  return ((Math.max(...values) - Math.min(...values)) / Math.abs(mean)) * 100;
}

export function symmetryMismatch(points: AxisPoint[]) {
  const byX = new Map(points.map((point) => [Math.round(point.x * 1000) / 1000, point.b]));
  const mismatches: number[] = [];

  for (const point of points) {
    if (point.x <= 0) continue;
    const opposite = byX.get(Math.round(-point.x * 1000) / 1000);
    if (opposite === undefined) continue;
    const denom = Math.max((Math.abs(point.b) + Math.abs(opposite)) / 2, 1e-9);
    mismatches.push((Math.abs(point.b - opposite) / denom) * 100);
  }

  if (mismatches.length === 0) return null;
  return mismatches.reduce((sum, value) => sum + value, 0) / mismatches.length;
}

export function relativeErrors(points: AxisPoint[], predictions: number[]) {
  return points.map((point, index) => {
    const denom = Math.max(Math.abs(point.b), 1e-9);
    return (Math.abs(point.b - predictions[index]) / denom) * 100;
  });
}

export function makeAxisCurve(dRatio: number, effectiveCurrentA: number, radiusMm = 100) {
  return Array.from({ length: 181 }, (_, index) => {
    const x = -180 + index * 2;
    return { x, y: biotSavartAxis(x, dRatio, effectiveCurrentA, radiusMm) };
  });
}

export function estimateSpacing(
  points: AxisPoint[],
  radiusMm = 100,
  minDRatio = 0.4,
  maxDRatio = 2.2,
  step = 0.01,
) {
  let best = {
    dRatio: minDRatio,
    current: 0,
    rmse: Number.POSITIVE_INFINITY,
    r2: Number.NEGATIVE_INFINITY,
    meanError: Number.POSITIVE_INFINITY,
  };

  for (let dRatio = minDRatio; dRatio <= maxDRatio + 1e-9; dRatio += step) {
    const current = fitEffectiveCurrent(points, dRatio, radiusMm);
    const predictions = points.map((point) => biotSavartAxis(point.x, dRatio, current, radiusMm));
    const rmse = residualRmse(points, predictions);
    if (rmse < best.rmse) {
      const errors = relativeErrors(points, predictions);
      best = {
        dRatio,
        current,
        rmse,
        r2: rSquared(points, predictions),
        meanError: errors.reduce((sum, error) => sum + error, 0) / errors.length,
      };
    }
  }

  return {
    ...best,
    dRatio: Math.round(best.dRatio * 100) / 100,
  };
}

export function makeBiotSavartGrid({
  dRatio,
  effectiveCurrentA,
  radiusMm = 100,
  xCount = 49,
  yCount = 31,
  segments = 72,
}: {
  dRatio: number;
  effectiveCurrentA: number;
  radiusMm?: number;
  xCount?: number;
  yCount?: number;
  segments?: number;
}) {
  const radiusM = radiusMm / 1000;
  const dM = dRatio * radiusM;
  const x = Array.from({ length: xCount }, (_, i) => -180 + (360 * i) / (xCount - 1));
  const y = Array.from({ length: yCount }, (_, i) => -90 + (180 * i) / (yCount - 1));
  const zRows: number[][] = [];

  const coilCenters = [-dM / 2, dM / 2];
  const dTheta = (2 * Math.PI) / segments;
  const prefactor = (MU0 * effectiveCurrentA) / (4 * Math.PI);

  for (const yMm of y) {
    const row: number[] = [];
    for (const xMm of x) {
      const px = xMm / 1000;
      const py = yMm / 1000;
      const pz = 0;
      let bx = 0;
      let by = 0;
      let bz = 0;

      for (const cx of coilCenters) {
        for (let seg = 0; seg < segments; seg += 1) {
          const theta = (seg + 0.5) * dTheta;
          const sx = cx;
          const sy = radiusM * Math.cos(theta);
          const sz = radiusM * Math.sin(theta);
          const dlx = 0;
          const dly = -radiusM * Math.sin(theta) * dTheta;
          const dlz = radiusM * Math.cos(theta) * dTheta;
          const rx = px - sx;
          const ry = py - sy;
          const rz = pz - sz;
          const r2 = rx * rx + ry * ry + rz * rz;
          const r3 = Math.pow(Math.max(r2, 1e-12), 1.5);

          bx += prefactor * ((dly * rz - dlz * ry) / r3);
          by += prefactor * ((dlz * rx - dlx * rz) / r3);
          bz += prefactor * ((dlx * ry - dly * rx) / r3);
        }
      }
      row.push(Math.sqrt(bx * bx + by * by + bz * bz) * 1000);
    }
    zRows.push(row);
  }

  return { x, y, z: zRows };
}
