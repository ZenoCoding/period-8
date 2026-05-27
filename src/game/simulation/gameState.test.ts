import { describe, expect, it } from 'vitest';
import { createInitialGameState, resolvePortalTransition, resolveTimedAnomalyTimeout } from './gameState';
import type { GameState } from './types';

describe('hallway loop simulation', () => {
  it('advances when a normal hallway is exited forward', () => {
    const initial = createInitialGameState();

    const result = resolvePortalTransition(initial, 'forward');

    expect(result.wasCorrect).toBe(true);
    expect(initial.loopIndex).toBe(0);
    expect(result.state.loopIndex).toBe(1);
    expect(result.state.failCount).toBe(0);
    expect(result.state.encounterHistory).toHaveLength(2);
  });

  it('advances when an anomalous hallway is exited backward', () => {
    const anomalous: GameState = {
      ...createInitialGameState(),
      loopIndex: 2,
      currentAnomalyId: 'locker-count-missing',
      expectedAction: 'backward'
    };

    const result = resolvePortalTransition(anomalous, 'backward');

    expect(result.wasCorrect).toBe(true);
    expect(result.state.loopIndex).toBe(3);
    expect(result.state.lastOutcome).toBe('correct');
  });

  it('soft-resets and escalates ambience on a wrong direction', () => {
    const anomalous: GameState = {
      ...createInitialGameState(),
      loopIndex: 4,
      currentAnomalyId: 'clock-wrong',
      expectedAction: 'backward',
      ambienceLevel: 2
    };

    const result = resolvePortalTransition(anomalous, 'forward');

    expect(result.wasCorrect).toBe(false);
    expect(result.state.loopIndex).toBe(0);
    expect(result.state.failCount).toBe(1);
    expect(result.state.ambienceLevel).toBe(3);
    expect(result.state.lastOutcome).toBe('wrong');
  });

  it('escapes after the target loop is completed correctly', () => {
    const finalLoop: GameState = {
      ...createInitialGameState(),
      loopIndex: 7,
      targetLoops: 8,
      currentAnomalyId: null,
      expectedAction: 'forward'
    };

    const result = resolvePortalTransition(finalLoop, 'forward');

    expect(result.wasCorrect).toBe(true);
    expect(result.state.loopIndex).toBe(8);
    expect(result.state.phase).toBe('escaped');
    expect(result.state.lastOutcome).toBe('escaped');
  });

  it('soft-resets and escalates ambience when a timed anomaly catches the player', () => {
    const threatened: GameState = {
      ...createInitialGameState(),
      loopIndex: 7,
      currentAnomalyId: 'red-flood',
      expectedAction: 'backward',
      ambienceLevel: 1,
      streak: 5
    };

    const result = resolveTimedAnomalyTimeout(threatened);

    expect(result.loopIndex).toBe(0);
    expect(result.failCount).toBe(1);
    expect(result.ambienceLevel).toBe(2);
    expect(result.streak).toBe(0);
    expect(result.lastOutcome).toBe('wrong');
  });

  it('preserves recent anomaly history across resets', () => {
    const anomalous: GameState = {
      ...createInitialGameState(),
      loopIndex: 4,
      currentAnomalyId: 'clock-wrong',
      expectedAction: 'backward',
      recentAnomalyIds: ['clock-wrong', 'vent-open', 'yellow-lights']
    };

    const result = resolvePortalTransition(anomalous, 'forward');

    expect(result.state.loopIndex).toBe(0);
    expect(result.state.recentAnomalyIds).toEqual(['clock-wrong', 'vent-open', 'yellow-lights']);
  });
});
