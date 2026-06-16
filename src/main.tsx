import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  ArrowRight,
  Atom,
  BookOpen,
  Boxes,
  ChartSpline,
  Database,
  Download,
  FlaskConical,
  Gauge,
  GitBranch,
  Home,
  Microscope,
  Minus,
  Play,
  Plus,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react";
import webData from "./data/web-data.json";
import { AxisChart } from "./components/AxisChart";
import { FieldScene } from "./components/FieldScene";
import { HeatmapCanvas } from "./components/HeatmapCanvas";
import { StudentLab } from "./components/StudentLab";
import { makeAxisCurve } from "./lib/physics";
import "./styles.css";

type WebData = typeof webData;
type ViewKey = "home" | "workbench" | "simulation" | "evidence" | "experiment" | "reproduce";

const data = webData as WebData;
const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

const navItems: Array<{ id: ViewKey; label: string; icon: React.ElementType }> = [
  { id: "home", label: "主控台", icon: Home },
  { id: "workbench", label: "引导实验", icon: FlaskConical },
  { id: "simulation", label: "三维仿真", icon: SlidersHorizontal },
  { id: "evidence", label: "验证证据", icon: ShieldCheck },
  { id: "experiment", label: "数据档案", icon: Database },
  { id: "reproduce", label: "复现记录", icon: GitBranch },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function isViewKey(value: string): value is ViewKey {
  return navItems.some((item) => item.id === value);
}

function readHashView(): ViewKey {
  const raw = window.location.hash.replace("#", "");
  return isViewKey(raw) ? raw : "home";
}

function activeExperiment(dRatio: number) {
  const anchors = [
    { d: 0.5, label: "d=R/2 训练数据", values: data.axis.halfMeasured, color: "#2c9bd6" },
    { d: 1, label: "d=R 未见验证", values: data.axis.helmMeasured, color: "#e84c3d" },
    { d: 2, label: "d=2R 训练数据", values: data.axis.doubleMeasured, color: "#8b5bb7" },
  ];

  return anchors.reduce(
    (best, item) => (Math.abs(item.d - dRatio) < Math.abs(best.d - dRatio) ? item : best),
    anchors[0],
  );
}

function MetricTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "teal" | "amber" | "rose" | "violet";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit && <em>{unit}</em>}
      </strong>
    </div>
  );
}

function ImgPanel({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label: string;
}) {
  return (
    <figure className="image-panel">
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  eyebrow,
  body,
  meta,
  onOpen,
}: {
  icon: React.ElementType;
  title: string;
  eyebrow: string;
  body: string;
  meta: string;
  onOpen: () => void;
}) {
  return (
    <button className="module-card" type="button" onClick={onOpen}>
      <span className="module-icon">
        <Icon size={22} />
      </span>
      <span className="module-copy">
        <em>{eyebrow}</em>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      <span className="module-meta">
        {meta}
        <ArrowRight size={17} />
      </span>
    </button>
  );
}

function ViewFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="view-frame">
      <div className="view-heading">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

