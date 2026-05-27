export type AnomalyId =
  | 'locker-count-missing'
  | 'clock-wrong'
  | 'camera-tracking'
  | 'vent-open'
  | 'light-failure'
  | 'bulletin-board'
  | 'man-staring'
  | 'man-face-missing'
  | 'red-flood'
  | 'door-label-wrong'
  | 'door-handle-centered'
  | 'ceiling-stain-face'
  | 'yellow-lights'
  | 'floor-extra-tile'
  | 'poster-eyes'
  | 'poster-face-wrong';

export type AnomalySubtlety = 'obvious' | 'medium' | 'subtle';
export type AnomalyCategory = 'environment' | 'prop' | 'person' | 'light' | 'threat';

export interface AnomalyDefinition {
  id: AnomalyId;
  label: string;
  target:
    | 'locker'
    | 'clock'
    | 'security-camera'
    | 'vent'
    | 'light'
    | 'floor-tile'
    | 'bulletin-board'
    | 'hallway-figure'
    | 'floor-threat'
    | 'classroom-door'
    | 'ceiling'
    | 'poster';
  subtlety: AnomalySubtlety;
  category: AnomalyCategory;
  weight: number;
  minPeriod?: number;
  maxPerRun?: number;
  normalState: string;
  anomalousState: string;
  timedThreatSeconds?: number;
}

