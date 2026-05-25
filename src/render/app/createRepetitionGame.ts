import * as THREE from 'three';
import { applyKeyChange, createInputState } from '../../game/input/actions';
import { ANOMALY_BY_ID } from '../../game/simulation/anomalies';
import { createInitialGameState, resolveTimedAnomalyTimeout } from '../../game/simulation/gameState';
import type { GameState } from '../../game/simulation/types';
import { createHud, renderHud } from '../../ui/hud';
import { applyAnomaly, updateAnomaly, updateAtmosphere, type LightFailureEffectState } from '../adapters/anomalyRenderer';
import {
  createHallwayScene,
  MAIN_HALF_LENGTH,
  MAIN_HALF_WIDTH,
  QUEUED_HALLWAY_RECTS,
  QUEUED_HALLWAY_ROOT_LOCAL_X,
  QUEUED_HALLWAY_ROOT_LOCAL_Z,
  setTransitionSign,
  setTransitionSignTransform,
  setTransitionSignVisible,
  TRANSITION_BRANCH_X_MAX,
  TRANSITION_ENTRY_Z_MAX,
  TRANSITION_ENTRY_Z_MIN,
  WALKABLE_RECTS,
  type BoundsRect,
  type HallwayHandles
} from '../objects/hallway';
import { createHallwayWalker, type HallwayWalkerSnapshot } from '../objects/hallwayWalker';
import {
  beginTransition,
  commitTransition,
  markTransitionPostCommit,
  type ActiveTransition,
  type TransitionPhase,
  type TransitionSide
} from './transitionController';
import {
  captureCommitGate,
  captureSignPlacement,
  formatTransitionTuning,
  getNearestTransitionSide,
  isPastTunedCommitGate,
  loadTransitionTuning,
  resetTransitionTuning,
  sideKey
} from './transitionTuning';

export interface RepetitionGame {
  destroy(): void;
}

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
  }
}

const PLAYER_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.28;
const TARGET_FPS = 30;
const TARGET_FRAME_SECONDS = 1 / TARGET_FPS;
const MAX_FRAME_DELTA_SECONDS = TARGET_FRAME_SECONDS * 3;
const MAX_RENDER_PIXEL_RATIO = 1.35;
const CAMERA_BASE_FOV = 74;
const BASE_SCREEN_FUZZ = 0.34;
const BASE_LENS_WARP = 0.012;
const AMBIENCE_SMOOTHING_SECONDS = 1.4;
const LIGHT_FAILURE_DELAY_SECONDS = 5;
const LIGHT_FAILURE_MIDDLE_Z = 1.15;
const LIGHT_FAILURE_BLACKOUT_SECONDS = 2.2;
const NEGATIVE_HALLWAY_START = new THREE.Vector3(
  0,
  PLAYER_HEIGHT,
  MAIN_HALF_LENGTH - 0.85
);
const NEGATIVE_EXIT_Z = -MAIN_HALF_LENGTH + PLAYER_RADIUS;
const POSITIVE_EXIT_X = MAIN_HALF_WIDTH + PLAYER_RADIUS + 0.04;
const POSITIVE_EXIT_Z_MIN = TRANSITION_ENTRY_Z_MIN + 0.15;
const POSITIVE_EXIT_Z_MAX = TRANSITION_ENTRY_Z_MAX - 0.15;
const QUEUED_HALLWAY_ROOT_X = QUEUED_HALLWAY_ROOT_LOCAL_X;
const QUEUED_HALLWAY_ROOT_Z = QUEUED_HALLWAY_ROOT_LOCAL_Z;
const NEXT_HALLWAY_HANDOFF_LOCAL_Z = MAIN_HALF_LENGTH + 0.15;
const MAIN_CORRIDOR_CENTER_LIMIT = MAIN_HALF_WIDTH - PLAYER_RADIUS + 0.02;
const MAIN_INTERIOR_Z_MIN = -MAIN_HALF_LENGTH + 0.55;
const MAIN_INTERIOR_Z_MAX = MAIN_HALF_LENGTH - 0.55;
const COMMITTED_VIEW_LIMIT = 1.22;
const FOOTSTEP_SAMPLE_PATH = '/audio/footsteps/freesound-community-footsteps-in-a-hallway-47842.mp3?v=raw-segments-2';
const LIGHT_FAILURE_SAMPLE_PATH = '/audio/lights/fluorescent-light-flickering-unstuntedsfx.mp3';
const RECORDED_FOOTSTEP_SLICE_DURATION = 0.52;
const RECORDED_FOOTSTEP_SEGMENT_OFFSETS = [
  0.62,
  1.19,
  1.79,
  2.38,
  3.03,
  3.53,
  4.24,
  4.69,
  5.35,
  5.81,
  6.46,
  6.97,
  7.53,
  8.1,
  8.68,
  9.24,
  9.8,
  10.32
] as const;
const UP = new THREE.Vector3(0, 1, 0);

interface HallwayCell {
  handles: HallwayHandles;
  state: GameState;
  walkableRects: BoundsRect[];
}

interface FramePerformance {
  record(renderCostMs: number, frameDeltaSeconds: number): void;
  snapshot(): {
    targetFps: number;
    averageFps: number;
    averageRenderMs: number;
    lastRenderMs: number;
    lastFrameMs: number;
  };
}

interface ScreenEffectState {
  time: number;
  warp: number;
  aberration: number;
  fuzz: number;
}

interface ScreenEffectPass {
  setSize(): void;
  setState(state: ScreenEffectState): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

interface LightFailureCueState extends LightFailureEffectState {
  active: boolean;
  justTriggered: boolean;
}

export function createRepetitionGame(root: HTMLElement): RepetitionGame {
  root.replaceChildren();

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  root.append(canvas);

  const renderer = createRenderer(canvas);
  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.035, 70);
  camera.rotation.order = 'YXZ';
  const screenEffects = createScreenEffectPass(renderer);

  const hud = createHud(root);
  const input = createInputState();
  const audio = createHorrorAudio();

  let state = createInitialGameState();
  let hallway = createHallwayScene(scene);
  const hallwayWalker = createHallwayWalker();
  let currentHallwayState = state;
  let nextHallway: HallwayCell | null = null;
  let standbyHallway: HallwayCell | null = null;
  let queuedPreviewHallway: HallwayCell | null = null;
  let pendingStandbyState: GameState | null = null;
  let isStandbyPreparationScheduled = false;
  let transitionTuning = loadTransitionTuning();
  let animationFrame = 0;
  let frameAccumulator = 0;
  let measuredFrameAccumulator = 0;
  let fpsHudAccumulator = 0;
  let isRenderLoopRunning = false;
  let isPaused = false;
  let isDestroyed = false;
  let isPointerLocked = false;
  let isAdvancingAutomation = false;
  let transitionCooldown = 0;
  let transitionPhase: TransitionPhase = 'observing';
  let activeTransition: ActiveTransition | null = null;
  let suppressedExitSide: TransitionSide | null = null;
  let debugNotice = '';
  let yaw = 0;
  let pitch = 0;
  let transitionVisualPulse = 0;
  let anomalyVisualPulse = 0;
  let lastVisualAnomalyId: GameState['currentAnomalyId'] = state.currentAnomalyId;
  let activeElapsedSeconds = 0;
  let smoothedAmbienceLevel = state.ambienceLevel;
  let activeTimedAnomalyId: GameState['currentAnomalyId'] = null;
  let timedThreatElapsed = 0;
  let lightFailureElapsed = 0;
  let lightFailureBlackoutElapsed = 0;
  let hasLightFailureBlackoutStarted = false;
  let didCueLightFailureAudio = false;
  let playerMoveSpeed = 0;
  const clock = new THREE.Clock();
  const playerPosition = NEGATIVE_HALLWAY_START.clone();
  const moveForward = new THREE.Vector3();
  const moveRight = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const candidatePosition = new THREE.Vector3();
  const xOnlyPosition = new THREE.Vector3();
  const zOnlyPosition = new THREE.Vector3();
  const hallwayLocalScratch = new THREE.Vector3();
  const perf = createFramePerformanceTracker();
  const previousAdvanceTime = window.advanceTime;
  const previousRenderGameToText = window.render_game_to_text;
  let installedAdvanceTime: Window['advanceTime'] = undefined;
  let installedRenderGameToText: Window['render_game_to_text'] = undefined;
  let automationFrameAccumulator = 0;

  applyTransitionTuningToHallway(hallway);
  applyAnomaly(hallway, state.currentAnomalyId);
  resetTransitionSigns(state.loopIndex, 'idle');
  renderHud(hud, state);
  scheduleHallwayPoolWarmup();
  installAutomationHooks();

  const resize = (): void => {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    screenEffects.setSize();
  };

