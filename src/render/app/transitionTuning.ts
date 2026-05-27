import {
  WALKABLE_RECTS,
  type BoundsRect,
  MAIN_HALF_WIDTH,
  TRANSITION_BRANCH_X_MAX,
  TRANSITION_CONNECTOR_CENTER_Z,
  TRANSITION_ENTRY_Z_MIN,
  TRANSITION_ENTRY_Z_MAX
} from '../objects/hallway';
import type { TransitionSide } from './transitionController';

export interface TransitionSideTuning {
  commitX: number;
  commitZ: number;
  signX: number;
  signY: number;
  signZ: number;
  signRotationY: number;
}

export interface TransitionTuning {
  negative: TransitionSideTuning;
  positive: TransitionSideTuning;
}

export interface SignCaptureResult {
  tuning: TransitionTuning;
  wall: 'xMin' | 'xMax' | 'zMin' | 'zMax';
}

const STORAGE_KEY = 'repetition.transitionTuning.v5';
const SIGN_WALL_OFFSET = 0.07;

export const DEFAULT_TRANSITION_TUNING: TransitionTuning = {
  negative: {
    commitX: -(TRANSITION_BRANCH_X_MAX - 1.15),
    commitZ: -10.15,
    signX: -(TRANSITION_BRANCH_X_MAX + MAIN_HALF_WIDTH - 0.07),
    signY: 1.7,
    signZ: -(TRANSITION_CONNECTOR_CENTER_Z - 2.75),
    signRotationY: Math.PI / 2
  },
  positive: {
    commitX: TRANSITION_BRANCH_X_MAX - 1.15,
    commitZ: 10.15,
    signX: TRANSITION_BRANCH_X_MAX + MAIN_HALF_WIDTH - 0.07,
    signY: 1.7,
    signZ: TRANSITION_CONNECTOR_CENTER_Z - 2.75,
    signRotationY: -Math.PI / 2
  }
};

export function cloneTransitionTuning(tuning: TransitionTuning): TransitionTuning {
  return {
    negative: { ...tuning.negative },
    positive: { ...tuning.positive }
  };
}

export function loadTransitionTuning(): TransitionTuning {
  if (typeof window === 'undefined') {
    return cloneTransitionTuning(DEFAULT_TRANSITION_TUNING);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return cloneTransitionTuning(DEFAULT_TRANSITION_TUNING);
  }

  try {
    return normalizeTransitionTuning(JSON.parse(raw));
  } catch {
    return cloneTransitionTuning(DEFAULT_TRANSITION_TUNING);
  }
}

export function saveTransitionTuning(tuning: TransitionTuning): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
}

export function resetTransitionTuning(): TransitionTuning {
  const tuning = cloneTransitionTuning(DEFAULT_TRANSITION_TUNING);
  saveTransitionTuning(tuning);
  return tuning;
}

export function sideKey(side: TransitionSide): keyof TransitionTuning {
  return side < 0 ? 'negative' : 'positive';
}

export function isPastTunedCommitGate(
  tuning: TransitionTuning,
  side: TransitionSide,
  x: number,
  z: number
): boolean {
  void tuning;

  // If the player has already walked deep into the turn (Segment 2 or 3),
  // they are physically way past the commit line.
  if (side < 0) {
    if (x <= -TRANSITION_ENTRY_Z_MIN && z <= -TRANSITION_ENTRY_Z_MAX) {
      return true;
    }
  } else {
    if (x >= TRANSITION_ENTRY_Z_MIN && z >= TRANSITION_ENTRY_Z_MAX) {
      return true;
    }
  }

  // A slanted threshold line (slope 1.2) going from the inside corner to the top wall.
  // We mirror the formula for both sides: side * (z - 1.2 * x) <= thresholdLimit
  // The threshold limit is derived from the inner corner (TRANSITION_ENTRY_Z_MIN, TRANSITION_ENTRY_Z_MAX).
  // A margin of 0.28 is applied to shift the line closer to the main hallway (earlier trigger).
  const innerZMin = TRANSITION_ENTRY_Z_MIN;
  const innerZMax = TRANSITION_ENTRY_Z_MAX;
  const margin = 0.28;
  const thresholdLimit = innerZMax - 1.2 * innerZMin + margin;
  return side * (z - 1.2 * x) <= thresholdLimit;
}

export function captureCommitGate(
  tuning: TransitionTuning,
  side: TransitionSide,
  x: number,
  z: number
): TransitionTuning {
  const next = cloneTransitionTuning(tuning);
  next[sideKey(side)] = {
    ...next[sideKey(side)],
    commitX: roundTuningValue(x),
    commitZ: roundTuningValue(z)
  };
  saveTransitionTuning(next);
  return next;
}

export function captureSignPlacement(
  tuning: TransitionTuning,
  side: TransitionSide,
  x: number,
  y: number,
  z: number
): SignCaptureResult {
  const placement = getNearestWallPlacement(x, z);
  const next = cloneTransitionTuning(tuning);
  next[sideKey(side)] = {
    ...next[sideKey(side)],
    signX: roundTuningValue(placement.x),
    signY: roundTuningValue(y),
    signZ: roundTuningValue(placement.z),
    signRotationY: roundTuningValue(placement.rotationY)
  };
  saveTransitionTuning(next);
  return {
    tuning: next,
    wall: placement.wall
  };
}

