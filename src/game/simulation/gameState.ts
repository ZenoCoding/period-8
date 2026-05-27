import { selectEncounterForPeriod, type EncounterSelection } from './anomalies';
import type { DirectionChoice, GameState, TransitionResult } from './types';

const DEFAULT_TARGET_LOOPS = 8;
const MAX_AMBIENCE_LEVEL = 5;

export function expectedActionForAnomaly(currentAnomalyId: GameState['currentAnomalyId']): DirectionChoice {
  return currentAnomalyId === null ? 'forward' : 'backward';
}

export function createInitialGameState(targetLoops = DEFAULT_TARGET_LOOPS): GameState {
  const selection = selectEncounterForPeriod({ periodIndex: 0 });
  const currentAnomalyId = selection.anomalyId;

  return {
    loopIndex: 0,
    targetLoops,
    currentAnomalyId,
    expectedAction: expectedActionForAnomaly(currentAnomalyId),
    failCount: 0,
    encounterChance: selection.chance,
    encounterRoll: selection.roll,
    encounterHistory: [currentAnomalyId],
    recentAnomalyIds: [],
    usedAnomalyCounts: {},
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
    const nextState = createResetState(state, 'The hallway rejects that choice.');

    return {
      state: nextState,
      choice,
      expectedAction,
      wasCorrect,
      resetToStart: true,
      message: nextState.lastMessage
    };
  }

  if (state.loopIndex >= state.targetLoops - 1) {
    const nextState: GameState = {
      ...state,
      loopIndex: state.targetLoops,
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
  const selection = selectEncounterForPeriod({
    periodIndex: loopIndex,
    failCount: state.failCount,
    encounterHistory: state.encounterHistory,
    recentAnomalyIds: state.recentAnomalyIds,
    usedAnomalyCounts: state.usedAnomalyCounts
  });
  const nextState: GameState = {
    ...applyEncounterSelection(state, loopIndex, selection),
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
  return createResetState(state, 'The hallway caught you.');
}

function createResetState(state: GameState, lastMessage: string): GameState {
  const failCount = state.failCount + 1;
  const ambienceLevel = Math.min(MAX_AMBIENCE_LEVEL, state.ambienceLevel + 1);
  const selection = selectEncounterForPeriod({
    periodIndex: 0,
    failCount,
    recentAnomalyIds: state.recentAnomalyIds,
    usedAnomalyCounts: state.usedAnomalyCounts
  });

  return {
    ...state,
    loopIndex: 0,
    currentAnomalyId: selection.anomalyId,
    expectedAction: expectedActionForAnomaly(selection.anomalyId),
    failCount,
    encounterChance: selection.chance,
    encounterRoll: selection.roll,
    encounterHistory: [selection.anomalyId],
    ambienceLevel,
    streak: 0,
    phase: 'playing',
    lastOutcome: 'wrong',
    lastMessage
  };
}

function applyEncounterSelection(
  state: GameState,
  loopIndex: number,
  selection: EncounterSelection
): GameState {
  const currentAnomalyId = selection.anomalyId;
  const recentAnomalyIds = currentAnomalyId
    ? [currentAnomalyId, ...state.recentAnomalyIds].slice(0, 3)
    : state.recentAnomalyIds;
  const usedAnomalyCounts = currentAnomalyId
    ? {
        ...state.usedAnomalyCounts,
        [currentAnomalyId]: (state.usedAnomalyCounts[currentAnomalyId] ?? 0) + 1
      }
    : state.usedAnomalyCounts;

  return {
    ...state,
    loopIndex,
    currentAnomalyId,
    expectedAction: expectedActionForAnomaly(currentAnomalyId),
    encounterChance: selection.chance,
    encounterRoll: selection.roll,
    encounterHistory: [...state.encounterHistory, currentAnomalyId].slice(-8),
    recentAnomalyIds,
    usedAnomalyCounts
  };
}
