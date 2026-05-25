export type AnomalyId =
  | 'locker-ajar'
  | 'clock-wrong'
  | 'camera-tracking'
  | 'vent-open'
  | 'light-failure'
  | 'tile-mismatch'
  | 'bulletin-board'
  | 'man-staring'
  | 'man-face-missing'
  | 'red-flood';

export type AnomalySubtlety = 'obvious' | 'medium' | 'subtle';

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
    | 'floor-threat';
  subtlety: AnomalySubtlety;
  normalState: string;
  anomalousState: string;
  timedThreatSeconds?: number;
}

export const ANOMALIES: AnomalyDefinition[] = [
  {
    id: 'locker-ajar',
    label: 'Locker door ajar',
    target: 'locker',
    subtlety: 'obvious',
    normalState: 'All locker doors are closed and flush.',
    anomalousState: 'The middle locker hangs open with a dark interior.'
  },
  {
    id: 'clock-wrong',
    label: 'Clock hands displaced',
    target: 'clock',
    subtlety: 'medium',
    normalState: 'The wall clock reads 03:17.',
    anomalousState: 'The clock reads 11:58 and the second hand is red.'
  },
  {
    id: 'camera-tracking',
    label: 'Security camera tracking',
    target: 'security-camera',
    subtlety: 'medium',
    normalState: 'The security camera points down the hall.',
    anomalousState: 'The security camera turns to follow the player.'
  },
  {
    id: 'vent-open',
    label: 'Vent cover shifted',
    target: 'vent',
    subtlety: 'subtle',
    normalState: 'The ceiling vent is aligned with its frame.',
    anomalousState: 'The vent cover is slightly pulled open.'
  },
  {
    id: 'light-failure',
    label: 'Fluorescent light failed',
    target: 'light',
    subtlety: 'obvious',
    normalState: 'Every fluorescent light hums evenly.',
    anomalousState: 'One light is dead and the nearby wall pulses faintly.'
  },
  {
    id: 'tile-mismatch',
    label: 'Floor tile mismatch',
    target: 'floor-tile',
    subtlety: 'subtle',
    normalState: 'The floor tile grid is uniform.',
    anomalousState: 'One floor tile is darker and raised by a few centimeters.'
  },
  {
    id: 'bulletin-board',
    label: 'Bulletin board rewritten',
    target: 'bulletin-board',
    subtlety: 'medium',
    normalState: 'The bulletin board is covered in ordinary school notices.',
    anomalousState: 'The bulletin board notices all repeat the same warning.'
  },
  {
    id: 'man-staring',
    label: 'Severed head watching',
    target: 'hallway-figure',
    subtlety: 'obvious',
    normalState: 'The side hallway is empty.',
    anomalousState: 'A detached head turns completely around to keep looking at the player.'
  },
  {
    id: 'man-face-missing',
    label: 'Hallway figure without a face',
    target: 'hallway-figure',
    subtlety: 'medium',
    normalState: 'The side hallway is empty.',
    anomalousState: 'A man stands still with a blank, unlit face.'
  },
  {
    id: 'red-flood',
    label: 'Red flood behind you',
    target: 'floor-threat',
    subtlety: 'obvious',
    normalState: 'The floor is dry.',
    anomalousState: 'Red liquid spreads from the starting side of the hallway.',
    timedThreatSeconds: 9.5
  }
];

export const ANOMALY_BY_ID = new Map(ANOMALIES.map((anomaly) => [anomaly.id, anomaly]));

export const ACTIVE_ANOMALY_IDS: readonly AnomalyId[] = [
  'locker-ajar',
  'clock-wrong',
  'camera-tracking',
  'vent-open',
  'light-failure',
  'bulletin-board',
  'man-staring',
  'man-face-missing',
  'red-flood'
];

type RandomSource = () => number;

const ENCOUNTER_SESSION_SEED = Math.floor(Math.random() * 0xffffffff);

export function pickEncounterForLoop(
  loopIndex: number,
  failCount = 0,
  random: RandomSource = Math.random
): AnomalyId | null {
  if (loopIndex <= 1) {
    return null;
  }

  const postStartLoopIndex = loopIndex - 2;
  const pairIndex = Math.floor(postStartLoopIndex / 2);
  const isSecondInPair = postStartLoopIndex % 2 === 1;
  const anomalySlotIsSecond = seededUnitRandom(ENCOUNTER_SESSION_SEED, failCount, pairIndex, 0) < 0.5;
  const shouldHaveAnomaly = isSecondInPair === anomalySlotIsSecond;

  if (!shouldHaveAnomaly) {
    return null;
  }

  const anomalyRoll = random();
  const anomalyIndex = Math.min(
    Math.floor(anomalyRoll * ACTIVE_ANOMALY_IDS.length),
    ACTIVE_ANOMALY_IDS.length - 1
  );
  return ACTIVE_ANOMALY_IDS[anomalyIndex];
}

function seededUnitRandom(seed: number, failCount: number, pairIndex: number, salt: number): number {
  let state = (
    seed ^
    Math.imul(failCount + 1, 0x85ebca6b) ^
    Math.imul(pairIndex + 1, 0xc2b2ae35) ^
    Math.imul(salt + 1, 0x27d4eb2f)
  ) >>> 0;

  state ^= state >>> 16;
  state = Math.imul(state, 0x7feb352d) >>> 0;
  state ^= state >>> 15;
  state = Math.imul(state, 0x846ca68b) >>> 0;
  state ^= state >>> 16;
  return state / 0x100000000;
}
