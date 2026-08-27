import React from "react";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck2,
  FlaskConical,
  Gauge,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Sigma,
  TimerReset,
  Workflow,
} from "lucide-react";

type LossTracePoint = {
  step: number;
  train: number;
  test: number;
  components: number[];
};

type SensitivityRun = {
  ratio_data_to_physics: number;
  axis_mre_percent: number;
  axis_r2: number;
  divergence_rms_normalized: number;
  curl_rms_normalized: number;
  biot_savart_magnitude_nrmse_percent: number;
  protocol: {
    loss_weights: number[];
    model_source: string;
  };
};

type TrainingData = {
  standard: {
    name: string;
    backend: string;
    device: string;
    seed: number;
    axisPoints: number;
    domainPoints: number;
    boundaryPoints: number;
    testPoints: number;
    architecture: string;
    activation: string;
    initializer: string;
    lossWeights: number[];
    adamSteps: number;
    adamLearningRate: number;
    adamSeconds: number;
    lbfgsFinalStep: number;
    lbfgsSeconds: number;
    checkpoint: string;
    trace: LossTracePoint[];
    final: {
      meanRelativeErrorPercent: number;
      r2: number;
      maeMt: number;
      rmseMt: number;
    };
  };
  parametric: {
    name: string;
    axisPointsPerGroup: number;
    experimentalDRatios: number[];
    virtualDRatios: number[];
    heldOutDRatio: number;
    domainPoints: number;
    testPoints: number;
    architecture: string;
    activation: string;
    featureEncoding: string;
    dataHeavySteps: number;
    physicsRefineSteps: number;
    lbfgsFinalStep: number;
    checkpoint: string;
    final: {
      heldOutMeanRelativeErrorPercent: number;
      heldOutR2: number;
    };
  };
  sensitivity: Record<string, SensitivityRun>;
  ablation: {
    pinn: {
      axis_mre_percent: number;
      div_rms: number;
      curl_rms: number;
      bs_structure_rmse_percent: number;
    };
    data_only_nn: {
      axis_mre_percent: number;
      div_rms: number;
      curl_rms: number;
      bs_structure_rmse_percent: number;
    };
  };
};

type TrainingVariant = "standard" | "parametric";

type ReplayPoint = {
  step: number;
  phase: string;
  stage: number;
};

const standardStages = [
  { label: "数据装载", caption: "37 点轴线实测", icon: Database },
  { label: "计算域采样", caption: "域内与边界配点", icon: FlaskConical },
  { label: "自动微分", caption: "div / curl 残差", icon: Sigma },
  { label: "梯度优化", caption: "Adam 主训练", icon: Cpu },
  { label: "模型固化", caption: "L-BFGS 与检查点", icon: FileCheck2 },
];

const parametricStages = [
  { label: "条件数据", caption: "实验与 BS 锚点", icon: Database },
  { label: "特征编码", caption: "d 的 9 维映射", icon: Layers3 },
  { label: "物理约束", caption: "4D 条件化残差", icon: Sigma },
  { label: "分阶段优化", caption: "数据主导到物理精修", icon: Cpu },
  { label: "未见验证", caption: "d/R = 1.00", icon: BadgeCheck },
];

const componentLabels = ["div B", "curl x", "curl y", "curl z", "轴线 Bx", "轴线 By", "轴线 Bz"];

function formatScientific(value: number | undefined) {
  return value === undefined ? "--" : value.toExponential(2);
}

function formatDuration(seconds: number) {
  const minutes = seconds / 60;
  return minutes >= 10 ? `${minutes.toFixed(1)} min` : `${seconds.toFixed(1)} s`;
}

