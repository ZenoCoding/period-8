import type { AnomalyId } from './anomalies';

export type DirectionChoice = 'forward' | 'backward';
export type GamePhase = 'playing' | 'escaped';
export type TransitionOutcome = 'correct' | 'wrong' | 'escaped' | 'idle';

export interface GameState {
  loopIndex: number;
  targetLoops: number;
  currentAnomalyId: AnomalyId | null;
  expectedAction: DirectionChoice;
  failCount: number;
  encounterChance: number;
  encounterRoll: number;
  encounterHistory: (AnomalyId | null)[];
  recentAnomalyIds: AnomalyId[];
  usedAnomalyCounts: Partial<Record<AnomalyId, number>>;
  ambienceLevel: number;
  streak: number;
  phase: GamePhase;
  lastOutcome: TransitionOutcome;
  lastMessage: string;
}

export interface TransitionResult {
  state: GameState;
  choice: DirectionChoice;
  expectedAction: DirectionChoice;
  wasCorrect: boolean;
  resetToStart: boolean;
  message: string;
}