  const requestLock = (): void => {
    audio.resume();
    canvas.requestPointerLock();
  };

  const onPointerLockChange = (): void => {
    isPointerLocked = document.pointerLockElement === canvas;
    hud.setLocked(isPointerLocked);
  };

  const pauseGame = (): void => {
    if (isPaused) {
      return;
    }

    isPaused = true;
    stopRenderLoop();
    resetMovementInput();
    hud.setPaused(true);
    audio.suspend();

    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const resumeGame = (): void => {
    if (!isPaused || shouldPause()) {
      return;
    }

    isPaused = false;
    hud.setPaused(false);
    startRenderLoop();
  };

  const syncPauseState = (): void => {
    if (shouldPause()) {
      pauseGame();
      return;
    }

    resumeGame();
  };

  const shouldPause = (): boolean => document.hidden || !document.hasFocus();

  const onMouseMove = (event: MouseEvent): void => {
    if (!isPointerLocked) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.002;
    pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const handledInput = applyKeyChange(input, event.code, true);
    const handledTuning = handleDebugTuningKey(event.code);

    if (handledInput || handledTuning) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (applyKeyChange(input, event.code, false)) {
      event.preventDefault();
    }
  };

  hud.prompt.addEventListener('click', requestLock);
  canvas.addEventListener('click', requestLock);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resize);
  window.addEventListener('blur', syncPauseState);
  window.addEventListener('focus', syncPauseState);
  window.addEventListener('pageshow', syncPauseState);
  document.addEventListener('visibilitychange', syncPauseState);
  resize();
  syncPauseState();

  const update = (deltaSeconds: number, elapsedSeconds: number): void => {
    transitionCooldown = Math.max(0, transitionCooldown - deltaSeconds);
    constrainCommittedView();
    camera.rotation.set(pitch, yaw, 0);

    if (isPointerLocked || isAdvancingAutomation) {
      playerMoveSpeed = updatePlayerPosition(deltaSeconds);
      if (state.phase === 'playing' || transitionPhase !== 'observing') {
        evaluateTransitions();
      }
    } else {
      playerMoveSpeed = 0;
    }

    const timedThreatProgress = updateTimedThreat(deltaSeconds);
    const lightFailure = updateLightFailureCue(deltaSeconds);
    updateAnomaly(hallway, currentHallwayState, playerPosition, elapsedSeconds, timedThreatProgress, lightFailure);
    if (nextHallway) {
      updateAnomaly(nextHallway.handles, nextHallway.state, playerPosition, elapsedSeconds);
    }
    const visibleAmbienceLevel = updateSmoothedAmbience(deltaSeconds);
    updateAtmosphere(scene, hallway, state, visibleAmbienceLevel, lightFailure.progress);
    if (nextHallway) {
      updateAtmosphere(scene, nextHallway.handles, state, visibleAmbienceLevel);
    }
    hallwayWalker.setHeadTracking(currentHallwayState.currentAnomalyId === 'man-staring', playerPosition, elapsedSeconds);
    hallwayWalker.update(deltaSeconds);
    hud.setDebugVisible(input.debug);
    if (input.debug) {
      updateDebugOverlay();
    }
    updateScreenTreatment(deltaSeconds, elapsedSeconds);
    audio.update(
      state,
      visibleAmbienceLevel,
      elapsedSeconds,
      playerMoveSpeed,
      input.sprint,
      hallwayWalker.snapshot(),
      playerPosition,
      yaw,
      lightFailure
    );
  };

  const tick = (): void => {
    if (isPaused) {
      isRenderLoopRunning = false;
      animationFrame = 0;
      return;
    }

    const rawFrameDeltaSeconds = clock.getDelta();
    const frameDeltaSeconds = Math.min(rawFrameDeltaSeconds, MAX_FRAME_DELTA_SECONDS);
    frameAccumulator += frameDeltaSeconds;
    measuredFrameAccumulator += rawFrameDeltaSeconds;

    if (frameAccumulator < TARGET_FRAME_SECONDS) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }

