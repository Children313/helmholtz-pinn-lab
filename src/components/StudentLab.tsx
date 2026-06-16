import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  Clipboard,
  Download,
  Eraser,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  RefreshCw,
  Search,
  TableProperties,
} from "lucide-react";
import { AxisChart } from "./AxisChart";
import { HeatmapCanvas } from "./HeatmapCanvas";
import {
  AxisPoint,
  biotSavartAxis,
  centralUniformity,
  estimateSpacing,
  fitEffectiveCurrent,
  hallVoltageToField,
  makeAxisCurve,
  makeBiotSavartGrid,
  relativeErrors,
  residualRmse,
  rSquared,
  symmetryMismatch,
} from "../lib/physics";

type LabData = {
  meta: {
    kh: number;
    hallCurrentMa: number;
    radiusMm: number;
  };
  axis: {
    xMm: number[];
    helmMeasured: number[];
    halfMeasured: number[];
    doubleMeasured: number[];
  };
};

type Sample = {
  label: string;
  dRatio: number;
  values: number[];
};

type ParseResult = {
  points: AxisPoint[];
  acceptedLines: number;
  ignoredLines: number;
  duplicateXs: Set<number>;
};

type AnalysisRow = {
  x: number;
  measured: number;
  predicted?: number;
  residual?: number;
  error?: number;
  flag: "通过" | "复核" | "重复 x";
};

type QualityTone = "good" | "ok" | "warn" | "neutral";

const defaultX = Array.from({ length: 37 }, (_, index) => -180 + index * 10);

const labSteps = [
  { label: "数据导入", caption: "采集与标定" },
  { label: "模型拟合", caption: "物理参数反演" },
  { label: "质量控制", caption: "残差与可信度" },
  { label: "场图报告", caption: "可视化与导出" },
];

function toFieldText(x: number[], values: number[]) {
  return x.map((xValue, index) => `${xValue}, ${values[index].toFixed(4)}`).join("\n");
}

