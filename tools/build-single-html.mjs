import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const publicDir = path.join(projectRoot, "public");
const outputPath = path.join(distDir, "helmholtz-pinn-lab-single.html");

const plotlyUrl = "https://cdn.plot.ly/plotly-3.5.0.min.js";

const mimeTypes = new Map([
  [".gif", "image/gif"],
  [".html", "text/html;charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript;charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const toPosix = (value) => value.split(path.sep).join("/");

function mimeFor(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function fileToDataUri(filePath, mime = mimeFor(filePath)) {
  const buffer = await fs.readFile(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function embedPlotly(html) {
  if (!html.includes(plotlyUrl)) {
    return html;
  }

  const plotlySource = (await fetchText(plotlyUrl)).replace(/<\/script/gi, "<\\/script");
  return html.replace(
    /<script[^>]+src="https:\/\/cdn\.plot\.ly\/plotly-3\.5\.0\.min\.js"[^>]*><\/script>/,
    `<script>${plotlySource}</script>`,
  );
}

async function collectPublicAssets() {
  const assets = {};

  async function walk(directory, relativeRoot = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.join(relativeRoot, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
        continue;
      }

      const normalizedPath = toPosix(relativePath);
      if (normalizedPath === "interactive/param_slider.html") {
        const html = await embedPlotly(await fs.readFile(fullPath, "utf8"));
        assets[normalizedPath] = `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
        continue;
      }

      assets[normalizedPath] = await fileToDataUri(fullPath);
    }
  }

  await walk(publicDir);
  return assets;
}

function resolveDistReference(reference) {
  return path.join(distDir, reference.replace(/^\.?\//, ""));
}

async function inlineViteOutput(html, assets) {
  const cssMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+\.css)"[^>]*>/);
  const jsMatch = html.match(/<script type="module"[^>]+src="([^"]+\.js)"[^>]*><\/script>/);

  if (!cssMatch || !jsMatch) {
    throw new Error("Could not find Vite CSS/JS references in dist/index.html");
  }

  const css = await fs.readFile(resolveDistReference(cssMatch[1]), "utf8");
  const js = await fs.readFile(resolveDistReference(jsMatch[1]), "utf8");
  const assetJson = JSON.stringify(assets).replace(/</g, "\\u003c");
  const appJsBase64 = Buffer.from(js, "utf8").toString("base64");
  const appBootstrap = [
    "<script>",
    "(() => {",
    `  const source = ${JSON.stringify(appJsBase64)};`,
    "  const bytes = Uint8Array.from(atob(source), (char) => char.charCodeAt(0));",
    "  const script = document.createElement('script');",
    "  script.type = 'module';",
    "  script.textContent = new TextDecoder().decode(bytes);",
    "  document.head.appendChild(script);",
    "})();",
    "</script>",
  ].join("\n");

  return html
    .replace(cssMatch[0], `<style>\n${css}\n</style>`)
    .replace(
      jsMatch[0],
      `<script>window.__HELMHOLTZ_ASSETS__=${assetJson};</script>\n${appBootstrap}`,
    )
    .replace(/<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/, [
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '<meta name="application-name" content="Helmholtz PINN Lab Single File" />',
    ].join("\n    "));
}

async function main() {
  const html = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const assets = await collectPublicAssets();
  const singleHtml = await inlineViteOutput(html, assets);
  await fs.writeFile(outputPath, singleHtml, "utf8");

  const stats = await fs.stat(outputPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${outputPath}`);
  console.log(`Embedded ${Object.keys(assets).length} public assets`);
  console.log(`Single-file size: ${sizeMb} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