    const deltaSeconds = Math.min(frameAccumulator, MAX_FRAME_DELTA_SECONDS);
    frameAccumulator = 0;
    activeElapsedSeconds += deltaSeconds;
    const frameStart = performance.now();
    update(deltaSeconds, activeElapsedSeconds);
    renderFrame();
    perf.record(performance.now() - frameStart, measuredFrameAccumulator);
    updateFpsCounter(deltaSeconds);
    measuredFrameAccumulator = 0;
    animationFrame = requestAnimationFrame(tick);
  };

  startRenderLoop();

  function startRenderLoop(): void {
    if (isPaused || isRenderLoopRunning) {
      return;
    }

    clock.getDelta();
    frameAccumulator = 0;
    measuredFrameAccumulator = 0;
    isRenderLoopRunning = true;
    animationFrame = requestAnimationFrame(tick);
  }

  function stopRenderLoop(): void {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }

    isRenderLoopRunning = false;
  }

  function resetMovementInput(): void {
    input.forward = false;
    input.backward = false;
    input.left = false;
    input.right = false;
    input.sprint = false;
  }

  function updatePlayerPosition(deltaSeconds: number): number {
    const axisX = Number(input.right) - Number(input.left);
    const axisZ = Number(input.forward) - Number(input.backward);

    if (axisX === 0 && axisZ === 0) {
      return 0;
    }

    camera.getWorldDirection(moveForward);
    moveForward.y = 0;
    moveForward.normalize();
    moveRight.crossVectors(moveForward, UP).normalize();

    movement.set(0, 0, 0)
      .addScaledVector(moveForward, axisZ)
      .addScaledVector(moveRight, axisX);

    if (movement.lengthSq() <= 0) {
      return 0;
    }

    movement.normalize();
    const speed = input.sprint ? 4.15 : 2.45;
    candidatePosition.copy(playerPosition).addScaledVector(movement, speed * deltaSeconds);
    candidatePosition.y = PLAYER_HEIGHT;
    const nextPosition = resolveMovement(playerPosition, candidatePosition, isWalkableWorld, xOnlyPosition, zOnlyPosition);
    const distance = playerPosition.distanceTo(nextPosition);
    playerPosition.copy(nextPosition);
    return distance / Math.max(deltaSeconds, 0.001);
  }

  function evaluateTransitions(): void {
    if (transitionCooldown > 0) {
      return;
    }

    trackTransitionEntry();
    evaluateTransitionCommitGate();
    completePostCommitTransition();
    clearReturnedTransition();
  }

  function trackTransitionEntry(): void {
    if (activeTransition) {
      return;
    }

    if (suppressedExitSide) {
      if (isInsideCurrentHallway()) {
        suppressedExitSide = null;
      } else {
        return;
      }
    }

    const side = getCurrentExitSide();
    if (!side) {
      return;
    }

    activeTransition = beginTransition(side);
    transitionPhase = activeTransition.phase;
    setTransitionSignVisible(hallway, null);
    pulseScreenDistortion(0.72);
  }

  function evaluateTransitionCommitGate(): void {
    if (
      !activeTransition ||
      activeTransition.phase !== 'preCommit' ||
      !isPastCommitGate(activeTransition.side)
    ) {
      return;
    }

    const commit = commitTransition(state, activeTransition);
    state = commit.state;
    activeTransition = commit.activeTransition;
    transitionPhase = activeTransition.phase;

    queueNextHallway(activeTransition.side, state);
    setTransitionSign(
      hallway,
      activeTransition.side,
      commit.signCount,
      state.targetLoops,
      state.phase === 'escaped',
      commit.result.wasCorrect ? 'correct' : 'wrong'
    );
    setTransitionSignVisible(hallway, activeTransition.side);
    renderHud(hud, state);
    pulseScreenDistortion(commit.result.wasCorrect ? 0.82 : 1);

    activeTransition = markTransitionPostCommit(activeTransition);
    transitionPhase = activeTransition.phase;
  }

  function clearReturnedTransition(): void {
    if (!activeTransition || !isInsideCurrentHallway()) {
      return;
    }

    activeTransition = null;
    transitionPhase = 'observing';
    setTransitionSignVisible(hallway, null);
  }

  function completePostCommitTransition(): void {
    if (
      !activeTransition ||
      activeTransition.phase !== 'postCommit' ||
      !nextHallway ||
      !isReadyForQueuedHallwayHandoff(nextHallway)
    ) {
      return;
    }

    recenterToQueuedHallway(nextHallway);
    suppressedExitSide = activeTransition.side;
    activeTransition = null;
    transitionPhase = 'observing';
    setTransitionSignVisible(hallway, null);
  }

  function getCurrentExitSide(): TransitionSide | null {
    const local = worldToHallwayLocal(hallway, playerPosition);

    if (local.z <= NEGATIVE_EXIT_Z) {
      return -1;
    }

    if (
      local.x >= POSITIVE_EXIT_X &&
      local.z >= POSITIVE_EXIT_Z_MIN &&
      local.z <= POSITIVE_EXIT_Z_MAX
    ) {
      return 1;
    }

    return null;
  }

  function isPastCommitGate(side: TransitionSide): boolean {
    const local = worldToHallwayLocal(hallway, playerPosition);
    return isPastTunedCommitGate(transitionTuning, side, local.x, local.z);
  }

  function resetTransitionSigns(level: number, outcome: 'idle' | 'correct' | 'wrong'): void {
    setTransitionSign(hallway, -1, level, state.targetLoops, state.phase === 'escaped', outcome);
    setTransitionSign(hallway, 1, level, state.targetLoops, state.phase === 'escaped', outcome);
    setTransitionSignVisible(hallway, null);
  }

  function isInsideCurrentHallway(): boolean {
    const local = worldToHallwayLocal(hallway, playerPosition);
    return (
      Math.abs(local.x) <= MAIN_CORRIDOR_CENTER_LIMIT &&
      local.z > MAIN_INTERIOR_Z_MIN &&
      local.z < MAIN_INTERIOR_Z_MAX
    );
  }

  function queueNextHallway(side: TransitionSide, nextState: GameState): void {
    if (nextHallway) {
      hideHallwayCell(nextHallway);
      nextHallway = null;
    }

    const queuedCell = getQueuedPreviewHallway();
    const handles = queuedCell.handles;
    const rotationY = side > 0 ? Math.PI : 0;

    handles.root.visible = true;
    handles.root.rotation.y = rotationY;
    handles.root.position.set(side * QUEUED_HALLWAY_ROOT_X, 0, side * QUEUED_HALLWAY_ROOT_Z);
    handles.root.updateMatrixWorld(true);

    configureHallwayForState(queuedCell, nextState);
    nextHallway = queuedCell;
    scheduleStandbyPreparation(nextState);
  }

  function isReadyForQueuedHallwayHandoff(cell: HallwayCell): boolean {
    const local = worldToHallwayLocal(cell.handles, playerPosition);
    const isInQueuedMain = (
      Math.abs(local.x) <= MAIN_CORRIDOR_CENTER_LIMIT &&
      local.z > MAIN_INTERIOR_Z_MIN &&
      local.z < NEXT_HALLWAY_HANDOFF_LOCAL_Z
    );
    const isInQueuedEntranceBranch = (
      local.x > MAIN_CORRIDOR_CENTER_LIMIT &&
      local.x <= TRANSITION_BRANCH_X_MAX - PLAYER_RADIUS &&
      local.z > TRANSITION_ENTRY_Z_MIN + PLAYER_RADIUS &&
      local.z < NEXT_HALLWAY_HANDOFF_LOCAL_Z
    );

    return isInQueuedMain || isInQueuedEntranceBranch;
  }

  function recenterToQueuedHallway(cell: HallwayCell): void {
    const previousHallway: HallwayCell = {
      handles: hallway,
      state: currentHallwayState,
      walkableRects: WALKABLE_RECTS
    };
    const promotedHallway = getStandbyHallway();
    if (promotedHallway.state !== cell.state) {
      prepareStandbyHallway(cell.state);
    }
    pendingStandbyState = null;
    const nextLocalPosition = worldToHallwayLocal(cell.handles, playerPosition);
    const nextRootYaw = cell.handles.root.rotation.y;

    yaw = normalizeAngle(yaw - nextRootYaw);

    activateHallwayCell(promotedHallway);
    hallway = promotedHallway.handles;
    currentHallwayState = promotedHallway.state;
    standbyHallway = previousHallway;
    hideHallwayCell(standbyHallway);
    hideHallwayCell(cell);
    nextHallway = null;

    hallway.root.position.set(0, 0, 0);
    hallway.root.rotation.set(0, 0, 0);
    hallway.root.updateMatrixWorld(true);
    playerPosition.copy(
      hallway.root.localToWorld(new THREE.Vector3(nextLocalPosition.x, PLAYER_HEIGHT, nextLocalPosition.z))
    );
    resetTransitionSigns(state.loopIndex, 'idle');
    renderHud(hud, state);
    hallwayWalker.start(hallway.root);
    renderer.shadowMap.needsUpdate = true;
    pulseScreenDistortion(1.08);
  }

  function handleDebugTuningKey(code: string): boolean {
    if (!input.debug) {
      return false;
    }

    const { side, local } = getTuningCaptureContext();
    if (code === 'KeyC') {
      transitionTuning = captureCommitGate(transitionTuning, side, local.x, local.z);
      debugNotice = `Captured ${formatSide(side)} commit at x ${formatNumber(local.x)} z ${formatNumber(local.z)}`;
      return true;
    }

    if (code === 'KeyV') {
      const capture = captureSignPlacement(transitionTuning, side, local.x, local.y, local.z);
      transitionTuning = capture.tuning;
      applyTransitionTuningToHallway(hallway);
      if (nextHallway) {
        applyTransitionTuningToHallway(nextHallway.handles);
      }
      debugNotice = `Captured ${formatSide(side)} sign on ${capture.wall}`;
      return true;
    }

    if (code === 'KeyR') {
      transitionTuning = resetTransitionTuning();
      applyTransitionTuningToHallway(hallway);
      if (nextHallway) {
        applyTransitionTuningToHallway(nextHallway.handles);
      }
      debugNotice = 'Reset transition tuning to defaults';
      return true;
    }

    return false;
  }

  function getTuningCaptureContext(): { side: TransitionSide; local: THREE.Vector3 } {
    const local = worldToHallwayLocal(hallway, playerPosition);
    return {
      side: activeTransition?.side ?? getNearestTransitionSide(local.x, local.z),
      local
    };
  }

  function updateDebugOverlay(): void {
    const local = worldToHallwayLocal(hallway, playerPosition);
    const side = activeTransition?.side ?? getNearestTransitionSide(local.x, local.z);
    const queuedLocal = nextHallway ? worldToHallwayLocal(nextHallway.handles, playerPosition) : null;
    const ruleAnomaly = state.currentAnomalyId
      ? ANOMALY_BY_ID.get(state.currentAnomalyId)
      : null;
    const visualAnomaly = currentHallwayState.currentAnomalyId
      ? ANOMALY_BY_ID.get(currentHallwayState.currentAnomalyId)
      : null;
    const queuedAnomaly = nextHallway?.state.currentAnomalyId
      ? ANOMALY_BY_ID.get(nextHallway.state.currentAnomalyId)
      : null;
    hud.debug.textContent = [
      `Position: x ${formatNumber(local.x)} z ${formatNumber(local.z)} yaw ${formatNumber(yaw)}`,
      queuedLocal ? `Queued local: x ${formatNumber(queuedLocal.x)} z ${formatNumber(queuedLocal.z)}` : 'Queued local: none',
      `Transition: ${transitionPhase} side ${formatSide(side)}`,
      `Level: ${state.loopIndex}/${state.targetLoops} outcome ${state.lastOutcome}`,
      state.currentAnomalyId
        ? `Rule anomaly: ${ruleAnomaly?.label ?? state.currentAnomalyId} (${state.currentAnomalyId})`
        : 'Rule anomaly: none',
      currentHallwayState.currentAnomalyId
        ? `Visual anomaly: ${visualAnomaly?.label ?? currentHallwayState.currentAnomalyId} (${currentHallwayState.currentAnomalyId})`
        : 'Visual anomaly: none',
      nextHallway?.state.currentAnomalyId
        ? `Queued anomaly: ${queuedAnomaly?.label ?? nextHallway.state.currentAnomalyId} (${nextHallway.state.currentAnomalyId})`
        : 'Queued anomaly: none',
      ruleAnomaly
        ? `Target: ${ruleAnomaly.target} subtlety ${ruleAnomaly.subtlety}`
        : '',
      activeTimedAnomalyId
        ? `Timed threat: ${formatNumber(getTimedThreatProgress() * 100)}% (${formatNumber(timedThreatElapsed)}s)`
        : '',
      currentHallwayState.currentAnomalyId === 'light-failure'
        ? `Light failure: ${hasLightFailureBlackoutStarted ? 'blackout' : 'armed'} ${formatNumber(lightFailureElapsed)}s`
        : '',
      formatTransitionTuning(transitionTuning),
      'Debug tuning: C commit, V sign, R reset',
      debugNotice ? `Last: ${debugNotice}` : ''
    ].filter(Boolean).join('\n');
  }

  function updateFpsCounter(deltaSeconds: number): void {
    const snapshot = perf.snapshot();
    const hasFrameSpike = snapshot.lastFrameMs >= 100;
    fpsHudAccumulator += deltaSeconds;

    if (!hasFrameSpike && fpsHudAccumulator < 0.25) {
      return;
    }

    fpsHudAccumulator = 0;
    hud.setFps(
      snapshot.averageFps,
      snapshot.lastFrameMs,
      snapshot.averageFps > 0 && (snapshot.averageFps < TARGET_FPS - 4 || hasFrameSpike)
    );
  }

  function updateSmoothedAmbience(deltaSeconds: number): number {
    const targetAmbienceLevel = state.phase === 'escaped' ? 0 : state.ambienceLevel;
    const smoothingFactor = 1 - Math.exp(-deltaSeconds / AMBIENCE_SMOOTHING_SECONDS);
    smoothedAmbienceLevel = THREE.MathUtils.lerp(
      smoothedAmbienceLevel,
      targetAmbienceLevel,
      THREE.MathUtils.clamp(smoothingFactor, 0, 1)
    );

    if (Math.abs(smoothedAmbienceLevel - targetAmbienceLevel) < 0.01) {
      smoothedAmbienceLevel = targetAmbienceLevel;
    }

    return smoothedAmbienceLevel;
  }

  function updateTimedThreat(deltaSeconds: number): number {
    const anomalyId = currentHallwayState.currentAnomalyId;
    const anomaly = anomalyId ? ANOMALY_BY_ID.get(anomalyId) : null;
    const limit = anomaly?.timedThreatSeconds;
    const hasCommittedPortal =
      activeTransition?.phase === 'committed' || activeTransition?.phase === 'postCommit';

    if (!limit || state.phase !== 'playing' || hasCommittedPortal) {
      activeTimedAnomalyId = null;
      timedThreatElapsed = 0;
      return 0;
    }

    if (activeTimedAnomalyId !== anomalyId) {
      activeTimedAnomalyId = anomalyId;
      timedThreatElapsed = 0;
    }

    timedThreatElapsed += deltaSeconds;
    const progress = THREE.MathUtils.clamp(timedThreatElapsed / limit, 0, 1);

    if (progress >= 1) {
      resetFromTimedThreat();
      return 0;
    }

    return progress;
  }

  function getTimedThreatProgress(): number {
    const anomaly = activeTimedAnomalyId ? ANOMALY_BY_ID.get(activeTimedAnomalyId) : null;
    return anomaly?.timedThreatSeconds
      ? THREE.MathUtils.clamp(timedThreatElapsed / anomaly.timedThreatSeconds, 0, 1)
      : 0;
  }

  function updateLightFailureCue(deltaSeconds: number): LightFailureCueState {
    if (currentHallwayState.currentAnomalyId !== 'light-failure' || state.phase !== 'playing') {
      lightFailureElapsed = 0;
      lightFailureBlackoutElapsed = 0;
      hasLightFailureBlackoutStarted = false;
      didCueLightFailureAudio = false;
      return {
        active: false,
        progress: 0,
        sparkPulse: 0,
        justTriggered: false
      };
    }

    lightFailureElapsed += deltaSeconds;
    const local = worldToHallwayLocal(hallway, playerPosition);
    const reachedMiddle = Math.abs(local.z) <= LIGHT_FAILURE_MIDDLE_Z;
    if (!hasLightFailureBlackoutStarted && (lightFailureElapsed >= LIGHT_FAILURE_DELAY_SECONDS || reachedMiddle)) {
      hasLightFailureBlackoutStarted = true;
      lightFailureBlackoutElapsed = 0;
    }

    let justTriggered = false;
    if (hasLightFailureBlackoutStarted) {
      lightFailureBlackoutElapsed += deltaSeconds;
      justTriggered = !didCueLightFailureAudio;
      didCueLightFailureAudio = true;
    }

    const progress = hasLightFailureBlackoutStarted
      ? THREE.MathUtils.clamp(lightFailureBlackoutElapsed / LIGHT_FAILURE_BLACKOUT_SECONDS, 0, 1)
      : 0;
    const sparkPulse = hasLightFailureBlackoutStarted
      ? Math.max(0, Math.sin(progress * Math.PI * 3.2)) * (1 - THREE.MathUtils.smoothstep(progress, 0.45, 1))
      : 0;

    return {
      active: true,
      progress,
      sparkPulse,
      justTriggered
    };
  }

  function resetFromTimedThreat(): void {
    state = resolveTimedAnomalyTimeout(state);
    currentHallwayState = state;
    playerPosition.copy(NEGATIVE_HALLWAY_START);
    yaw = 0;
    pitch = 0;
    activeTransition = null;
    transitionPhase = 'observing';
    suppressedExitSide = null;
    transitionCooldown = 0.4;
    activeTimedAnomalyId = null;
    timedThreatElapsed = 0;

    if (nextHallway) {
      hideHallwayCell(nextHallway);
      nextHallway = null;
    }

    configureHallwayForState({ handles: hallway, state: currentHallwayState, walkableRects: WALKABLE_RECTS }, state);
    hallway.root.position.set(0, 0, 0);
    hallway.root.rotation.set(0, 0, 0);
    hallway.root.updateMatrixWorld(true);
    resetTransitionSigns(state.loopIndex, 'wrong');
    renderHud(hud, state);
    hud.flashPortal();
    pulseScreenDistortion(1.24);
  }

  function updateScreenTreatment(deltaSeconds: number, elapsedSeconds: number): void {
    transitionVisualPulse = Math.max(0, transitionVisualPulse - deltaSeconds * 1.45);
    anomalyVisualPulse = Math.max(0, anomalyVisualPulse - deltaSeconds * 0.95);

    if (currentHallwayState.currentAnomalyId !== lastVisualAnomalyId) {
      if (currentHallwayState.currentAnomalyId || lastVisualAnomalyId) {
        anomalyVisualPulse = Math.max(anomalyVisualPulse, 1);
      }
      lastVisualAnomalyId = currentHallwayState.currentAnomalyId;
    }

    const transitionCurve = transitionVisualPulse * transitionVisualPulse;
    const anomalyCurve = anomalyVisualPulse * anomalyVisualPulse;
    const movement = THREE.MathUtils.clamp(playerMoveSpeed / 4.15, 0, 1);
    const sprintNudge = input.sprint && movement > 0.1 ? 0.04 : 0;
    const slowBreathing = Math.sin(elapsedSeconds * 0.73) * 0.5 + Math.sin(elapsedSeconds * 1.91) * 0.25;
    const shake = 0.0012 + movement * 0.0015 + transitionCurve * 0.014 + anomalyCurve * 0.005;
    const roll =
      Math.sin(elapsedSeconds * 0.67) * 0.0015 +
      Math.sin(elapsedSeconds * 1.37) * 0.0008 +
      Math.sin(elapsedSeconds * 18.5) * transitionCurve * 0.007 +
      Math.sin(elapsedSeconds * 11.2) * anomalyCurve * 0.0028;
    const fov =
      CAMERA_BASE_FOV +
      slowBreathing * 0.1 +
      movement * 0.05 +
      transitionCurve * 0.55 +
      anomalyCurve * 0.18;

    camera.rotation.set(pitch, yaw, roll);
    camera.position.copy(playerPosition);
    camera.position.x += Math.sin(elapsedSeconds * 15.1) * shake;
    camera.position.y += Math.cos(elapsedSeconds * 12.7) * shake * 0.45;

    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const fuzz = THREE.MathUtils.clamp(
      BASE_SCREEN_FUZZ + movement * 0.09 + sprintNudge + transitionCurve * 0.46 + anomalyCurve * 0.22,
      0,
      1
    );
    const jitter = THREE.MathUtils.clamp(0.1 + movement * 0.08 + transitionCurve * 0.72 + anomalyCurve * 0.24, 0, 1);
    hud.setScreenEffects(fuzz, jitter);
    screenEffects.setState({
      time: elapsedSeconds,
      warp: BASE_LENS_WARP + transitionCurve * 0.03 + anomalyCurve * 0.012,
      aberration: 0.0011 + movement * 0.00045 + transitionCurve * 0.0038 + anomalyCurve * 0.0015,
      fuzz
    });
  }

  function pulseScreenDistortion(amount: number): void {
    transitionVisualPulse = Math.max(transitionVisualPulse, amount);
  }

  function renderFrame(): void {
    screenEffects.render(scene, camera);
  }

  function applyTransitionTuningToHallway(handles: HallwayHandles): void {
    for (const side of [-1, 1] as const) {
      const tuning = transitionTuning[sideKey(side)];
      setTransitionSignTransform(
        handles,
        side,
        new THREE.Vector3(tuning.signX, tuning.signY, tuning.signZ),
        tuning.signRotationY
      );
    }
  }

  function isWalkableWorld(x: number, z: number): boolean {
    if (isWalkableInHallway(hallway, x, z, true)) {
      return true;
    }

    return nextHallway
      ? isWalkableInHallway(nextHallway.handles, x, z, false, nextHallway.walkableRects)
      : false;
  }

  function isWalkableInHallway(
    handles: HallwayHandles,
    x: number,
    z: number,
    shouldApplyCommitLock: boolean,
    walkableRects = WALKABLE_RECTS
  ): boolean {
    const local = worldToHallwayLocal(handles, new THREE.Vector3(x, PLAYER_HEIGHT, z));
    if (!isWalkableLocal(local.x, local.z, walkableRects)) {
      return false;
    }

    return !shouldApplyCommitLock || !isBlockedByCommitLock(local.x, local.z);
  }

  function isBlockedByCommitLock(x: number, z: number): boolean {
    if (!activeTransition || activeTransition.phase === 'preCommit') {
      return false;
    }

    return !isPastTunedCommitGate(transitionTuning, activeTransition.side, x, z);
  }

  function constrainCommittedView(): void {
    if (!activeTransition || activeTransition.phase === 'preCommit') {
      return;
    }

    const centerYaw = activeTransition.side < 0 ? 0 : Math.PI;
    yaw = clampAngleAround(yaw, centerYaw, COMMITTED_VIEW_LIMIT);
  }

  function worldToHallwayLocal(handles: HallwayHandles, worldPosition: THREE.Vector3): THREE.Vector3 {
    return handles.root.worldToLocal(worldPosition.clone());
  }

  function copyWorldToHallwayLocal(
    handles: HallwayHandles,
    worldPosition: THREE.Vector3,
    target: THREE.Vector3
  ): THREE.Vector3 {
    return handles.root.worldToLocal(target.copy(worldPosition));
  }

  function getStandbyHallway(): HallwayCell {
    if (!standbyHallway) {
      standbyHallway = createHiddenHallwayCell(createHallwayScene(scene), state, WALKABLE_RECTS);
      prepareStandbyHallway(state);
    }

    return standbyHallway;
  }

  function getQueuedPreviewHallway(): HallwayCell {
    if (!queuedPreviewHallway) {
      queuedPreviewHallway = createHiddenHallwayCell(
        createHallwayScene(scene, { layout: 'queuedNext' }),
        state,
        QUEUED_HALLWAY_RECTS
      );
    }

    return queuedPreviewHallway;
  }

  function scheduleHallwayPoolWarmup(): void {
    scheduleIdleWork(() => {
      if (isDestroyed || queuedPreviewHallway) {
        return;
      }

      queuedPreviewHallway = createHiddenHallwayCell(
        createHallwayScene(scene, { layout: 'queuedNext' }),
        state,
        QUEUED_HALLWAY_RECTS
      );
      scheduleIdleWork(() => {
        if (isDestroyed || standbyHallway) {
          return;
        }

        standbyHallway = createHiddenHallwayCell(createHallwayScene(scene), state, WALKABLE_RECTS);
        prepareStandbyHallway(state);
      });
    });
  }

  function scheduleIdleWork(work: () => void): void {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };

    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(work, { timeout: 1500 });
      return;
    }

    window.setTimeout(work, 250);
  }

  function createHiddenHallwayCell(
    handles: HallwayHandles,
    cellState: GameState,
    walkableRects: BoundsRect[]
  ): HallwayCell {
    const cell = { handles, state: cellState, walkableRects };
    hideHallwayCell(cell);
    return cell;
  }

  function configureHallwayForState(cell: HallwayCell, cellState: GameState): void {
    cell.state = cellState;
    applyTransitionTuningToHallway(cell.handles);
    applyAnomaly(cell.handles, cellState.currentAnomalyId);
    updateAtmosphere(scene, cell.handles, cellState, smoothedAmbienceLevel);
    setTransitionSignVisible(cell.handles, null);
  }

  function prepareStandbyHallway(nextState: GameState): void {
    const standby = getStandbyHallway();
    configureHallwayForState(standby, nextState);
    standby.handles.root.position.set(0, 0, 0);
    standby.handles.root.rotation.set(0, 0, 0);
    standby.handles.root.updateMatrixWorld(true);
    hideHallwayCell(standby);
  }

  function scheduleStandbyPreparation(nextState: GameState): void {
    pendingStandbyState = nextState;
    if (isStandbyPreparationScheduled) {
      return;
    }

    isStandbyPreparationScheduled = true;
    scheduleIdleWork(() => {
      isStandbyPreparationScheduled = false;
      const stateToPrepare = pendingStandbyState;
      pendingStandbyState = null;

      if (!stateToPrepare || isDestroyed) {
        return;
      }

      prepareStandbyHallway(stateToPrepare);
    });
  }

  function activateHallwayCell(cell: HallwayCell): void {
    cell.handles.root.visible = true;
    cell.handles.ambientLight.visible = true;
  }

  function hideHallwayCell(cell: HallwayCell): void {
    cell.handles.root.visible = false;
    cell.handles.ambientLight.visible = false;
  }

  function installAutomationHooks(): void {
    installedAdvanceTime = (ms: number): void => {
      const totalSeconds = Math.max(0, Math.min(ms / 1000, 2));
      automationFrameAccumulator += totalSeconds;
      let didAdvance = false;

      while (automationFrameAccumulator >= TARGET_FRAME_SECONDS) {
        automationFrameAccumulator -= TARGET_FRAME_SECONDS;
        activeElapsedSeconds += TARGET_FRAME_SECONDS;
        isAdvancingAutomation = true;
        try {
          update(TARGET_FRAME_SECONDS, activeElapsedSeconds);
        } finally {
          isAdvancingAutomation = false;
        }
        didAdvance = true;
      }

      const frameStart = performance.now();
      renderFrame();
      if (didAdvance) {
        perf.record(performance.now() - frameStart, TARGET_FRAME_SECONDS);
        updateFpsCounter(TARGET_FRAME_SECONDS);
      }
    };
    window.advanceTime = installedAdvanceTime;

    installedRenderGameToText = (): string => {
      const local = copyWorldToHallwayLocal(hallway, playerPosition, hallwayLocalScratch);
      const queuedLocal = nextHallway
        ? copyWorldToHallwayLocal(nextHallway.handles, playerPosition, new THREE.Vector3())
        : null;
      const performanceSnapshot = perf.snapshot();
      return JSON.stringify({
        coordinateSystem: 'hallway local x/z, origin at active hallway center, +z toward the starting side',
        mode: state.phase,
        transitionPhase,
        activeTransition: activeTransition
          ? { side: activeTransition.side, phase: activeTransition.phase, choice: activeTransition.choice }
          : null,
        player: {
          x: roundForText(local.x),
          z: roundForText(local.z),
          yaw: roundForText(yaw)
        },
        queuedPlayer: queuedLocal
          ? { x: roundForText(queuedLocal.x), z: roundForText(queuedLocal.z) }
          : null,
        loopIndex: state.loopIndex,
        targetLoops: state.targetLoops,
        anomaly: state.currentAnomalyId,
        visualAnomaly: currentHallwayState.currentAnomalyId,
        queuedAnomaly: nextHallway?.state.currentAnomalyId ?? null,
        timedThreat: activeTimedAnomalyId
          ? {
              id: activeTimedAnomalyId,
              elapsed: roundForText(timedThreatElapsed),
              progress: roundForText(getTimedThreatProgress())
            }
          : null,
        lightFailure: currentHallwayState.currentAnomalyId === 'light-failure'
          ? {
              elapsed: roundForText(lightFailureElapsed),
              blackoutStarted: hasLightFailureBlackoutStarted,
              progress: roundForText(
                hasLightFailureBlackoutStarted
                  ? THREE.MathUtils.clamp(lightFailureBlackoutElapsed / LIGHT_FAILURE_BLACKOUT_SECONDS, 0, 1)
                  : 0
              )
            }
          : null,
        ambienceLevel: state.ambienceLevel,
        visibleAmbienceLevel: roundForText(smoothedAmbienceLevel),
        hallwayWalker: hallwayWalker.snapshot(),
        expectedAction: state.expectedAction,
        fps: performanceSnapshot.averageFps,
        targetFps: performanceSnapshot.targetFps,
        renderMs: performanceSnapshot.averageRenderMs,
        frameMs: performanceSnapshot.lastFrameMs,
        renderer: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        }
      });
    };
    window.render_game_to_text = installedRenderGameToText;
  }

  function disposeHallway(handles: HallwayHandles): void {
    scene.remove(handles.root);
    scene.remove(handles.ambientLight);
    handles.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
  }

  return {
    destroy(): void {
      isDestroyed = true;
      stopRenderLoop();
      hud.prompt.removeEventListener('click', requestLock);
      canvas.removeEventListener('click', requestLock);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', syncPauseState);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', syncPauseState);
      window.removeEventListener('focus', syncPauseState);
      window.removeEventListener('pageshow', syncPauseState);
      const hallwaysToDispose = new Set<HallwayHandles>([hallway]);
      if (standbyHallway) {
        hallwaysToDispose.add(standbyHallway.handles);
      }
      if (queuedPreviewHallway) {
        hallwaysToDispose.add(queuedPreviewHallway.handles);
      }
      if (nextHallway) {
        hallwaysToDispose.add(nextHallway.handles);
      }

      hallwayWalker.dispose();
      for (const handles of hallwaysToDispose) {
        disposeHallway(handles);
      }
      audio.destroy();
      screenEffects.dispose();
      renderer.dispose();
      if (window.advanceTime === installedAdvanceTime) {
        window.advanceTime = previousAdvanceTime;
      }
      if (window.render_game_to_text === installedRenderGameToText) {
        window.render_game_to_text = previousRenderGameToText;
      }
      root.replaceChildren();
    }
  };
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f9fb);
  scene.fog = new THREE.FogExp2(0xf1f5f8, 0.006);
  return scene;
}

