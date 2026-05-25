import { pickEncounterForLoop } from './anomalies';
import type { DirectionChoice, GameState, TransitionResult } from './types';

const DEFAULT_TARGET_LOOPS = 8;
const MAX_AMBIENCE_LEVEL = 5;

export function expectedActionForAnomaly(currentAnomalyId: GameState['currentAnomalyId']): DirectionChoice {
  return currentAnomalyId === null ? 'forward' : 'backward';
}

export function createInitialGameState(targetLoops = DEFAULT_TARGET_LOOPS): GameState {
  const currentAnomalyId = pickEncounterForLoop(1);

  return {
    loopIndex: 1,
    targetLoops,
    currentAnomalyId,
    expectedAction: expectedActionForAnomaly(currentAnomalyId),
    failCount: 0,
    ambienceLevel: 0,
    streak: 0,
    phase: 'playing',
    lastOutcome: 'idle',
    lastMessage: 'The corridor waits.'
  };
}

export function resolvePortalTransition(state: GameState, choice: DirectionChoice): TransitionResult {
  if (state.phase === 'escaped') {
    return {
      state,
      choice,
      expectedAction: state.expectedAction,
      wasCorrect: true,
      resetToStart: false,
      message: state.lastMessage
    };
  }

  const expectedAction = expectedActionForAnomaly(state.currentAnomalyId);
  const wasCorrect = choice === expectedAction;

  if (!wasCorrect) {
    const failCount = state.failCount + 1;
    const ambienceLevel = Math.min(MAX_AMBIENCE_LEVEL, state.ambienceLevel + 1);
    const currentAnomalyId = pickEncounterForLoop(1, failCount);
    const nextState: GameState = {
      ...state,
      loopIndex: 1,
      currentAnomalyId,
      expectedAction: expectedActionForAnomaly(currentAnomalyId),
      failCount,
      ambienceLevel,
      streak: 0,
      phase: 'playing',
      lastOutcome: 'wrong',
      lastMessage: 'The hallway rejects that choice.'
    };

    return {
      state: nextState,
      choice,
      expectedAction,
      wasCorrect,
      resetToStart: true,
      message: nextState.lastMessage
    };
  }

  if (state.loopIndex >= state.targetLoops) {
    const nextState: GameState = {
      ...state,
      currentAnomalyId: null,
      expectedAction: 'forward',
      streak: state.streak + 1,
      phase: 'escaped',
      lastOutcome: 'escaped',
      lastMessage: 'The repetition breaks.'
    };

    return {
      state: nextState,
      choice,
      expectedAction,
      wasCorrect,
      resetToStart: true,
      message: nextState.lastMessage
    };
  }

  const loopIndex = state.loopIndex + 1;
  const currentAnomalyId = pickEncounterForLoop(loopIndex, state.failCount);
  const nextState: GameState = {
    ...state,
    loopIndex,
    currentAnomalyId,
    expectedAction: expectedActionForAnomaly(currentAnomalyId),
    streak: state.streak + 1,
    lastOutcome: 'correct',
    lastMessage: 'The corridor repeats.'
  };

  return {
    state: nextState,
    choice,
    expectedAction,
    wasCorrect,
    resetToStart: true,
    message: nextState.lastMessage
  };
}

export function resolveTimedAnomalyTimeout(state: GameState): GameState {
  const failCount = state.failCount + 1;
  const ambienceLevel = Math.min(MAX_AMBIENCE_LEVEL, state.ambienceLevel + 1);
  const currentAnomalyId = pickEncounterForLoop(1, failCount);

  return {
    ...state,
    loopIndex: 1,
    currentAnomalyId,
    expectedAction: expectedActionForAnomaly(currentAnomalyId),
    failCount,
    ambienceLevel,
    streak: 0,
    phase: 'playing',
    lastOutcome: 'wrong',
    lastMessage: 'The hallway caught you.'
  };
}