export const ANOMALIES: AnomalyDefinition[] = [
  {
    id: 'locker-count-missing',
    label: 'Locker count missing',
    target: 'locker',
    subtlety: 'subtle',
    category: 'environment',
    weight: 1.15,
    normalState: 'Nine lockers sit in an even row on the right wall.',
    anomalousState: 'One locker is missing; only eight remain.'
  },
  {
    id: 'clock-wrong',
    label: 'Clock hands displaced',
    target: 'clock',
    subtlety: 'medium',
    category: 'prop',
    weight: 1.1,
    normalState: 'The wall clock reads 03:17.',
    anomalousState: 'The wall clock hands are slightly wrong and the second hand will not behave.'
  },
  {
    id: 'camera-tracking',
    label: 'Security camera tracking',
    target: 'security-camera',
    subtlety: 'medium',
    category: 'prop',
    weight: 1,
    normalState: 'The security camera points down the hall.',
    anomalousState: 'The security camera turns to follow the player.'
  },
  {
    id: 'vent-open',
    label: 'Vent cover shifted',
    target: 'vent',
    subtlety: 'subtle',
    category: 'environment',
    weight: 1,
    normalState: 'The ceiling vent is aligned with its frame.',
    anomalousState: 'The vent cover is slightly pulled open.'
  },
  {
    id: 'light-failure',
    label: 'Fluorescent light failed',
    target: 'light',
    subtlety: 'obvious',
    category: 'light',
    weight: 0.42,
    minPeriod: 3,
    maxPerRun: 1,
    normalState: 'Every fluorescent light hums evenly.',
    anomalousState: 'The fluorescent lights flicker out after the player enters.'
  },
  {
    id: 'bulletin-board',
    label: 'Bulletin board changed',
    target: 'bulletin-board',
    subtlety: 'medium',
    category: 'prop',
    weight: 1,
    normalState: 'The bulletin board is covered in ordinary school notices.',
    anomalousState: 'The bulletin board notices have been replaced with impossible school notices.'
  },
  {
    id: 'man-staring',
    label: 'Severed head watching',
    target: 'hallway-figure',
    subtlety: 'obvious',
    category: 'person',
    weight: 0.62,
    minPeriod: 2,
    maxPerRun: 1,
    normalState: 'The walking man passes through the side hall.',
    anomalousState: 'The walking man keeps his cut head turned toward the player.'
  },
  {
    id: 'man-face-missing',
    label: 'Walking man without a face',
    target: 'hallway-figure',
    subtlety: 'medium',
    category: 'person',
    weight: 0.74,
    minPeriod: 2,
    maxPerRun: 1,
    normalState: 'The walking man has a normal face.',
    anomalousState: 'The walking man has skin-colored blank eyes and face detail.'
  },
  {
    id: 'red-flood',
    label: 'Red flood ahead',
    target: 'floor-threat',
    subtlety: 'obvious',
    category: 'threat',
    weight: 0.34,
    minPeriod: 4,
    maxPerRun: 1,
    normalState: 'The floor is dry.',
    anomalousState: 'Red liquid crashes in from the far end of the hallway.',
    timedThreatSeconds: 9.5
  },
  {
    id: 'door-label-wrong',
    label: 'Classroom label changed',
    target: 'classroom-door',
    subtlety: 'subtle',
    category: 'environment',
    weight: 1,
    normalState: 'The classroom door label is ordinary.',
    anomalousState: 'One classroom label has the wrong room number.'
  },
  {
    id: 'door-handle-centered',
    label: 'Centered door handle',
    target: 'classroom-door',
    subtlety: 'medium',
    category: 'environment',
    weight: 0.9,
    normalState: 'The classroom handle sits near the latch edge.',
    anomalousState: 'A classroom handle sits in the center of the door.'
  },
  {
    id: 'ceiling-stain-face',
    label: 'Ceiling stain face',
    target: 'ceiling',
    subtlety: 'subtle',
    category: 'environment',
    weight: 1.05,
    normalState: 'The ceiling is clean except for ordinary seams.',
    anomalousState: 'A faint face-like stain appears on the ceiling.'
  },
  {
    id: 'yellow-lights',
    label: 'Yellow fluorescent lights',
    target: 'light',
    subtlety: 'subtle',
    category: 'light',
    weight: 1,
    normalState: 'The fluorescent lights are cold white.',
    anomalousState: 'The fluorescent lights shift to a sickly yellow.'
  },
  {
    id: 'floor-extra-tile',
    label: 'Extra floor tile strip',
    target: 'floor-tile',
    subtlety: 'subtle',
    category: 'environment',
    weight: 1,
    normalState: 'The floor tile grid is uniform.',
    anomalousState: 'An extra tile strip interrupts the floor grid.'
  },
  {
    id: 'poster-eyes',
    label: 'Poster eyes tracking',
    target: 'poster',
    subtlety: 'subtle',
    category: 'prop',
    weight: 0.82,
    minPeriod: 2,
    maxPerRun: 1,
    normalState: 'The hallway poster characters have fixed printed eyes.',
    anomalousState: 'One poster character subtly watches the player.'
  },
  {
    id: 'poster-face-wrong',
    label: 'Poster face warped',
    target: 'poster',
    subtlety: 'medium',
    category: 'prop',
    weight: 0.74,
    minPeriod: 2,
    maxPerRun: 1,
    normalState: 'The hallway poster faces are clean printed art.',
    anomalousState: 'One poster face is slightly warped without changing the rest of the print.'
  }
];

export const ANOMALY_BY_ID = new Map(ANOMALIES.map((anomaly) => [anomaly.id, anomaly]));

export const ACTIVE_ANOMALY_IDS: readonly AnomalyId[] = [
  'locker-count-missing',
  'clock-wrong',
  'camera-tracking',
  'vent-open',
  'light-failure',
  'bulletin-board',
  'man-staring',
  'man-face-missing',
  'red-flood',
  'door-label-wrong',
  'door-handle-centered',
  'ceiling-stain-face',
  'yellow-lights',
  'floor-extra-tile',
  'poster-eyes',
  'poster-face-wrong'
];

type RandomSource = () => number;

const MAX_RECENT_ANOMALY_REPEAT_WINDOW = 3;
const BASE_ANOMALY_CHANCE = 0.5;
const MAX_ANOMALY_CHANCE = 0.7;

export interface EncounterSelectionContext {
  periodIndex: number;
  failCount?: number;
  encounterHistory?: readonly (AnomalyId | null)[];
  recentAnomalyIds?: readonly AnomalyId[];
  usedAnomalyCounts?: Partial<Record<AnomalyId, number>>;
  random?: RandomSource;
}

