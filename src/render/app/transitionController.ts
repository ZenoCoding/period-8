import { resolvePortalTransition } from '../../game/simulation/gameState';
import type { DirectionChoice, GameState, TransitionResult } from '../../game/simulation/types';

export type TransitionPhase = 'observing' | 'preCommit' | 'committed' | 'postCommit' | 'resetting';
export type TransitionChoice = DirectionChoice;
export type TransitionSide = -1 | 1;

export interface ActiveTransition {
  side: TransitionSide;
  choice: TransitionChoice;
  phase: Exclude<TransitionPhase, 'observing'>;
  committedState?: GameState;
}

export interface TransitionCommit {
  activeTransition: ActiveTransition;
  state: GameState;
  result: TransitionResult;
  signCount: number;
  shouldReset: boolean;
}

export function choiceForTransitionSide(side: TransitionSide): TransitionChoice {
  return side < 0 ? 'forward' : 'backward';
}

export function beginTransition(side: TransitionSide): ActiveTransition {
  return {
    side,
    choice: choiceForTransitionSide(side),
    phase: 'preCommit'
  };
}

export function commitTransition(state: GameState, activeTransition: ActiveTransition): TransitionCommit {
  const result = resolvePortalTransition(state, activeTransition.choice);
  const committedTransition: ActiveTransition = {
    ...activeTransition,
    phase: result.wasCorrect ? 'committed' : 'resetting',
    committedState: result.state
  };

  return {
    activeTransition: committedTransition,
    state: result.state,
    result,
    signCount: result.wasCorrect ? result.state.streak : 0,
    shouldReset: !result.wasCorrect
  };
}

export function markTransitionPostCommit(activeTransition: ActiveTransition): ActiveTransition {
  return {
    ...activeTransition,
    phase: 'postCommit'
  };
}
