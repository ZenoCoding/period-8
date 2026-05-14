import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init();

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

export type TransitionSignSide = -1 | 1;
export type TransitionSignOutcome = 'idle' | 'correct' | 'wrong';

export interface TransitionSignHandle {
  root: THREE.Group;
  texture: THREE.CanvasTexture;
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
const FLOOR_Y = -0.05;
const CEILING_Y = WALL_HEIGHT + 0.05;
const POSITIVE_WALL_FACE_X = MAIN_HALF_WIDTH - 0.015;
const NEGATIVE_WALL_FACE_X = -MAIN_HALF_WIDTH + 0.015;

interface ShellOptions {
  walkableRects: BoundsRect[];
  transitionFrameSides: TransitionSignSide[];
  openMainPositiveSide: boolean;
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
  const wall = new THREE.MeshStandardMaterial({
    color: 0xfff7ed,
    roughness: 0.76,
    metalness: 0.01
  });
  const floor = new THREE.MeshStandardMaterial({
    color: 0xe7e9e2,
    roughness: 0.72,
    metalness: 0.02
  });
  const ceiling = new THREE.MeshStandardMaterial({
    color: 0xfffdf8,
    roughness: 0.78,
    metalness: 0.01
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xc7beb2,
    roughness: 0.6,
    metalness: 0.12
  });
  const environmentMaterials = { wall, floor, ceiling, trim };

  addHallwayShell(root, floor, wall, ceiling, trim, {
    walkableRects,
    transitionFrameSides: isQueuedNext ? [-1] : [-1, 1],
    openMainPositiveSide: isQueuedNext
  });
  addTileGrid(root, walkableRects);

  const ambientLight = new THREE.HemisphereLight(0xf4f9ff, 0xd8dee5, 1.05);
  if (!isQueuedNext) {
    scene.add(ambientLight);
  }

  const lightHandles = addFluorescentLights(root, 1);
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
  paintLevelSign(getTransitionSign(handles, side).texture, level, targetLoops, isEscaped, outcome);
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
  for (const rect of options.walkableRects) {
    const width = rect.xMax - rect.xMin;
    const depth = rect.zMax - rect.zMin;
    const x = (rect.xMin + rect.xMax) / 2;
    const z = (rect.zMin + rect.zMax) / 2;

    addBox(root, 'floor-panel', [width, 0.1, depth], [x, FLOOR_Y, z], floorMaterial, false, true);
    addBox(root, 'ceiling-panel', [width, 0.1, depth], [x, CEILING_Y, z], ceilingMaterial, false, false);
  }

  addBoundaryWalls(root, wallMaterial, trimMaterial, options);
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

function addTileGrid(root: THREE.Group, walkableRects: BoundsRect[]): void {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xa8afaa,
    transparent: true,
    opacity: 0.28
  });
  const positions: number[] = [];

  for (const rect of walkableRects) {
    for (let x = Math.ceil(rect.xMin); x <= Math.floor(rect.xMax); x += 1) {
      positions.push(x, 0.012, rect.zMin, x, 0.012, rect.zMax);
    }
    for (let z = Math.ceil(rect.zMin); z <= Math.floor(rect.zMax); z += 1) {
      positions.push(rect.xMin, 0.014, z, rect.xMax, 0.014, z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const grid = new THREE.LineSegments(geometry, lineMaterial);
  grid.name = 'floor-grid';
  root.add(grid);
}

function addFluorescentLights(
  root: THREE.Group,
  lightIntensityScale: number
): Pick<HallwayHandles, 'flickerLight' | 'flickerTubeMaterial'> {
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6fbff,
    emissive: 0xdbf0ff,
    emissiveIntensity: 1.85,
    roughness: 0.2
  });
  const dimTubeMaterial = tubeMaterial.clone();
  const lightSpecs = [
    { x: 0, z: 4.5, rotY: 0, intensity: 13.8 },
    { x: 0, z: -3.3, rotY: 0, intensity: 12.8 },
    { x: -4.8, z: -8, rotY: Math.PI / 2, intensity: 11.6 },
    { x: -8, z: -12.4, rotY: 0, intensity: 12.2 },
    { x: -3.8, z: -16, rotY: Math.PI / 2, intensity: 10.8 },
    { x: 0, z: -21.2, rotY: 0, intensity: 10.4 }
  ];

  let flickerLight = new THREE.RectAreaLight(0xe2f2ff, 11.6 * lightIntensityScale, 0.34, 1.78);

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
      new THREE.MeshStandardMaterial({ color: 0xd7dce0, roughness: 0.58, metalness: 0.16 })
    );
    fixture.position.y = 0.035;
    group.add(fixture);