export interface EncounterSelection {
  anomalyId: AnomalyId | null;
  chance: number;
  roll: number;
}

export function pickEncounterForLoop(
  loopIndex: number,
  failCount = 0,
  random: RandomSource = Math.random
): AnomalyId | null {
  return selectEncounterForPeriod({
    periodIndex: loopIndex,
    failCount,
    random
  }).anomalyId;
}

export function selectEncounterForPeriod(context: EncounterSelectionContext): EncounterSelection {
  const {
    periodIndex,
    failCount = 0,
    encounterHistory = [],
    recentAnomalyIds = [],
    usedAnomalyCounts = {},
    random = Math.random
  } = context;

  if (periodIndex <= 0) {
    return {
      anomalyId: null,
      chance: 0,
      roll: 1
    };
  }

  const chance = getEncounterChance(failCount);
  const roll = random();
  const recentEncounters = encounterHistory.slice(-2);
  const hasTwoClean = recentEncounters.length >= 2 && recentEncounters.every((anomalyId) => anomalyId === null);
  const hasTwoAnomalies = recentEncounters.length >= 2 && recentEncounters.every((anomalyId) => anomalyId !== null);
  const shouldHaveAnomaly = hasTwoClean || (!hasTwoAnomalies && roll < chance);
  const anomalyId = shouldHaveAnomaly
    ? pickWeightedAnomaly(periodIndex, failCount, recentAnomalyIds, usedAnomalyCounts, random)
    : null;

  return {
    anomalyId,
    chance,
    roll
  };
}

export function getEncounterChance(failCount: number): number {
  return Math.min(MAX_ANOMALY_CHANCE, BASE_ANOMALY_CHANCE + Math.max(0, failCount) * 0.05);
}

function pickWeightedAnomaly(
  periodIndex: number,
  failCount: number,
  recentAnomalyIds: readonly AnomalyId[],
  usedAnomalyCounts: Partial<Record<AnomalyId, number>>,
  random: RandomSource
): AnomalyId {
  const recentBlocked = new Set(recentAnomalyIds.slice(-MAX_RECENT_ANOMALY_REPEAT_WINDOW));
  const weighted = ACTIVE_ANOMALY_IDS
    .map((id) => ANOMALY_BY_ID.get(id))
    .filter((anomaly): anomaly is AnomalyDefinition => Boolean(anomaly))
    .filter((anomaly) => periodIndex >= (anomaly.minPeriod ?? 1))
    .filter((anomaly) => (usedAnomalyCounts[anomaly.id] ?? 0) < (anomaly.maxPerRun ?? Number.POSITIVE_INFINITY))
    .filter((anomaly) => !recentBlocked.has(anomaly.id));

  const candidates = weighted.length > 0
    ? weighted
    : ACTIVE_ANOMALY_IDS.map((id) => ANOMALY_BY_ID.get(id)).filter((anomaly): anomaly is AnomalyDefinition => Boolean(anomaly));
  const subtleBias = Math.min(0.32, Math.max(0, failCount) * 0.05 + Math.max(0, periodIndex - 4) * 0.035);
  const totalWeight = candidates.reduce((total, anomaly) => total + getWeightedAnomalyChance(anomaly, subtleBias), 0);
  let roll = random() * totalWeight;

  for (const anomaly of candidates) {
    roll -= getWeightedAnomalyChance(anomaly, subtleBias);
    if (roll <= 0) {
      return anomaly.id;
    }
  }

  return candidates[candidates.length - 1].id;
}

function getWeightedAnomalyChance(anomaly: AnomalyDefinition, subtleBias: number): number {
  const subtletyBoost =
    anomaly.subtlety === 'subtle' ? subtleBias :
    anomaly.subtlety === 'medium' ? subtleBias * 0.45 :
    -subtleBias * 0.35;
  return Math.max(0.05, anomaly.weight * (1 + subtletyBoost));
}
