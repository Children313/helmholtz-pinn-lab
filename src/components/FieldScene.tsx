import React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Crosshair, Expand, Rotate3D } from "lucide-react";

const COIL_RADIUS = 0.95;
const FIELD_SEGMENTS = 56;
const TRACE_STEP = 0.036;
const TRACE_STEPS = 240;
const MAX_X = 5.2;
const MAX_RHO = 1.78;
const FIXED_COIL_X = -3.1;
const PROBE_ROD_LENGTH = 2.75;

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

function fieldAt(point: THREE.Vector3, coilCenters: readonly [number, number]) {
  const field = new THREE.Vector3();
  const dTheta = (2 * Math.PI) / FIELD_SEGMENTS;

  for (const centerX of coilCenters) {
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

function isNearWire(point: THREE.Vector3, coilCenters: readonly [number, number]) {
  const rho = Math.hypot(point.y, point.z);
  return coilCenters.some(
    (centerX) => Math.abs(point.x - centerX) < 0.08 && Math.abs(rho - COIL_RADIUS) < 0.1,
  );
}

function trace(seed: THREE.Vector3, coilCenters: readonly [number, number], direction: 1 | -1) {
  const points: THREE.Vector3[] = [];
  let point = seed.clone();

  for (let index = 0; index < TRACE_STEPS; index += 1) {
    const field = fieldAt(point, coilCenters);
    if (field.lengthSq() < 1e-8) break;
    const next = point.clone().add(field.normalize().multiplyScalar(direction * TRACE_STEP));
    if (!isInsideFieldVolume(next) || isNearWire(next, coilCenters)) break;
    points.push(next);
    point = next;
  }

  return points;
}

function makeStreamline(seed: THREE.Vector3, coilCenters: readonly [number, number]) {
  return [...trace(seed, coilCenters, -1).reverse(), seed.clone(), ...trace(seed, coilCenters, 1)];
}

function makeFieldSeeds(centerX: number) {
  const seeds: Array<{ seed: THREE.Vector3; color: number; opacity: number }> = [
    { seed: new THREE.Vector3(centerX, 0.025, 0), color: 0x0e7490, opacity: 0.95 },
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
        seed: new THREE.Vector3(centerX, family.rho * Math.cos(phi), family.rho * Math.sin(phi)),
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

function createCable(points: THREE.Vector3[], material: THREE.Material, radius = 0.024) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.42);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, radius, 8, false), material);
  cable.castShadow = true;
  return cable;
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
  terminal.position.set(0, -0.72, 0.67);
  assembly.add(terminal);
  const returnTerminal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: 0x181b1f, roughness: 0.38, metalness: 0.28 }),
  );
  returnTerminal.rotation.z = Math.PI / 2;
  returnTerminal.position.set(0, -0.72, 0.49);
  assembly.add(returnTerminal);
  return assembly;
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

function createInstrumentPanelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 480;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

function drawInstrumentPanel(canvas: HTMLCanvasElement, hallVoltageMv: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#e8e5c8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#7b4326";
  context.font = "700 34px sans-serif";
  context.fillText("3D HELMHOLTZ COIL MAGNETIC FIELD LAB", 46, 55);

  const readings = ["5.00", hallVoltageMv.toFixed(2), "0.500"];
  const units = ["mA  IS", "mV  VH", "A  IM"];
  readings.forEach((reading, index) => {
    const x = 56 + index * 410;
    context.fillStyle = "#50533d";
    context.fillRect(x, 88, 330, 132);
    context.shadowColor = "#e9f43d";
    context.shadowBlur = 18;
    context.fillStyle = "#eff54b";
    context.font = "700 72px monospace";
    context.textAlign = "center";
    context.fillText(reading, x + 165, 180);
    context.shadowBlur = 0;
    context.fillStyle = "#615f46";
    context.font = "700 26px sans-serif";
    context.fillText(units[index], x + 165, 255);

    for (let knob = 0; knob < 4; knob += 1) {
      context.beginPath();
      context.fillStyle = knob % 2 === 0 ? "#b54236" : "#2f3334";
      context.arc(x + 56 + knob * 76, 326, 20, 0, Math.PI * 2);
      context.fill();
    }
  });
  context.textAlign = "left";
  context.fillStyle = "#7a4930";
  context.font = "700 23px sans-serif";
  context.fillText("HALL VOLTAGE / EXCITATION / REVERSING CONTROL", 54, 420);
}