    const isRotated = Math.abs(spec.rotY) > 0.01;
    const light = new THREE.RectAreaLight(
      0xe2f2ff,
      spec.intensity * lightIntensityScale,
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
    mismatchTile: anomalyTile,
    exitGlow,
    transitionSigns: {
      negative: negativeTransitionSign,
      positive: positiveTransitionSign
    }
  };
}

function getTransitionSignPosition(side: TransitionSignSide): THREE.Vector3 {
  return new THREE.Vector3(side * 14.57, 1.62, side * 20.1);
}

function getTransitionSignRotation(side: TransitionSignSide): number {
  return side * Math.PI / 2;
}

function addClassroomDoors(root: THREE.Group): void {
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8c7aa,
    roughness: 0.58,
    metalness: 0.02
  });
  const doorFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c8175,
    roughness: 0.54,
    metalness: 0.12
  });
  const darkRoomMaterial = new THREE.MeshStandardMaterial({
    color: 0x050607,
    emissive: 0x020303,
    emissiveIntensity: 0.06,
    roughness: 0.94,
    metalness: 0.02
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f2a31,
    emissive: 0x020406,
    emissiveIntensity: 0.18,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.86
  });
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xcab77a,
    roughness: 0.34,
    metalness: 0.52
  });

  addClassroomDoor(root, {
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
  addClassroomDoor(root, {
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
  addBox(
    leaf,
    `${options.name}-window-glass`,
    [windowWidth * 0.9, windowHeight * 0.9, 0.006],
    [0, windowCenterY, 0.002],
    options.glassMaterial,
    false,
    false
  );
  addBox(leaf, `${options.name}-handle`, [0.055, 0.055, 0.055], [0.39, 1.0, 0.042], options.handleMaterial);

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
  const texture = createLevelSignTexture();
  const signMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.58,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b514e,
    roughness: 0.5,
    metalness: 0.18
  });

  const sign = new THREE.Group();
  sign.name = options.name;
  sign.position.copy(options.position);
  sign.rotation.y = options.rotationY;
  sign.visible = false;
  root.add(sign);

  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.86), signMaterial);
  board.name = `${options.name}-face`;
  board.position.z = 0.022;
  sign.add(board);

  addRectangularFrame(sign, `${options.name}-frame`, {
    outerWidth: 1.32,
    outerHeight: 0.98,
    thickness: 0.055,
    depth: 0.035,
    bottom: -0.49,
    z: 0,
    material: frameMaterial
  });

  return { root: sign, texture };
}

function createLevelSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  paintLevelSign(texture, 1, 8, false, 'idle');
  return texture;
}

function paintLevelSign(
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

  const count = THREE.MathUtils.clamp(level, 1, targetLoops);
  const status = getTransitionSignStatus(outcome, isEscaped);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = outcome === 'wrong' ? '#efe6df' : '#f3f0df';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = outcome === 'wrong' ? '#351b17' : '#222927';
  context.lineWidth = 22;
  context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  context.strokeStyle = outcome === 'wrong' ? '#b86b5e' : '#b7ad8f';
  context.lineWidth = 4;
  context.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

  context.fillStyle = outcome === 'wrong' ? '#3a1512' : '#171c1b';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 58px Arial, sans-serif';
  context.fillText('IF YOU SEE AN ANOMALY', canvas.width / 2, 110);
  context.fillText('TURN BACK', canvas.width / 2, 172);
  context.font = '700 52px Arial, sans-serif';
  context.fillText('IF NOT, KEEP GOING', canvas.width / 2, 248);
  context.font = '800 94px Arial, sans-serif';
  context.fillText(status, canvas.width / 2, 348);
  context.font = '800 70px Arial, sans-serif';
  context.fillText(isEscaped ? 'EXIT' : `LEVEL ${count}`, canvas.width / 2, 420);
  context.font = '700 34px Arial, sans-serif';
  context.fillText(isEscaped ? 'THE REPETITION BREAKS' : `${count} / ${targetLoops}`, canvas.width / 2, 466);

  texture.needsUpdate = true;
}

