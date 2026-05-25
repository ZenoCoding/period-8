import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init();

THREE.Cache.enabled = true;

export interface BoundsRect {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface TransformSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export interface HallwayHandles {
  root: THREE.Group;
  environmentMaterials: EnvironmentMaterials;
  ambientLight: THREE.HemisphereLight;
  securityCameraHead: THREE.Object3D;
  securityCameraLensMaterial: THREE.MeshStandardMaterial;
  lockerDoor: THREE.Object3D;
  lockerInterior: THREE.Mesh;
  lockerInteriorMaterial: THREE.MeshStandardMaterial;
  clockHourPivot: THREE.Object3D;
  clockMinutePivot: THREE.Object3D;
  clockSecondPivot: THREE.Object3D;
  clockSecondMaterial: THREE.MeshStandardMaterial;
  ventCover: THREE.Object3D;
  ventDarkness: THREE.Mesh;
  flickerLight: THREE.RectAreaLight;
  flickerTubeMaterial: THREE.MeshStandardMaterial;
  mismatchTile: THREE.Mesh;
  bulletinBoardTexture: THREE.CanvasTexture;
  hallwayFigure: THREE.Group;
  hallwayFigureHead: THREE.Object3D;
  hallwayFigureFaceMaterial: THREE.MeshStandardMaterial;
  hallwayFigureHeadMaterial: THREE.MeshStandardMaterial;
  redFlood: THREE.Mesh;
  redFloodMaterial: THREE.MeshStandardMaterial;
  exitGlow: THREE.Mesh;
  transitionSigns: TransitionSignHandles;
  snapshots: Map<THREE.Object3D, TransformSnapshot>;
}

export interface EnvironmentMaterials {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
}

interface BoxSurfaceScale {
  px: [number, number];
  nx: [number, number];
  py: [number, number];
  ny: [number, number];
  pz: [number, number];
  nz: [number, number];
}

interface PbrMaterialOptions {
  color: number;
  colorMap: string;
  roughnessMap?: string;
  normalMap: string;
  aoMap?: string;
  metalnessMap?: string;
  roughness: number;
  metalness: number;
  normalScale?: number;
}

type ModelFitAxis = 'x' | 'y' | 'z';

interface ModelPlacementOptions {
  fitSize?: THREE.Vector3;
  fitAxes?: ModelFitAxis[];
  center?: THREE.Vector3;
  rotation?: THREE.Euler;
}

export type TransitionSignSide = -1 | 1;
export type TransitionSignOutcome = 'idle' | 'correct' | 'wrong';

export interface TransitionSignHandle {
  root: THREE.Group;
  numberTexture: THREE.CanvasTexture;
}

export interface TransitionSignHandles {
  negative: TransitionSignHandle;
  positive: TransitionSignHandle;
}

export const MAIN_HALF_WIDTH = 1.8;
export const MAIN_HALF_LENGTH = 8 * 1.5;
export const TRANSITION_BRANCH_X_MAX = 8;
export const TRANSITION_ENTRY_Z_MIN = MAIN_HALF_LENGTH - MAIN_HALF_WIDTH;
export const TRANSITION_ENTRY_Z_MAX = MAIN_HALF_LENGTH + MAIN_HALF_WIDTH;
export const TRANSITION_CONNECTOR_CENTER_Z = MAIN_HALF_LENGTH + TRANSITION_BRANCH_X_MAX;
export const TRANSITION_CONNECTOR_X_MAX = TRANSITION_BRANCH_X_MAX * 2;
export const QUEUED_HALLWAY_ROOT_LOCAL_X = TRANSITION_CONNECTOR_X_MAX - MAIN_HALF_WIDTH;
export const QUEUED_HALLWAY_ROOT_LOCAL_Z = TRANSITION_CONNECTOR_CENTER_Z + MAIN_HALF_LENGTH;

export const MAIN_HALLWAY_RECTS: BoundsRect[] = [
  { xMin: -MAIN_HALF_WIDTH, xMax: MAIN_HALF_WIDTH, zMin: -MAIN_HALF_LENGTH, zMax: MAIN_HALF_LENGTH }
];

const MAIN_POSITIVE_END_Z = MAIN_HALF_LENGTH;
const MAIN_SIDE_OPENING_Z_MIN = TRANSITION_ENTRY_Z_MIN;
const MAIN_SIDE_OPENING_Z_MAX = MAIN_HALF_LENGTH;
const TRANSITION_CONNECTOR_Z_MIN = TRANSITION_CONNECTOR_CENTER_Z - MAIN_HALF_WIDTH;
const TRANSITION_CONNECTOR_Z_MAX = TRANSITION_CONNECTOR_CENTER_Z + MAIN_HALF_WIDTH;
const TRANSITION_CONNECTOR_MAIN_OVERLAP_X_MIN = TRANSITION_CONNECTOR_X_MAX - MAIN_HALF_WIDTH * 2;

const CANONICAL_TRANSITION_RECTS: BoundsRect[] = [
  {
    xMin: -MAIN_HALF_WIDTH,
    xMax: TRANSITION_BRANCH_X_MAX,
    zMin: TRANSITION_ENTRY_Z_MIN,
    zMax: TRANSITION_ENTRY_Z_MAX
  },
  {
    xMin: TRANSITION_BRANCH_X_MAX - MAIN_HALF_WIDTH,
    xMax: TRANSITION_BRANCH_X_MAX + MAIN_HALF_WIDTH,
    zMin: TRANSITION_ENTRY_Z_MIN,
    zMax: TRANSITION_CONNECTOR_CENTER_Z
  },
  {
    xMin: TRANSITION_BRANCH_X_MAX - MAIN_HALF_WIDTH,
    xMax: TRANSITION_CONNECTOR_X_MAX,
    zMin: TRANSITION_CONNECTOR_Z_MIN,
    zMax: TRANSITION_CONNECTOR_Z_MAX
  }
];

const NEGATIVE_TRANSITION_RECTS = createTransitionRects(-1);
const POSITIVE_TRANSITION_RECTS = createTransitionRects(1);

export const QUEUED_HALLWAY_RECTS: BoundsRect[] = [
  ...MAIN_HALLWAY_RECTS,
  ...NEGATIVE_TRANSITION_RECTS
];

export const WALKABLE_RECTS: BoundsRect[] = [
  ...MAIN_HALLWAY_RECTS,
  ...NEGATIVE_TRANSITION_RECTS,
  ...POSITIVE_TRANSITION_RECTS
];

export type HallwaySceneLayout = 'full' | 'queuedNext';

export interface HallwaySceneOptions {
  layout?: HallwaySceneLayout;
}

const WALL_HEIGHT = 3.6;
const WALL_CENTER_Y = WALL_HEIGHT / 2;
const FLOOR_SURFACE_Y = 0;
const CEILING_SURFACE_Y = WALL_HEIGHT;
const FLOOR_TEXTURE_SCALE = 2.2;
const POSITIVE_WALL_FACE_X = MAIN_HALF_WIDTH - 0.015;
const NEGATIVE_WALL_FACE_X = -MAIN_HALF_WIDTH + 0.015;
const TEXTURE_ROOT = '/textures/ambientcg';
const MODEL_ROOT = '/models/hallway';
const TRANSITION_CHALKBOARD_TEXTURE = '/textures/transition-chalkboard.png';
const TRANSITION_CHALK_FONT_URL = '/fonts/CabinSketch-Bold.ttf';
const TRANSITION_CHALK_FONT_FAMILY = 'Cabin Sketch Repetition';
const TRANSITION_SIGN_WIDTH = 1.48;
const TRANSITION_SIGN_HEIGHT = 0.95;
const TRANSITION_SIGN_CANVAS_WIDTH = 1566;
const TRANSITION_SIGN_CANVAS_HEIGHT = 1004;
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const textureCache = new Map<string, THREE.Texture>();
const modelCache = new Map<string, Promise<THREE.Group>>();
let chalkNumberFontLoaded = false;
let chalkNumberFontPromise: Promise<void> | null = null;

interface ShellOptions {
  walkableRects: BoundsRect[];
  transitionFrameSides: TransitionSignSide[];
  openMainPositiveSide: boolean;
}

interface FluorescentLightOptions {
  intensityScale: number;
  activeLightCount: number;
  castShadows: boolean;
}

function createPbrMaterial(options: PbrMaterialOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    map: loadTexture(options.colorMap, true),
    normalMap: loadTexture(options.normalMap, false),
    roughness: options.roughness,
    metalness: options.metalness
  });

  material.normalScale.setScalar(options.normalScale ?? 0.45);

  if (options.roughnessMap) {
    material.roughnessMap = loadTexture(options.roughnessMap, false);
  }

  if (options.aoMap) {
    material.aoMap = loadTexture(options.aoMap, false);
    material.aoMapIntensity = 0.72;
  }

  if (options.metalnessMap) {
    material.metalnessMap = loadTexture(options.metalnessMap, false);
  }

  return material;
}

function loadTexture(path: string, isColor: boolean): THREE.Texture {
  const cached = textureCache.get(path);
  if (cached) {
    return cached;
  }

  const texture = textureLoader.load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textureCache.set(path, texture);
  return texture;
}

function loadFlatTexture(path: string, isColor: boolean): THREE.Texture {
  const cached = textureCache.get(path);
  if (cached) {
    return cached;
  }

  const texture = textureLoader.load(path);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textureCache.set(path, texture);
  return texture;
}