function estimateHallVoltageMv(dRatio: number, probeXMm: number, radiusMm: number) {
  const sensorOffsetR = probeXMm / radiusMm;
  const relativeField = [-dRatio / 2, dRatio / 2].reduce(
    (sum, coilX) => sum + Math.pow(1 + Math.pow(sensorOffsetR - coilX, 2), -1.5),
    0,
  );
  const helmholtzReference = 2 * Math.pow(1 + 0.25, -1.5);
  const bMilliTesla = 2.255 * (relativeField / helmholtzReference);
  return 0.174 * 5 * bMilliTesla;
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
  for (let index = 0; index <= 60; index += 1) {
    const x = -3.78 + index * 0.052;
    const longTick = index % 10 === 0;
    const mediumTick = index % 5 === 0;
    positions.push(x, -1.08, 1.246, x, longTick ? -1.3 : mediumTick ? -1.25 : -1.2, 1.246);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.96 }),
  );
}

export function FieldScene({
  dRatio,
  probeXMm,
  radiusMm,
  source,
  cameraLinked,
  controls,
  className = "",
}: {
  dRatio: number;
  probeXMm: number;
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
  const targetMovingCoilRef = React.useRef(FIXED_COIL_X + dRatio);
  const probeCarriageRef = React.useRef<THREE.Group | null>(null);
  const targetProbeCarriageRef = React.useRef(
    FIXED_COIL_X + dRatio / 2 + probeXMm / radiusMm + PROBE_ROD_LENGTH,
  );
  const fieldGroupRef = React.useRef<THREE.Group | null>(null);
  const particlesRef = React.useRef<FieldParticle[]>([]);
  const dimensionLineRef = React.useRef<THREE.Line | null>(null);
  const dimensionTicksRef = React.useRef<THREE.Mesh[]>([]);
  const dimensionCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dimensionTextureRef = React.useRef<THREE.CanvasTexture | null>(null);
  const dimensionSpriteRef = React.useRef<THREE.Sprite | null>(null);
  const instrumentCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const instrumentTextureRef = React.useRef<THREE.CanvasTexture | null>(null);
  const wiringGroupRef = React.useRef<THREE.Group | null>(null);
  const uniformityVolumeRef = React.useRef<THREE.Mesh | null>(null);

  const setView = React.useCallback((preset: ViewPreset) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return;
    const positions: Record<ViewPreset, THREE.Vector3> = {
      perspective: new THREE.Vector3(7.2, 3.75, 7.9),
      front: new THREE.Vector3(0.35, 1.1, 10.1),
      top: new THREE.Vector3(0.35, 10.2, 0.01),
    };
    camera.position.copy(positions[preset]);
    orbit.target.set(0.15, -0.18, 0);
    orbit.update();
  }, []);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.FogExp2(0xffffff, 0.045);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(7.2, 3.75, 7.9);
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
    orbit.target.set(0.15, -0.18, 0);
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
    const baseBlue = new THREE.MeshStandardMaterial({ color: 0x176f9f, roughness: 0.54, metalness: 0.3 });
    const guideOrange = new THREE.MeshStandardMaterial({ color: 0xd8912d, roughness: 0.42, metalness: 0.46 });
    const sliderGreen = new THREE.MeshStandardMaterial({ color: 0x357d67, roughness: 0.5, metalness: 0.34 });
    const sensorGold = new THREE.MeshStandardMaterial({
      color: 0xf1b83b,
      emissive: 0x8a4d00,
      emissiveIntensity: 0.45,
      roughness: 0.34,
      metalness: 0.24,
    });
    const instrumentBeige = new THREE.MeshStandardMaterial({ color: 0xd9d5b8, roughness: 0.62, metalness: 0.18 });
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
    apparatus.add(createBox([8.45, 0.3, 2.48], [0.15, -1.28, 0], baseBlue));
    apparatus.add(createBox([8.08, 0.07, 2.16], [0.15, -1.1, 0], blackSoft));
    apparatus.add(createBox([3.45, 0.08, 0.25], [-2.08, -1.0, 1.08], baseBlue));
    apparatus.add(createScaleMarks());

    for (const x of [-3.7, -2.55, 2.95, 4]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18), steel);
      screw.position.set(x, -1.06, 1.08);
      apparatus.add(screw);
    }

    [-0.35, 0.05, 0.45].forEach((offset, index) => {
      const port = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.045, 18),
        index === 1 ? black : new THREE.MeshStandardMaterial({ color: 0xc53b32, roughness: 0.4, metalness: 0.2 }),
      );
      port.rotation.x = Math.PI / 2;
      port.position.set(3.45 + offset, -1.23, 1.25);
      apparatus.add(port);
    });

    const leftCoil = createCoilAssembly({ copper, copperDark, resin, black });
    const rightCoil = createCoilAssembly({ copper, copperDark, resin, black });
    leftCoil.position.x = FIXED_COIL_X;
    rightCoil.position.x = targetMovingCoilRef.current;
    const lockKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 18), blackSoft);
    lockKnob.position.set(0, -0.85, 0.72);
    rightCoil.add(lockKnob);
    apparatus.add(leftCoil, rightCoil);
    coilGroupsRef.current = [leftCoil, rightCoil];

    apparatus.add(createBox([5.25, 0.1, 0.42], [0.85, -0.94, 0.72], guideOrange));
    apparatus.add(createRail(5.08, 0.035, [0.85, -0.83, 0.55], steel));
    apparatus.add(createRail(5.08, 0.035, [0.85, -0.83, 0.89], steel));
    apparatus.add(createBox([0.18, 0.09, 2.02], [-1.62, -1.0, 0], steel));
    apparatus.add(createBox([0.18, 0.09, 2.02], [3.32, -1.0, 0], steel));

    const probeCarriage = new THREE.Group();
    probeCarriage.position.x = targetProbeCarriageRef.current;
    probeCarriage.add(createBox([0.54, 0.18, 0.7], [0, -0.86, 0.72], sliderGreen));
    probeCarriage.add(createBox([0.16, 2.08, 0.16], [0, 0.03, 0.72], steel));
    probeCarriage.add(createBox([0.36, 0.24, 0.34], [0, 0, 0.47], blackSoft));
    probeCarriage.add(createBox([0.16, 0.16, 1.48], [0, 0, 0.02], steel));
    probeCarriage.add(createRail(PROBE_ROD_LENGTH, 0.035, [-PROBE_ROD_LENGTH / 2, 0, 0], guideOrange));
    probeCarriage.add(createBox([0.17, 0.09, 0.13], [-PROBE_ROD_LENGTH - 0.05, 0, 0], sensorGold));
    const sensorStem = createBox([0.12, 0.19, 0.08], [-PROBE_ROD_LENGTH - 0.05, 0.11, 0], black, false);
    probeCarriage.add(sensorStem);
    apparatus.add(probeCarriage);
    probeCarriageRef.current = probeCarriage;
    scene.add(apparatus);

    const instrumentPanel = createInstrumentPanelTexture();
    drawInstrumentPanel(instrumentPanel.canvas, estimateHallVoltageMv(dRatio, probeXMm, radiusMm));
    instrumentPanel.texture.needsUpdate = true;
    instrumentCanvasRef.current = instrumentPanel.canvas;
    instrumentTextureRef.current = instrumentPanel.texture;
    const instrumentGroup = new THREE.Group();
    instrumentGroup.position.set(3.78, -0.78, -2.03);
    instrumentGroup.add(createBox([2.78, 1.28, 1.48], [0, 0, 0], instrumentBeige));
    instrumentGroup.add(createBox([2.64, 0.12, 1.34], [0, 0.7, 0], blackSoft));
    const panelFace = new THREE.Mesh(
      new THREE.PlaneGeometry(2.56, 0.92),
      new THREE.MeshBasicMaterial({ map: instrumentPanel.texture }),
    );
    panelFace.position.set(0, -0.04, 0.745);
    instrumentGroup.add(panelFace);
    scene.add(instrumentGroup);

    const wiringGroup = new THREE.Group();
    wiringGroupRef.current = wiringGroup;
    scene.add(wiringGroup);

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
    dimension.sprite.position.set(FIXED_COIL_X + dRatio / 2, -0.69, 1.18);
    dimension.sprite.renderOrder = 20;
    dimensionCanvasRef.current = dimension.canvas;
    dimensionTextureRef.current = dimension.texture;
    dimensionSpriteRef.current = dimension.sprite;
    scene.add(dimension.sprite);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.fov = width <= 720 ? 86 : 38;
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
      const movingCoil = coilGroupsRef.current[1];
      if (movingCoil) {
        movingCoil.position.x = THREE.MathUtils.damp(movingCoil.position.x, targetMovingCoilRef.current, 9, delta);
      }
      if (probeCarriageRef.current) {
        probeCarriageRef.current.position.x = THREE.MathUtils.damp(
          probeCarriageRef.current.position.x,
          targetProbeCarriageRef.current,
          9,
          delta,
        );
      }
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
      if (wiringGroupRef.current) clearGroup(wiringGroupRef.current);
      particlesRef.current = [];
      dimension.texture.dispose();
      instrumentPanel.texture.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.forceContextLoss();
      mount.replaceChildren();
      cameraRef.current = null;
      orbitRef.current = null;
      fieldGroupRef.current = null;
      coilGroupsRef.current = [];
      probeCarriageRef.current = null;
      dimensionSpriteRef.current = null;
      instrumentCanvasRef.current = null;
      instrumentTextureRef.current = null;
      wiringGroupRef.current = null;
    };
  }, [radiusMm]);

  React.useEffect(() => {
    const movingCoilX = FIXED_COIL_X + dRatio;
    const pairCenterX = (FIXED_COIL_X + movingCoilX) / 2;
    const coilCenters: [number, number] = [FIXED_COIL_X, movingCoilX];
    const dMm = dRatio * radiusMm;
    targetMovingCoilRef.current = movingCoilX;
    targetProbeCarriageRef.current = pairCenterX + probeXMm / radiusMm + PROBE_ROD_LENGTH;

    const fieldGroup = fieldGroupRef.current;
    if (fieldGroup) {
      clearGroup(fieldGroup);
      particlesRef.current = [];
      makeFieldSeeds(pairCenterX).forEach((record, lineIndex) => {
        const points = makeStreamline(record.seed, coilCenters);
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
        new THREE.Vector3(FIXED_COIL_X, -1.02, 1.12),
        new THREE.Vector3(movingCoilX, -1.02, 1.12),
      ]);
    }
    dimensionTicksRef.current.forEach((tick, index) => {
      tick.position.x = index === 0 ? FIXED_COIL_X : movingCoilX;
    });
    if (dimensionSpriteRef.current) dimensionSpriteRef.current.position.x = pairCenterX;
    if (dimensionCanvasRef.current && dimensionTextureRef.current) {
      drawDimensionLabel(dimensionCanvasRef.current, dMm);
      dimensionTextureRef.current.needsUpdate = true;
    }
    if (instrumentCanvasRef.current && instrumentTextureRef.current) {
      drawInstrumentPanel(
        instrumentCanvasRef.current,
        estimateHallVoltageMv(dRatio, probeXMm, radiusMm),
      );
      instrumentTextureRef.current.needsUpdate = true;
    }
    if (wiringGroupRef.current) {
      clearGroup(wiringGroupRef.current);
      const redCable = new THREE.MeshStandardMaterial({ color: 0xd3312f, roughness: 0.62, metalness: 0.06 });
      const blackCable = new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.68, metalness: 0.04 });
      const signalCable = new THREE.MeshStandardMaterial({ color: 0x315d82, roughness: 0.64, metalness: 0.05 });
      const probeCarriageX = targetProbeCarriageRef.current;
      wiringGroupRef.current.add(
        createCable(
          [
            new THREE.Vector3(FIXED_COIL_X, -0.72, 0.67),
            new THREE.Vector3(FIXED_COIL_X - 0.12, -1.16, 0.25),
            new THREE.Vector3(1.4, -1.18, -0.82),
            new THREE.Vector3(4.28, -0.98, -1.27),
          ],
          redCable,
        ),
        createCable(
          [
            new THREE.Vector3(movingCoilX, -0.72, 0.49),
            new THREE.Vector3(movingCoilX + 0.18, -1.12, 0.12),
            new THREE.Vector3(1.75, -1.2, -0.94),
            new THREE.Vector3(4.72, -0.98, -1.27),
          ],
          blackCable,
        ),
        createCable(
          [
            new THREE.Vector3(FIXED_COIL_X, -0.72, 0.49),
            new THREE.Vector3(pairCenterX, -0.93, 0.86),
            new THREE.Vector3(movingCoilX, -0.72, 0.67),
          ],
          blackCable,
          0.019,
        ),
        createCable(
          [
            new THREE.Vector3(probeCarriageX, -0.04, 0.72),
            new THREE.Vector3(probeCarriageX + 0.18, -0.8, 0.22),
            new THREE.Vector3(2.1, -1.19, -0.72),
            new THREE.Vector3(3.74, -0.98, -1.27),
          ],
          signalCable,
          0.028,
        ),
        createCable(
          [
            new THREE.Vector3(probeCarriageX + 0.08, -0.12, 0.66),
            new THREE.Vector3(probeCarriageX + 0.38, -0.92, 0.08),
            new THREE.Vector3(1.82, -1.2, -0.62),
            new THREE.Vector3(2.92, -0.98, -1.27),
          ],
          redCable,
          0.017,
        ),
      );
    }
    if (uniformityVolumeRef.current) {
      uniformityVolumeRef.current.position.x = pairCenterX;
      const helmholtzQuality = Math.exp(-Math.pow((dRatio - 1) / 0.38, 2));
      uniformityVolumeRef.current.scale.set(
        0.62 + helmholtzQuality * 0.34,
        0.55 + helmholtzQuality * 0.9,
        0.62 + helmholtzQuality * 0.34,
      );
      const material = uniformityVolumeRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.025 + helmholtzQuality * 0.075;
    }
  }, [dRatio, probeXMm, radiusMm]);

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
            <em>霍尔探头 x</em>
            <strong>{probeXMm.toFixed(0)} mm</strong>
          </span>
          <span>
            <em>线圈运动</em>
            <strong>L FIXED · R MOVING</strong>
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