function HomeView({ navigate }: { navigate: (view: ViewKey) => void }) {
  return (
    <section className="portal-shell">
      <div className="portal-hero">
        <div className="portal-title">
          <p>Helmholtz PINN Research Suite</p>
          <h1>面向物理实验、PINN 建模与竞赛展示的磁场研究工作台</h1>
          <span>
            以实验流程为主线，把数据采集、物理拟合、三维场结构、模型验证和复现资料拆分为独立研究模块。
          </span>
        </div>
        <div className="portal-instrument">
          <div>
            <span>Axis samples</span>
            <strong>37</strong>
          </div>
          <div>
            <span>Held-out d=R</span>
            <strong>{data.meta.metrics.paramUnseenMeanErr.toFixed(2)}%</strong>
          </div>
          <div>
            <span>PINN R²</span>
            <strong>{data.meta.metrics.paramUnseenR2.toFixed(4)}</strong>
          </div>
        </div>
      </div>

      <div className="module-grid">
        <ModuleCard
          icon={Workflow}
          eyebrow="Guided protocol"
          title="引导式实验流程"
          body="从数据导入、标定、拟合、质控到报告导出，按研究步骤推进。"
          meta="4 stages"
          onOpen={() => navigate("workbench")}
        />
        <ModuleCard
          icon={Microscope}
          eyebrow="Field simulation"
          title="三维场结构与参数扫描"
          body="控制 d/R，观察轴线曲线、线圈位置和数值追踪磁感线。"
          meta="interactive"
          onOpen={() => navigate("simulation")}
        />
        <ModuleCard
          icon={ShieldCheck}
          eyebrow="Validation"
          title="PINN 验证证据链"
          body="标准 PINN、参数化 PINN、叠加原理和设备边界判断集中审阅。"
          meta="3 checks"
          onOpen={() => navigate("evidence")}
        />
        <ModuleCard
          icon={Database}
          eyebrow="Archive"
          title="实验数据档案"
          body="仪器照片、实验参数、轴线数据预览和二维参考场图。"
          meta="raw data"
          onOpen={() => navigate("experiment")}
        />
        <ModuleCard
          icon={GitBranch}
          eyebrow="Reproducibility"
          title="复现与材料记录"
          body="保留 step1-step8 的数据处理、训练、验证和交互演示资产。"
          meta="pipeline"
          onOpen={() => navigate("reproduce")}
        />
      </div>

      <div className="portal-labline">
        <div>
          <BookOpen size={18} />
          <strong>Research narrative</strong>
          <span>轴线实测约束三维表达，Maxwell 物理项约束网络学习，参数化模型检验泛化能力。</span>
        </div>
        <button type="button" onClick={() => navigate("workbench")}>
          进入实验流程
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function SimulationView() {
  const [dRatio, setDRatio] = React.useState(1);
  const updateDRatio = (event: React.FormEvent<HTMLInputElement>) => {
    setDRatio(clamp(Number(event.currentTarget.value), 0.4, 2.2));
  };
  const exp = activeExperiment(dRatio);
  const axisCurve = makeAxisCurve(dRatio, data.parametric.calibratedCurrentA, data.meta.radiusMm);
  const expPoints = data.axis.xMm.map((x, index) => ({ x, y: exp.values[index] }));
  const nearestIsHeldOut = Math.abs(exp.d - 1) < 0.01;
  const coilDistance = dRatio * data.meta.radiusMm;

  return (
    <ViewFrame eyebrow="Simulation Module" title="线圈间距扫描与三维场结构">
      <div className="metrics-row compact-metrics" aria-label="关键指标">
        <MetricTile
          label="亥姆霍兹轴线误差"
          value={data.meta.metrics.helmAxisMeanErr.toFixed(3)}
          unit="%"
          tone="teal"
        />
        <MetricTile
          label="未见 d=R 泛化"
          value={data.meta.metrics.paramUnseenMeanErr.toFixed(3)}
          unit="%"
          tone="rose"
        />
        <MetricTile
          label="叠加原理验证"
          value={data.meta.metrics.superpositionMeanErr.toFixed(2)}
          unit="%"
          tone="amber"
        />
        <MetricTile
          label="参数化模型 R²"
          value={data.meta.metrics.paramUnseenR2.toFixed(4)}
          tone="violet"
        />
      </div>

      <div className="bench-grid module-surface">
        <div className="control-panel">
          <div className="panel-heading">
            <SlidersHorizontal size={18} />
            <h2>线圈间距控制</h2>
          </div>
          <label className="range-label" htmlFor="spacing">
            <span>d/R</span>
            <strong>{dRatio.toFixed(2)}</strong>
          </label>
          <input
            id="spacing"
            type="range"
            min="0.4"
            max="2.2"
            step="0.02"
            value={dRatio}
            onInput={updateDRatio}
            onChange={updateDRatio}
          />
          <div className="range-ticks" aria-hidden="true">
            <span>0.4R</span>
            <span>R/2</span>
            <span>R</span>
            <span>2R</span>
            <span>2.2R</span>
          </div>
          <div className="spacing-actions" aria-label="线圈间距快捷控制">
            <button type="button" onClick={() => setDRatio((value) => clamp(value - 0.1, 0.4, 2.2))}>
              <Minus size={15} />
            </button>
            <button type="button" onClick={() => setDRatio(0.5)}>
              R/2
            </button>
            <button type="button" onClick={() => setDRatio(1)}>
              R
            </button>
            <button type="button" onClick={() => setDRatio(2)}>
              2R
            </button>
            <button type="button" onClick={() => setDRatio((value) => clamp(value + 0.1, 0.4, 2.2))}>
              <Plus size={15} />
            </button>
          </div>
          <div className="readouts">
            <div>
              <span>线圈中心位置</span>
              <strong>x = ±{(coilDistance / 2).toFixed(0)} mm</strong>
            </div>
            <div>
              <span>最近实验锚点</span>
              <strong className={nearestIsHeldOut ? "held-out" : ""}>{exp.label}</strong>
            </div>
          </div>
          <div className="boundary-note">
            <ShieldCheck size={18} />
            <p>定量结论限定在轴线；三维图用于展示物理场结构与参数变化趋势。</p>
          </div>
        </div>

        <AxisChart
          className="axis-card"
          title="轴线 Bx(x) 参考曲线"
          subtitle="解析曲线随 d/R 变化，散点显示最接近的实测配置。"
          xLabel="x (mm)"
          yLabel="B (mT)"
          series={[
            {
              id: "bs",
              label: "Biot-Savart reference",
              color: "#16a34a",
              points: axisCurve,
              dashed: true,
              width: 2,
            },
          ]}
          scatter={[
            {
              id: "exp",
              label: exp.label,
              color: exp.color,
              points: expPoints,
              radius: 4.6,
            },
          ]}
          yDomain={[0, 3.05]}
        />

        <FieldScene dRatio={dRatio} className="scene-card" />
      </div>

      <div className="iframe-panel module-panel">
        <div className="panel-heading">
          <ChartSpline size={18} />
          <h3>参数化 PINN 高保真滑块</h3>
        </div>
        <iframe title="Parametric PINN slider" src={assetPath("interactive/param_slider.html")} />
      </div>
    </ViewFrame>
  );
}

function EvidenceView() {
  return (
    <ViewFrame eyebrow="Validation Module" title="模型验证证据链">
      <div className="evidence-grid module-surface">
        <AxisChart
          title="标准 PINN 轴线验证"
          subtitle="37 个实测点上，PINN 与实验数据近乎重合。"
          xLabel="x (mm)"
          yLabel="B (mT)"
          series={[
            {
              id: "pinn",
              label: "PINN d=R",
              color: "#e84c3d",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.helmPinn[i] })),
              width: 2.5,
            },
            {
              id: "bs",
              label: "Biot-Savart",
              color: "#16a34a",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.biotHelm[i] })),
              dashed: true,
              width: 2,
            },
          ]}
          scatter={[
            {
              id: "measured",
              label: "Experiment",
              color: "#0f4c81",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.helmMeasured[i] })),
              radius: 4,
            },
          ]}
          yDomain={[0, 2.5]}
        />

        <AxisChart
          title="参数化 PINN：未见 d=R"
          subtitle="训练仅用 d=R/2 与 d=2R，d=R 作为 held-out 验证。"
          xLabel="x (mm)"
          yLabel="B (mT)"
          series={[
            {
              id: "param",
              label: "Parametric PINN",
              color: "#e84c3d",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.paramHelmPinn[i] })),
              width: 2.5,
            },
            {
              id: "bs",
              label: "Biot-Savart",
              color: "#16a34a",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.biotHelm[i] })),
              dashed: true,
              width: 2,
            },
          ]}
          scatter={[
            {
              id: "heldout",
              label: "Held-out experiment",
              color: "#e84c3d",
              points: data.axis.xMm.map((x, i) => ({ x, y: data.axis.helmMeasured[i] })),
              radius: 4,
            },
          ]}
          yDomain={[0, 2.5]}
        />

        <AxisChart
          title="叠加原理闭环"
          subtitle="平移两个单线圈 PINN 后相加，再回到亥姆霍兹轴线验证。"
          xLabel="x (mm)"
          yLabel="B (mT)"
          series={[
            {
              id: "sum",
              label: "Single-coil PINN sum",
              color: "#f59e0b",
              points: data.superposition.xMm.map((x, i) => ({
                x,
                y: data.superposition.predicted[i],
              })),
              width: 2.5,
            },
          ]}
          scatter={[
            {
              id: "measured",
              label: "Helmholtz experiment",
              color: "#0f4c81",
              points: data.superposition.xMm.map((x, i) => ({
                x,
                y: data.superposition.measured[i],
              })),
              radius: 4,
            },
          ]}
          yDomain={[0, 2.5]}
        />

        <div className="boundary-panel">
          <div className="panel-heading">
            <Gauge size={18} />
            <h3>设备边界判断</h3>
          </div>
          <p>
            径向补测显示，手动 Y 导轨定位误差会被场梯度放大。因此轴线外结果定位为结构性可视化，
            轴线数据承担定量验证。
          </p>
          <ImgPanel src={assetPath("assets/radial_op1.jpg")} alt="径向补测过程" label="径向补测用于识别设备边界" />
        </div>
      </div>
    </ViewFrame>
  );
}