function loadModelInto(
  path: string,
  parent: THREE.Object3D,
  fallback?: THREE.Object3D,
  placement?: ModelPlacementOptions
): void {
  void getModel(path)
    .then((source) => {
      const instance = source.clone(true);
      instance.name = `${source.name || 'imported-model'}-instance`;
      applyModelPlacement(instance, placement);
      instance.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      parent.add(instance);

      if (fallback) {
        fallback.visible = false;
      }
    })
    .catch((error: unknown) => {
      console.warn(`Could not load hallway model ${path}`, error);
    });
}

function applyModelPlacement(instance: THREE.Object3D, placement?: ModelPlacementOptions): void {
  if (!placement) {
    return;
  }

  if (placement.rotation) {
    instance.rotation.copy(placement.rotation);
  }

  if (!placement.fitSize && !placement.center) {
    return;
  }

  instance.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(instance);
  if (bounds.isEmpty()) {
    return;
  }

  if (placement.fitSize) {
    const currentSize = bounds.getSize(new THREE.Vector3());
    const axes = placement.fitAxes ?? ['x', 'y', 'z'];
    const scale = axes.reduce((best, axis) => {
      const source = currentSize[axis];
      const target = placement.fitSize?.[axis] ?? 0;
      if (source <= 0 || target <= 0) {
        return best;
      }
      return Math.min(best, target / source);
    }, Number.POSITIVE_INFINITY);

    if (Number.isFinite(scale) && scale > 0) {
      instance.scale.multiplyScalar(scale);
      instance.updateMatrixWorld(true);
      bounds.setFromObject(instance);
    }
  }

  if (placement.center) {
    const currentCenter = bounds.getCenter(new THREE.Vector3());
    instance.position.add(placement.center.clone().sub(currentCenter));
  }
}

function getModel(path: string): Promise<THREE.Group> {
  const cached = modelCache.get(path);
  if (cached) {
    return cached;
  }

  const load = gltfLoader.loadAsync(path).then((gltf) => gltf.scene);
  modelCache.set(path, load);
  return load;
}

function createWallMaterial(): THREE.MeshStandardMaterial {
  return createPbrMaterial({
    color: 0xfffbf2,
    colorMap: `${TEXTURE_ROOT}/Plaster001/Plaster001_1K-JPG_Color.jpg`,
    roughnessMap: `${TEXTURE_ROOT}/Plaster001/Plaster001_1K-JPG_Roughness.jpg`,
    normalMap: `${TEXTURE_ROOT}/Plaster001/Plaster001_1K-JPG_NormalGL.jpg`,
    roughness: 0.94,
    metalness: 0.01,
    normalScale: 0.04
  });
}

function createFloorMaterial(): THREE.MeshStandardMaterial {
  return createPbrMaterial({
    color: 0xf1f3ee,
    colorMap: `${TEXTURE_ROOT}/Tiles107/Tiles107_1K-JPG_Color.jpg`,
    normalMap: `${TEXTURE_ROOT}/Tiles107/Tiles107_1K-JPG_NormalGL.jpg`,
    aoMap: `${TEXTURE_ROOT}/Tiles107/Tiles107_1K-JPG_AmbientOcclusion.jpg`,
    roughness: 0.93,
    metalness: 0.02,
    normalScale: 0.16
  });
}

function createWoodMaterial(color = 0xd1b58f): THREE.MeshStandardMaterial {
  return createPbrMaterial({
    color,
    colorMap: `${TEXTURE_ROOT}/Wood095/Wood095_1K-JPG_Color.jpg`,
    roughnessMap: `${TEXTURE_ROOT}/Wood095/Wood095_1K-JPG_Roughness.jpg`,
    normalMap: `${TEXTURE_ROOT}/Wood095/Wood095_1K-JPG_NormalGL.jpg`,
    roughness: 0.56,
    metalness: 0.02,
    normalScale: 0.25
  });
}

function createCleanMetalMaterial(color = 0xb8c0bd, metalness = 0.42): THREE.MeshStandardMaterial {
  return createPbrMaterial({
    color,
    colorMap: `${TEXTURE_ROOT}/Metal032/Metal032_1K-JPG_Color.jpg`,
    roughnessMap: `${TEXTURE_ROOT}/Metal032/Metal032_1K-JPG_Roughness.jpg`,
    normalMap: `${TEXTURE_ROOT}/Metal032/Metal032_1K-JPG_NormalGL.jpg`,
    metalnessMap: `${TEXTURE_ROOT}/Metal032/Metal032_1K-JPG_Metalness.jpg`,
    roughness: 0.46,
    metalness,
    normalScale: 0.18
  });
}

function createTransitionRects(side: TransitionSignSide): BoundsRect[] {
  return CANONICAL_TRANSITION_RECTS.map((rect) => mirrorRectForSide(rect, side));
}

function mirrorRectForSide(rect: BoundsRect, side: TransitionSignSide): BoundsRect {
  if (side > 0) {
    return { ...rect };
  }

  return {
    xMin: -rect.xMax,
    xMax: -rect.xMin,
    zMin: -rect.zMax,
    zMax: -rect.zMin
  };
}

export function createHallwayScene(scene: THREE.Scene, options: HallwaySceneOptions = {}): HallwayHandles {
  const layout = options.layout ?? 'full';
  const isQueuedNext = layout === 'queuedNext';
  const walkableRects = isQueuedNext ? QUEUED_HALLWAY_RECTS : WALKABLE_RECTS;
  const root = new THREE.Group();
  root.name = 'hallway-root';
  scene.add(root);

  const snapshots = new Map<THREE.Object3D, TransformSnapshot>();
  const wall = createWallMaterial();
  const floor = createFloorMaterial();
  const ceiling = createWallMaterial();
  ceiling.color.setHex(0xf3f0e8);
  ceiling.normalScale.setScalar(0.1);
  const trim = new THREE.MeshStandardMaterial({
    color: 0xa39f96,
    roughness: 0.68,
    metalness: 0.08
  });
  const environmentMaterials = { wall, floor, ceiling, trim };

  addHallwayShell(root, floor, wall, ceiling, trim, {
    walkableRects,
    transitionFrameSides: isQueuedNext ? [-1] : [-1, 1],
    openMainPositiveSide: isQueuedNext
  });
  addScuffDecals(root, createNonOverlappingRects(walkableRects));

  const ambientLight = new THREE.HemisphereLight(0xf4f9ff, 0xc1c7c2, 0.72);
  if (!isQueuedNext) {
    scene.add(ambientLight);
  }

  const lightHandles = addFluorescentLights(root, {
    intensityScale: isQueuedNext ? 0.48 : 1,
    activeLightCount: isQueuedNext ? 3 : 6,
    castShadows: !isQueuedNext
  });
  const propHandles = addProps(root, snapshots);
  root.updateMatrixWorld(true);

  return {
    root,
    environmentMaterials,
    ambientLight,
    ...lightHandles,
    ...propHandles,
    snapshots
  };
}

export function setTransitionSign(
  handles: HallwayHandles,
  side: TransitionSignSide,
  level: number,
  targetLoops: number,
  isEscaped: boolean,
  outcome: TransitionSignOutcome = 'idle'
): void {
  paintLevelSignNumber(getTransitionSign(handles, side).numberTexture, level, targetLoops, isEscaped, outcome);
}

export function setTransitionSignVisible(handles: HallwayHandles, visibleSide: TransitionSignSide | null): void {
  handles.transitionSigns.negative.root.visible = visibleSide === -1;
  handles.transitionSigns.positive.root.visible = visibleSide === 1;
}

export function setTransitionSignTransform(
  handles: HallwayHandles,
  side: TransitionSignSide,
  position: THREE.Vector3,
  rotationY: number
): void {
  const sign = getTransitionSign(handles, side).root;
  sign.position.copy(position);
  sign.rotation.y = rotationY;
}

export function setBulletinBoardWarning(handles: HallwayHandles, isWarning: boolean): void {
  paintBulletinBoardTexture(handles.bulletinBoardTexture, isWarning);
}

function getTransitionSign(handles: HallwayHandles, side: TransitionSignSide): TransitionSignHandle {
  return side < 0 ? handles.transitionSigns.negative : handles.transitionSigns.positive;
}

export function snapshotTransform(target: THREE.Object3D, snapshots: Map<THREE.Object3D, TransformSnapshot>): void {
  snapshots.set(target, {
    position: target.position.clone(),
    rotation: target.rotation.clone(),
    scale: target.scale.clone()
  });
}

export function restoreTransform(
  target: THREE.Object3D,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): void {
  const snapshot = snapshots.get(target);
  if (!snapshot) {
    return;
  }

  target.position.copy(snapshot.position);
  target.rotation.copy(snapshot.rotation);
  target.scale.copy(snapshot.scale);
}

function addHallwayShell(
  root: THREE.Group,
  floorMaterial: THREE.Material,
  wallMaterial: THREE.Material,
  ceilingMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  options: ShellOptions
): void {
  for (const rect of createNonOverlappingRects(options.walkableRects)) {
    addHorizontalSurface(root, 'floor-panel', rect, FLOOR_SURFACE_Y, floorMaterial, 'up');
    addHorizontalSurface(root, 'ceiling-panel', rect, CEILING_SURFACE_Y, ceilingMaterial, 'down');
  }

  addBoundaryWalls(root, wallMaterial, trimMaterial, options);
}

function createNonOverlappingRects(rects: BoundsRect[]): BoundsRect[] {
  const xs = getSortedBreakpoints(rects.flatMap((rect) => [rect.xMin, rect.xMax]));
  const zs = getSortedBreakpoints(rects.flatMap((rect) => [rect.zMin, rect.zMax]));
  const cells: BoundsRect[] = [];

  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    for (let zIndex = 0; zIndex < zs.length - 1; zIndex += 1) {
      const xMin = xs[xIndex];
      const xMax = xs[xIndex + 1];
      const zMin = zs[zIndex];
      const zMax = zs[zIndex + 1];
      const x = (xMin + xMax) / 2;
      const z = (zMin + zMax) / 2;

      if (xMax - xMin > 0.01 && zMax - zMin > 0.01 && isInsideWalkableRect(x, z, rects)) {
        cells.push({ xMin, xMax, zMin, zMax });
      }
    }
  }

  return cells;
}

