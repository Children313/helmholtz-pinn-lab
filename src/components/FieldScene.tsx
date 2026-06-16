import React from "react";
import * as THREE from "three";
import { Rotate3D } from "lucide-react";

const COIL_RADIUS = 0.8;
const FIELD_SEGMENTS = 80;
const TRACE_STEP = 0.026;
const TRACE_STEPS = 360;
const MAX_X = 2.2;
const MAX_RHO = 1.72;

function makeLine(points: THREE.Vector3[], color: string, opacity = 0.78) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  return new THREE.Line(geometry, material);
}

function disposeObject(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh;
  const line = object as THREE.Line;
  const geometry = mesh.geometry ?? line.geometry;
  const material = mesh.material ?? line.material;

  if (geometry && "dispose" in geometry) {
    geometry.dispose();
  }
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else if (material && "dispose" in material) {
    material.dispose();
  }
}

function clearGroup(group: THREE.Group) {
  group.children.forEach(disposeObject);
  group.clear();
}

function fieldAt(point: THREE.Vector3, halfSpacing: number) {
  const field = new THREE.Vector3();
  const dTheta = (2 * Math.PI) / FIELD_SEGMENTS;
  const centers = [-halfSpacing, halfSpacing];

  for (const centerX of centers) {
    for (let index = 0; index < FIELD_SEGMENTS; index += 1) {
      const theta = (index + 0.5) * dTheta;
      const source = new THREE.Vector3(
        centerX,
        COIL_RADIUS * Math.cos(theta),
        COIL_RADIUS * Math.sin(theta),
      );
      const dl = new THREE.Vector3(
        0,
        -COIL_RADIUS * Math.sin(theta) * dTheta,
        COIL_RADIUS * Math.cos(theta) * dTheta,
      );
      const r = point.clone().sub(source);
      const r2 = Math.max(r.lengthSq(), 0.006);
      field.add(dl.cross(r).multiplyScalar(1 / Math.pow(r2, 1.5)));
    }
  }

  return field;
}

function isInsideViewport(point: THREE.Vector3) {
  const rho = Math.hypot(point.y, point.z);
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    Math.abs(point.x) <= MAX_X &&
    rho <= MAX_RHO
  );
}

function isNearWire(point: THREE.Vector3, halfSpacing: number) {
  const rho = Math.hypot(point.y, point.z);
  return [-halfSpacing, halfSpacing].some((centerX) => {
    const axial = Math.abs(point.x - centerX);
    const radial = Math.abs(rho - COIL_RADIUS);
    return axial < 0.055 && radial < 0.075;
  });
}

function trace(seed: THREE.Vector3, halfSpacing: number, direction: 1 | -1) {
  const points: THREE.Vector3[] = [];
  let point = seed.clone();

  for (let index = 0; index < TRACE_STEPS; index += 1) {
    const field = fieldAt(point, halfSpacing);
    if (field.lengthSq() < 1e-9) break;

    const next = point.clone().add(field.normalize().multiplyScalar(direction * TRACE_STEP));
    if (!isInsideViewport(next) || isNearWire(next, halfSpacing)) break;

    points.push(next);
    point = next;
  }

  return points;
}

function makeStreamline(seed: THREE.Vector3, halfSpacing: number) {
  const backward = trace(seed, halfSpacing, -1).reverse();
  const forward = trace(seed, halfSpacing, 1);
  return [...backward, seed.clone(), ...forward];
}

function makeSeed(rho: number, phi: number) {
  return new THREE.Vector3(0, rho * Math.cos(phi), rho * Math.sin(phi));
}

function makeFieldLines(halfSpacing: number) {
  const seeds = [
    { seed: makeSeed(0, 0), color: "#0284c7", opacity: 0.72 },
    { seed: makeSeed(0.24, 0), color: "#0ea5e9", opacity: 0.76 },
    { seed: makeSeed(0.24, Math.PI), color: "#0ea5e9", opacity: 0.76 },
    { seed: makeSeed(0.48, 0), color: "#7c3aed", opacity: 0.67 },
    { seed: makeSeed(0.48, Math.PI), color: "#7c3aed", opacity: 0.67 },
    { seed: makeSeed(0.68, 0), color: "#a855f7", opacity: 0.58 },
    { seed: makeSeed(0.68, Math.PI), color: "#a855f7", opacity: 0.58 },
    { seed: makeSeed(0.38, Math.PI / 2), color: "#38bdf8", opacity: 0.48 },
    { seed: makeSeed(0.38, -Math.PI / 2), color: "#38bdf8", opacity: 0.48 },
  ];

  return seeds
    .map(({ seed, color, opacity }) => ({
      points: makeStreamline(seed, halfSpacing),
      color,
      opacity,
    }))
    .filter((line) => line.points.length >= 2);
}

export function FieldScene({ dRatio, className = "" }: { dRatio: number; className?: string }) {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const ringsRef = React.useRef<THREE.Mesh[]>([]);
  const linesGroupRef = React.useRef<THREE.Group | null>(null);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf7fafc, 4.2, 8.5);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(2.9, 2.25, 3.35);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(3, 4, 2);
    scene.add(light);

    const grid = new THREE.GridHelper(3.4, 18, 0xcbd5e1, 0xe2e8f0);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const axisMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.46,
    });
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-1.9, 0, 0),
          new THREE.Vector3(1.9, 0, 0),
        ]),
        axisMaterial,
      ),
    );

    const ringGeometry = new THREE.TorusGeometry(COIL_RADIUS, 0.022, 16, 128);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.45,
      roughness: 0.28,
      emissive: 0x3a1901,
      emissiveIntensity: 0.12,
    });
    const leftRing = new THREE.Mesh(ringGeometry, ringMaterial);
    const rightRing = new THREE.Mesh(ringGeometry, ringMaterial);
    leftRing.rotation.y = Math.PI / 2;
    rightRing.rotation.y = Math.PI / 2;
    scene.add(leftRing, rightRing);
    ringsRef.current = [leftRing, rightRing];

    const linesGroup = new THREE.Group();
    scene.add(linesGroup);
    linesGroupRef.current = linesGroup;

    const planeGeometry = new THREE.PlaneGeometry(3.2, 1.75, 1, 1);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = Math.PI / 2;
    scene.add(plane);

    let frame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      frame += 1;
      scene.rotation.y = Math.sin(frame / 240) * 0.045;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      if (!mount) return;
      const nextW = mount.clientWidth;
      const nextH = mount.clientHeight;
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
    };
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      if (linesGroupRef.current) clearGroup(linesGroupRef.current);
      ringGeometry.dispose();
      ringMaterial.dispose();
      planeGeometry.dispose();
      planeMaterial.dispose();
      axisMaterial.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  React.useEffect(() => {
    const half = (dRatio * 0.82) / 2;
    ringsRef.current.forEach((ring, index) => {
      ring.position.x = index === 0 ? -half : half;
    });

    const group = linesGroupRef.current;
    if (!group) return;
    clearGroup(group);
    makeFieldLines(half).forEach((line) => {
      group.add(makeLine(line.points, line.color, line.opacity));
    });
  }, [dRatio]);

  return (
    <div className={`field-scene ${className}`}>
      <div className="panel-heading scene-heading">
        <Rotate3D size={18} />
        <h3>三维场结构</h3>
        <span>d/R = {dRatio.toFixed(2)}</span>
      </div>
      <div className="scene-mount" ref={mountRef} />
    </div>
  );
}