function parseNumberList(line: string) {
  return line
    .trim()
    .split(/[\s,，;；\t]+/)
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function buildParseResult(points: AxisPoint[], rawLineCount: number): ParseResult {
  const sorted = points.sort((a, b) => a.x - b.x);
  const counts = new Map<number, number>();
  for (const point of sorted) {
    const key = Math.round(point.x * 1000) / 1000;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateXs = new Set<number>();
  counts.forEach((count, x) => {
    if (count > 1) duplicateXs.add(x);
  });

  return {
    points: sorted,
    acceptedLines: sorted.length,
    ignoredLines: Math.max(0, rawLineCount - sorted.length),
    duplicateXs,
  };
}

function parseFieldInput(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const points: AxisPoint[] = [];

  for (const [index, line] of lines.entries()) {
    const values = parseNumberList(line);
    if (values.length >= 2) {
      points.push({ x: values[0], b: values[1] });
    } else if (values.length === 1 && index < defaultX.length) {
      points.push({ x: defaultX[index], b: values[0] });
    }
  }

  return buildParseResult(points, lines.length);
}

function parseVoltageInput(text: string, kh: number, hallCurrentMa: number): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const points: AxisPoint[] = [];

  for (const [index, line] of lines.entries()) {
    const values = parseNumberList(line);
    const pushPoint = (x: number, v1: number, v2: number, v3: number, v4: number) => {
      const b = hallVoltageToField({ v1, v2, v3, v4, kh, hallCurrentMa });
      if (Number.isFinite(b)) points.push({ x, b });
    };

    if (values.length >= 5) {
      pushPoint(values[0], values[1], values[2], values[3], values[4]);
    } else if (values.length === 4 && index < defaultX.length) {
      pushPoint(defaultX[index], values[0], values[1], values[2], values[3]);
    }
  }

  return buildParseResult(points, lines.length);
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(filename: string, payload: unknown) {
  downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
}

function readNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeCsv(rows: AnalysisRow[]) {
  const header = ["x_mm", "B_measured_mT", "B_fit_mT", "residual_mT", "relative_error_percent", "flag"];
  const body = rows.map((row) =>
    [
      row.x.toFixed(2),
      row.measured.toFixed(6),
      row.predicted?.toFixed(6) ?? "",
      row.residual?.toFixed(6) ?? "",
      row.error?.toFixed(4) ?? "",
      row.flag,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function qualityGrade({
  pointCount,
  meanError,
  symmetry,
  spacingDelta,
  errorLimit,
}: {
  pointCount: number;
  meanError?: number;
  symmetry: number | null;
  spacingDelta: number | null;
  errorLimit: number;
}): { grade: string; tone: QualityTone; summary: string } {
  if (meanError === undefined || pointCount < 3) {
    return { grade: "待分析", tone: "neutral", summary: "至少输入 3 个有效点后启动拟合与质控。" };
  }
  if (pointCount < 8) {
    return { grade: "C", tone: "warn", summary: "点数偏少，适合课堂演示，不建议作为正式实验结论。" };
  }
  if (meanError <= errorLimit && (symmetry ?? 0) <= 2.5 && (spacingDelta ?? 0) <= 0.08) {
    return { grade: "A", tone: "good", summary: "曲线、对称性和间距反演均处于可信范围。" };
  }
  if (meanError <= errorLimit * 1.8 && (spacingDelta ?? 0) <= 0.16) {
    return { grade: "B", tone: "ok", summary: "整体可用，建议复核误差尖峰和中心区域均匀性。" };
  }
  return { grade: "C", tone: "warn", summary: "与模型偏差较明显，优先检查读数、坐标或线圈间距。" };
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : `${value.toFixed(2)}%`;
}

export function StudentLab({ data }: { data: LabData }) {
  const samples: Sample[] = React.useMemo(
    () => [
      { label: "亥姆霍兹 d=R", dRatio: 1, values: data.axis.helmMeasured },
      { label: "双线圈 d=R/2", dRatio: 0.5, values: data.axis.halfMeasured },
      { label: "双线圈 d=2R", dRatio: 2, values: data.axis.doubleMeasured },
    ],
    [data.axis.doubleMeasured, data.axis.halfMeasured, data.axis.helmMeasured],
  );

  const [activeStep, setActiveStep] = React.useState(0);
  const [mode, setMode] = React.useState<"field" | "voltage">("field");
  const [dRatio, setDRatio] = React.useState(1);
  const [input, setInput] = React.useState(() => toFieldText(data.axis.xMm, data.axis.helmMeasured));
  const [kh, setKh] = React.useState(data.meta.kh);
  const [hallCurrent, setHallCurrent] = React.useState(data.meta.hallCurrentMa);
  const [errorLimit, setErrorLimit] = React.useState(3);
  const [uniformityWindow, setUniformityWindow] = React.useState(50);

  const parsed = React.useMemo(
    () => (mode === "field" ? parseFieldInput(input) : parseVoltageInput(input, kh, hallCurrent)),
    [hallCurrent, input, kh, mode],
  );
  const points = parsed.points;

  const fit = React.useMemo(() => {
    if (points.length < 3) return null;
    const current = fitEffectiveCurrent(points, dRatio, data.meta.radiusMm);
    const directPred = points.map((point) => biotSavartAxis(point.x, dRatio, current, data.meta.radiusMm));
    const errors = relativeErrors(points, directPred);
    const centerPoint = points.reduce(
      (best, point) => (Math.abs(point.x) < Math.abs(best.x) ? point : best),
      points[0],
    );

    return {
      current,
      curve: makeAxisCurve(dRatio, current, data.meta.radiusMm),
      directPred,
      errors,
      meanError: errors.reduce((sum, error) => sum + error, 0) / errors.length,
      maxError: Math.max(...errors),
      rmse: residualRmse(points, directPred),
      r2: rSquared(points, directPred),
      centerField: centerPoint.b,
      uniformity: centralUniformity(points, uniformityWindow),
      symmetry: symmetryMismatch(points),
    };
  }, [dRatio, data.meta.radiusMm, points, uniformityWindow]);

  const spacingEstimate = React.useMemo(
    () => (points.length >= 8 ? estimateSpacing(points, data.meta.radiusMm) : null),
    [data.meta.radiusMm, points],
  );

  const heatmap = React.useMemo(() => {
    if (!fit) return null;
    return makeBiotSavartGrid({
      dRatio,
      effectiveCurrentA: fit.current,
      radiusMm: data.meta.radiusMm,
    });
  }, [dRatio, data.meta.radiusMm, fit]);

  const heatmapRange = React.useMemo(() => {
    if (!heatmap) return null;
    const values = heatmap.z.flat();
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      xCount: heatmap.x.length,
      yCount: heatmap.y.length,
    };
  }, [heatmap]);

  const tableRows: AnalysisRow[] = React.useMemo(
    () =>
      points.map((point, index) => {
        const predicted = fit?.directPred[index];
        const residual = predicted === undefined ? undefined : point.b - predicted;
        const error = fit?.errors[index];
        const duplicate = parsed.duplicateXs.has(Math.round(point.x * 1000) / 1000);
        return {
          x: point.x,
          measured: point.b,
          predicted,
          residual,
          error,
          flag: duplicate ? "重复 x" : error !== undefined && error > errorLimit ? "复核" : "通过",
        };
      }),
    [errorLimit, fit, parsed.duplicateXs, points],
  );

  const scatter = points.map((point) => ({ x: point.x, y: point.b }));
  const residualMax = fit ? Math.max(2, Math.ceil(fit.maxError / 5) * 5) : 10;
  const yMax = Math.max(3, ...scatter.map((point) => point.y));
  const spacingDelta = spacingEstimate ? Math.abs(spacingEstimate.dRatio - dRatio) : null;
  const quality = qualityGrade({
    pointCount: points.length,
    meanError: fit?.meanError,
    symmetry: fit?.symmetry ?? null,
    spacingDelta,
    errorLimit,
  });

  const exportPayload = {
    software: "Helmholtz PINN Research Suite",
    module: "Guided Experiment Workbench",
    method: "Axis Biot-Savart least-squares fit with spacing inversion",
    exportedAt: new Date().toISOString(),
    input: {
      mode,
      dRatio,
      kh,
      hallCurrentMa: hallCurrent,
      errorLimitPercent: errorLimit,
      uniformityWindowMm: uniformityWindow,
    },
    parse: {
      acceptedLines: parsed.acceptedLines,
      ignoredLines: parsed.ignoredLines,
      duplicateXs: Array.from(parsed.duplicateXs),
    },
    fit,
    spacingEstimate,
    quality,
    rows: tableRows,
  };

  const loadSample = (sample: Sample) => {
    setMode("field");
    setDRatio(sample.dRatio);
    setInput(toFieldText(data.axis.xMm, sample.values));
  };

  const inputPlaceholder =
    mode === "field"
      ? "-180, 0.4253\n-170, 0.4943\n...\n也可以每行只填 B 值，系统自动使用 -180 到 180 mm 的 37 个轴线点"
      : "-180, -0.68, -1.42, 1.36, 0.62\n-170, -0.62, -1.48, 1.42, 0.56\n...\n也可以每行只填 V1,V2,V3,V4";

  const resultStrip = (
    <div className="student-result-strip guided-result-strip">
      <div>
        <span>有效点数</span>
        <strong>{points.length}</strong>
      </div>
      <div>
        <span>等效安匝数</span>
        <strong>{fit ? `${fit.current.toFixed(1)} A` : "--"}</strong>
      </div>
      <div>
        <span>平均相对误差</span>
        <strong>{fit ? `${fit.meanError.toFixed(2)}%` : "--"}</strong>
      </div>
      <div>
        <span>RMSE</span>
        <strong>{fit ? `${fit.rmse.toFixed(4)} mT` : "--"}</strong>
      </div>
      <div>
        <span>中心磁场</span>
        <strong>{fit ? `${fit.centerField.toFixed(3)} mT` : "--"}</strong>
      </div>
      <div>
        <span>R²</span>
        <strong>{fit ? fit.r2.toFixed(4) : "--"}</strong>
      </div>
    </div>
  );

  const inputPanel = (
    <div className="student-input-panel guided-card">
      <div className="panel-heading">
        <Clipboard size={18} />
        <div>
          <h2>数据采集与标定</h2>
          <p className="panel-subtitle">导入轴线磁场或四路霍尔电压，建立本次实验的原始记录。</p>
        </div>
      </div>

      <div className="mode-tabs" role="tablist" aria-label="输入模式">
        <button type="button" className={mode === "field" ? "active" : ""} onClick={() => setMode("field")}>
          B(mT)
        </button>
        <button type="button" className={mode === "voltage" ? "active" : ""} onClick={() => setMode("voltage")}>
          V1-V4
        </button>
      </div>

      <label className="mini-label" htmlFor="student-d">
        <span>设定线圈间距 d/R</span>
        <input
          id="student-d"
          type="number"
          min="0.4"
          max="2.2"
          step="0.1"
          value={dRatio}
          onChange={(event) => {
            const next = readNumber(event.currentTarget.value, dRatio);
            setDRatio(Math.max(0.4, Math.min(2.2, next)));
          }}
        />
      </label>

      <div className="analysis-controls">
        <label>
          误差阈值(%)
          <input
            type="number"
            min="0.5"
            max="20"
            step="0.5"
            value={errorLimit}
            onChange={(event) => setErrorLimit(Math.max(0.5, readNumber(event.currentTarget.value, errorLimit)))}
          />
        </label>
        <label>
          均匀区(mm)
          <input
            type="number"
            min="10"
            max="100"
            step="10"
            value={uniformityWindow}
            onChange={(event) => setUniformityWindow(Math.max(10, readNumber(event.currentTarget.value, uniformityWindow)))}
          />
        </label>
      </div>

      {mode === "voltage" && (
        <div className="calibration-row">
          <label>
            KH
            <input
              type="number"
              step="0.001"
              value={kh}
              onChange={(event) => setKh(readNumber(event.currentTarget.value, data.meta.kh))}
            />
          </label>
          <label>
            IS(mA)
            <input
              type="number"
              step="0.1"
              value={hallCurrent}
              onChange={(event) => setHallCurrent(readNumber(event.currentTarget.value, data.meta.hallCurrentMa))}
            />
          </label>
        </div>
      )}

      <textarea
        value={input}
        onChange={(event) => setInput(event.currentTarget.value)}
        placeholder={inputPlaceholder}
        rows={14}
      />

      <div className="student-actions">
        {samples.map((sample) => (
          <button type="button" key={sample.label} onClick={() => loadSample(sample)}>
            <RefreshCw size={14} />
            {sample.label}
          </button>
        ))}
        <button type="button" onClick={() => setInput("")}>
          <Eraser size={14} />
          清空
        </button>
      </div>
    </div>
  );

  const parsePanel = (
    <div className="guided-card protocol-card">
      <div className="panel-heading">
        <TableProperties size={18} />
        <div>
          <h3>导入状态</h3>
          <p className="panel-subtitle">解析结果会进入后续拟合、质控和导出记录。</p>
        </div>
      </div>
      <div className="parse-grid">
        <div>
          <span>有效测点</span>
          <strong>{parsed.acceptedLines}</strong>
        </div>
        <div>
          <span>忽略行</span>
          <strong>{parsed.ignoredLines}</strong>
        </div>
        <div>
          <span>重复 x</span>
          <strong>{parsed.duplicateXs.size}</strong>
        </div>
        <div>
          <span>输入模式</span>
          <strong>{mode === "field" ? "B(mT)" : "V1-V4"}</strong>
        </div>
      </div>
      <div className="input-help compact-help">
        <TableProperties size={17} />
        <p>支持逗号、空格、制表符。若省略 x，默认使用 -180 到 180 mm、步长 10 mm 的 37 个轴线点。</p>
      </div>
    </div>
  );

  const acquisitionPanel = (
    <div className="guided-card lab-check-panel">
      <div className="panel-heading">
        <Gauge size={18} />
        <div>
          <h3>实验链路记录</h3>
          <p className="panel-subtitle">把本步输入转化为后续拟合、质控和报告生成所需的可追溯元数据。</p>
        </div>
      </div>
      <div className="lab-check-grid">
        <div>
          <span>轴线采样</span>
          <strong>{points.length}/37</strong>
          <em>-180 至 180 mm</em>
        </div>
        <div>
          <span>设定间距</span>
          <strong>d/R {dRatio.toFixed(2)}</strong>
          <em>后续反演复核</em>
        </div>
        <div>
          <span>误差阈值</span>
          <strong>{errorLimit.toFixed(1)}%</strong>
          <em>逐点审计标记</em>
        </div>
      </div>
      <ol className="lab-check-list">
        <li>进入模型拟合后，系统会给出等效电流、RMSE 与 R²。</li>
        <li>质量控制将检查对称性、中心均匀性和线圈间距反演误差。</li>
        <li>报告步骤会保留原始输入、拟合参数、残差表和二维场图。</li>
      </ol>
    </div>
  );

  const qualityPanel = (
    <div className="student-quality-panel guided-card">
      <div className="quality-head">
        <div>
          <p>Model Diagnostics</p>
          <h3>物理一致性检查</h3>
        </div>
        <span className={`quality-badge ${quality.tone}`}>
          {quality.tone === "good" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {quality.grade}
        </span>
      </div>
      <p className="quality-summary">{quality.summary}</p>
      <div className="quality-grid">
        <div>
          <span>反演 d/R</span>
          <strong>{spacingEstimate ? spacingEstimate.dRatio.toFixed(2) : "--"}</strong>
          <em>{spacingDelta !== null ? `Δ=${spacingDelta.toFixed(2)}` : "需要 ≥8 点"}</em>
        </div>
        <div>
          <span>中心均匀性</span>
          <strong>{formatPercent(fit?.uniformity)}</strong>
          <em>|x|≤{uniformityWindow} mm</em>
        </div>
        <div>
          <span>对称性偏差</span>
          <strong>{formatPercent(fit?.symmetry)}</strong>
          <em>B(+x) vs B(-x)</em>
        </div>
        <div>
          <span>忽略记录</span>
          <strong>{parsed.ignoredLines}</strong>
          <em>{parsed.duplicateXs.size} 个重复 x</em>
        </div>
      </div>
    </div>
  );

  const analysisTable = (
    <div className="analysis-table-panel guided-card">
      <div className="panel-heading">
        <Search size={18} />
        <div>
          <h3>残差审计表</h3>
          <p className="panel-subtitle">每个测点保留拟合值、残差、相对误差和复核标记。</p>
        </div>
      </div>
      <div className="qc-table-wrap">
        <table className="qc-table">
          <thead>
            <tr>
              <th>x(mm)</th>
              <th>B测量(mT)</th>
              <th>B拟合(mT)</th>
              <th>残差(mT)</th>
              <th>误差</th>
              <th>标记</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(0, 14).map((row, index) => (
              <tr key={`${row.x}-${index}`}>
                <td>{row.x.toFixed(0)}</td>
                <td>{row.measured.toFixed(4)}</td>
                <td>{row.predicted?.toFixed(4) ?? "--"}</td>
                <td>{row.residual?.toFixed(4) ?? "--"}</td>
                <td>{row.error !== undefined ? `${row.error.toFixed(2)}%` : "--"}</td>
                <td>
                  <span className={`flag ${row.flag === "通过" ? "pass" : "review"}`}>{row.flag}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-footnote">当前显示前 14 行，CSV 导出包含全部 {tableRows.length} 个有效测点。</p>
    </div>
  );

  const reportAuditPanel = (
    <div className="guided-card report-audit-panel">
      <div className="panel-heading">
        <Search size={18} />
        <div>
          <h3>报告审查摘要</h3>
          <p className="panel-subtitle">导出前汇总核心判据，便于核对实验结论是否自洽。</p>
        </div>
      </div>
      <div className="report-metric-grid">
        <div>
          <span>质控等级</span>
          <strong>{quality.grade}</strong>
        </div>
        <div>
          <span>平均误差</span>
          <strong>{fit ? `${fit.meanError.toFixed(2)}%` : "--"}</strong>
        </div>
        <div>
          <span>反演间距</span>
          <strong>{spacingEstimate ? spacingEstimate.dRatio.toFixed(2) : "--"}</strong>
        </div>
        <div>
          <span>对称偏差</span>
          <strong>{formatPercent(fit?.symmetry)}</strong>
        </div>
      </div>
      <ol className="report-check-list">
        <li>若质控等级低于 A，先返回质量控制查看异常点。</li>
        <li>若反演间距明显偏离设定 d/R，优先复核线圈位置和坐标零点。</li>
        <li>导出的 CSV 可用于论文图表复绘与附录数据归档。</li>
      </ol>
    </div>
  );

  return (
    <section className="section student-lab-section research-suite" id="student-lab">
      <div className="section-title research-hero guided-hero">
        <div className="lab-hero-copy">
          <p>Guided Experiment</p>
          <h1>亥姆霍兹线圈 PINN 磁场实验流程</h1>
          <span>按科研实验链路推进：采集记录、模型拟合、质量控制、场图报告。</span>
        </div>
        <div className="software-ribbon" aria-label="软件状态">
          <div>
            <span>Protocol</span>
            <strong>BS-Axis-Fit v1.1</strong>
          </div>
          <div>
            <span>Dataset</span>
            <strong>{points.length}/37 points</strong>
          </div>
          <div>
            <span>QC</span>
            <strong className={`grade-${quality.tone}`}>{quality.grade}</strong>
          </div>
        </div>
      </div>

      <div className="lab-stepper" aria-label="实验流程">
        {labSteps.map((step, index) => (
          <button
            type="button"
            key={step.label}
            className={`${index === activeStep ? "active" : ""} ${index < activeStep ? "done" : ""}`}
            onClick={() => setActiveStep(index)}
          >
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <em>{step.caption}</em>
          </button>
        ))}
      </div>

      <div className="lab-stage-shell">
        {activeStep === 0 && (
          <div className="guided-stage stage-import">
            {inputPanel}
            {parsePanel}
            {acquisitionPanel}
          </div>
        )}

        {activeStep === 1 && (
          <div className="guided-stage stage-fit">
            {resultStrip}
            <AxisChart
              className="student-axis-chart guided-card"
              title="轴线磁场拟合"
              subtitle="以 Biot-Savart 解析轴线场为参考，最小二乘拟合等效安匝数。"
              xLabel="x (mm)"
              yLabel="B (mT)"
              series={
                fit
                  ? [
                      {
                        id: "fit",
                        label: "Fitted Biot-Savart",
                        color: "#16a34a",
                        points: fit.curve,
                        dashed: true,
                        width: 2.2,
                      },
                    ]
                  : []
              }
              scatter={[
                {
                  id: "student",
                  label: "Measured data",
                  color: "#e84c3d",
                  points: scatter,
                  radius: 4.3,
                },
              ]}
              yDomain={[0, yMax]}
            />
            <div className="student-explain-panel guided-card">
              <div className="panel-heading">
                <Calculator size={18} />
                <div>
                  <h3>模型协议</h3>
                  <p className="panel-subtitle">轴线解析场提供可解释物理基准。</p>
                </div>
              </div>
              <ol className="protocol-list">
                <li>将输入统一为轴线磁场曲线 Bx(x)。</li>
                <li>拟合等效安匝数并计算 RMSE、R² 与逐点残差。</li>
                <li>反演最可能的线圈间距 d/R，复核装置设置。</li>
              </ol>
              <div className="formula-box">
                <BarChart3 size={18} />
                <p>
                  Bx(x) = μ0 Ieff R² / 2 · [ (R²+(x-d/2)²)<sup>-3/2</sup> + (R²+(x+d/2)²)<sup>-3/2</sup> ]
                </p>
              </div>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="guided-stage stage-qc">
            {qualityPanel}
            <AxisChart
              className="student-error-chart guided-card"
              title="逐点相对误差"
              subtitle={`超过 ${errorLimit.toFixed(1)}% 的点会在审计表中标记为复核。`}
              xLabel="x (mm)"
              yLabel="Error (%)"
              series={[
                {
                  id: "error",
                  label: "Relative error",
                  color: "#f59e0b",
                  points: fit ? points.map((point, index) => ({ x: point.x, y: fit.errors[index] })) : [],
                  width: 2.2,
                },
              ]}
              yDomain={[0, residualMax]}
            />
            {analysisTable}
          </div>
        )}

        {activeStep === 3 && (
          <div className="guided-stage stage-report">
            <div className="student-map-panel guided-card">
              <div className="panel-heading">
                <FlaskConical size={18} />
                <div>
                  <h3>xOy 场结构重建</h3>
                  <p className="panel-subtitle">由当前拟合参数生成二维参考场图。</p>
                </div>
              </div>
              {heatmap ? (
                <>
                  <HeatmapCanvas x={heatmap.x} y={heatmap.y} z={heatmap.z} xLabel="x (mm)" yLabel="y (mm)" />
                  <div className="field-summary-grid">
                    <div>
                      <span>场强范围</span>
                      <strong>
                        {heatmapRange ? `${heatmapRange.min.toFixed(2)}-${heatmapRange.max.toFixed(2)} mT` : "--"}
                      </strong>
                    </div>
                    <div>
                      <span>网格分辨率</span>
                      <strong>{heatmapRange ? `${heatmapRange.xCount} x ${heatmapRange.yCount}` : "--"}</strong>
                    </div>
                    <div>
                      <span>生成依据</span>
                      <strong>BS 拟合参数</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">至少输入 3 个有效点后生成场图。</div>
              )}
            </div>
            <div className="guided-card report-panel">
              <div className="panel-heading">
                <Download size={18} />
                <div>
                  <h3>报告导出</h3>
                  <p className="panel-subtitle">保留参数、质控等级、逐点残差和导出时间。</p>
                </div>
              </div>
              <div className="export-row report-actions">
                <button type="button" onClick={() => downloadJson("helmholtz_analysis_report.json", exportPayload)}>
                  <Download size={15} />
                  JSON 报告
                </button>
                <button
                  type="button"
                  onClick={() => downloadText("helmholtz_analysis_table.csv", makeCsv(tableRows), "text/csv")}
                >
                  <FileSpreadsheet size={15} />
                  CSV 表格
                </button>
              </div>
              <div className="student-status">
                <Gauge size={18} />
                <p>{quality.summary}</p>
              </div>
            </div>
            {reportAuditPanel}
          </div>
        )}
      </div>

      <div className="stage-actions">
        <button type="button" onClick={() => setActiveStep((step) => Math.max(0, step - 1))} disabled={activeStep === 0}>
          <ArrowLeft size={16} />
          上一步
        </button>
        <button
          type="button"
          onClick={() => setActiveStep((step) => Math.min(labSteps.length - 1, step + 1))}
          disabled={activeStep === labSteps.length - 1}
        >
          下一步
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
