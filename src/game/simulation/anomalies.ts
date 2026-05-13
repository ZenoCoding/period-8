export type AnomalyId =
  | 'locker-ajar'
  | 'clock-wrong'
  | 'camera-tracking'
  | 'vent-open'
  | 'light-failure'
  | 'tile-mismatch';

export type AnomalySubtlety = 'obvious' | 'medium' | 'subtle';

export interface AnomalyDefinition {
  id: AnomalyId;
  label: string;
  target: 'locker' | 'clock' | 'security-camera' | 'vent' | 'light' | 'floor-tile';
  subtlety: AnomalySubtlety;
  normalState: string;
  anomalousState: string;
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
  }
];

export const ANOMALY_BY_ID = new Map(ANOMALIES.map((anomaly) => [anomaly.id, anomaly]));

const LOOP_SCRIPT: Array<AnomalyId | null> = [
  null,
  'locker-ajar',
  null,
  'clock-wrong',
  'camera-tracking',
  'vent-open',
  null,
  'light-failure',
  'tile-mismatch'
];

export function pickEncounterForLoop(loopIndex: number, failCount = 0): AnomalyId | null {
  if (loopIndex <= 1) {
    return null;
  }

  const scriptIndex = (loopIndex - 1 + failCount) % LOOP_SCRIPT.length;
  return LOOP_SCRIPT[scriptIndex];
}