function getSortedBreakpoints(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))]
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function addHorizontalSurface(
  parent: THREE.Object3D,
  name: string,
  rect: BoundsRect,
  y: number,
  material: THREE.Material,
  side: 'up' | 'down'
): THREE.Mesh {
  const geometry = createWorldAlignedSurfaceGeometry(rect, y, side);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = side === 'up';
  parent.add(mesh);
  return mesh;
}

function createWorldAlignedSurfaceGeometry(
  rect: BoundsRect,
  y: number,
  side: 'up' | 'down'
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const { xMin, xMax, zMin, zMax } = rect;
  const positions = new Float32Array([
    xMin, y, zMin,
    xMax, y, zMin,
    xMax, y, zMax,
    xMin, y, zMax
  ]);
  const normalY = side === 'up' ? 1 : -1;
  const normals = new Float32Array([
    0, normalY, 0,
    0, normalY, 0,
    0, normalY, 0,
    0, normalY, 0
  ]);
  const uvs = new Float32Array([
    xMin / FLOOR_TEXTURE_SCALE, zMin / FLOOR_TEXTURE_SCALE,
    xMax / FLOOR_TEXTURE_SCALE, zMin / FLOOR_TEXTURE_SCALE,
    xMax / FLOOR_TEXTURE_SCALE, zMax / FLOOR_TEXTURE_SCALE,
    xMin / FLOOR_TEXTURE_SCALE, zMax / FLOOR_TEXTURE_SCALE
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
  geometry.setIndex(side === 'up' ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  return geometry;
}

const BASEBOARD_HEIGHT = 0.16;
const BASEBOARD_THICKNESS = 0.08;
const BASEBOARD_Y = 0.18;
const WALL_THICKNESS = 0.12;

interface Interval {
  start: number;
  end: number;
}

interface VerticalBaseboardGap {
  x: number;
  side: -1 | 1;
  zStart: number;
  zEnd: number;
}

const VERTICAL_BASEBOARD_GAPS: VerticalBaseboardGap[] = [
  { x: MAIN_HALF_WIDTH, side: 1, zStart: 4.25, zEnd: 5.65 },
  { x: -MAIN_HALF_WIDTH, side: -1, zStart: -3.0, zEnd: -1.6 }
];

function addBoundaryWalls(
  root: THREE.Group,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  options: ShellOptions
): void {
  for (const rect of options.walkableRects) {
    addVerticalBoundary(root, rect.xMin, rect.zMin, rect.zMax, -1, wallMaterial, trimMaterial, options);
    addVerticalBoundary(root, rect.xMax, rect.zMin, rect.zMax, 1, wallMaterial, trimMaterial, options);
    addHorizontalBoundary(root, rect.zMin, rect.xMin, rect.xMax, -1, wallMaterial, trimMaterial, options);
    addHorizontalBoundary(root, rect.zMax, rect.xMin, rect.xMax, 1, wallMaterial, trimMaterial, options);
  }
}

function addVerticalBoundary(
  root: THREE.Group,
  x: number,
  zMin: number,
  zMax: number,
  side: -1 | 1,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  options: ShellOptions
): void {
  const intervals = getBoundaryIntervals('vertical', x, zMin, zMax, side, options.walkableRects)
    .flatMap((interval) => subtractVerticalOpeningGaps(x, side, interval, options));

  for (const interval of intervals) {
    const length = interval.end - interval.start;
    if (length <= 0.04) {
      continue;
    }

    const wallX = x + side * WALL_THICKNESS / 2;
    const wallZ = (interval.start + interval.end) / 2;
    addBox(root, 'boundary-wall-z', [WALL_THICKNESS, WALL_HEIGHT, length], [wallX, WALL_CENTER_Y, wallZ], wallMaterial);

    for (const baseboardInterval of subtractVerticalBaseboardGaps(x, side, interval)) {
      addBaseboardZ(
        root,
        'boundary-baseboard-z',
        x - side * BASEBOARD_THICKNESS / 2,
        baseboardInterval.start,
        baseboardInterval.end,
        trimMaterial
      );
    }
    addWallRailZ(root, 'boundary-ceiling-rail-z', x - side * BASEBOARD_THICKNESS / 2, interval.start, interval.end, trimMaterial);
  }
}

function subtractVerticalOpeningGaps(
  x: number,
  side: -1 | 1,
  interval: Interval,
  options: ShellOptions | null
): Interval[] {
  if (options?.openMainPositiveSide && isMainPositiveSideOpening(x, side, interval)) {
    return subtractInterval(interval, {
      start: MAIN_SIDE_OPENING_Z_MIN,
      end: MAIN_SIDE_OPENING_Z_MAX
    });
  }

  return [interval];
}

function isMainPositiveSideOpening(x: number, side: -1 | 1, interval: Interval): boolean {
  return (
    side > 0 &&
    Math.abs(x - MAIN_HALF_WIDTH) < 0.01 &&
    interval.start < MAIN_SIDE_OPENING_Z_MAX &&
    interval.end > MAIN_SIDE_OPENING_Z_MIN
  );
}

function subtractVerticalBaseboardGaps(x: number, side: -1 | 1, interval: Interval): Interval[] {
  let intervals = [interval];

  for (const gap of VERTICAL_BASEBOARD_GAPS) {
    if (Math.abs(gap.x - x) > 0.01 || gap.side !== side) {
      continue;
    }

    intervals = intervals.flatMap((candidate) =>
      subtractInterval(candidate, { start: gap.zStart, end: gap.zEnd })
    );
  }

  return intervals.filter((candidate) => candidate.end - candidate.start > 0.04);
}

function subtractInterval(interval: Interval, gap: Interval): Interval[] {
  const start = Math.max(interval.start, gap.start);
  const end = Math.min(interval.end, gap.end);

  if (end <= start) {
    return [interval];
  }

  const intervals: Interval[] = [];
  if (start - interval.start > 0.04) {
    intervals.push({ start: interval.start, end: start });
  }

  if (interval.end - end > 0.04) {
    intervals.push({ start: end, end: interval.end });
  }

  return intervals;
}

function addHorizontalBoundary(
  root: THREE.Group,
  z: number,
  xMin: number,
  xMax: number,
  side: -1 | 1,
  wallMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  options: ShellOptions
): void {
  const intervals = getBoundaryIntervals('horizontal', z, xMin, xMax, side, options.walkableRects)
    .flatMap((interval) => subtractHorizontalOpeningGaps(z, side, interval, options));

  for (const interval of intervals) {
    const length = interval.end - interval.start;
    if (length <= 0.04) {
      continue;
    }

    const wallX = (interval.start + interval.end) / 2;
    const wallZ = z + side * WALL_THICKNESS / 2;
    addBox(root, 'boundary-wall-x', [length, WALL_HEIGHT, WALL_THICKNESS], [wallX, WALL_CENTER_Y, wallZ], wallMaterial);
    addBaseboardX(root, 'boundary-baseboard-x', interval.start, interval.end, z - side * BASEBOARD_THICKNESS / 2, trimMaterial);
    addWallRailX(root, 'boundary-ceiling-rail-x', interval.start, interval.end, z - side * BASEBOARD_THICKNESS / 2, trimMaterial);
  }
}

function subtractHorizontalOpeningGaps(
  z: number,
  side: -1 | 1,
  interval: Interval,
  options: ShellOptions
): Interval[] {
  let intervals = [interval];

  if (options.openMainPositiveSide && isMainPositiveEndOpening(z, side, interval)) {
    intervals = intervals.flatMap((candidate) =>
      subtractInterval(candidate, { start: -MAIN_HALF_WIDTH, end: MAIN_HALF_WIDTH })
    );
  }

  return intervals.flatMap((candidate) => subtractTransitionConnectorSideOpening(z, side, candidate));
}

function isMainPositiveEndOpening(z: number, side: -1 | 1, interval: Interval): boolean {
  return (
    side > 0 &&
    Math.abs(z - MAIN_POSITIVE_END_Z) < 0.01 &&
    interval.start < MAIN_HALF_WIDTH &&
    interval.end > -MAIN_HALF_WIDTH
  );
}

function subtractTransitionConnectorSideOpening(z: number, side: -1 | 1, interval: Interval): Interval[] {
  if (isPositiveTransitionConnectorSide(z, side, interval)) {
    return subtractInterval(interval, {
      start: TRANSITION_CONNECTOR_MAIN_OVERLAP_X_MIN,
      end: TRANSITION_CONNECTOR_X_MAX
    });
  }

  if (isNegativeTransitionConnectorSide(z, side, interval)) {
    return subtractInterval(interval, {
      start: -TRANSITION_CONNECTOR_X_MAX,
      end: -TRANSITION_CONNECTOR_MAIN_OVERLAP_X_MIN
    });
  }

  return [interval];
}

function isPositiveTransitionConnectorSide(z: number, side: -1 | 1, interval: Interval): boolean {
  return (
    side > 0 &&
    Math.abs(z - TRANSITION_CONNECTOR_Z_MAX) < 0.01 &&
    interval.start < TRANSITION_CONNECTOR_X_MAX &&
    interval.end > TRANSITION_CONNECTOR_MAIN_OVERLAP_X_MIN
  );
}

function isNegativeTransitionConnectorSide(z: number, side: -1 | 1, interval: Interval): boolean {
  return (
    side < 0 &&
    Math.abs(z + TRANSITION_CONNECTOR_Z_MAX) < 0.01 &&
    interval.start < -TRANSITION_CONNECTOR_MAIN_OVERLAP_X_MIN &&
    interval.end > -TRANSITION_CONNECTOR_X_MAX
  );
}

function getBoundaryIntervals(
  axis: 'vertical' | 'horizontal',
  fixed: number,
  rangeMin: number,
  rangeMax: number,
  side: -1 | 1,
  walkableRects: BoundsRect[]
): Interval[] {
  const breakpoints = [rangeMin, rangeMax];
  for (const rect of walkableRects) {
    const otherMin = axis === 'vertical' ? rect.zMin : rect.xMin;
    const otherMax = axis === 'vertical' ? rect.zMax : rect.xMax;
    if (otherMax <= rangeMin || otherMin >= rangeMax) {
      continue;
    }

    breakpoints.push(
      THREE.MathUtils.clamp(otherMin, rangeMin, rangeMax),
      THREE.MathUtils.clamp(otherMax, rangeMin, rangeMax)
    );
  }

  const sorted = [...new Set(breakpoints)]
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const intervals: Interval[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    const midpoint = (start + end) / 2;
    const sampleX = axis === 'vertical' ? fixed + side * 0.025 : midpoint;
    const sampleZ = axis === 'vertical' ? midpoint : fixed + side * 0.025;

    if (!isInsideWalkableRect(sampleX, sampleZ, walkableRects)) {
      intervals.push({ start, end });
    }
  }

  return intervals;
}

function isInsideWalkableRect(x: number, z: number, walkableRects: BoundsRect[]): boolean {
  return walkableRects.some(
    (rect) => x > rect.xMin && x < rect.xMax && z > rect.zMin && z < rect.zMax
  );
}

function addBaseboardX(
  parent: THREE.Object3D,
  name: string,
  xStart: number,
  xEnd: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const xMin = Math.min(xStart, xEnd);
  const xMax = Math.max(xStart, xEnd);
  return addBox(
    parent,
    name,
    [xMax - xMin, BASEBOARD_HEIGHT, BASEBOARD_THICKNESS],
    [(xMin + xMax) / 2, BASEBOARD_Y, z],
    material
  );
}

function addBaseboardZ(
  parent: THREE.Object3D,
  name: string,
  x: number,
  zStart: number,
  zEnd: number,
  material: THREE.Material
): THREE.Mesh {
  const zMin = Math.min(zStart, zEnd);
  const zMax = Math.max(zStart, zEnd);
  return addBox(
    parent,
    name,
    [BASEBOARD_THICKNESS, BASEBOARD_HEIGHT, zMax - zMin],
    [x, BASEBOARD_Y, (zMin + zMax) / 2],
    material
  );
}

function addWallRailX(
  parent: THREE.Object3D,
  name: string,
  xStart: number,
  xEnd: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const xMin = Math.min(xStart, xEnd);
  const xMax = Math.max(xStart, xEnd);
  return addBox(
    parent,
    name,
    [xMax - xMin, 0.06, BASEBOARD_THICKNESS],
    [(xMin + xMax) / 2, WALL_HEIGHT - 0.16, z],
    material
  );
}

function addWallRailZ(
  parent: THREE.Object3D,
  name: string,
  x: number,
  zStart: number,
  zEnd: number,
  material: THREE.Material
): THREE.Mesh {
  const zMin = Math.min(zStart, zEnd);
  const zMax = Math.max(zStart, zEnd);
  return addBox(
    parent,
    name,
    [BASEBOARD_THICKNESS, 0.06, zMax - zMin],
    [x, WALL_HEIGHT - 0.16, (zMin + zMax) / 2],
    material
  );
}

function addScuffDecals(root: THREE.Group, walkableRects: BoundsRect[]): void {
  const wallScuffMaterial = new THREE.MeshBasicMaterial({
    map: createScuffTexture(1024, 256, 0.14),
    color: 0x6c7069,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });

  for (const rect of walkableRects) {
    const width = rect.xMax - rect.xMin;
    const depth = rect.zMax - rect.zMin;
    const centerZ = (rect.zMin + rect.zMax) / 2;

    if (depth > width) {
      addWallScuff(root, wallScuffMaterial, rect.xMin + 0.004, centerZ, depth, -1);
      addWallScuff(root, wallScuffMaterial, rect.xMax - 0.004, centerZ, depth, 1);
    }
  }
}

function addWallScuff(
  root: THREE.Group,
  material: THREE.Material,
  x: number,
  z: number,
  width: number,
  side: -1 | 1
): void {
  const scuff = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.44), material);
  scuff.name = 'wall-scuff-decals';
  scuff.position.set(x, 0.4, z);
  scuff.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  root.add(scuff);
}

function createScuffTexture(width: number, height: number, strength: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create scuff texture canvas context.');
  }

  context.clearRect(0, 0, width, height);
  for (let index = 0; index < 120; index += 1) {
    const t = index * 12.9898;
    const x = ((Math.sin(t) * 43758.5453) % 1 + 1) % 1;
    const y = ((Math.sin(t * 1.71) * 21942.381) % 1 + 1) % 1;
    const smudgeWidth = 18 + (((Math.sin(t * 0.53) * 912.3) % 1 + 1) % 1) * 130;
    const smudgeHeight = 4 + (((Math.sin(t * 0.37) * 713.7) % 1 + 1) % 1) * 28;
    context.fillStyle = `rgba(25, 28, 26, ${strength * (0.18 + (index % 5) * 0.035)})`;
    context.beginPath();
    context.ellipse(x * width, y * height, smudgeWidth, smudgeHeight, Math.sin(t) * 0.22, 0, Math.PI * 2);
    context.fill();
  }

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.65, `rgba(0, 0, 0, ${strength * 0.25})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addFluorescentLights(
  root: THREE.Group,
  options: FluorescentLightOptions
): Pick<HallwayHandles, 'flickerLight' | 'flickerTubeMaterial'> {
  const tubeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf6fbff,
    emissive: 0xdbf0ff,
    emissiveIntensity: 1.85,
    roughness: 0.16,
    transmission: 0.05,
    clearcoat: 0.4
  });
  const dimTubeMaterial = tubeMaterial.clone();
  const fixtureMaterial = createCleanMetalMaterial(0xcbd1d0, 0.28);
  const lightSpecs = [
    { x: 0, z: 4.5, rotY: 0, intensity: 13.8 },
    { x: 0, z: -3.3, rotY: 0, intensity: 12.8 },
    { x: -4.8, z: -8, rotY: Math.PI / 2, intensity: 11.6 },
    { x: -8, z: -12.4, rotY: 0, intensity: 12.2 },
    { x: -3.8, z: -16, rotY: Math.PI / 2, intensity: 10.8 },
    { x: 0, z: -21.2, rotY: 0, intensity: 10.4 }
  ];

  let flickerLight = new THREE.RectAreaLight(0xe2f2ff, 0, 0.34, 1.78);

  for (const [index, spec] of lightSpecs.entries()) {
    const group = new THREE.Group();
    group.name = `fluorescent-${index + 1}`;
    group.position.set(spec.x, WALL_HEIGHT - 0.14, spec.z);
    group.rotation.y = spec.rotY;

    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 1.48), index === 2 ? dimTubeMaterial : tubeMaterial);
    tube.name = 'fluorescent-tube';
    group.add(tube);

    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.07, 1.78),
      fixtureMaterial
    );
    fixture.position.y = 0.035;
    group.add(fixture);

    const isRotated = Math.abs(spec.rotY) > 0.01;
    const light = new THREE.RectAreaLight(
      0xe2f2ff,
      index < options.activeLightCount ? spec.intensity * options.intensityScale : 0,
      isRotated ? 1.78 : 0.34,
      isRotated ? 0.34 : 1.78
    );
    light.name = `${group.name}-bar-light`;
    light.position.set(spec.x, WALL_HEIGHT - 0.26, spec.z);
    light.rotation.x = -Math.PI / 2;
    root.add(light);

    if (index === 2) {
      flickerLight = light;
    }

    if (options.castShadows && (index === 0 || index === 2)) {
      const spot = new THREE.SpotLight(0xdcecff, 1.8 * options.intensityScale, 7, 0.82, 0.74, 1.2);
      spot.name = `${group.name}-shadow-light`;
      spot.position.set(spec.x, WALL_HEIGHT - 0.34, spec.z);
      spot.castShadow = true;
      spot.shadow.mapSize.set(256, 256);
      spot.shadow.bias = -0.00018;
      spot.shadow.camera.near = 0.2;
      spot.shadow.camera.far = 7;
      const target = new THREE.Object3D();
      target.name = `${group.name}-shadow-target`;
      target.position.set(spec.x, 0, spec.z);
      root.add(spot, target);
      spot.target = target;
    }

    root.add(group);
  }

  return {
    flickerLight,
    flickerTubeMaterial: dimTubeMaterial
  };
}

function addProps(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Omit<
  HallwayHandles,
  | 'root'
  | 'environmentMaterials'
  | 'ambientLight'
  | 'flickerLight'
  | 'flickerTubeMaterial'
  | 'snapshots'
> {
  const lockerHandles = addLockers(root, snapshots);
  const clockHandles = addClock(root, snapshots);
  const cameraHandles = addSecurityCamera(root, snapshots);
  const ventHandles = addVent(root, snapshots);
  const anomalyTile = addMismatchTile(root);
  const bulletinBoardHandles = addBulletinBoard(root);
  const hallwayFigureHandles = addHallwayFigure(root, snapshots);
  const redFloodHandles = addRedFlood(root);
  const exitGlow = addExitGlow(root);
  const negativeTransitionSign = addLevelSign(root, {
    name: 'negative-transition-level-sign',
    position: getTransitionSignPosition(-1),
    rotationY: getTransitionSignRotation(-1)
  });
  const positiveTransitionSign = addLevelSign(root, {
    name: 'positive-transition-level-sign',
    position: getTransitionSignPosition(1),
    rotationY: getTransitionSignRotation(1)
  });
  addClassroomDoors(root);
  addMotivationalPoster(root);

  return {
    ...lockerHandles,
    ...clockHandles,
    ...cameraHandles,
    ...ventHandles,
    ...bulletinBoardHandles,
    ...hallwayFigureHandles,
    ...redFloodHandles,
    mismatchTile: anomalyTile,
    exitGlow,
    transitionSigns: {
      negative: negativeTransitionSign,
      positive: positiveTransitionSign
    }
  };
}

function getTransitionSignPosition(side: TransitionSignSide): THREE.Vector3 {
  return new THREE.Vector3(side * 9.73, 1.7, side * 17.25);
}

function getTransitionSignRotation(side: TransitionSignSide): number {
  return side * Math.PI / 2;
}

function addClassroomDoors(root: THREE.Group): void {
  const doorMaterial = createWoodMaterial(0xcabca5);
  const doorFrameMaterial = createCleanMetalMaterial(0x9a9087, 0.22);
  const darkRoomMaterial = new THREE.MeshStandardMaterial({
    color: 0x050607,
    emissive: 0x020303,
    emissiveIntensity: 0.06,
    roughness: 0.94,
    metalness: 0.02
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1f2a31,
    emissive: 0x020406,
    emissiveIntensity: 0.18,
    roughness: 0.08,
    metalness: 0.08,
    transmission: 0.12,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 0.78
  });
  const handleMaterial = createCleanMetalMaterial(0xcab77a, 0.58);

  addImportedClassroomDoor(root, {
    name: 'classroom-door-101',
    position: new THREE.Vector3(POSITIVE_WALL_FACE_X, 0.04, 4.95),
    rotationY: -Math.PI / 2,
    label: '101',
    doorMaterial,
    doorFrameMaterial,
    darkRoomMaterial,
    glassMaterial,
    handleMaterial
  });
  addImportedClassroomDoor(root, {
    name: 'classroom-door-102',
    position: new THREE.Vector3(NEGATIVE_WALL_FACE_X, 0.04, -2.3),
    rotationY: Math.PI / 2,
    label: '102',
    doorMaterial,
    doorFrameMaterial,
    darkRoomMaterial,
    glassMaterial,
    handleMaterial
  });
}

interface ClassroomDoorOptions {
  name: string;
  position: THREE.Vector3;
  rotationY: number;
  label: string;
  doorMaterial: THREE.Material;
  doorFrameMaterial: THREE.Material;
  darkRoomMaterial: THREE.Material;
  glassMaterial: THREE.Material;
  handleMaterial: THREE.Material;
}

function addImportedClassroomDoor(root: THREE.Group, options: ClassroomDoorOptions): void {
  const importedDoor = new THREE.Group();
  importedDoor.name = `${options.name}-imported`;
  importedDoor.position.copy(options.position);
  importedDoor.rotation.y = options.rotationY;
  root.add(importedDoor);

  const fallback = new THREE.Group();
  fallback.name = `${options.name}-procedural-fallback`;
  root.add(fallback);
  addClassroomDoor(fallback, options);

  loadModelInto(`${MODEL_ROOT}/classroom-door.glb`, importedDoor, fallback, {
    fitSize: new THREE.Vector3(1.18, 2.34, 0.12),
    fitAxes: ['x', 'y'],
    center: new THREE.Vector3(0, 1.18, 0.01)
  });
}

function addClassroomDoor(root: THREE.Group, options: ClassroomDoorOptions): void {
  const frameOuterWidth = 1.26;
  const frameOuterHeight = 2.36;
  const frameThickness = 0.12;
  const frameDepth = 0.045;
  const frameBottom = 0;
  const frameZ = 0.012;
  const leafWidth = 1.03;
  const leafBottom = frameBottom + frameThickness;
  const leafTop = frameBottom + frameOuterHeight - frameThickness;
  const leafDepth = 0.035;
  const windowWidth = 0.36;
  const windowHeight = 0.58;
  const windowCenterY = 1.55;
  const windowBottom = windowCenterY - windowHeight / 2;
  const windowTop = windowCenterY + windowHeight / 2;
  const sidePanelWidth = (leafWidth - windowWidth) / 2;
  const panelOverlap = 0.012;

  const door = new THREE.Group();
  door.name = options.name;
  door.position.copy(options.position);
  door.rotation.y = options.rotationY;
  root.add(door);

  addRectangularFrame(door, `${options.name}-outer-frame`, {
    outerWidth: frameOuterWidth,
    outerHeight: frameOuterHeight,
    thickness: frameThickness,
    depth: frameDepth,
    bottom: frameBottom,
    z: frameZ,
    material: options.doorFrameMaterial
  });

  const leafPivot = new THREE.Group();
  leafPivot.name = `${options.name}-leaf-pivot`;
  leafPivot.position.set(-leafWidth / 2, 0, 0);
  door.add(leafPivot);

  const leaf = new THREE.Group();
  leaf.name = `${options.name}-leaf`;
  leaf.position.set(leafWidth / 2, 0, 0);
  leafPivot.add(leaf);

  addBox(
    leaf,
    `${options.name}-panel-bottom`,
    [leafWidth, windowBottom - leafBottom + panelOverlap, leafDepth],
    [0, leafBottom + (windowBottom - leafBottom + panelOverlap) / 2, 0],
    options.doorMaterial
  );
  addBox(
    leaf,
    `${options.name}-panel-top`,
    [leafWidth, leafTop - windowTop + panelOverlap, leafDepth],
    [0, windowTop - panelOverlap + (leafTop - windowTop + panelOverlap) / 2, 0],
    options.doorMaterial
  );
  addBox(
    leaf,
    `${options.name}-panel-left`,
    [sidePanelWidth, windowHeight - panelOverlap * 2, leafDepth],
    [-(windowWidth / 2 + sidePanelWidth / 2), windowCenterY, 0.001],
    options.doorMaterial
  );
  addBox(
    leaf,
    `${options.name}-panel-right`,
    [sidePanelWidth, windowHeight - panelOverlap * 2, leafDepth],
    [windowWidth / 2 + sidePanelWidth / 2, windowCenterY, 0.001],
    options.doorMaterial
  );
  addBox(leaf, `${options.name}-window-shadow`, [windowWidth, windowHeight, 0.012], [0, windowCenterY, -0.016], options.darkRoomMaterial);
  addRectangularFrame(leaf, `${options.name}-window-frame`, {
    outerWidth: windowWidth + 0.08,
    outerHeight: windowHeight + 0.08,
    thickness: 0.035,
    depth: 0.018,
    bottom: windowBottom - 0.04,
    z: 0.018,
    material: options.doorFrameMaterial
  });
  addBox(
    leaf,
    `${options.name}-window-glass`,
    [windowWidth * 0.9, windowHeight * 0.9, 0.006],
    [0, windowCenterY, 0.002],
    options.glassMaterial,
    false,
    false
  );
  addBox(leaf, `${options.name}-kick-plate`, [0.7, 0.28, 0.012], [0.02, 0.34, 0.034], options.handleMaterial);
  addBox(leaf, `${options.name}-handle`, [0.065, 0.065, 0.065], [0.39, 1.0, 0.048], options.handleMaterial);
  addBox(leaf, `${options.name}-latch-plate`, [0.025, 0.22, 0.012], [0.47, 1.0, 0.04], options.handleMaterial);
  for (let index = 0; index < 3; index += 1) {
    addBox(
      leaf,
      `${options.name}-hinge-${index}`,
      [0.035, 0.18, 0.018],
      [-0.52, 0.62 + index * 0.58, 0.043],
      options.handleMaterial
    );
  }

  const labelTexture = createDoorLabelTexture(options.label);
  const labelMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    roughness: 0.65,
    metalness: 0.01
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.15), labelMaterial);
  label.name = `${options.name}-label`;
  label.position.set(-0.31, 1.92, 0.023);
  leaf.add(label);
}

interface RectangularFrameOptions {
  outerWidth: number;
  outerHeight: number;
  thickness: number;
  depth: number;
  bottom: number;
  z: number;
  material: THREE.Material;
}

function addRectangularFrame(parent: THREE.Object3D, name: string, options: RectangularFrameOptions): void {
  const { outerWidth, outerHeight, thickness, depth, bottom, z, material } = options;
  const innerHeight = outerHeight - thickness * 2;
  const centerY = bottom + outerHeight / 2;
  const topY = bottom + outerHeight - thickness / 2;
  const bottomY = bottom + thickness / 2;
  const sideX = outerWidth / 2 - thickness / 2;

  addBox(parent, `${name}-top`, [outerWidth, thickness, depth], [0, topY, z], material);
  addBox(parent, `${name}-bottom`, [outerWidth, thickness, depth], [0, bottomY, z], material);
  addBox(parent, `${name}-left`, [thickness, innerHeight, depth], [-sideX, centerY, z], material);
  addBox(parent, `${name}-right`, [thickness, innerHeight, depth], [sideX, centerY, z], material);
}

function createDoorLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create door label canvas context.');
  }

  context.fillStyle = '#f8f5e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#807869';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = '#27313b';
  context.font = '700 62px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface LevelSignOptions {
  name: string;
  position: THREE.Vector3;
  rotationY: number;
}

function addLevelSign(root: THREE.Group, options: LevelSignOptions): TransitionSignHandle {
  const boardTexture = loadFlatTexture(TRANSITION_CHALKBOARD_TEXTURE, true);
  const numberTexture = createLevelSignNumberTexture();
  const signMaterial = new THREE.MeshStandardMaterial({
    map: boardTexture,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const numberMaterial = new THREE.MeshBasicMaterial({
    map: numberTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const sign = new THREE.Group();
  sign.name = options.name;
  sign.position.copy(options.position);
  sign.rotation.y = options.rotationY;
  sign.visible = false;
  root.add(sign);

  const board = new THREE.Mesh(new THREE.PlaneGeometry(TRANSITION_SIGN_WIDTH, TRANSITION_SIGN_HEIGHT), signMaterial);
  board.name = `${options.name}-face`;
  board.position.z = 0.022;
  sign.add(board);

  const numberOverlay = new THREE.Mesh(new THREE.PlaneGeometry(TRANSITION_SIGN_WIDTH, TRANSITION_SIGN_HEIGHT), numberMaterial);
  numberOverlay.name = `${options.name}-period-number`;
  numberOverlay.position.z = 0.024;
  numberOverlay.renderOrder = 2;
  sign.add(numberOverlay);

  addBox(sign, `${options.name}-backing`, [TRANSITION_SIGN_WIDTH + 0.04, TRANSITION_SIGN_HEIGHT + 0.04, 0.025], [0, 0, 0], signMaterial);

  return { root: sign, numberTexture };
}

function createLevelSignNumberTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TRANSITION_SIGN_CANVAS_WIDTH;
  canvas.height = TRANSITION_SIGN_CANVAS_HEIGHT;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  ensureChalkNumberFontLoaded(() => paintLevelSignNumber(texture, 1, 8, false, 'idle'));
  paintLevelSignNumber(texture, 1, 8, false, 'idle');
  return texture;
}

function paintLevelSignNumber(
  texture: THREE.CanvasTexture,
  level: number,
  targetLoops: number,
  isEscaped: boolean,
  outcome: TransitionSignOutcome
): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create level sign canvas context.');
  }

  const count = isEscaped ? targetLoops : THREE.MathUtils.clamp(level, 1, targetLoops);
  const color = outcome === 'wrong' ? '219, 205, 194' : '224, 221, 205';
  const seed = count * 97 + targetLoops * 13 + (outcome === 'wrong' ? 19 : 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.font = getChalkNumberFont(560);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const number = String(count);
  const centerX = canvas.width * 0.715;
  const centerY = canvas.height * 0.35;
  const random = seededRandom(seed);

  context.shadowColor = `rgba(${color}, 0.32)`;
  context.shadowBlur = 15;
  for (let pass = 0; pass < 10; pass += 1) {
    const dx = Math.round((random() - 0.5) * 9);
    const dy = Math.round((random() - 0.5) * 7);
    context.fillStyle = `rgba(${color}, ${0.08 + random() * 0.045})`;
    context.fillText(number, centerX + dx, centerY + dy);
  }

  context.shadowBlur = 0;
  context.fillStyle = `rgba(${color}, 0.9)`;
  context.fillText(number, centerX, centerY);
  context.restore();

  distressChalkNumber(context, number, centerX, centerY, seed);
  smudgeChalkNumber(context, centerX, centerY, seed);

  texture.needsUpdate = true;

  if (!chalkNumberFontLoaded) {
    ensureChalkNumberFontLoaded(() => paintLevelSignNumber(texture, level, targetLoops, isEscaped, outcome));
  }
}

function getChalkNumberFont(size: number): string {
  const primaryFont = chalkNumberFontLoaded ? `"${TRANSITION_CHALK_FONT_FAMILY}"` : 'Arial Black';
  return `700 ${size}px ${primaryFont}, sans-serif`;
}

function ensureChalkNumberFontLoaded(onLoaded?: () => void): void {
  if (chalkNumberFontLoaded) {
    onLoaded?.();
    return;
  }

  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    return;
  }

  if (!chalkNumberFontPromise) {
    const fontFace = new FontFace(
      TRANSITION_CHALK_FONT_FAMILY,
      `url("${TRANSITION_CHALK_FONT_URL}") format("truetype")`
    );
    chalkNumberFontPromise = fontFace.load().then((loadedFontFace) => {
      document.fonts.add(loadedFontFace);
      chalkNumberFontLoaded = true;
    });
  }

  if (onLoaded) {
    chalkNumberFontPromise.then(onLoaded).catch(() => undefined);
  }
}

function distressChalkNumber(
  context: CanvasRenderingContext2D,
  number: string,
  centerX: number,
  centerY: number,
  seed: number
): void {
  const metrics = context.measureText(number);
  const width = Math.ceil(metrics.width + 90);
  const height = Math.ceil((metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 560) + 110);
  const x = Math.max(0, Math.floor(centerX - width / 2));
  const y = Math.max(0, Math.floor(centerY - height / 2));
  const clippedWidth = Math.min(width, context.canvas.width - x);
  const clippedHeight = Math.min(height, context.canvas.height - y);
  const imageData = context.getImageData(x, y, clippedWidth, clippedHeight);
  const data = imageData.data;
  const random = seededRandom(seed + 1009);

  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index];
    if (alpha === 0) {
      continue;
    }

    const roll = random();
    if (roll < 0.1) {
      data[index] = Math.round(alpha * (0.2 + random() * 0.35));
    } else if (roll < 0.22) {
      data[index] = Math.round(alpha * (0.58 + random() * 0.22));
    }
  }

  context.putImageData(imageData, x, y);
}

function smudgeChalkNumber(context: CanvasRenderingContext2D, centerX: number, centerY: number, seed: number): void {
  const random = seededRandom(seed + 4099);
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.filter = 'blur(8px)';
  context.lineCap = 'round';

  for (let smear = 0; smear < 2; smear += 1) {
    context.beginPath();
    const y = centerY + (smear === 0 ? 70 : 165) + (random() - 0.5) * 26;
    const startX = centerX - 210 + random() * 28;
    context.moveTo(startX, y);
    for (let point = 1; point <= 7; point += 1) {
      const x = startX + point * 58 + (random() - 0.5) * 24;
      const curveY = y + Math.sin(point * 0.9 + seed) * 9 + (random() - 0.5) * 10;
      context.lineTo(x, curveY);
    }
    context.strokeStyle = `rgba(0, 0, 0, ${smear === 0 ? 0.18 : 0.13})`;
    context.lineWidth = smear === 0 ? 42 : 30;
    context.stroke();
  }

  context.restore();
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function addMotivationalPoster(root: THREE.Group): void {
  const posterTexture = new THREE.TextureLoader().load('/textures/you-can-do-it-poster.png');
  posterTexture.colorSpace = THREE.SRGBColorSpace;
  const posterMaterial = new THREE.MeshStandardMaterial({
    map: posterTexture,
    roughness: 0.74,
    metalness: 0.01
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9b48b,
    roughness: 0.58,
    metalness: 0.04
  });

  const poster = new THREE.Group();
  poster.name = 'you-can-do-it-poster';
  poster.position.set(NEGATIVE_WALL_FACE_X, 1.48, 0.65);
  poster.rotation.y = Math.PI / 2;
  root.add(poster);

  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.08), posterMaterial);
  board.position.z = 0.018;
  poster.add(board);

  addRectangularFrame(poster, 'poster-frame', {
    outerWidth: 0.9,
    outerHeight: 1.16,
    thickness: 0.04,
    depth: 0.03,
    bottom: -0.58,
    z: 0,
    material: frameMaterial
  });
}

function addBulletinBoard(root: THREE.Group): Pick<HallwayHandles, 'bulletinBoardTexture'> {
  const bulletinBoardTexture = createBulletinBoardTexture(false);
  const corkMaterial = new THREE.MeshStandardMaterial({
    map: bulletinBoardTexture,
    roughness: 0.82,
    metalness: 0.01
  });
  const frameMaterial = createWoodMaterial(0x9f7447);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf8ffff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    transmission: 0.12,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16
  });

  const board = new THREE.Group();
  board.name = 'bulletin-board';
  board.position.set(NEGATIVE_WALL_FACE_X, 1.44, -6.2);
  board.rotation.y = Math.PI / 2;
  root.add(board);

  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.92), corkMaterial);
  face.name = 'bulletin-board-face';
  face.position.z = 0.019;
  board.add(face);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.88), glassMaterial);
  glass.name = 'bulletin-board-glass';
  glass.position.z = 0.026;
  board.add(glass);

  addRectangularFrame(board, 'bulletin-board-frame', {
    outerWidth: 1.58,
    outerHeight: 1.04,
    thickness: 0.055,
    depth: 0.038,
    bottom: -0.52,
    z: 0,
    material: frameMaterial
  });

  return { bulletinBoardTexture };
}

function createBulletinBoardTexture(isWarning: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  paintBulletinBoardTexture(texture, isWarning);
  return texture;
}

function paintBulletinBoardTexture(texture: THREE.CanvasTexture, isWarning: boolean): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create bulletin board canvas context.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = isWarning ? '#6f2720' : '#b9854f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = isWarning ? 0.32 : 0.18;
  context.strokeStyle = isWarning ? '#210807' : '#6d4729';
  context.lineWidth = 3;
  for (let y = 18; y < canvas.height; y += 42) {
    context.beginPath();
    context.moveTo(0, y + Math.sin(y) * 8);
    context.lineTo(canvas.width, y + Math.cos(y) * 8);
    context.stroke();
  }
  context.globalAlpha = 1;

  const notes = [
    { x: 76, y: 58, w: 252, h: 174, color: '#f5efd8', rot: -0.05 },
    { x: 382, y: 62, w: 216, h: 240, color: '#d9e8f5', rot: 0.04 },
    { x: 662, y: 74, w: 250, h: 162, color: '#f7e2d0', rot: -0.035 },
    { x: 116, y: 312, w: 304, h: 206, color: '#e8efd4', rot: 0.035 },
    { x: 524, y: 352, w: 356, h: 164, color: '#f5f0cc', rot: -0.025 }
  ];

  for (const [index, note] of notes.entries()) {
    drawBulletinNote(context, note.x, note.y, note.w, note.h, note.color, note.rot, index, isWarning);
  }

  if (isWarning) {
    context.fillStyle = 'rgba(44, 5, 3, 0.82)';
    context.font = '900 86px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('TURN BACK', canvas.width / 2, canvas.height / 2 + 8);
  }

  texture.needsUpdate = true;
}

function drawBulletinNote(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotation: number,
  index: number,
  isWarning: boolean
): void {
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(rotation);
  context.fillStyle = color;
  context.fillRect(-width / 2, -height / 2, width, height);
  context.strokeStyle = 'rgba(42, 38, 31, 0.26)';
  context.lineWidth = 5;
  context.strokeRect(-width / 2, -height / 2, width, height);

  context.fillStyle = isWarning ? '#3a0805' : '#27313b';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = `800 ${isWarning ? 34 : 28}px Arial, sans-serif`;
  const headline = isWarning ? 'TURN BACK' : ['TRYOUTS', 'MATH CLUB', 'LOST KEYS', 'CAFETERIA', 'FIELD TRIP'][index];
  context.fillText(headline, -width / 2 + 24, -height / 2 + 22);

  context.lineWidth = isWarning ? 7 : 4;
  context.strokeStyle = isWarning ? 'rgba(58, 8, 5, 0.78)' : 'rgba(39, 49, 59, 0.42)';
  const lineCount = isWarning ? 4 : 5;
  for (let line = 0; line < lineCount; line += 1) {
    const lineY = -height / 2 + 78 + line * 28;
    context.beginPath();
    context.moveTo(-width / 2 + 24, lineY);
    context.lineTo(width / 2 - 24 - (line % 2) * 36, lineY);
    context.stroke();
  }

  context.fillStyle = isWarning ? '#16110d' : '#b5221f';
  context.beginPath();
  context.arc(0, -height / 2 + 14, 9, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function addHallwayFigure(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<
  HallwayHandles,
  'hallwayFigure' | 'hallwayFigureHead' | 'hallwayFigureFaceMaterial' | 'hallwayFigureHeadMaterial'
> {
  const figure = new THREE.Group();
  figure.name = 'hallway-figure';
  figure.position.set(MAIN_HALF_WIDTH - 0.64, 0, -7.4);
  figure.rotation.y = -2.72;
  figure.visible = false;
  root.add(figure);

  const suitMaterial = new THREE.MeshStandardMaterial({
    color: 0x22282d,
    roughness: 0.78,
    metalness: 0.02
  });
  const shirtMaterial = new THREE.MeshStandardMaterial({
    color: 0xcbd3d6,
    roughness: 0.72,
    metalness: 0.01
  });
  const collarMaterial = new THREE.MeshStandardMaterial({
    color: 0x080909,
    emissive: 0x020202,
    emissiveIntensity: 0.1,
    roughness: 0.9,
    metalness: 0.02
  });
  const hallwayFigureHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xc99d7c,
    roughness: 0.64,
    metalness: 0.01
  });
  const hallwayFigureFaceMaterial = new THREE.MeshStandardMaterial({
    color: 0x17110f,
    emissive: 0x080302,
    emissiveIntensity: 0.18,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.74, 5, 12), suitMaterial);
  torso.name = 'hallway-figure-torso';
  torso.position.y = 0.98;
  torso.scale.set(0.82, 1, 0.62);
  torso.castShadow = true;
  figure.add(torso);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.56, 0.035), shirtMaterial);
  shirt.name = 'hallway-figure-shirt';
  shirt.position.set(0, 1.12, -0.19);
  shirt.castShadow = true;
  figure.add(shirt);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.055, 20), collarMaterial);
  collar.name = 'hallway-figure-empty-collar';
  collar.position.set(0, 1.48, -0.01);
  collar.scale.z = 0.72;
  collar.castShadow = true;
  figure.add(collar);

  for (const side of [-1, 1] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.56, 4, 8), suitMaterial);
    arm.name = `hallway-figure-arm-${side}`;
    arm.position.set(side * 0.28, 1.02, -0.03);
    arm.rotation.z = side * 0.16;
    arm.castShadow = true;
    figure.add(arm);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.68, 4, 8), suitMaterial);
    leg.name = `hallway-figure-leg-${side}`;
    leg.position.set(side * 0.09, 0.42, 0);
    leg.castShadow = true;
    figure.add(leg);
  }

  const headPivot = new THREE.Group();
  headPivot.name = 'hallway-figure-head-pivot';
  headPivot.position.set(0, 1.57, -0.02);
  figure.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), hallwayFigureHeadMaterial);
  head.name = 'hallway-figure-head';
  head.scale.set(0.86, 1.02, 0.78);
  head.castShadow = true;
  headPivot.add(head);

  const face = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), hallwayFigureFaceMaterial);
  face.name = 'hallway-figure-face-shadow';
  face.position.set(0, -0.006, -0.128);
  face.scale.set(0.74, 1.05, 1);
  headPivot.add(face);

  snapshotTransform(figure, snapshots);
  snapshotTransform(headPivot, snapshots);

  return {
    hallwayFigure: figure,
    hallwayFigureHead: headPivot,
    hallwayFigureFaceMaterial,
    hallwayFigureHeadMaterial
  };
}

function addRedFlood(root: THREE.Group): Pick<HallwayHandles, 'redFlood' | 'redFloodMaterial'> {
  const redFloodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a0604,
    emissive: 0x240100,
    emissiveIntensity: 0.22,
    roughness: 0.18,
    metalness: 0.04,
    transparent: true,
    opacity: 0.78
  });
  const redFlood = new THREE.Mesh(
    new THREE.BoxGeometry(MAIN_HALF_WIDTH * 2 - 0.18, 0.045, 1),
    redFloodMaterial
  );
  redFlood.name = 'red-flood';
  redFlood.position.set(0, 0.032, MAIN_HALF_LENGTH);
  redFlood.scale.z = 0.05;
  redFlood.receiveShadow = true;
  redFlood.visible = false;
  root.add(redFlood);

  return { redFlood, redFloodMaterial };
}

function addLockers(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'lockerDoor' | 'lockerInterior' | 'lockerInteriorMaterial'> {
  const lockerGroup = new THREE.Group();
  lockerGroup.name = 'lockers';
  root.add(lockerGroup);

  const bodyMaterial = createCleanMetalMaterial(0x244f83, 0.34);
  const doorMaterial = createCleanMetalMaterial(0x3577b6, 0.36);
  const handleMaterial = createCleanMetalMaterial(0xe2dccf, 0.46);
  const lockerInteriorMaterial = new THREE.MeshStandardMaterial({
    color: 0x060707,
    emissive: 0x050202,
    roughness: 1
  });

  const fallback = new THREE.Group();
  fallback.name = 'lockers-procedural-fallback';
  lockerGroup.add(fallback);

  for (let index = 0; index < 3; index += 1) {
    const z = 2.85 - index * 0.82;
    addBox(fallback, `locker-body-${index}`, [0.48, 1.62, 0.72], [MAIN_HALF_WIDTH - 0.28, 0.86, z], bodyMaterial);
    if (index !== 1) {
      addBox(fallback, `locker-door-${index}`, [0.045, 1.45, 0.61], [MAIN_HALF_WIDTH - 0.57, 0.93, z], doorMaterial);
      addBox(fallback, `locker-handle-${index}`, [0.04, 0.18, 0.035], [MAIN_HALF_WIDTH - 0.61, 1.05, z - 0.21], handleMaterial);
    }
  }

  const lockerInterior = addBox(
    lockerGroup,
    'locker-interior-anomaly',
    [0.035, 1.34, 0.38],
    [MAIN_HALF_WIDTH - 0.49, 0.92, 2.03],
    lockerInteriorMaterial,
    false,
    false
  );
  lockerInterior.visible = false;

  const anomalyDoor = new THREE.Group();
  anomalyDoor.name = 'locker-door-anomaly-pivot';
  anomalyDoor.position.set(MAIN_HALF_WIDTH - 0.51, 0, 1.82);
  anomalyDoor.visible = false;
  lockerGroup.add(anomalyDoor);
  addBox(anomalyDoor, 'locker-door-anomaly-panel', [0.035, 1.45, 0.42], [0, 0.93, 0.21], doorMaterial);
  addBox(anomalyDoor, 'locker-door-anomaly-handle', [0.035, 0.2, 0.025], [-0.035, 1.05, 0.06], handleMaterial);
  for (let index = 0; index < 4; index += 1) {
    addBox(
      anomalyDoor,
      `locker-door-anomaly-vent-${index}`,
      [0.012, 0.012, 0.16],
      [-0.024, 1.34 - index * 0.055, 0.27],
      handleMaterial,
      false,
      false
    );
  }

  const importedBank = new THREE.Group();
  importedBank.name = 'locker-bank-imported';
  importedBank.position.set(MAIN_HALF_WIDTH - 0.28, 0, 2.03);
  lockerGroup.add(importedBank);

  loadModelInto(`${MODEL_ROOT}/locker-bank.glb`, importedBank, fallback, {
    rotation: new THREE.Euler(-Math.PI / 2, Math.PI / 2, 0),
    fitSize: new THREE.Vector3(0.48, 1.86, 1.48),
    fitAxes: ['y', 'z'],
    center: new THREE.Vector3(0, 0.96, 0)
  });
  snapshotTransform(anomalyDoor, snapshots);

  return {
    lockerDoor: anomalyDoor,
    lockerInterior,
    lockerInteriorMaterial
  };
}

function addClock(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'clockHourPivot' | 'clockMinutePivot' | 'clockSecondPivot' | 'clockSecondMaterial'> {
  const clockGroup = new THREE.Group();
  clockGroup.name = 'wall-clock';
  clockGroup.position.set(-MAIN_HALF_WIDTH + 0.04, WALL_HEIGHT - 0.68, 3.7);
  clockGroup.scale.setScalar(0.78);
  root.add(clockGroup);

  const clockPlane = new THREE.Group();
  clockPlane.rotation.y = Math.PI / 2;
  clockGroup.add(clockPlane);

  const clockFace = new THREE.Group();
  clockFace.name = 'wall-clock-face';
  clockPlane.add(clockFace);

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 56),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createClockFaceTexture(),
      roughness: 0.68,
      metalness: 0.01
    })
  );
  face.position.z = 0.006;
  clockFace.add(face);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.026, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0x3c2b21, roughness: 0.48, metalness: 0.08 })
  );
  rim.position.z = 0.018;
  clockFace.add(rim);

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.322, 56),
    new THREE.MeshPhysicalMaterial({
      color: 0xf8ffff,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      transmission: 0.25,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08
    })
  );
  glass.position.z = 0.027;
  clockFace.add(glass);

  const tickMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2623, roughness: 0.58 });
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(index % 3 === 0 ? 0.018 : 0.011, 0.052, 0.01), tickMaterial);
    tick.position.set(Math.sin(angle) * 0.27, Math.cos(angle) * 0.27, 0.026);
    tick.rotation.z = -angle;
    clockFace.add(tick);
  }

  const hourPivot = new THREE.Object3D();
  const minutePivot = new THREE.Object3D();
  const secondPivot = new THREE.Object3D();
  clockPlane.add(hourPivot, minutePivot, secondPivot);

  const handMaterial = new THREE.MeshStandardMaterial({ color: 0x111715, roughness: 0.42 });
  const clockSecondMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c1410,
    emissive: 0x450605,
    emissiveIntensity: 0,
    roughness: 0.35
  });

  const hourHand = createClockHand(0.15, 0.032, handMaterial);
  const minuteHand = createClockHand(0.24, 0.022, handMaterial);
  const secondHand = createClockHand(0.28, 0.012, clockSecondMaterial);
  hourPivot.add(hourHand);
  minutePivot.add(minuteHand);
  secondPivot.add(secondHand);

  hourPivot.rotation.z = THREE.MathUtils.degToRad(-98.5);
  minutePivot.rotation.z = THREE.MathUtils.degToRad(-102);
  secondPivot.visible = false;
  snapshotTransform(hourPivot, snapshots);
  snapshotTransform(minutePivot, snapshots);
  snapshotTransform(secondPivot, snapshots);

  return {
    clockHourPivot: hourPivot,
    clockMinutePivot: minutePivot,
    clockSecondPivot: secondPivot,
    clockSecondMaterial
  };
}

function createClockHand(length: number, width: number, material: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.014), material);
  hand.position.y = length / 2;
  hand.position.z = 0.034;
  pivot.add(hand);
  return pivot;
}

function createClockFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create clock face canvas context.');
  }

  context.fillStyle = '#f3f0df';
  context.beginPath();
  context.arc(256, 256, 240, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#221f1b';
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = '#171715';
  context.font = '700 42px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let hour = 1; hour <= 12; hour += 1) {
    const angle = (hour / 12) * Math.PI * 2;
    context.fillText(String(hour), 256 + Math.sin(angle) * 168, 256 - Math.cos(angle) * 168 + 2);
  }

  context.strokeStyle = '#1b1b18';
  context.lineWidth = 4;
  for (let minute = 0; minute < 60; minute += 1) {
    const angle = (minute / 60) * Math.PI * 2;
    const outer = 222;
    const inner = minute % 5 === 0 ? 204 : 214;
    context.beginPath();
    context.moveTo(256 + Math.sin(angle) * inner, 256 - Math.cos(angle) * inner);
    context.lineTo(256 + Math.sin(angle) * outer, 256 - Math.cos(angle) * outer);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addSecurityCamera(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'securityCameraHead' | 'securityCameraLensMaterial'> {
  const mountMaterial = createCleanMetalMaterial(0x4d5651, 0.35);
  const bodyMaterial = createCleanMetalMaterial(0xb8c1bb, 0.18);
  const securityCameraLensMaterial = new THREE.MeshStandardMaterial({
    color: 0x07100e,
    emissive: 0x001a0e,
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0.08
  });

  const cameraRoot = new THREE.Group();
  cameraRoot.name = 'security-camera';
  cameraRoot.position.set(MAIN_HALF_WIDTH - 0.26, WALL_HEIGHT - 0.54, -3.75);
  root.add(cameraRoot);

  addBox(cameraRoot, 'camera-mount', [0.22, 0.28, 0.22], [0.18, 0.16, 0], mountMaterial);

  const head = new THREE.Group();
  head.position.set(-0.06, -0.05, 0);
  cameraRoot.add(head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.44), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  head.add(body);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24), securityCameraLensMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.25;
  head.add(lens);

  head.lookAt(new THREE.Vector3(0, 1.5, -9));
  snapshotTransform(head, snapshots);

  return {
    securityCameraHead: head,
    securityCameraLensMaterial
  };
}

function addVent(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'ventCover' | 'ventDarkness'> {
  const frameMaterial = createCleanMetalMaterial(0x8c9790, 0.25);
  const darknessMaterial = new THREE.MeshStandardMaterial({
    color: 0x010202,
    emissive: 0x010202,
    roughness: 1
  });

  const ventGroup = new THREE.Group();
  ventGroup.name = 'ceiling-vent';
  ventGroup.position.set(-8, WALL_HEIGHT - 0.06, -15.05);
  root.add(ventGroup);

  const ventDarkness = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.025, 0.72), darknessMaterial);
  ventDarkness.position.y = -0.018;
  ventGroup.add(ventDarkness);

  const cover = new THREE.Group();
  cover.name = 'vent-cover';
  ventGroup.add(cover);

  addBox(cover, 'vent-frame', [1.08, 0.035, 0.84], [0, 0, 0], frameMaterial, true, false);
  for (let index = 0; index < 5; index += 1) {
    addBox(cover, `vent-slat-${index}`, [0.08, 0.045, 0.72], [-0.32 + index * 0.16, -0.022, 0], frameMaterial);
  }

  snapshotTransform(cover, snapshots);

  return {
    ventCover: cover,
    ventDarkness
  };
}

function addMismatchTile(root: THREE.Group): THREE.Mesh {
  const tile = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.035, 0.92),
    new THREE.MeshStandardMaterial({ color: 0x505951, roughness: 0.94, metalness: 0.01 })
  );
  tile.name = 'mismatched-floor-tile';
  tile.position.set(0.46, 0.014, -4.4);
  tile.receiveShadow = true;
  tile.visible = false;
  root.add(tile);
  return tile;
}

function addExitGlow(root: THREE.Group): THREE.Mesh {
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 2.55, 0.04),
    new THREE.MeshBasicMaterial({
      color: 0xb9e4b4,
      transparent: true,
      opacity: 0.18
    })
  );
  glow.name = 'exit-glow';
  glow.position.set(-TRANSITION_CONNECTOR_X_MAX, WALL_CENTER_Y, -TRANSITION_CONNECTOR_CENTER_Z);
  glow.visible = false;
  root.add(glow);
  return glow;
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  castShadow = true,
  receiveShadow = true
): THREE.Mesh {
  const geometry = createBoxGeometry(size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

function createBoxGeometry(size: [number, number, number]): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(...size);
  applyBoxUvScale(geometry, getBoxSurfaceScale(size));
  const uv = geometry.getAttribute('uv');
  geometry.setAttribute('uv2', uv.clone());
  return geometry;
}

function getBoxSurfaceScale([width, height, depth]: [number, number, number]): BoxSurfaceScale {
  const wallScale = 3.6;
  const floorScale = 2.2;

  return {
    px: [depth / wallScale, height / wallScale],
    nx: [depth / wallScale, height / wallScale],
    py: [width / floorScale, depth / floorScale],
    ny: [width / floorScale, depth / floorScale],
    pz: [width / wallScale, height / wallScale],
    nz: [width / wallScale, height / wallScale]
  };
}

function applyBoxUvScale(geometry: THREE.BoxGeometry, scale: BoxSurfaceScale): void {
  const uv = geometry.getAttribute('uv');
  const scales = [scale.px, scale.nx, scale.py, scale.ny, scale.pz, scale.nz];

  for (const [faceIndex, [uScale, vScale]] of scales.entries()) {
    const offset = faceIndex * 4;
    uv.setXY(offset, 0, vScale);
    uv.setXY(offset + 1, uScale, vScale);
    uv.setXY(offset + 2, 0, 0);
    uv.setXY(offset + 3, uScale, 0);
  }

  uv.needsUpdate = true;
}
