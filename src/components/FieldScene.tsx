import React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Crosshair, Expand, Rotate3D } from "lucide-react";

const COIL_RADIUS = 0.95;
const FIELD_SEGMENTS = 56;
const TRACE_STEP = 0.036;
const TRACE_STEPS = 240;
const MAX_X = 3.05;
const MAX_RHO = 1.78;

type FieldParticle = {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  phase: number;
  speed: number;
};

type ViewPreset = "perspective" | "front" | "top";

function disposeObject(object: THREE.Object3D) {
  const candidate = object as THREE.Mesh;
  candidate.geometry?.dispose();
  const materials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
  materials.filter(Boolean).forEach((material) => material.dispose());
}

function clearGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (child !== group) disposeObject(child);
  });
  group.clear();
}

function fieldAt(point: THREE.Vector3, halfSpacing: number) {
  const field = new THREE.Vector3();
  const dTheta = (2 * Math.PI) / FIELD_SEGMENTS;

  for (const centerX of [-halfSpacing, halfSpacing]) {
    for (let index = 0; index < FIELD_SEGMENTS; index += 1) {
      const theta = (index + 0.5) * dTheta;
      const sourceY = COIL_RADIUS * Math.cos(theta);
      const sourceZ = COIL_RADIUS * Math.sin(theta);
      const dlY = -COIL_RADIUS * Math.sin(theta) * dTheta;
      const dlZ = COIL_RADIUS * Math.cos(theta) * dTheta;
      const rx = point.x - centerX;
      const ry = point.y - sourceY;
      const rz = point.z - sourceZ;
      const r2 = Math.max(rx * rx + ry * ry + rz * rz, 0.008);
      const factor = 1 / Math.pow(r2, 1.5);
      field.x += (dlY * rz - dlZ * ry) * factor;
      field.y += dlZ * rx * factor;
      field.z += -dlY * rx * factor;
    }
  }

  return field;
}

function isInsideFieldVolume(point: THREE.Vector3) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    Math.abs(point.x) <= MAX_X &&
    Math.hypot(point.y, point.z) <= MAX_RHO
  );
}

function isNearWire(point: THREE.Vector3, halfSpacing: number) {
  const rho = Math.hypot(point.y, point.z);
  return [-halfSpacing, halfSpacing].some(
    (centerX) => Math.abs(point.x - centerX) < 0.08 && Math.abs(rho - COIL_RADIUS) < 0.1,
  );
}

function trace(seed: THREE.Vector3, halfSpacing: number, direction: 1 | -1) {
  const points: THREE.Vector3[] = [];
  let point = seed.clone();

  for (let index = 0; index < TRACE_STEPS; index += 1) {
    const field = fieldAt(point, halfSpacing);
    if (field.lengthSq() < 1e-8) break;
    const next = point.clone().add(field.normalize().multiplyScalar(direction * TRACE_STEP));
    if (!isInsideFieldVolume(next) || isNearWire(next, halfSpacing)) break;
    points.push(next);
    point = next;
  }

  return points;
}

function makeStreamline(seed: THREE.Vector3, halfSpacing: number) {
  return [...trace(seed, halfSpacing, -1).reverse(), seed.clone(), ...trace(seed, halfSpacing, 1)];
}

function makeFieldSeeds() {
  const seeds: Array<{ seed: THREE.Vector3; color: number; opacity: number }> = [
    { seed: new THREE.Vector3(0, 0.025, 0), color: 0x0e7490, opacity: 0.95 },
  ];
  const families = [
    { rho: 0.24, color: 0x0891b2, opacity: 0.84, count: 6 },
    { rho: 0.47, color: 0x0284c7, opacity: 0.72, count: 8 },
    { rho: 0.7, color: 0x7c3aed, opacity: 0.62, count: 8 },
  ];

  families.forEach((family) => {
    for (let index = 0; index < family.count; index += 1) {
      const phi = (index / family.count) * Math.PI * 2;
      seeds.push({
        seed: new THREE.Vector3(0, family.rho * Math.cos(phi), family.rho * Math.sin(phi)),
        color: family.color,
        opacity: family.opacity,
      });
    }
  });
  return seeds;
}

function createBox(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  castShadow = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function createRail(length: number, radius: number, position: [number, number, number], material: THREE.Material) {
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), material);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(...position);
  rail.castShadow = true;
  rail.receiveShadow = true;
  return rail;
}

