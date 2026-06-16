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
