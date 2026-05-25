import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const outputDir = path.resolve('public/models/hallway');

await mkdir(outputDir, { recursive: true });
await exportScene('classroom-door.gltf', createClassroomDoorAsset());
await exportScene('locker-bank.gltf', createLockerBankAsset());
await exportScene('locker-door.gltf', createLockerDoorAsset());
await exportScene('wall-clock-face.gltf', createClockFaceAsset());

async function exportScene(fileName, scene) {
  const exporter = new GLTFExporter();
  const gltf = await new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, {
      binary: false,
      trs: true
    });
  });

  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(gltf)}\n`);
}

function createClassroomDoorAsset() {
  const scene = new THREE.Scene();
  scene.name = 'classroom-door-asset';

  const frameMaterial = material('aged-anodized-frame', 0x656761, 0.58, 0.2);
  const doorMaterial = material('laminated-wood-door', 0xc4aa83, 0.62, 0.02);
  const darkGlassMaterial = material('dark-wired-glass', 0x101a1d, 0.2, 0.04);
  darkGlassMaterial.transparent = true;
  darkGlassMaterial.opacity = 0.74;
  const brassMaterial = material('worn-brass-hardware', 0xc5a05c, 0.38, 0.58);
  const shadowMaterial = material('recess-shadow', 0x050607, 0.9, 0.01);

  const root = new THREE.Group();
  root.name = 'classroom-door-root';
  scene.add(root);

  addRoundedBox(root, 'outer-frame-top', [1.34, 0.13, 0.08], [0, 2.29, 0], frameMaterial, 0.015);
  addRoundedBox(root, 'outer-frame-left', [0.13, 2.34, 0.08], [-0.61, 1.17, 0], frameMaterial, 0.015);
  addRoundedBox(root, 'outer-frame-right', [0.13, 2.34, 0.08], [0.61, 1.17, 0], frameMaterial, 0.015);
  addRoundedBox(root, 'outer-frame-bottom', [1.34, 0.08, 0.06], [0, 0.04, 0], frameMaterial, 0.012);

  addRoundedBox(root, 'door-slab', [1.04, 2.08, 0.045], [0, 1.14, 0.035], doorMaterial, 0.014);
  addRoundedBox(root, 'upper-panel-recess', [0.74, 0.72, 0.012], [0, 1.72, 0.064], shadowMaterial, 0.01);
  addRoundedBox(root, 'upper-panel', [0.68, 0.66, 0.016], [0, 1.72, 0.074], doorMaterial, 0.012);
  addRoundedBox(root, 'lower-panel-recess', [0.74, 0.48, 0.012], [0, 0.7, 0.064], shadowMaterial, 0.01);
  addRoundedBox(root, 'lower-panel', [0.68, 0.42, 0.016], [0, 0.7, 0.074], doorMaterial, 0.012);

  addRoundedBox(root, 'window-recess', [0.4, 0.62, 0.014], [0.22, 1.58, 0.084], shadowMaterial, 0.008);
  addRoundedBox(root, 'window-frame-top', [0.48, 0.04, 0.03], [0.22, 1.91, 0.095], frameMaterial, 0.006);
  addRoundedBox(root, 'window-frame-bottom', [0.48, 0.04, 0.03], [0.22, 1.25, 0.095], frameMaterial, 0.006);
  addRoundedBox(root, 'window-frame-left', [0.04, 0.66, 0.03], [-0.02, 1.58, 0.095], frameMaterial, 0.006);
  addRoundedBox(root, 'window-frame-right', [0.04, 0.66, 0.03], [0.46, 1.58, 0.095], frameMaterial, 0.006);
  addRoundedBox(root, 'wire-glass', [0.34, 0.54, 0.01], [0.22, 1.58, 0.108], darkGlassMaterial, 0.005);
  addRoundedBox(root, 'kick-plate', [0.78, 0.26, 0.012], [0, 0.28, 0.095], brassMaterial, 0.007);
  addRoundedBox(root, 'latch-plate', [0.035, 0.22, 0.012], [0.43, 1.05, 0.112], brassMaterial, 0.006);
  addCylinder(root, 'lever-handle', 0.025, 0.28, [0.35, 1.05, 0.12], [0, 0, Math.PI / 2], brassMaterial);

  for (let index = 0; index < 3; index += 1) {
    addRoundedBox(root, `hinge-${index}`, [0.04, 0.22, 0.018], [-0.55, 0.56 + index * 0.66, 0.11], brassMaterial, 0.006);
  }

  return scene;
}

function createLockerBankAsset() {
  const scene = new THREE.Scene();
  scene.name = 'locker-bank-asset';

  const bodyMaterial = material('blue-painted-locker-body', 0x163f6f, 0.5, 0.32);
  const doorMaterial = material('blue-painted-locker-door', 0x1f5f9a, 0.46, 0.35);
  const darkMaterial = material('locker-vent-shadow', 0x07111a, 0.82, 0.04);
  const metalMaterial = material('brushed-locker-hardware', 0xc9c8bd, 0.4, 0.5);

  const root = new THREE.Group();
  root.name = 'locker-bank-root';
  scene.add(root);

  addRoundedBox(root, 'locker-bank-carcass', [0.52, 1.72, 2.42], [0, 0.88, 0], bodyMaterial, 0.025);
  addRoundedBox(root, 'locker-top-lip', [0.56, 0.08, 2.52], [-0.01, 1.76, 0], metalMaterial, 0.015);
  addRoundedBox(root, 'locker-bottom-kick', [0.58, 0.12, 2.5], [-0.01, 0.07, 0], darkMaterial, 0.012);

  for (let index = 0; index < 3; index += 1) {
    const z = 0.82 - index * 0.82;
    if (index !== 1) {
      addLockerDoor(root, `static-door-${index}`, z, doorMaterial, darkMaterial, metalMaterial, -0.29);
    }
    addRoundedBox(root, `locker-divider-${index}`, [0.035, 1.58, 0.035], [-0.28, 0.9, z - 0.39], metalMaterial, 0.006);
  }

  return scene;
}

function createLockerDoorAsset() {
  const scene = new THREE.Scene();
  scene.name = 'locker-door-asset';

  const doorMaterial = material('blue-painted-anomaly-door', 0x1f5f9a, 0.46, 0.35);
  const darkMaterial = material('locker-vent-shadow', 0x07111a, 0.82, 0.04);
  const metalMaterial = material('brushed-locker-hardware', 0xc9c8bd, 0.4, 0.5);

  const root = new THREE.Group();
  root.name = 'locker-door-root';
  scene.add(root);
  addLockerDoor(root, 'anomaly-door', 0, doorMaterial, darkMaterial, metalMaterial, 0);
  return scene;
}

function addLockerDoor(root, prefix, z, doorMaterial, darkMaterial, metalMaterial, x) {
  addRoundedBox(root, `${prefix}-panel`, [0.05, 1.48, 0.62], [x, 0.93, z], doorMaterial, 0.018);
  addRoundedBox(root, `${prefix}-recess`, [0.012, 0.72, 0.48], [x - 0.03, 0.9, z], darkMaterial, 0.008);
  addRoundedBox(root, `${prefix}-number-plate`, [0.012, 0.14, 0.22], [x - 0.035, 1.5, z + 0.02], metalMaterial, 0.005);
  addRoundedBox(root, `${prefix}-handle`, [0.035, 0.2, 0.035], [x - 0.055, 1.04, z - 0.22], metalMaterial, 0.006);

  for (let index = 0; index < 5; index += 1) {
    addRoundedBox(root, `${prefix}-top-vent-${index}`, [0.012, 0.012, 0.28], [x - 0.058, 1.28 + index * 0.045, z + 0.03], darkMaterial, 0.003);
    addRoundedBox(root, `${prefix}-bottom-vent-${index}`, [0.012, 0.012, 0.28], [x - 0.058, 0.52 + index * 0.045, z + 0.03], darkMaterial, 0.003);
  }
}

function createClockFaceAsset() {
  const scene = new THREE.Scene();
  scene.name = 'wall-clock-face-asset';

  const faceMaterial = material('aged-clock-face', 0xe9eadf, 0.76, 0.02);
  const rimMaterial = material('clock-black-rim', 0x202826, 0.5, 0.22);
  const tickMaterial = material('clock-ticks', 0x171d1b, 0.58, 0.02);

  const root = new THREE.Group();
  root.name = 'wall-clock-face-root';
  scene.add(root);

  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.035, 96), faceMaterial);
  face.name = 'clock-face-disc';
  face.rotation.x = Math.PI / 2;
  root.add(face);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 10, 96), rimMaterial);
  rim.name = 'clock-rim';
  rim.position.z = 0.025;
  root.add(rim);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(
      new RoundedBoxGeometry(index % 3 === 0 ? 0.022 : 0.012, 0.062, 0.012, 2, 0.003),
      tickMaterial
    );
    tick.name = `clock-tick-${index}`;
    tick.position.set(Math.sin(angle) * 0.27, Math.cos(angle) * 0.27, 0.05);
    tick.rotation.z = -angle;
    root.add(tick);
  }

  return scene;
}

function addRoundedBox(parent, name, size, position, meshMaterial, radius) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, radius, depth, position, rotation, meshMaterial) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), meshMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function material(name, color, roughness, metalness) {
  const meshMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
  meshMaterial.name = name;
  return meshMaterial;
}