function createScreenEffectPass(renderer: THREE.WebGLRenderer): ScreenEffectPass {
  const drawingBufferSize = new THREE.Vector2(1, 1);
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false
  });
  renderTarget.texture.name = 'screen-effect-color';

  const uniforms = {
    tDiffuse: { value: renderTarget.texture },
    time: { value: 0 },
    warp: { value: BASE_LENS_WARP },
    aberration: { value: 0.0011 },
    fuzz: { value: BASE_SCREEN_FUZZ },
    resolution: { value: new THREE.Vector2(1, 1) }
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float warp;
      uniform float aberration;
      uniform float fuzz;
      uniform vec2 resolution;
      varying vec2 vUv;

      float random(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float radius = dot(centered, centered);
        float edge = smoothstep(0.34, 1.22, length(centered));
        float horizontalDrift = sin(centered.y * 9.0 + time * 1.7) * fuzz * 0.0014;
        float verticalDrift = sin(centered.x * 7.0 - time * 1.2) * fuzz * 0.0007;
        vec2 warped = centered * (1.0 + warp * radius) + vec2(horizontalDrift, verticalDrift);
        vec2 uv = warped * 0.5 + 0.5;
        vec2 edgeDirection = normalize(centered + vec2(0.0001, -0.0001));
        vec2 chroma = edgeDirection * aberration * (0.45 + radius);
        vec3 color = vec3(
          texture2D(tDiffuse, uv + chroma).r,
          texture2D(tDiffuse, uv).g,
          texture2D(tDiffuse, uv - chroma).b
        );
        vec2 blurStep = vec2(0.0015, 0.001) * fuzz * (0.25 + edge);
        vec3 soft = (
          texture2D(tDiffuse, uv + vec2(blurStep.x, 0.0)).rgb +
          texture2D(tDiffuse, uv - vec2(blurStep.x, 0.0)).rgb +
          texture2D(tDiffuse, uv + vec2(0.0, blurStep.y)).rgb +
          texture2D(tDiffuse, uv - vec2(0.0, blurStep.y)).rgb
        ) * 0.25;
        color = mix(color, soft, edge * fuzz * 0.24);
        float grain = random(floor(gl_FragCoord.xy * 0.68 + time * vec2(43.0, 19.0))) - 0.5;
        color += grain * fuzz * 0.055;
        color *= 1.0 - smoothstep(0.6, 1.42, length(centered)) * (0.16 + fuzz * 0.1);
        color = mix(color, vec3(0.018, 0.052, 0.044), edge * warp * 0.14);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  material.toneMapped = true;

  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(geometry, material);
  postScene.add(quad);

  return {
    setSize(): void {
      renderer.getDrawingBufferSize(drawingBufferSize);
      const width = Math.max(1, Math.round(drawingBufferSize.x));
      const height = Math.max(1, Math.round(drawingBufferSize.y));
      renderTarget.setSize(width, height);
      uniforms.resolution.value.set(width, height);
    },
    setState(state: ScreenEffectState): void {
      uniforms.time.value = state.time;
      uniforms.warp.value = state.warp;
      uniforms.aberration.value = state.aberration;
      uniforms.fuzz.value = state.fuzz;
    },
    render(scene: THREE.Scene, camera: THREE.Camera): void {
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    dispose(): void {
      renderTarget.dispose();
      geometry.dispose();
      material.dispose();
    }
  };
}

function resolveMovement(
  current: THREE.Vector3,
  candidate: THREE.Vector3,
  isWalkable: (x: number, z: number) => boolean,
  xOnly: THREE.Vector3,
  zOnly: THREE.Vector3
): THREE.Vector3 {
  if (isWalkable(candidate.x, candidate.z)) {
    return candidate;
  }

  xOnly.set(candidate.x, PLAYER_HEIGHT, current.z);
  if (isWalkable(xOnly.x, xOnly.z)) {
    return xOnly;
  }

  zOnly.set(current.x, PLAYER_HEIGHT, candidate.z);
  if (isWalkable(zOnly.x, zOnly.z)) {
    return zOnly;
  }

  return current;
}

function isWalkableLocal(
  x: number,
  z: number,
  walkableRects: BoundsRect[]
): boolean {
  return walkableRects.some(
    (rect) =>
      x >= rect.xMin + PLAYER_RADIUS &&
      x <= rect.xMax - PLAYER_RADIUS &&
      z >= rect.zMin + PLAYER_RADIUS &&
      z <= rect.zMax - PLAYER_RADIUS
  );
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  material.dispose();
}

function clampAngleAround(angle: number, center: number, limit: number): number {
  const delta = normalizeAngle(angle - center);
  return normalizeAngle(center + THREE.MathUtils.clamp(delta, -limit, limit));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function formatSide(side: TransitionSide): string {
  return side < 0 ? 'forward/-' : 'back/+';
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function roundForText(value: number): number {
  return Math.round(value * 100) / 100;
}

function createFramePerformanceTracker(): FramePerformance {
  const maxSamples = 90;
  const renderSamples: number[] = [];
  const deltaSamples: number[] = [];
  let lastRenderMs = 0;
  let lastFrameMs = 0;

  return {
    record(renderCostMs: number, frameDeltaSeconds: number): void {
      lastRenderMs = renderCostMs;
      lastFrameMs = frameDeltaSeconds * 1000;
      renderSamples.push(renderCostMs);
      deltaSamples.push(frameDeltaSeconds);

      if (renderSamples.length > maxSamples) {
        renderSamples.shift();
        deltaSamples.shift();
      }
    },
    snapshot() {
      const averageRenderMs = average(renderSamples);
      const averageDelta = average(deltaSamples);
      return {
        targetFps: TARGET_FPS,
        averageFps: averageDelta > 0 ? Math.round((1 / averageDelta) * 10) / 10 : 0,
        averageRenderMs: Math.round(averageRenderMs * 10) / 10,
        lastRenderMs: Math.round(lastRenderMs * 10) / 10,
        lastFrameMs: Math.round(lastFrameMs * 10) / 10
      };
    }
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

interface HorrorAudio {
  resume(): void;
  suspend(): void;
  update(
    state: GameState,
    ambienceLevel: number,
    elapsedSeconds: number,
    movementSpeed: number,
    isSprinting: boolean,
    walker: HallwayWalkerSnapshot,
    playerPosition: THREE.Vector3,
    listenerYaw: number,
    lightFailure: LightFailureCueState
  ): void;
  destroy(): void;
}

function createHorrorAudio(): HorrorAudio {
  type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  let context: AudioContext | null = null;
  let hum: OscillatorNode | null = null;
  let drone: OscillatorNode | null = null;
  let buzz: OscillatorNode | null = null;
  let flickerNoise: AudioBufferSourceNode | null = null;
  let humGain: GainNode | null = null;
  let droneGain: GainNode | null = null;
  let buzzGain: GainNode | null = null;
  let flickerGain: GainNode | null = null;
  let dryBus: GainNode | null = null;
  let roomSend: GainNode | null = null;
  let roomReturn: GainNode | null = null;
  let footstepEchoDelay: DelayNode | null = null;
  let footstepEchoFeedback: GainNode | null = null;
  let footstepEchoReturn: GainNode | null = null;
  let masterGain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let buzzFilter: BiquadFilterNode | null = null;
  let flickerFilter: BiquadFilterNode | null = null;
  let roomReverb: ConvolverNode | null = null;
  let recordedFootstepBuffer: AudioBuffer | null = null;
  let recordedFootstepLoad: Promise<void> | null = null;
  let lightFailureBuffer: AudioBuffer | null = null;
  let lightFailureLoad: Promise<void> | null = null;
  let nextFootstepTime = 0;
  let footstepIndex = 0;
  let lastWalkerFootstepId = 0;
  let walkerFootstepIndex = 0;

  const ensureContext = (): void => {
    if (context || !AudioContextCtor) {
      return;
    }

    context = new AudioContextCtor();
    hum = context.createOscillator();
    drone = context.createOscillator();
    buzz = context.createOscillator();
    flickerNoise = context.createBufferSource();
    humGain = context.createGain();
    droneGain = context.createGain();
    buzzGain = context.createGain();
    flickerGain = context.createGain();
    dryBus = context.createGain();
    roomSend = context.createGain();
    roomReturn = context.createGain();
    footstepEchoDelay = context.createDelay(0.8);
    footstepEchoFeedback = context.createGain();
    footstepEchoReturn = context.createGain();
    masterGain = context.createGain();
    filter = context.createBiquadFilter();
    buzzFilter = context.createBiquadFilter();
    flickerFilter = context.createBiquadFilter();
    roomReverb = context.createConvolver();

    hum.type = 'sawtooth';
    hum.frequency.value = 59.7;
    drone.type = 'sine';
    drone.frequency.value = 36;
    buzz.type = 'square';
    buzz.frequency.value = 119.4;
    flickerNoise.buffer = createLoopingNoiseBuffer(context, 1.7);
    flickerNoise.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    buzzFilter.type = 'bandpass';
    buzzFilter.frequency.value = 1850;
    buzzFilter.Q.value = 7;
    flickerFilter.type = 'highpass';
    flickerFilter.frequency.value = 2600;
    roomReverb.buffer = createRoomImpulse(context, 2.7, 2.45);
    humGain.gain.value = 0.018;
    droneGain.gain.value = 0.004;
    buzzGain.gain.value = 0.0028;
    flickerGain.gain.value = 0.0014;
    dryBus.gain.value = 0.92;
    roomSend.gain.value = 0.34;
    roomReturn.gain.value = 0.48;
    footstepEchoDelay.delayTime.value = 0.28;
    footstepEchoFeedback.gain.value = 0.08;
    footstepEchoReturn.gain.value = 0.2;
    masterGain.gain.value = 0.76;

    hum.connect(humGain).connect(filter);
    filter.connect(dryBus);
    filter.connect(roomSend);
    drone.connect(droneGain);
    droneGain.connect(dryBus);
    droneGain.connect(roomSend);
    buzz.connect(buzzGain).connect(buzzFilter);
    buzzFilter.connect(dryBus);
    buzzFilter.connect(roomSend);
    flickerNoise.connect(flickerFilter).connect(flickerGain);
    flickerGain.connect(dryBus);
    flickerGain.connect(roomSend);
    dryBus.connect(masterGain);
    roomSend.connect(roomReverb).connect(roomReturn).connect(masterGain);
    footstepEchoDelay.connect(footstepEchoReturn).connect(masterGain);
    footstepEchoReturn.connect(footstepEchoFeedback).connect(footstepEchoDelay);
    masterGain.connect(context.destination);
    hum.start();
    drone.start();
    buzz.start();
    flickerNoise.start();
    loadRecordedFootsteps();
    loadLightFailureSample();
  };

  const loadRecordedFootsteps = (): void => {
    if (!context || recordedFootstepLoad) {
      return;
    }

    const targetContext = context;
    recordedFootstepLoad = fetch(FOOTSTEP_SAMPLE_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((audioData) => targetContext.decodeAudioData(audioData))
      .then((decodedBuffer) => {
        if (context === targetContext) {
          recordedFootstepBuffer = decodedBuffer;
        }
      })
      .catch((error: unknown) => {
        console.warn(`Could not load footstep sample ${FOOTSTEP_SAMPLE_PATH}`, error);
      });
  };

  const loadLightFailureSample = (): void => {
    if (!context || lightFailureLoad) {
      return;
    }

    const targetContext = context;
    lightFailureLoad = fetch(LIGHT_FAILURE_SAMPLE_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((audioData) => targetContext.decodeAudioData(audioData))
      .then((decodedBuffer) => {
        if (context === targetContext) {
          lightFailureBuffer = decodedBuffer;
        }
      })
      .catch((error: unknown) => {
        console.warn(`Could not load light failure sample ${LIGHT_FAILURE_SAMPLE_PATH}`, error);
      });
  };

  const updateFootsteps = (movementSpeed: number, isSprinting: boolean, ambience: number): void => {
    if (!context || context.state !== 'running' || movementSpeed < 0.12) {
      nextFootstepTime = 0;
      return;
    }

    const now = context.currentTime;
    if (nextFootstepTime <= 0 || nextFootstepTime < now - 0.08) {
      nextFootstepTime = now + 0.03;
    }

    const baseInterval = isSprinting ? 0.34 : 0.52;
    const pace = clampNumber(baseInterval - (movementSpeed - 2.4) * 0.035, 0.3, 0.62);
    const intensity = clampNumber(
      (isSprinting ? 0.82 : 0.64) + movementSpeed * 0.065 + ambience * 0.035,
      0.62,
      1.08
    );

    while (nextFootstepTime <= now + 0.08) {
      playFootstep(nextFootstepTime, {
        intensity,
        index: footstepIndex,
        ambience,
        pan: (footstepIndex % 2 === 0 ? -1 : 1) * 0.12,
        echo: 0.8,
        room: 0.72,
        lowpass: 1
      });
      nextFootstepTime += pace;
      footstepIndex += 1;
    }
  };

  const updateWalkerFootsteps = (
    walker: HallwayWalkerSnapshot,
    player: THREE.Vector3,
    ambience: number,
    listenerYaw: number
  ): void => {
    if (!context || context.state !== 'running' || !walker.visible || !walker.walking) {
      lastWalkerFootstepId = walker.stepId;
      return;
    }

    if (walker.stepId === lastWalkerFootstepId) {
      return;
    }

    lastWalkerFootstepId = walker.stepId;

    const distance = Math.hypot(walker.x - player.x, walker.z - player.z);
    const distanceVolume = clampNumber(1 / (1 + distance * 0.18), 0.18, 0.88);
    const pan = getListenerRelativePan(walker.x - player.x, walker.z - player.z, listenerYaw);
    const room = clampNumber(0.32 + distance * 0.035 + ambience * 0.025, 0.35, 0.72);
    const echo = clampNumber(0.18 + distance * 0.018 + ambience * 0.018, 0.18, 0.48);

    playFootstep(context.currentTime + 0.015, {
      intensity: distanceVolume * (0.96 + ambience * 0.035),
      index: walkerFootstepIndex,
      ambience,
      pan,
      echo,
      room,
      lowpass: 1
    });
    walkerFootstepIndex += 1;
  };

  interface FootstepOptions {
    intensity: number;
    index: number;
    ambience: number;
    pan: number;
    echo: number;
    room: number;
    lowpass: number;
  }

  const playFootstep = (time: number, options: FootstepOptions): void => {
    if (!context || !dryBus || !roomSend || !footstepEchoDelay || !recordedFootstepBuffer) {
      return;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const dryGain = context.createGain();
    const roomGain = context.createGain();
    const echoGain = context.createGain();
    const stepDuration = RECORDED_FOOTSTEP_SLICE_DURATION;
    const sampleOffset = getRecordedFootstepOffset(recordedFootstepBuffer, options.index, stepDuration);

    source.buffer = recordedFootstepBuffer;
    source.playbackRate.setValueAtTime(1, time);
    panner.pan.setValueAtTime(options.pan * 0.85, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.88 * options.intensity, time + 0.006);
    gain.gain.linearRampToValueAtTime(0.0001, time + stepDuration);
    dryGain.gain.setValueAtTime(0.88, time);
    roomGain.gain.setValueAtTime(options.room * 0.22, time);
    echoGain.gain.setValueAtTime(options.echo * 0.1, time);
    source.connect(gain).connect(panner);
    panner.connect(dryGain).connect(dryBus);
    panner.connect(roomGain).connect(roomSend);
    panner.connect(echoGain).connect(footstepEchoDelay);
    source.start(time, sampleOffset, stepDuration);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      dryGain.disconnect();
      roomGain.disconnect();
      echoGain.disconnect();
    };
  };

  const playLightFailureSound = (time: number): void => {
    if (!context || !dryBus || !roomSend) {
      return;
    }

    if (lightFailureBuffer) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const filterNode = context.createBiquadFilter();
      const roomGain = context.createGain();
      source.buffer = lightFailureBuffer;
      source.playbackRate.setValueAtTime(0.86, time);
      filterNode.type = 'bandpass';
      filterNode.frequency.setValueAtTime(1800, time);
      filterNode.frequency.exponentialRampToValueAtTime(420, time + 1.2);
      filterNode.Q.setValueAtTime(1.8, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.82, time + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.75);
      roomGain.gain.setValueAtTime(0.24, time);
      source.connect(filterNode).connect(gain);
      gain.connect(dryBus);
      gain.connect(roomGain).connect(roomSend);
      source.start(time, 0, Math.min(1.8, lightFailureBuffer.duration));
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        filterNode.disconnect();
        roomGain.disconnect();
      };
      return;
    }

    const whirr = context.createOscillator();
    const whirrGain = context.createGain();
    const whirrFilter = context.createBiquadFilter();
    const sparkNoise = context.createBufferSource();
    const sparkGain = context.createGain();
    const sparkFilter = context.createBiquadFilter();

    whirr.type = 'sawtooth';
    whirr.frequency.setValueAtTime(162, time);
    whirr.frequency.exponentialRampToValueAtTime(31, time + 1.45);
    whirrFilter.type = 'lowpass';
    whirrFilter.frequency.setValueAtTime(2200, time);
    whirrFilter.frequency.exponentialRampToValueAtTime(260, time + 1.35);
    whirrGain.gain.setValueAtTime(0.0001, time);
    whirrGain.gain.linearRampToValueAtTime(0.13, time + 0.045);
    whirrGain.gain.exponentialRampToValueAtTime(0.0001, time + 1.58);

    sparkNoise.buffer = createElectricCrackleBuffer(context, 0.72);
    sparkFilter.type = 'bandpass';
    sparkFilter.frequency.setValueAtTime(4200, time);
    sparkFilter.Q.setValueAtTime(5.5, time);
    sparkGain.gain.setValueAtTime(0.0001, time);
    sparkGain.gain.linearRampToValueAtTime(0.22, time + 0.025);
    sparkGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.62);

    whirr.connect(whirrFilter).connect(whirrGain);
    whirrGain.connect(dryBus);
    whirrGain.connect(roomSend);
    sparkNoise.connect(sparkFilter).connect(sparkGain);
    sparkGain.connect(dryBus);
    sparkGain.connect(roomSend);
    whirr.start(time);
    whirr.stop(time + 1.65);
    sparkNoise.start(time + 0.04);
    sparkNoise.stop(time + 0.76);

    const cleanup = () => {
      whirr.disconnect();
      whirrGain.disconnect();
      whirrFilter.disconnect();
      sparkNoise.disconnect();
      sparkGain.disconnect();
      sparkFilter.disconnect();
    };
    whirr.onended = cleanup;
  };

  return {
    resume(): void {
      ensureContext();
      void context?.resume();
    },
    suspend(): void {
      if (context?.state === 'running') {
        void context.suspend();
      }
    },
    update(
      state: GameState,
      ambienceLevel: number,
      elapsedSeconds: number,
      movementSpeed: number,
    isSprinting: boolean,
    walker: HallwayWalkerSnapshot,
    playerPosition: THREE.Vector3,
    listenerYaw: number,
    lightFailure: LightFailureCueState
  ): void {
      if (
        !context ||
        !hum ||
        !drone ||
        !buzz ||
        !humGain ||
        !droneGain ||
        !buzzGain ||
        !flickerGain ||
        !roomSend ||
        !roomReturn ||
        !footstepEchoReturn ||
        !footstepEchoFeedback ||
        !filter ||
        !buzzFilter ||
        !flickerFilter
      ) {
        return;
      }

      const ambience = state.phase === 'escaped' ? 0 : ambienceLevel;
      if (lightFailure.justTriggered) {
        playLightFailureSound(context.currentTime + 0.01);
      }

      const blackout = state.currentAnomalyId === 'light-failure'
        ? THREE.MathUtils.smoothstep(lightFailure.progress, 0, 1)
        : 0;
      const ambientMute = 1 - blackout * 0.88;
      const wobble = Math.sin(elapsedSeconds * 1.9) * 2.2;
      const flicker = Math.max(
        0,
        Math.sin(elapsedSeconds * 8.7) * 0.55 + Math.sin(elapsedSeconds * 17.3) * 0.28
      );
      hum.frequency.setTargetAtTime(59.7 + ambience * 0.35 + wobble, context.currentTime, 0.08);
      drone.frequency.setTargetAtTime(36 + ambience * 1.2, context.currentTime, 0.1);
      buzz.frequency.setTargetAtTime(
        119.4 + ambience * 0.8 + Math.sin(elapsedSeconds * 5.2) * 0.5,
        context.currentTime,
        0.06
      );
      humGain.gain.setTargetAtTime((0.017 + ambience * 0.004) * ambientMute, context.currentTime, 0.08);
      droneGain.gain.setTargetAtTime((0.004 + ambience * 0.005) * (1 - blackout * 0.32), context.currentTime, 0.08);
      buzzGain.gain.setTargetAtTime(
        (0.0027 + ambience * 0.0007 + flicker * 0.0014) * (1 - blackout * 0.96),
        context.currentTime,
        0.04
      );
      flickerGain.gain.setTargetAtTime(
        (0.001 + ambience * 0.00055 + flicker * 0.001) * (1 - blackout * 0.9) + lightFailure.sparkPulse * 0.0016,
        context.currentTime,
        0.045
      );
      filter.frequency.setTargetAtTime(220 + (360 + ambience * 56) * ambientMute, context.currentTime, 0.12);
      buzzFilter.frequency.setTargetAtTime(1800 + ambience * 120 + flicker * 380 + lightFailure.sparkPulse * 900, context.currentTime, 0.05);
      flickerFilter.frequency.setTargetAtTime(2600 + ambience * 140 + flicker * 500 + lightFailure.sparkPulse * 1200, context.currentTime, 0.05);
      roomSend.gain.setTargetAtTime(0.34 + ambience * 0.035, context.currentTime, 0.12);
      roomReturn.gain.setTargetAtTime(0.48 + ambience * 0.025, context.currentTime, 0.12);
      footstepEchoReturn.gain.setTargetAtTime(0.2 + ambience * 0.018, context.currentTime, 0.1);
      footstepEchoFeedback.gain.setTargetAtTime(0.08 + ambience * 0.01, context.currentTime, 0.1);
      updateFootsteps(movementSpeed, isSprinting, ambience);
      updateWalkerFootsteps(walker, playerPosition, ambience, listenerYaw);
    },
    destroy(): void {
      hum?.stop();
      drone?.stop();
      buzz?.stop();
      flickerNoise?.stop();
      void context?.close();
      context = null;
      hum = null;
      drone = null;
      buzz = null;
      flickerNoise = null;
      humGain = null;
      droneGain = null;
      buzzGain = null;
      flickerGain = null;
      dryBus = null;
      roomSend = null;
      roomReturn = null;
      footstepEchoDelay = null;
      footstepEchoFeedback = null;
      footstepEchoReturn = null;
      masterGain = null;
      filter = null;
      buzzFilter = null;
      flickerFilter = null;
      roomReverb = null;
      recordedFootstepBuffer = null;
      recordedFootstepLoad = null;
      lightFailureBuffer = null;
      lightFailureLoad = null;
      nextFootstepTime = 0;
      lastWalkerFootstepId = 0;
      walkerFootstepIndex = 0;
    }
  };
}

function getRecordedFootstepOffset(buffer: AudioBuffer, index: number, stepDuration: number): number {
  const detectedOffset = RECORDED_FOOTSTEP_SEGMENT_OFFSETS[index % RECORDED_FOOTSTEP_SEGMENT_OFFSETS.length];
  const latestSafeOffset = Math.max(0, buffer.duration - stepDuration - 0.01);
  return Math.min(detectedOffset, latestSafeOffset);
}

function getListenerRelativePan(deltaX: number, deltaZ: number, listenerYaw: number): number {
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= 0.001) {
    return 0;
  }

  const rightX = Math.cos(listenerYaw);
  const rightZ = -Math.sin(listenerYaw);
  return clampNumber((deltaX * rightX + deltaZ * rightZ) / distance, -0.95, 0.95);
}

function createLoopingNoiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let pink = 0;

  for (let index = 0; index < length; index += 1) {
    pink = pink * 0.86 + (Math.random() * 2 - 1) * 0.14;
    channel[index] = pink;
  }

  return buffer;
}

function createElectricCrackleBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let burst = 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / length;
    const envelope = Math.pow(1 - progress, 2.1);
    const trigger = Math.random() > 0.91 ? Math.random() * 2 - 1 : 0;
    burst = burst * 0.42 + trigger * 0.58;
    channel[index] = burst * envelope;
  }

  return buffer;
}

function createRoomImpulse(context: BaseAudioContext, seconds: number, decayPower: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);

  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    let smear = 0;

    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.pow(1 - progress, decayPower);
      smear = smear * 0.64 + (Math.random() * 2 - 1) * 0.36;
      channel[index] = smear * decay * (channelIndex === 0 ? 0.78 : 0.72);
    }
  }

  return buffer;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