function ExperimentView() {
  const rows = data.axis.xMm
    .map((x, index) => ({
      x,
      single: data.axis.singleMeasured[index],
      half: data.axis.halfMeasured[index],
      helm: data.axis.helmMeasured[index],
      double: data.axis.doubleMeasured[index],
    }))
    .filter((_, index) => index % 4 === 0);

  return (
    <ViewFrame eyebrow="Data Archive" title="实验仪器与轴线数据档案">
      <div className="experiment-grid module-surface">
        <ImgPanel
          src={assetPath("assets/device_photo.jpg")}
          alt="亥姆霍兹线圈实验装置实拍"
          label="DH4501N 三维亥姆霍兹线圈磁场实验仪"
        />
        <div className="spec-panel">
          <div className="panel-heading">
            <RadioTower size={18} />
            <h3>实验参数</h3>
          </div>
          <dl>
            <div>
              <dt>有效半径</dt>
              <dd>{data.meta.radiusMm} mm</dd>
            </div>
            <div>
              <dt>线圈匝数</dt>
              <dd>{data.meta.turns}</dd>
            </div>
            <div>
              <dt>励磁电流</dt>
              <dd>{data.meta.coilCurrentMa} mA</dd>
            </div>
            <div>
              <dt>霍尔电流</dt>
              <dd>{data.meta.hallCurrentMa.toFixed(2)} mA</dd>
            </div>
            <div>
              <dt>KH 标定</dt>
              <dd>{data.meta.kh.toFixed(3)} mV/(mA·mT)</dd>
            </div>
          </dl>
        </div>
        <div className="heatmap-panel">
          <div className="panel-heading">
            <Boxes size={18} />
            <h3>xOy 参考场图</h3>
          </div>
          <HeatmapCanvas
            x={data.fieldMap.xMm}
            y={data.fieldMap.yMm}
            z={data.fieldMap.bMag}
            xLabel="x (mm)"
            yLabel="y (mm)"
          />
        </div>
        <div className="table-panel">
          <div className="panel-heading">
            <Database size={18} />
            <h3>轴线数据预览</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>x</th>
                <th>单线圈</th>
                <th>R/2</th>
                <th>R</th>
                <th>2R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.x}>
                  <td>{row.x}</td>
                  <td>{row.single.toFixed(3)}</td>
                  <td>{row.half.toFixed(3)}</td>
                  <td>{row.helm.toFixed(3)}</td>
                  <td>{row.double.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ViewFrame>
  );
}

