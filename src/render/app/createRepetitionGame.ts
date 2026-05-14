import * as THREE from 'three';
import { applyKeyChange, createInputState } from '../../game/input/actions';
import { createInitialGameState } from '../../game/simulation/gameState';
import type { GameState } from '../../game/simulation/types';
import { createHud, renderHud } from '../../ui/hud';
import { applyAnomaly, updateAnomaly, updateAtmosphere } from '../adapters/anomalyRenderer';
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

const PLAYER_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.28;
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
const UP = new THREE.Vector3(0, 1, 0);

interface HallwayCell {
  handles: HallwayHandles;
  state: GameState;
  walkableRects: BoundsRect[];
}

export function createRepetitionGame(root: HTMLElement): RepetitionGame {
  root.replaceChildren();

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  root.append(canvas);

  const renderer = createRenderer(canvas);
  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(74, 1, 0.035, 70);
  camera.rotation.order = 'YXZ';

  const hud = createHud(root);
  const input = createInputState();
  const audio = createHorrorAudio();

  let state = createInitialGameState();
  let hallway = createHallwayScene(scene);
  let currentHallwayState = state;
  let nextHallway: HallwayCell | null = null;
  let transitionTuning = loadTransitionTuning();
  let animationFrame = 0;
  let isRenderLoopRunning = false;
  let isPaused = false;
  let isPointerLocked = false;
  let transitionCooldown = 0;
  let transitionPhase: TransitionPhase = 'observing';
  let activeTransition: ActiveTransition | null = null;
  let suppressedExitSide: TransitionSide | null = null;
  let debugNotice = '';
  let yaw = 0;
  let pitch = 0;
  let activeElapsedSeconds = 0;
  const clock = new THREE.Clock();
  const playerPosition = NEGATIVE_HALLWAY_START.clone();
  const moveForward = new THREE.Vector3();
  const moveRight = new THREE.Vector3();

  applyTransitionTuningToHallway(hallway);
  applyAnomaly(hallway, state.currentAnomalyId);
  resetTransitionSigns(state.loopIndex, 'idle');
  renderHud(hud, state);

  const resize = (): void => {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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

    if (isPointerLocked) {
      updatePlayerPosition(deltaSeconds);
      if (state.phase === 'playing' || transitionPhase !== 'observing') {
        evaluateTransitions();
      }
    }

    camera.position.copy(playerPosition);
    updateAnomaly(hallway, currentHallwayState, playerPosition, elapsedSeconds);
    if (nextHallway) {
      updateAnomaly(nextHallway.handles, nextHallway.state, playerPosition, elapsedSeconds);
    }
    updateAtmosphere(scene, hallway, state);
    if (nextHallway) {
      updateAtmosphere(scene, nextHallway.handles, state);
    }
    hud.setDebugVisible(input.debug);
    if (input.debug) {
      updateDebugOverlay();
    }
    audio.update(state, elapsedSeconds);
  };

  const tick = (): void => {
    if (isPaused) {
      isRenderLoopRunning = false;
      animationFrame = 0;
      return;
    }

    const deltaSeconds = Math.min(clock.getDelta(), 0.05);
    activeElapsedSeconds += deltaSeconds;
    update(deltaSeconds, activeElapsedSeconds);
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(tick);
  };

  startRenderLoop();

  function startRenderLoop(): void {
    if (isPaused || isRenderLoopRunning) {
      return;
    }

    clock.getDelta();
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

  function updatePlayerPosition(deltaSeconds: number): void {
    const axisX = Number(input.right) - Number(input.left);
    const axisZ = Number(input.forward) - Number(input.backward);

    if (axisX === 0 && axisZ === 0) {
      return;
    }

    camera.getWorldDirection(moveForward);
    moveForward.y = 0;
    moveForward.normalize();
    moveRight.crossVectors(moveForward, UP).normalize();

    const movement = new THREE.Vector3()
      .addScaledVector(moveForward, axisZ)
      .addScaledVector(moveRight, axisX);

    if (movement.lengthSq() <= 0) {
      return;
    }

    movement.normalize();
    const speed = input.sprint ? 4.15 : 2.45;
    const candidate = playerPosition.clone().addScaledVector(movement, speed * deltaSeconds);
    candidate.y = PLAYER_HEIGHT;
    playerPosition.copy(resolveMovement(playerPosition, candidate, isWalkableWorld));
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
      disposeHallway(nextHallway.handles);
      nextHallway = null;
    }

    const handles = createHallwayScene(scene, { layout: 'queuedNext' });
    const rotationY = side > 0 ? Math.PI : 0;

    handles.root.rotation.y = rotationY;
    handles.root.position.set(side * QUEUED_HALLWAY_ROOT_X, 0, side * QUEUED_HALLWAY_ROOT_Z);
    handles.root.updateMatrixWorld(true);

    applyTransitionTuningToHallway(handles);
    applyAnomaly(handles, nextState.currentAnomalyId);
    updateAtmosphere(scene, handles, nextState);
    paintTransitionSigns(handles, nextState.loopIndex, nextState.targetLoops, nextState.phase === 'escaped', 'idle');
    setTransitionSignVisible(handles, null);
    nextHallway = { handles, state: nextState, walkableRects: QUEUED_HALLWAY_RECTS };
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
    const previousHallway = hallway;
    const previousPreview = cell.handles;
    const nextLocalPosition = worldToHallwayLocal(cell.handles, playerPosition);
    const nextRootYaw = cell.handles.root.rotation.y;

    yaw = normalizeAngle(yaw - nextRootYaw);
    hallway = createHallwayScene(scene);
    currentHallwayState = cell.state;
    nextHallway = null;
    applyTransitionTuningToHallway(hallway);
    applyAnomaly(hallway, state.currentAnomalyId);
    hallway.root.position.set(0, 0, 0);
    hallway.root.rotation.set(0, 0, 0);
    hallway.root.updateMatrixWorld(true);
    playerPosition.copy(
      hallway.root.localToWorld(new THREE.Vector3(nextLocalPosition.x, PLAYER_HEIGHT, nextLocalPosition.z))
    );
    disposeHallway(previousHallway);
    disposeHallway(previousPreview);
    resetTransitionSigns(state.loopIndex, 'idle');
    renderHud(hud, state);
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
    hud.debug.textContent = [
      `Position: x ${formatNumber(local.x)} z ${formatNumber(local.z)} yaw ${formatNumber(yaw)}`,
      queuedLocal ? `Queued local: x ${formatNumber(queuedLocal.x)} z ${formatNumber(queuedLocal.z)}` : 'Queued local: none',
      `Transition: ${transitionPhase} side ${formatSide(side)}`,
      `Level: ${state.loopIndex}/${state.targetLoops} outcome ${state.lastOutcome}`,
      formatTransitionTuning(transitionTuning),
      'Debug tuning: C commit, V sign, R reset',
      debugNotice ? `Last: ${debugNotice}` : ''
    ].filter(Boolean).join('\n');
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

  function paintTransitionSigns(
    handles: HallwayHandles,
    level: number,
    targetLoops: number,
    isEscaped: boolean,
    outcome: 'idle' | 'correct' | 'wrong'
  ): void {
    setTransitionSign(handles, -1, level, targetLoops, isEscaped, outcome);
    setTransitionSign(handles, 1, level, targetLoops, isEscaped, outcome);
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
      if (nextHallway) {
        disposeHallway(nextHallway.handles);
      }
      disposeHallway(hallway);
      audio.destroy();
      renderer.dispose();
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

function resolveMovement(
  current: THREE.Vector3,
  candidate: THREE.Vector3,
  isWalkable: (x: number, z: number) => boolean
): THREE.Vector3 {
  if (isWalkable(candidate.x, candidate.z)) {
    return candidate;
  }

  const xOnly = new THREE.Vector3(candidate.x, PLAYER_HEIGHT, current.z);
  if (isWalkable(xOnly.x, xOnly.z)) {
    return xOnly;
  }

  const zOnly = new THREE.Vector3(current.x, PLAYER_HEIGHT, candidate.z);
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

interface HorrorAudio {
  resume(): void;
  suspend(): void;
  update(state: GameState, elapsedSeconds: number): void;
  destroy(): void;
}

function createHorrorAudio(): HorrorAudio {
  type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  let context: AudioContext | null = null;
  let hum: OscillatorNode | null = null;
  let drone: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let droneGain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;

  const ensureContext = (): void => {
    if (context || !AudioContextCtor) {
      return;
    }

    context = new AudioContextCtor();
    hum = context.createOscillator();
    drone = context.createOscillator();
    humGain = context.createGain();
    droneGain = context.createGain();
    filter = context.createBiquadFilter();

    hum.type = 'sawtooth';
    hum.frequency.value = 59.7;
    drone.type = 'sine';
    drone.frequency.value = 36;
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    humGain.gain.value = 0.018;
    droneGain.gain.value = 0.004;

    hum.connect(humGain).connect(filter).connect(context.destination);
    drone.connect(droneGain).connect(context.destination);
    hum.start();
    drone.start();
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
    update(state: GameState, elapsedSeconds: number): void {
      if (!context || !hum || !drone || !humGain || !droneGain || !filter) {
        return;
      }

      const ambience = state.ambienceLevel;
      const wobble = Math.sin(elapsedSeconds * 1.9) * 2.2;
      hum.frequency.setTargetAtTime(59.7 + ambience * 0.35 + wobble, context.currentTime, 0.08);
      drone.frequency.setTargetAtTime(36 + ambience * 1.2, context.currentTime, 0.1);
      humGain.gain.setTargetAtTime(0.017 + ambience * 0.004, context.currentTime, 0.08);
      droneGain.gain.setTargetAtTime(0.004 + ambience * 0.005, context.currentTime, 0.08);
      filter.frequency.setTargetAtTime(360 + ambience * 56, context.currentTime, 0.12);
    },
    destroy(): void {
      hum?.stop();
      drone?.stop();
      void context?.close();
      context = null;
      hum = null;
      drone = null;
      humGain = null;
      droneGain = null;
      filter = null;
    }
  };
}
