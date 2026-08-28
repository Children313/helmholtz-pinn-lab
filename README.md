# Helmholtz PINN Lab

面向大学物理实验、PINN 建模与竞赛展示的亥姆霍兹线圈磁场研究工作台。

## 本地运行

```bash
npm install
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

## 构建

```bash
npm run build
```

构建产物位于 `dist/`。

生成可直接离线打开、资源全部内嵌的单文件版本：

```bash
npm run build:single
```

输出文件为 `dist/helmholtz-pinn-lab-single.html`。

## 数字孪生间距接口

三维仿真页将线圈中心间距 `D` 作为统一状态。选择“摄像头 D”后，外部视觉测距程序可通过以下任一方式提交测量值：

```js
window.HelmholtzTwin.setSpacing({
  dMm: 100,
  confidence: 0.97,
  timestamp: Date.now(),
});
```

也可以发送浏览器事件或跨窗口消息：

```js
window.dispatchEvent(
  new CustomEvent("helmholtz:spacing", {
    detail: { dMm: 100, confidence: 0.97, timestamp: Date.now() },
  }),
);

window.postMessage(
  { type: "helmholtz-spacing", dMm: 100, confidence: 0.97, timestamp: Date.now() },
  "*",
);
```

`dMm` 为必填毫米值，系统会限制在实验讲义规定的 `50–200 mm` 行程内；`confidence` 和 `timestamp` 可选。数字孪生中左线圈固定，摄像头间距只驱动右线圈沿底板导轨移动。

## 部署到 GitHub Pages

项目已包含 GitHub Actions 工作流：

```text
.github/workflows/deploy.yml
```

推送到 GitHub 仓库的 `main` 分支后，在仓库设置中进入：

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

之后每次 push 到 `main`，工作流会自动：

1. 安装依赖
2. 执行 `npm run build`
3. 上传 `dist/`
4. 发布到 GitHub Pages

Vite 的 `base` 已根据 GitHub 仓库名自动设置，适配：

```text
https://用户名.github.io/仓库名/
```
