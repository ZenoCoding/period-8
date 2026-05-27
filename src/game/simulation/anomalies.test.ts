import { describe, expect, it } from 'vitest';
import { ACTIVE_ANOMALY_IDS, selectEncounterForPeriod } from './anomalies';

function randomSequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe('anomaly encounter picker', () => {
  it('never starts Period 0 with an anomaly', () => {
    const selection = selectEncounterForPeriod({
      periodIndex: 0,
      random: randomSequence([0])
    });

    expect(selection.anomalyId).toBeNull();
    expect(selection.chance).toBe(0);
  });

  it('uses near-50/50 rolls after Period 0', () => {
    const clean = selectEncounterForPeriod({
      periodIndex: 1,
      encounterHistory: [null],
      random: randomSequence([0.99])
    });
    const anomaly = selectEncounterForPeriod({
      periodIndex: 1,
      encounterHistory: [null],
      random: randomSequence([0.01, 0])
    });

    expect(clean.anomalyId).toBeNull();
    expect(anomaly.anomalyId).toBe(ACTIVE_ANOMALY_IDS[0]);
  });

  it('forces an anomaly after two clean periods', () => {
    const selection = selectEncounterForPeriod({
      periodIndex: 2,
      encounterHistory: [null, null],
      random: randomSequence([0.99, 0])
    });

    expect(selection.anomalyId).toBe(ACTIVE_ANOMALY_IDS[0]);
  });

  it('prevents exact repeats from the last three anomaly appearances', () => {
    const selection = selectEncounterForPeriod({
      periodIndex: 5,
      encounterHistory: [null, 'locker-count-missing', null, 'clock-wrong', null, 'camera-tracking'],
      recentAnomalyIds: ['camera-tracking', 'clock-wrong', 'locker-count-missing'],
      random: randomSequence([0.01, 0])
    });

    expect(selection.anomalyId).not.toBe('locker-count-missing');
    expect(selection.anomalyId).not.toBe('clock-wrong');
    expect(selection.anomalyId).not.toBe('camera-tracking');
  });

  it('keeps retired anomalies out of random rotation', () => {
    expect(ACTIVE_ANOMALY_IDS).not.toContain('tile-mismatch');
  });
});