function createCoilAssembly(materials: {
  copper: THREE.Material;
  copperDark: THREE.Material;
  resin: THREE.Material;
  black: THREE.Material;
}) {
  const assembly = new THREE.Group();
  assembly.add(createBox([0.58, 0.18, 1.5], [0, -1.02, 0], materials.black));
  assembly.add(createBox([0.32, 0.72, 0.22], [0, -0.72, 0], materials.black));
  assembly.add(createBox([0.18, 0.2, 1.14], [0, -0.57, 0], materials.black));

  [-0.07, 0.07].forEach((offset, layerIndex) => {
    const casing = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.102, 18, 128), materials.resin);
    casing.rotation.y = Math.PI / 2;
    casing.position.x = offset;
    casing.castShadow = true;
    assembly.add(casing);

    [0.905, 0.935, 0.965].forEach((radius, windingIndex) => {
      const winding = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.024, 12, 128),
        windingIndex === 1 && layerIndex === 0 ? materials.copperDark : materials.copper,
      );
      winding.rotation.y = Math.PI / 2;
      winding.position.x = offset;
      winding.castShadow = true;
      assembly.add(winding);
    });
  });

  const terminalMaterial = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.35, metalness: 0.2 });
  const terminal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 14), terminalMaterial);
  terminal.rotation.z = Math.PI / 2;
  terminal.position.set(0, -0.72, 0.63);
  assembly.add(terminal);
  return assembly;
}

function createPanelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 360;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

function drawControlPanel(canvas: HTMLCanvasElement, dMm: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#d9dde1";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#20252b";
  context.fillRect(34, 34, 956, 292);
  context.fillStyle = "#d8dee5";
  context.fillRect(48, 48, 928, 264);
  context.fillStyle = "#27313a";
  context.font = "700 34px sans-serif";
  context.fillText("HZDH 3D MAGNETIC FIELD LAB", 70, 92);

  const readings = ["5.00", dMm.toFixed(0), "0.500"];
  readings.forEach((reading, index) => {
    const x = 78 + index * 300;
    context.fillStyle = "#111518";
    context.fillRect(x, 122, 232, 94);
    context.shadowColor = "#ff203d";
    context.shadowBlur = 18;
    context.fillStyle = "#ff2945";
    context.font = "700 58px monospace";
    context.textAlign = "center";
    context.fillText(reading, x + 116, 190);
    context.shadowBlur = 0;
    context.fillStyle = "#4b5563";
    context.font = "700 24px sans-serif";
    context.fillText(index === 0 ? "mA" : index === 1 ? "D / mm" : "A", x + 116, 256);
  });
  context.textAlign = "left";
  context.fillStyle = "#6b7280";
  context.font = "600 20px sans-serif";
  context.fillText("CURRENT", 92, 292);
  context.fillText("SPACING", 392, 292);
  context.fillText("COIL", 712, 292);
}

function createDimensionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.39, 1);
  return { canvas, texture, sprite };
}

function drawDimensionLabel(canvas: HTMLCanvasElement, dMm: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(22, 104, 168, 0.92)";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 18);
  context.stroke();
  context.font = "700 48px monospace";
  context.textAlign = "center";
  context.lineJoin = "round";
  context.lineWidth = 10;
  context.strokeStyle = "rgba(255, 255, 255, 0.94)";
  context.strokeText(`D = ${dMm.toFixed(0)} mm`, 256, 78);
  context.fillStyle = "#0b4f84";
  context.fillText(`D = ${dMm.toFixed(0)} mm`, 256, 78);
}

function createScaleMarks() {
  const positions: number[] = [];
  for (let index = -34; index <= 34; index += 1) {
    const x = index / 10;
    const longTick = index % 5 === 0;
    positions.push(x, -0.82, 0.93, x, -0.82, longTick ? 0.76 : 0.84);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xe5edf4, transparent: true, opacity: 0.82 }),
  );
}