function LossChart({ points, visibleCount }: { points: LossTracePoint[]; visibleCount: number }) {
  const width = 760;
  const height = 340;
  const margin = { left: 64, right: 24, top: 24, bottom: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxStep = Math.max(...points.map((point) => point.step));
  const minLog = -5;
  const maxLog = 1;
  const shown = points.slice(0, Math.max(1, visibleCount));
  const scaleX = (step: number) => margin.left + (step / maxStep) * plotWidth;
  const scaleY = (value: number) => {
    const logValue = Math.max(minLog, Math.min(maxLog, Math.log10(Math.max(value, 1e-12))));
    return margin.top + ((maxLog - logValue) / (maxLog - minLog)) * plotHeight;
  };
  const makePath = (key: "train" | "test") =>
    shown.map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(point.step)},${scaleY(point[key])}`).join(" ");
  const xTicks = [0, 10000, 20000, 30000, 40000, maxStep];
  const yTicks = [1e1, 1, 1e-1, 1e-2, 1e-3, 1e-4, 1e-5];
  const current = shown[shown.length - 1];

  return (
    <svg className="training-loss-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标准 PINN 真实训练损失曲线">
      <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} className="loss-plot-bg" />
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={margin.left} x2={width - margin.right} y1={scaleY(tick)} y2={scaleY(tick)} className="loss-grid" />
          <text x={margin.left - 10} y={scaleY(tick) + 4} textAnchor="end" className="loss-tick-label">
            {tick.toExponential(0)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={tick}>
          <line x1={scaleX(tick)} x2={scaleX(tick)} y1={margin.top} y2={height - margin.bottom} className="loss-grid vertical" />
          <text x={scaleX(tick)} y={height - margin.bottom + 22} textAnchor="middle" className="loss-tick-label">
            {tick === maxStep ? "48.5k" : tick === 0 ? "0" : `${tick / 1000}k`}
          </text>
        </g>
      ))}
      <line
        x1={scaleX(40000)}
        x2={scaleX(40000)}
        y1={margin.top}
        y2={height - margin.bottom}
        className="optimizer-divider"
      />
      <text x={scaleX(40000) - 8} y={margin.top + 16} textAnchor="end" className="optimizer-label">
        Adam
      </text>
      <text x={scaleX(40000) + 8} y={margin.top + 16} className="optimizer-label">
        L-BFGS
      </text>
      <path d={makePath("train")} className="loss-line train" />
      <path d={makePath("test")} className="loss-line test" />
      <circle cx={scaleX(current.step)} cy={scaleY(current.train)} r="4" className="loss-current train" />
      <circle cx={scaleX(current.step)} cy={scaleY(current.test)} r="4" className="loss-current test" />
      <text x={width / 2} y={height - 8} textAnchor="middle" className="loss-axis-label">
        迭代步数
      </text>
      <text transform={`translate(17 ${height / 2}) rotate(-90)`} textAnchor="middle" className="loss-axis-label">
        加权总损失（对数）
      </text>
    </svg>
  );
}

function ArchitectureStrip({ variant }: { variant: TrainingVariant }) {
  const standard = variant === "standard";
  return (
    <div className="architecture-strip" aria-label="PINN 网络结构">
      <div className="architecture-block input">
        <span>Input</span>
        <strong>{standard ? "3" : "4"}</strong>
        <em>{standard ? "x, y, z" : "x, y, z, d"}</em>
      </div>
      <ArrowRight size={18} />
      {!standard && (
        <>
          <div className="architecture-block encoding">
            <span>Encoding</span>
            <strong>9D</strong>
            <em>d, d², sin/cos</em>
          </div>
          <ArrowRight size={18} />
        </>
      )}
      <div className="architecture-block hidden">
        <span>Hidden FNN</span>
        <strong>{standard ? "64 × 6" : "100 × 8"}</strong>
        <em>tanh · Glorot</em>
      </div>
      <ArrowRight size={18} />
      <div className="architecture-block output">
        <span>Output</span>
        <strong>3</strong>
        <em>Bx, By, Bz</em>
      </div>
    </div>
  );
}

export function TrainingLab({
  training,
  parametricLossImage,
  onProceed,
}: {
  training: TrainingData;
  parametricLossImage: string;
  onProceed: () => void;
}) {
  const [variant, setVariant] = React.useState<TrainingVariant>("standard");
  const [sensitivityKey, setSensitivityKey] = React.useState("10.0");
  const standardReplay: ReplayPoint[] = React.useMemo(
    () =>
      training.standard.trace.map((point) => ({
        step: point.step,
        phase: point.step === 0 ? "模型初始化" : point.step < training.standard.adamSteps ? "Adam 主训练" : "L-BFGS 精细优化",
        stage: point.step === 0 ? 0 : point.step < training.standard.adamSteps ? 3 : 4,
      })),
    [training.standard.adamSteps, training.standard.trace],
  );
  const parametricReplay: ReplayPoint[] = React.useMemo(
    () => [
      { step: 0, phase: "条件数据装载", stage: 0 },
      { step: 10000, phase: "Adam 数据主导", stage: 3 },
      { step: 30000, phase: "Adam 数据主导", stage: 3 },
      { step: 60000, phase: "数据主导阶段完成", stage: 3 },
      { step: 70000, phase: "Adam 物理精修", stage: 3 },
      { step: 80000, phase: "Adam 物理精修", stage: 3 },
      { step: 90000, phase: "物理精修阶段完成", stage: 3 },
      { step: training.parametric.lbfgsFinalStep, phase: "L-BFGS 与未见验证", stage: 4 },
    ],
    [training.parametric.lbfgsFinalStep],
  );
  const replay = variant === "standard" ? standardReplay : parametricReplay;
  const [cursor, setCursor] = React.useState(standardReplay.length - 1);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!running) return;
    if (cursor >= replay.length - 1) {
      setRunning(false);
      return;
    }
    const timer = window.setTimeout(() => setCursor((value) => value + 1), variant === "standard" ? 420 : 620);
    return () => window.clearTimeout(timer);
  }, [cursor, replay.length, running, variant]);

  const selectVariant = (next: TrainingVariant) => {
    const nextReplay = next === "standard" ? standardReplay : parametricReplay;
    setVariant(next);
    setRunning(false);
    setCursor(nextReplay.length - 1);
  };

  const startReplay = () => {
    if (cursor >= replay.length - 1) setCursor(0);
    setRunning(true);
  };

  const currentReplay = replay[Math.min(cursor, replay.length - 1)];
  const currentTrace = training.standard.trace[Math.min(cursor, training.standard.trace.length - 1)];
  const finalStep = variant === "standard" ? training.standard.lbfgsFinalStep : training.parametric.lbfgsFinalStep;
  const progress = Math.min(100, (currentReplay.step / finalStep) * 100);
  const stages = variant === "standard" ? standardStages : parametricStages;
  const selectedSensitivity = training.sensitivity[sensitivityKey];
  const isStandard = variant === "standard";
  const checkpoint = isStandard ? training.standard.checkpoint : training.parametric.checkpoint;
  const divRatio = training.ablation.data_only_nn.div_rms / training.ablation.pinn.div_rms;
  const curlRatio = training.ablation.data_only_nn.curl_rms / training.ablation.pinn.curl_rms;

  return (
    <div className="training-module">
      <div className="training-commandbar">
        <div className="training-variant-tabs" role="tablist" aria-label="PINN 训练任务">
          <button
            type="button"
            role="tab"
            aria-selected={isStandard}
            className={isStandard ? "active" : ""}
            onClick={() => selectVariant("standard")}
          >
            <BrainCircuit size={18} />
            <span>
              <strong>标准 PINN</strong>
              <em>37 点轴线约束三维场</em>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isStandard}
            className={!isStandard ? "active" : ""}
            onClick={() => selectVariant("parametric")}
          >
            <Workflow size={18} />
            <span>
              <strong>参数化 PINN v2</strong>
              <em>d/R 条件化泛化模型</em>
            </span>
          </button>
        </div>
        <div className="archive-run-status">
          <CheckCircle2 size={17} />
          <span>
            <strong>归档训练已完成</strong>
            <em>日志回放 · 非浏览器实时重训</em>
          </span>
        </div>
        <div className="training-command-actions">
          <button type="button" className="primary" onClick={running ? () => setRunning(false) : startReplay}>
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? "暂停回放" : "回放归档训练"}
          </button>
          <button type="button" onClick={() => { setRunning(false); setCursor(replay.length - 1); }} title="回到最终归档状态">
            <RotateCcw size={16} />
            最终状态
          </button>
        </div>
      </div>

      <div className="training-stage-track" aria-label="PINN 训练流程">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const state = index < currentReplay.stage ? "done" : index === currentReplay.stage ? "active" : "pending";
          return (
            <div key={stage.label} className={state}>
              <span className="stage-index">{index + 1}</span>
              <Icon size={18} />
              <strong>{stage.label}</strong>
              <em>{stage.caption}</em>
            </div>
          );
        })}
      </div>

      <div className="training-console-grid">
        <section className="training-config-panel">
          <div className="training-panel-heading">
            <Gauge size={18} />
            <div>
              <h2>训练任务配置</h2>
              <p>{isStandard ? "Step 3 · Helmholtz d=R" : "Step 6 v2 · spacing-conditioned model"}</p>
            </div>
          </div>
          <dl className="training-config-list">
            <div>
              <dt>监督数据</dt>
              <dd>{isStandard ? "轴线 37 点，仅 Bx 实测" : "d/R=0.5、2.0 实验数据"}</dd>
            </div>
            <div>
              <dt>物理配点</dt>
              <dd>{isStandard ? `${training.standard.domainPoints.toLocaleString()} 域内 + ${training.standard.boundaryPoints} 边界` : `${training.parametric.domainPoints.toLocaleString()} 个 4D 域内点`}</dd>
            </div>
            <div>
              <dt>网络结构</dt>
              <dd>{isStandard ? training.standard.architecture : training.parametric.architecture}</dd>
            </div>
            <div>
              <dt>激活函数</dt>
              <dd>tanh · Glorot uniform</dd>
            </div>
            <div>
              <dt>优化序列</dt>
              <dd>{isStandard ? "Adam 40k → L-BFGS" : "Adam 60k + 30k → L-BFGS"}</dd>
            </div>
            <div>
              <dt>随机种子</dt>
              <dd>{training.standard.seed}</dd>
            </div>
          </dl>
          <div className="runtime-environment">
            <Cpu size={17} />
            <div>
              <strong>{training.standard.backend}</strong>
              <span>{training.standard.device}</span>
            </div>
          </div>
        </section>

        <section className="training-loss-panel">
          <div className="training-panel-heading split">
            <div>
              <h2>{isStandard ? "真实损失收敛" : "参数化模型损失归档"}</h2>
              <p>{isStandard ? "训练日志中的加权总损失，纵轴为对数尺度。" : "原始训练脚本输出的总损失与分项损失图。"}</p>
            </div>
            {isStandard && (
              <div className="loss-legend">
                <span className="train">训练</span>
                <span className="test">测试</span>
              </div>
            )}
          </div>
          {isStandard ? (
            <>
              <LossChart points={training.standard.trace} visibleCount={cursor + 1} />
              <div className="loss-components">
                {componentLabels.map((label, index) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{formatScientific(currentTrace.components[index])}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="parametric-loss-figure">
              <img src={parametricLossImage} alt="参数化 PINN v2 真实训练损失曲线" />
              <p>图像来自 fig_param_v2_loss.png；回放进度仅展示已记录的训练阶段和最终检查点。</p>
            </div>
          )}
        </section>

        <section className="training-runtime-panel">
          <div className="training-panel-heading">
            <TimerReset size={18} />
            <div>
              <h2>运行监视器</h2>
              <p>Archived run monitor</p>
            </div>
          </div>
          <div className={`run-indicator ${running ? "running" : "complete"}`}>
            <span />
            {running ? "回放进行中" : cursor >= replay.length - 1 ? "检查点已固化" : "回放已暂停"}
          </div>
          <div className="run-step-readout">
            <span>当前步数</span>
            <strong>{currentReplay.step.toLocaleString()}</strong>
            <em>/ {finalStep.toLocaleString()}</em>
          </div>
          <div className="run-progress" aria-label={`训练回放进度 ${progress.toFixed(0)}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="run-phase">
            <span>优化阶段</span>
            <strong>{currentReplay.phase}</strong>
          </div>
          {isStandard ? (
            <div className="run-loss-readouts">
              <div>
                <span>训练损失</span>
                <strong>{formatScientific(currentTrace.train)}</strong>
              </div>
              <div>
                <span>测试损失</span>
                <strong>{formatScientific(currentTrace.test)}</strong>
              </div>
            </div>
          ) : (
            <div className="run-loss-readouts">
              <div>
                <span>数据主导</span>
                <strong>60,000</strong>
              </div>
              <div>
                <span>物理精修</span>
                <strong>30,000</strong>
              </div>
            </div>
          )}
          <div className="checkpoint-record">
            <FileCheck2 size={17} />
            <div>
              <span>Final checkpoint</span>
              <strong>{checkpoint}</strong>
            </div>
          </div>
          <p className="runtime-boundary">完整重训需在项目 Python/DeepXDE GPU 环境执行；本页负责审阅配置、日志与模型去向。</p>
        </section>
      </div>

      <div className="training-analysis-grid">
        <section className="architecture-panel">
          <div className="training-panel-heading">
            <BrainCircuit size={18} />
            <div>
              <h2>网络表达与自动微分</h2>
              <p>{isStandard ? "坐标到三分量磁场的连续函数映射" : "将线圈间距作为条件变量输入网络"}</p>
            </div>
          </div>
          <ArchitectureStrip variant={variant} />
          <div className="physics-loss-equation">
            <Sigma size={18} />
            <div>
              <strong>L = λ<sub>p</sub>(L<sub>div</sub> + L<sub>curl</sub>) + λ<sub>d</sub>(L<sub>Bx</sub> + L<sub>By</sub> + L<sub>Bz</sub>)</strong>
              <span>无源无流区域使用 ∇·B=0、∇×B=0；轴线上以 Bx 实测和 By=Bz=0 约束网络。</span>
            </div>
          </div>
        </section>

        {isStandard ? (
          <section className="sensitivity-panel">
            <div className="training-panel-heading split">
              <div>
                <h2>数据/物理损失权重审查</h2>
                <p>三组已完成训练，切换查看真实敏感性结果。</p>
              </div>
              <span className="evidence-tag">verified runs</span>
            </div>
            <div className="sensitivity-tabs">
              {Object.keys(training.sensitivity).map((key) => (
                <button type="button" className={sensitivityKey === key ? "active" : ""} onClick={() => setSensitivityKey(key)} key={key}>
                  λd/λp = {Number(key).toFixed(Number(key) < 1 ? 1 : 0)}
                  {key === "10.0" && <em>采用</em>}
                </button>
              ))}
            </div>
            <div className="sensitivity-metrics">
              <div>
                <span>轴线 MRE</span>
                <strong>{selectedSensitivity.axis_mre_percent.toFixed(3)}%</strong>
              </div>
              <div>
                <span>div RMS</span>
                <strong>{selectedSensitivity.divergence_rms_normalized.toExponential(2)}</strong>
              </div>
              <div>
                <span>curl RMS</span>
                <strong>{selectedSensitivity.curl_rms_normalized.toExponential(2)}</strong>
              </div>
              <div>
                <span>BS 结构 NRMSE</span>
                <strong>{selectedSensitivity.biot_savart_magnitude_nrmse_percent.toFixed(2)}%</strong>
              </div>
            </div>
            <div className="ablation-note">
              <Gauge size={17} />
              <p>
                纯数据网络仍可拟合轴线，但其 div 与 curl 残差分别是 PINN 的 {divRatio.toFixed(0)} 倍和 {curlRatio.toFixed(1)} 倍；
                物理项决定的是场表达的自洽性，不只是轴线拟合误差。
              </p>
            </div>
          </section>
        ) : (
          <section className="conditioning-panel">
            <div className="training-panel-heading">
              <Workflow size={18} />
              <div>
                <h2>线圈间距条件数据布局</h2>
                <p>d/R=1.00 全程不参与训练，仅用于未见配置验证。</p>
              </div>
            </div>
            <div className="conditioning-track">
              <div className="conditioning-line" />
              {[0.5, 0.7, 0.9, 1, 1.1, 1.3, 1.5, 1.8, 2].map((value) => {
                const experimental = training.parametric.experimentalDRatios.includes(value);
                const heldOut = value === training.parametric.heldOutDRatio;
                return (
                  <div
                    key={value}
                    className={`conditioning-point ${experimental ? "experiment" : heldOut ? "heldout" : "virtual"}`}
                    style={{ left: `${((value - 0.4) / 1.8) * 100}%` }}
                  >
                    <span />
                    <strong>{value.toFixed(1)}</strong>
                    <em>{experimental ? "实验" : heldOut ? "未见" : "BS"}</em>
                  </div>
                );
              })}
            </div>
            <div className="conditioning-legend">
              <span className="experiment">实验训练</span>
              <span className="virtual">BS 软约束</span>
              <span className="heldout">d=R 未见验证</span>
            </div>
            <div className="feature-record">
              <span>Fourier d encoding</span>
              <strong>{training.parametric.featureEncoding}</strong>
            </div>
          </section>
        )}
      </div>

      <div className="training-output-band">
        <div className="training-output-copy">
          <BadgeCheck size={21} />
          <div>
            <span>Model artifact ready</span>
            <strong>{checkpoint}</strong>
            <em>训练后的连续场模型将进入参数扫描、三维场结构计算和独立验证。</em>
          </div>
        </div>
        <div className="training-output-metrics">
          <div>
            <span>{isStandard ? "轴线 MRE" : "未见 d=R MRE"}</span>
            <strong>{isStandard ? training.standard.final.meanRelativeErrorPercent.toFixed(3) : training.parametric.final.heldOutMeanRelativeErrorPercent.toFixed(3)}%</strong>
          </div>
          <div>
            <span>R²</span>
            <strong>{isStandard ? training.standard.final.r2.toFixed(6) : training.parametric.final.heldOutR2.toFixed(4)}</strong>
          </div>
          <div>
            <span>{isStandard ? "GPU 优化用时" : "最终步数"}</span>
            <strong>{isStandard ? formatDuration(training.standard.adamSeconds + training.standard.lbfgsSeconds) : training.parametric.lbfgsFinalStep.toLocaleString()}</strong>
          </div>
        </div>
        <button type="button" className="proceed-simulation" onClick={onProceed}>
          进入三维仿真
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