export function getNearestTransitionSide(x: number, z: number): TransitionSide {
  const negativeDistance = distanceToSidePath(-1, x, z);
  const positiveDistance = distanceToSidePath(1, x, z);
  return negativeDistance <= positiveDistance ? -1 : 1;
}

export function formatTransitionTuning(tuning: TransitionTuning): string {
  const negative = tuning.negative;
  const positive = tuning.positive;
  
  const innerZMin = TRANSITION_ENTRY_Z_MIN;
  const innerZMax = TRANSITION_ENTRY_Z_MAX;
  const margin = 0.28;
  const thresholdLimit = innerZMax - 1.2 * innerZMin + margin;

  return [
    `Commit (slanted): side*(z - 1.2*x) <= ${formatNumber(thresholdLimit)} (margin: +${formatNumber(margin)})`,
    `Sign -: ${formatNumber(negative.signX)}, ${formatNumber(negative.signZ)} rot ${formatNumber(negative.signRotationY)}`,
    `Sign +: ${formatNumber(positive.signX)}, ${formatNumber(positive.signZ)} rot ${formatNumber(positive.signRotationY)}`
  ].join('\n');
}

function normalizeTransitionTuning(value: unknown): TransitionTuning {
  if (!isRecord(value)) {
    return cloneTransitionTuning(DEFAULT_TRANSITION_TUNING);
  }

  return {
    negative: normalizeSideTuning(value.negative, DEFAULT_TRANSITION_TUNING.negative),
    positive: normalizeSideTuning(value.positive, DEFAULT_TRANSITION_TUNING.positive)
  };
}

function normalizeSideTuning(value: unknown, fallback: TransitionSideTuning): TransitionSideTuning {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    commitX: finiteNumber(value.commitX, fallback.commitX),
    commitZ: finiteNumber(value.commitZ, fallback.commitZ),
    signX: finiteNumber(value.signX, fallback.signX),
    signY: finiteNumber(value.signY, fallback.signY),
    signZ: finiteNumber(value.signZ, fallback.signZ),
    signRotationY: finiteNumber(value.signRotationY, fallback.signRotationY)
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNearestWallPlacement(x: number, z: number): {
  x: number;
  z: number;
  rotationY: number;
  wall: SignCaptureResult['wall'];
} {
  const rect = getNearestWalkableRect(x, z);
  const clampedX = clamp(x, rect.xMin + SIGN_WALL_OFFSET, rect.xMax - SIGN_WALL_OFFSET);
  const clampedZ = clamp(z, rect.zMin + SIGN_WALL_OFFSET, rect.zMax - SIGN_WALL_OFFSET);
  const placements = [
    {
      distance: Math.abs(x - rect.xMin),
      x: rect.xMin + SIGN_WALL_OFFSET,
      z: clampedZ,
      rotationY: Math.PI / 2,
      wall: 'xMin' as const
    },
    {
      distance: Math.abs(x - rect.xMax),
      x: rect.xMax - SIGN_WALL_OFFSET,
      z: clampedZ,
      rotationY: -Math.PI / 2,
      wall: 'xMax' as const
    },
    {
      distance: Math.abs(z - rect.zMin),
      x: clampedX,
      z: rect.zMin + SIGN_WALL_OFFSET,
      rotationY: 0,
      wall: 'zMin' as const
    },
    {
      distance: Math.abs(z - rect.zMax),
      x: clampedX,
      z: rect.zMax - SIGN_WALL_OFFSET,
      rotationY: Math.PI,
      wall: 'zMax' as const
    }
  ];

  placements.sort((left, right) => left.distance - right.distance);
  const [placement] = placements;
  return placement;
}

function getNearestWalkableRect(x: number, z: number): BoundsRect {
  const containing = WALKABLE_RECTS.find(
    (rect) => x >= rect.xMin && x <= rect.xMax && z >= rect.zMin && z <= rect.zMax
  );
  if (containing) {
    return containing;
  }

  const [nearest] = [...WALKABLE_RECTS].sort((left, right) => {
    return distanceToRect(left, x, z) - distanceToRect(right, x, z);
  });
  return nearest;
}

function distanceToSidePath(side: TransitionSide, x: number, z: number): number {
  const sideRects = WALKABLE_RECTS.filter((rect) =>
    side < 0
      ? rect.xMax <= 1.5 && rect.zMin < -6
      : rect.xMin >= -1.5 && rect.zMax > 6
  );
  return Math.min(...sideRects.map((rect) => distanceToRect(rect, x, z)));
}

function distanceToRect(rect: BoundsRect, x: number, z: number): number {
  const dx = Math.max(rect.xMin - x, 0, x - rect.xMax);
  const dz = Math.max(rect.zMin - z, 0, z - rect.zMax);
  return Math.hypot(dx, dz);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTuningValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}
