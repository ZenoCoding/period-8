import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../game/simulation/gameState';
import type { GameState } from '../../game/simulation/types';
import {
  beginTransition,
  commitTransition,
  markTransitionPostCommit
} from './transitionController';

describe('transition controller', () => {
  it('enters pre-commit without changing game state', () => {
    const state = createInitialGameState();
    const activeTransition = beginTransition(-1);

    expect(activeTransition.phase).toBe('preCommit');
    expect(activeTransition.choice).toBe('forward');
    expect(activeTransition.committedState).toBeUndefined();
    expect(state.loopIndex).toBe(1);
    expect(state.streak).toBe(0);
  });

  it('increments only when a normal hallway is committed forward', () => {
    const state = createInitialGameState();
    const activeTransition = beginTransition(-1);

    expect(state.streak).toBe(0);

    const commit = commitTransition(state, activeTransition);
    const postCommit = markTransitionPostCommit(commit.activeTransition);

    expect(commit.result.wasCorrect).toBe(true);
    expect(commit.state.loopIndex).toBe(2);
    expect(commit.state.streak).toBe(1);
    expect(commit.signCount).toBe(1);
    expect(postCommit.phase).toBe('postCommit');
  });

  it('increments only when an anomalous hallway is committed backward', () => {
    const anomalous: GameState = {
      ...createInitialGameState(),
      loopIndex: 2,
      currentAnomalyId: 'locker-ajar',
      expectedAction: 'backward'
    };
    const activeTransition = beginTransition(1);

    const commit = commitTransition(anomalous, activeTransition);

    expect(commit.result.wasCorrect).toBe(true);
    expect(commit.state.loopIndex).toBe(3);
    expect(commit.state.streak).toBe(1);
    expect(commit.signCount).toBe(1);
  });

  it('resets wrong choices and reports the next confirmed sign as zero', () => {
    const anomalous: GameState = {
      ...createInitialGameState(),
      loopIndex: 4,
      currentAnomalyId: 'clock-wrong',
      expectedAction: 'backward',
      streak: 3
    };
    const activeTransition = beginTransition(-1);

    const commit = commitTransition(anomalous, activeTransition);

    expect(commit.shouldReset).toBe(true);
    expect(commit.activeTransition.phase).toBe('resetting');
    expect(commit.state.loopIndex).toBe(1);
    expect(commit.state.streak).toBe(0);
    expect(commit.signCount).toBe(0);
  });

  it('does not derive sign state before commit', () => {
    const activeTransition = beginTransition(1);

    expect(activeTransition.phase).toBe('preCommit');
    expect(activeTransition.committedState).toBeUndefined();
  });
});