export function FieldScene({
  dRatio,
  radiusMm,
  source,
  cameraLinked,
  controls,
  className = "",
}: {
  dRatio: number;
  radiusMm: number;
  source: "manual" | "camera";
  cameraLinked: boolean;
  controls: React.ReactNode;
  className?: string;
}) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = React.useRef<OrbitControls | null>(null);
  const coilGroupsRef = React.useRef<THREE.Group[]>([]);
  const targetHalfRef = React.useRef(dRatio / 2);
  const fieldGroupRef = React.useRef<THREE.Group | null>(null);
  const particlesRef = React.useRef<FieldParticle[]>([]);
  const dimensionLineRef = React.useRef<THREE.Line | null>(null);
  const dimensionTicksRef = React.useRef<THREE.Mesh[]>([]);
  const dimensionCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dimensionTextureRef = React.useRef<THREE.CanvasTexture | null>(null);
  const panelCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const panelTextureRef = React.useRef<THREE.CanvasTexture | null>(null);
  const uniformityVolumeRef = React.useRef<THREE.Mesh | null>(null);

  const setView = React.useCallback((preset: ViewPreset) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return;
    const positions: Record<ViewPreset, THREE.Vector3> = {
      perspective: new THREE.Vector3(6.5, 3.55, 7.4),
      front: new THREE.Vector3(0.3, 1.15, 9.2),
      top: new THREE.Vector3(0.15, 9.2, 0.01),
    };
    camera.position.copy(positions[preset]);
    orbit.target.set(0.25, -0.15, 0);
    orbit.update();
  }, []);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.FogExp2(0xffffff, 0.045);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(6.5, 3.55, 7.4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.055;
    orbit.enablePan = false;
    orbit.minDistance = 5.2;
    orbit.maxDistance = 13;
    orbit.minPolarAngle = 0.2;
    orbit.maxPolarAngle = Math.PI / 2.03;
    orbit.autoRotate = false;
    orbit.target.set(0.25, -0.15, 0);
    orbitRef.current = orbit;

    scene.add(new THREE.HemisphereLight(0xc7e8ff, 0x20130d, 1.75));
    const keyLight = new THREE.DirectionalLight(0xffe1c2, 4.2);
    keyLight.position.set(4.5, 7, 5.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -5;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x22d3ee, 28, 10, 2);
    rimLight.position.set(-2.6, 1.8, -2.3);
    scene.add(rimLight);
    const warmLight = new THREE.PointLight(0xff8a3d, 24, 8, 2);
    warmLight.position.set(2.6, 2.2, 2.4);
    scene.add(warmLight);

    const black = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.58, metalness: 0.42 });
    const blackSoft = new THREE.MeshStandardMaterial({ color: 0x1d2730, roughness: 0.72, metalness: 0.25 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa5ae, roughness: 0.23, metalness: 0.9 });
    const copper = new THREE.MeshStandardMaterial({
      color: 0xd46b2c,
      emissive: 0x4e1605,
      emissiveIntensity: 0.24,
      roughness: 0.24,
      metalness: 0.78,
    });
    const copperDark = new THREE.MeshStandardMaterial({
      color: 0x87370f,
      emissive: 0x351002,
      emissiveIntensity: 0.16,
      roughness: 0.3,
      metalness: 0.72,
    });
    const resin = new THREE.MeshPhysicalMaterial({
      color: 0xd9884d,
      transparent: true,
      opacity: 0.26,
      transmission: 0.28,
      roughness: 0.12,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 15),
      new THREE.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 0.96, metalness: 0.03 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    floor.receiveShadow = true;
    scene.add(floor);

    const apparatus = new THREE.Group();
    apparatus.add(createBox([7.25, 0.24, 2.45], [-0.15, -1.29, 0], blackSoft));
    apparatus.add(createBox([6.95, 0.12, 0.93], [-0.15, -1.09, 0], black));
    apparatus.add(createBox([7.05, 0.13, 0.22], [-0.15, -0.93, 0.94], black));
    apparatus.add(createRail(6.82, 0.045, [-0.15, -0.91, -0.57], steel));
    apparatus.add(createRail(6.82, 0.045, [-0.15, -0.91, 0.57], steel));
    apparatus.add(createScaleMarks());

    for (const x of [-3.35, -2.25, 2.05, 3.15]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18), steel);
      screw.position.set(x, -1.15, 1.04);
      apparatus.add(screw);
    }

    const leftCoil = createCoilAssembly({ copper, copperDark, resin, black });
    const rightCoil = createCoilAssembly({ copper, copperDark, resin, black });
    leftCoil.position.x = -targetHalfRef.current;
    rightCoil.position.x = targetHalfRef.current;
    apparatus.add(leftCoil, rightCoil);
    coilGroupsRef.current = [leftCoil, rightCoil];

    const probeCarriage = new THREE.Group();
    probeCarriage.add(createBox([0.48, 0.18, 0.72], [0, -1.02, -0.62], black));
    probeCarriage.add(createBox([0.18, 2.2, 0.18], [0, 0.02, -0.62], black));
    probeCarriage.add(createBox([0.34, 0.2, 0.34], [0, 0.62, -0.35], blackSoft));
    probeCarriage.add(createRail(5.35, 0.027, [0, 0.62, 0], steel));
    apparatus.add(probeCarriage);

    const panel = createPanelTexture();
    panelCanvasRef.current = panel.canvas;
    panelTextureRef.current = panel.texture;
    drawControlPanel(panel.canvas, dRatio * radiusMm);
    panel.texture.needsUpdate = true;
    const consoleGroup = new THREE.Group();
    consoleGroup.add(createBox([1.82, 0.95, 1.42], [3.95, -0.83, -0.67], blackSoft));
    const panelFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.62, 0.57),
      new THREE.MeshBasicMaterial({ map: panel.texture }),
    );
    panelFace.position.set(3.95, -0.82, 0.048);
    consoleGroup.add(panelFace);
    apparatus.add(consoleGroup);
    scene.add(apparatus);

    const fieldGroup = new THREE.Group();
    fieldGroupRef.current = fieldGroup;
    scene.add(fieldGroup);

    const uniformityVolume = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 1, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    );
    uniformityVolume.rotation.z = Math.PI / 2;
    uniformityVolumeRef.current = uniformityVolume;
    scene.add(uniformityVolume);

    const dimensionMaterial = new THREE.LineBasicMaterial({ color: 0x1668a8, transparent: true, opacity: 0.9 });
    const dimensionLine = new THREE.Line(new THREE.BufferGeometry(), dimensionMaterial);
    dimensionLineRef.current = dimensionLine;
    scene.add(dimensionLine);
    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x1668a8 });
    const ticks = [
      createBox([0.025, 0.32, 0.025], [0, -1.02, 1.12], tickMaterial, false),
      createBox([0.025, 0.32, 0.025], [0, -1.02, 1.12], tickMaterial, false),
    ];
    dimensionTicksRef.current = ticks;
    scene.add(...ticks);
    const dimension = createDimensionTexture();
    dimension.sprite.position.set(0, -0.69, 1.18);
    dimension.sprite.renderOrder = 20;
    dimensionCanvasRef.current = dimension.canvas;
    dimensionTextureRef.current = dimension.texture;
    scene.add(dimension.sprite);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    let lastTime = performance.now();
    const animate = (time: number) => {
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      coilGroupsRef.current.forEach((coil, index) => {
        const target = index === 0 ? -targetHalfRef.current : targetHalfRef.current;
        coil.position.x = THREE.MathUtils.damp(coil.position.x, target, 9, delta);
      });
      particlesRef.current.forEach((particle) => {
        const progress = (time * 0.00012 * particle.speed + particle.phase) % 1;
        particle.mesh.position.copy(particle.curve.getPointAt(progress));
        const pulse = 0.75 + Math.sin(time * 0.006 + particle.phase * 14) * 0.2;
        particle.mesh.scale.setScalar(pulse);
      });
      orbit.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      orbit.dispose();
      clearGroup(fieldGroup);
      particlesRef.current = [];
      panel.texture.dispose();
      dimension.texture.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.forceContextLoss();
      mount.replaceChildren();
      cameraRef.current = null;
      orbitRef.current = null;
      fieldGroupRef.current = null;
      coilGroupsRef.current = [];
    };
  }, [radiusMm]);

  React.useEffect(() => {
    const halfSpacing = dRatio / 2;
    const dMm = dRatio * radiusMm;
    targetHalfRef.current = halfSpacing;

    const fieldGroup = fieldGroupRef.current;
    if (fieldGroup) {
      clearGroup(fieldGroup);
      particlesRef.current = [];
      makeFieldSeeds().forEach((record, lineIndex) => {
        const points = makeStreamline(record.seed, halfSpacing);
        if (points.length < 5) return;
        const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.35);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, Math.min(180, Math.max(48, points.length)), 0.011, 5, false),
          new THREE.MeshBasicMaterial({
            color: record.color,
            transparent: true,
            opacity: record.opacity,
            blending: THREE.NormalBlending,
            depthWrite: false,
          }),
        );
        fieldGroup.add(tube);

        const particleCount = lineIndex === 0 ? 4 : lineIndex % 2 === 0 ? 2 : 1;
        for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
          const particle = new THREE.Mesh(
            new THREE.SphereGeometry(lineIndex === 0 ? 0.045 : 0.031, 10, 10),
            new THREE.MeshBasicMaterial({
              color: lineIndex === 0 ? 0x0f766e : record.color,
              transparent: true,
              opacity: 0.94,
              blending: THREE.NormalBlending,
              depthWrite: false,
            }),
          );
          fieldGroup.add(particle);
          particlesRef.current.push({
            mesh: particle,
            curve,
            phase: (particleIndex / particleCount + lineIndex * 0.073) % 1,
            speed: 0.8 + (lineIndex % 5) * 0.08,
          });
        }
      });
    }

    const line = dimensionLineRef.current;
    if (line) {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfSpacing, -1.02, 1.12),
        new THREE.Vector3(halfSpacing, -1.02, 1.12),
      ]);
    }
    dimensionTicksRef.current.forEach((tick, index) => {
      tick.position.x = index === 0 ? -halfSpacing : halfSpacing;
    });
    if (dimensionCanvasRef.current && dimensionTextureRef.current) {
      drawDimensionLabel(dimensionCanvasRef.current, dMm);
      dimensionTextureRef.current.needsUpdate = true;
    }
    if (panelCanvasRef.current && panelTextureRef.current) {
      drawControlPanel(panelCanvasRef.current, dMm);
      panelTextureRef.current.needsUpdate = true;
    }
    if (uniformityVolumeRef.current) {
      const helmholtzQuality = Math.exp(-Math.pow((dRatio - 1) / 0.38, 2));
      uniformityVolumeRef.current.scale.set(
        0.62 + helmholtzQuality * 0.34,
        0.55 + helmholtzQuality * 0.9,
        0.62 + helmholtzQuality * 0.34,
      );
      const material = uniformityVolumeRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.025 + helmholtzQuality * 0.075;
    }
  }, [dRatio, radiusMm]);

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen();
    }
  };

  return (
    <div ref={stageRef} className={`digital-twin-stage ${className}`}>
      <div ref={mountRef} className="digital-twin-canvas" aria-label="亥姆霍兹线圈实验装置数字孪生三维场景" />
      <div className="twin-topline">
        <div className="twin-identity">
          <Rotate3D size={18} />
          <span>
            <strong>HELMHOLTZ DIGITAL TWIN</strong>
            <em>实物几何映射 · 实时数值场</em>
          </span>
        </div>
        <div className="twin-live-readouts">
          <span>
            <em>间距 D</em>
            <strong>{(dRatio * radiusMm).toFixed(0)} mm</strong>
          </span>
          <span>
            <em>归一化</em>
            <strong>{dRatio.toFixed(2)} R</strong>
          </span>
          <span className={source === "camera" && cameraLinked ? "linked" : ""}>
            <em>数据源</em>
            <strong>{source === "manual" ? "MANUAL" : cameraLinked ? "CAMERA LIVE" : "CAMERA WAIT"}</strong>
          </span>
        </div>
      </div>
      <div className="twin-view-tools" aria-label="三维观察视角">
        <button type="button" onClick={() => setView("perspective")} title="透视视角" aria-label="透视视角">
          <Box size={17} />
        </button>
        <button type="button" onClick={() => setView("front")} title="正面视角" aria-label="正面视角">
          <Crosshair size={17} />
        </button>
        <button type="button" onClick={() => setView("top")} title="俯视视角" aria-label="俯视视角">
          <Rotate3D size={17} />
        </button>
        <button type="button" onClick={toggleFullscreen} title="全屏显示" aria-label="全屏显示">
          <Expand size={17} />
        </button>
      </div>
      <div className="twin-field-legend" aria-label="数值场图例">
        <span className="field-core">轴向主场</span>
        <span className="field-return">回流场线</span>
        <span className="field-volume">近均匀区</span>
      </div>
      {controls}
    </div>
  );
}