function getTransitionSignStatus(outcome: TransitionSignOutcome, isEscaped: boolean): string {
  if (isEscaped) {
    return 'SUCCESS';
  }

  if (outcome === 'wrong') {
    return 'ERROR';
  }

  if (outcome === 'correct') {
    return 'SUCCESS';
  }

  return 'READY';
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

function addLockers(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'lockerDoor' | 'lockerInterior' | 'lockerInteriorMaterial'> {
  const lockerGroup = new THREE.Group();
  lockerGroup.name = 'lockers';
  root.add(lockerGroup);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x244f83, roughness: 0.52, metalness: 0.22 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x3577b6, roughness: 0.5, metalness: 0.18 });
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.42, metalness: 0.38 });
  const lockerInteriorMaterial = new THREE.MeshStandardMaterial({
    color: 0x060707,
    emissive: 0x050202,
    roughness: 1
  });

  let anomalyDoor: THREE.Object3D = new THREE.Object3D();
  let lockerInterior: THREE.Mesh = new THREE.Mesh();

  for (let index = 0; index < 3; index += 1) {
    const z = 2.85 - index * 0.82;
    addBox(lockerGroup, `locker-body-${index}`, [0.48, 1.62, 0.72], [MAIN_HALF_WIDTH - 0.28, 0.86, z], bodyMaterial);
    const interior = addBox(
      lockerGroup,
      `locker-interior-${index}`,
      [0.04, 1.44, 0.58],
      [MAIN_HALF_WIDTH - 0.54, 0.92, z],
      lockerInteriorMaterial,
      false,
      false
    );
    const door = addBox(lockerGroup, `locker-door-${index}`, [0.045, 1.45, 0.61], [MAIN_HALF_WIDTH - 0.57, 0.93, z], doorMaterial);
    addBox(lockerGroup, `locker-handle-${index}`, [0.04, 0.18, 0.035], [MAIN_HALF_WIDTH - 0.61, 1.05, z - 0.21], handleMaterial);

    if (index === 1) {
      anomalyDoor = door;
      lockerInterior = interior;
      snapshotTransform(anomalyDoor, snapshots);
    }
  }

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

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 56),
    new THREE.MeshStandardMaterial({ color: 0xe4e6d9, roughness: 0.72, metalness: 0.02 })
  );
  face.position.z = 0.006;
  clockPlane.add(face);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.018, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x2d3430, roughness: 0.5, metalness: 0.2 })
  );
  rim.position.z = 0.018;
  clockPlane.add(rim);

  const tickMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2623, roughness: 0.58 });
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(index % 3 === 0 ? 0.018 : 0.011, 0.052, 0.01), tickMaterial);
    tick.position.set(Math.sin(angle) * 0.27, Math.cos(angle) * 0.27, 0.026);
    tick.rotation.z = -angle;
    clockPlane.add(tick);
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

function addSecurityCamera(
  root: THREE.Group,
  snapshots: Map<THREE.Object3D, TransformSnapshot>
): Pick<HallwayHandles, 'securityCameraHead' | 'securityCameraLensMaterial'> {
  const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5651, roughness: 0.62, metalness: 0.22 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c1bb, roughness: 0.47, metalness: 0.08 });
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
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x8c9790, roughness: 0.68, metalness: 0.14 });
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
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}