function ReproduceView() {
  const steps = [
    ["step1", "处理霍尔电压与四组轴线数据", "processed_data.npz"],
    ["step2", "建立 Biot-Savart 理论基准", "biot_savart_results.npz"],
    ["step3", "训练标准 PINN 并做轴线验证", "pinn_predictions.npz"],
    ["step5", "离轴三方对照，识别设备边界", "offaxis_validation_results.npz"],
    ["step6", "参数化 PINN v2 泛化验证", "pinn_parametric_v2_results.npz"],
    ["step8", "生成交互式 d/R 滑块和 GIF", "step8_param_d_slider.html"],
  ];

  return (
    <ViewFrame eyebrow="Reproducibility" title="复现流水线与图像材料">
      <div className="section-title inline-title">
        <span />
        <a className="ghost-link" href={assetPath("assets/param_animation.gif")} target="_blank" rel="noreferrer">
          <Download size={16} />
          查看扫描 GIF
        </a>
      </div>
      <div className="pipeline module-surface flat">
        {steps.map(([tag, title, output]) => (
          <div className="pipeline-step" key={tag}>
            <span>{tag}</span>
            <strong>{title}</strong>
            <em>{output}</em>
          </div>
        ))}
      </div>
      <div className="gallery-grid">
        <ImgPanel
          src={assetPath("assets/autodiff_axis_3dfield.png")}
          alt="自动微分、轴线磁场约束与三维场学习流程"
          label="自动微分、轴线磁场约束与三维场学习"
        />
        <ImgPanel
          src={assetPath("assets/param_valid.png")}
          alt="参数化 PINN 验证"
          label="d=R/2 与 d=2R 训练，d=R 未见验证"
        />
        <ImgPanel
          src={assetPath("assets/helm3d_persp.png")}
          alt="三维磁场重建"
          label="三维场结构和磁力线展示"
        />
      </div>
    </ViewFrame>
  );
}

function App() {
  const [view, setView] = React.useState<ViewKey>(() => readHashView());

  React.useEffect(() => {
    const handleHash = () => setView(readHashView());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const navigate = (nextView: ViewKey) => {
    setView(nextView);
    window.history.pushState(null, "", `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ActiveIcon = navItems.find((item) => item.id === view)?.icon ?? Home;

  return (
    <main>
      <header className="app-header app-header-pro">
        <button className="brand brand-button" type="button" onClick={() => navigate("home")}>
          <Atom size={22} />
          <span>Helmholtz PINN Lab</span>
        </button>
        <nav aria-label="模块导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id ? "active" : ""}
                type="button"
                onClick={() => navigate(item.id)}
                key={item.id}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="active-module-strip">
        <ActiveIcon size={18} />
        <span>{navItems.find((item) => item.id === view)?.label}</span>
      </div>

      {view === "home" && <HomeView navigate={navigate} />}
      {view === "workbench" && <StudentLab data={data} />}
      {view === "simulation" && <SimulationView />}
      {view === "evidence" && <EvidenceView />}
      {view === "experiment" && <ExperimentView />}
      {view === "reproduce" && <ReproduceView />}

      <footer>
        <Activity size={16} />
        <span>基于竞赛报告、实验数据、PINN 训练结果与可视化材料构建的本地科研工作站。</span>
        <Sparkles size={16} />
      </footer>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
