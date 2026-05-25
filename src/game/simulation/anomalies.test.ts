import { describe, expect, it } from 'vitest';
import { ACTIVE_ANOMALY_IDS, pickEncounterForLoop } from './anomalies';

function randomSequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe('anomaly encounter picker', () => {
  it('never starts the first hallway with an anomaly', () => {
    expect(pickEncounterForLoop(1, 0, randomSequence([0.99, 0.99]))).toBeNull();
  });

  it('balances each two-loop pair to one normal and one anomaly', () => {
    const pair = [
      pickEncounterForLoop(2, 0, randomSequence([0])),
      pickEncounterForLoop(3, 0, randomSequence([0]))
    ];

    expect(pair.filter(Boolean)).toHaveLength(1);
    expect(pair).toContain(null);
  });

  it('uses the random roll to choose the active anomaly inside the anomaly slot', () => {
    const firstAnomalyPair = [
      pickEncounterForLoop(2, 0, randomSequence([0])),
      pickEncounterForLoop(3, 0, randomSequence([0]))
    ];
    const lastAnomalyPair = [
      pickEncounterForLoop(2, 0, randomSequence([0.999])),
      pickEncounterForLoop(3, 0, randomSequence([0.999]))
    ];

    expect(firstAnomalyPair.find(Boolean)).toBe(ACTIVE_ANOMALY_IDS[0]);
    expect(lastAnomalyPair.find(Boolean)).toBe(ACTIVE_ANOMALY_IDS[ACTIVE_ANOMALY_IDS.length - 1]);
  });

  it('keeps retired anomalies out of random rotation', () => {
    expect(ACTIVE_ANOMALY_IDS).not.toContain('tile-mismatch');
  });
});
