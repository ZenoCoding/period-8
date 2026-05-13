import * as THREE from 'three';
import { applyKeyChange, createInputState } from '../../game/input/actions';
import { createInitialGameState } from '../../game/simulation/gameState';
import type { GameState } from '../../game/simulation/types';
import { createHud, renderHud } from '../../ui/hud';
import { applyAnomaly, updateAnomaly, updateAtmosphere } from '../adapters/anomalyRenderer';
import { createHallwayScene, setTransitionSign, setTransitionSignVisible, WALKABLE_RECTS } from '../objects/hallway';
import {
  beginTransition,
  commitTransition,
  markTransitionPostCommit,
  type ActiveTransition,
  type TransitionPhase,
  type TransitionSide
} from './transitionController';

export interface RepetitionGame {
  destroy(): void;
}

const PLAYER_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.28;
const NEGATIVE_HALLWAY_START = new THREE.Vector3(0, PLAYER_HEIGHT, 7.15);
const NEGATIVE_EXIT_Z = -7.72;
const POSITIVE_EXIT_X = 1.82;
const NEGATIVE_COMMIT_X = -11.1;
const POSITIVE_COMMIT_X = 11.1;
const NEGATIVE_POST_SIGN_HANDOFF_Z = -22.05;
const POSITIVE_POST_SIGN_HANDOFF_Z = 22.05;
const UP = new THREE.Vector3(0, 1, 0);

export function createRepetitionGame(root: HTMLElement): RepetitionGame {
  root.replaceChildren();

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  root.append(canvas);

  const renderer = createRenderer(canvas);
  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(74, 1, 0.035, 70);
  camera.rotation.order = 'YXZ';

  const hallway = createHallwayScene(scene);
  const hud = createHud(root);
  const input = createInputState();
  const audio = createHorrorAudio();

  let state = createInitialGameState();
  let animationFrame = 0;
  let isRenderLoopRunning = false;
  let isPaused = false;
  let isPointerLocked = false;
  let transitionCooldown = 0;
  let transitionPhase: TransitionPhase = 'observing';
  let activeTransition: ActiveTransition | null = null;
  let yaw = 0;
  let pitch = 0;
  let activeElapsedSeconds = 0;
  const clock = new THREE.Clock();
  const playerPosition = NEGATIVE_HALLWAY_START.clone();
  const moveForward = new THREE.Vector3();
  const moveRight = new THREE.Vector3();

  applyAnomaly(hallway, state.currentAnomalyId);
  resetTransitionSignsToCount(0);
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
    if (applyKeyChange(input, event.code, true)) {
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
    camera.rotation.set(pitch, yaw, 0);

    if (isPointerLocked) {
      updatePlayerPosition(deltaSeconds);
      if (state.phase === 'playing' || transitionPhase !== 'observing') {
        evaluateTransitions();
      }
    }

    camera.position.copy(playerPosition);
    updateAnomaly(hallway, state, playerPosition, elapsedSeconds);
    updateAtmosphere(scene, hallway, state);
    hud.setDebugVisible(input.debug);
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
    playerPosition.copy(resolveMovement(playerPosition, candidate));
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

    if (commit.shouldReset) {
      resetAfterWrongChoice();
      return;
    }

    applyAnomaly(hallway, state.currentAnomalyId);
    setTransitionSign(
      hallway,
      activeTransition.side,
      commit.signCount,
      state.targetLoops,
      state.phase === 'escaped'
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
      !isPastPostSignHandoff(activeTransition.side)
    ) {
      return;
    }

    playerPosition.copy(NEGATIVE_HALLWAY_START);
    yaw = 0;
    activeTransition = null;
    transitionPhase = 'observing';
    setTransitionSignVisible(hallway, null);
  }

  function getCurrentExitSide(): TransitionSide | null {
    if (playerPosition.z <= NEGATIVE_EXIT_Z) {
      return -1;
    }

    if (
      playerPosition.x >= POSITIVE_EXIT_X &&
      playerPosition.z >= 6.65 &&
      playerPosition.z <= 9.35
    ) {
      return 1;
    }

    return null;
  }

  function isPastCommitGate(side: TransitionSide): boolean {
    if (side < 0) {
      return playerPosition.x <= NEGATIVE_COMMIT_X && playerPosition.z <= -14.35;
    }

    return playerPosition.x >= POSITIVE_COMMIT_X && playerPosition.z >= 14.35;
  }

  function isPastPostSignHandoff(side: TransitionSide): boolean {
    return side < 0
      ? playerPosition.z <= NEGATIVE_POST_SIGN_HANDOFF_Z
      : playerPosition.z >= POSITIVE_POST_SIGN_HANDOFF_Z;
  }

  function resetAfterWrongChoice(): void {
    transitionPhase = 'resetting';
    activeTransition = null;
    playerPosition.copy(NEGATIVE_HALLWAY_START);
    yaw = 0;
    pitch = 0;
    transitionCooldown = 0.64;
    applyAnomaly(hallway, state.currentAnomalyId);
    resetTransitionSignsToCount(0);
    renderHud(hud, state);
    hud.flashPortal();
    transitionPhase = 'observing';
  }

  function resetTransitionSignsToCount(count: number): void {
    setTransitionSign(hallway, -1, count, state.targetLoops, state.phase === 'escaped');
    setTransitionSign(hallway, 1, count, state.targetLoops, state.phase === 'escaped');
    setTransitionSignVisible(hallway, null);
  }

  function isInsideCurrentHallway(): boolean {
    return Math.abs(playerPosition.x) <= 1.24 && playerPosition.z > -7.45 && playerPosition.z < 7.45;
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

function resolveMovement(current: THREE.Vector3, candidate: THREE.Vector3): THREE.Vector3 {
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

function isWalkable(x: number, z: number): boolean {
  return WALKABLE_RECTS.some(
    (rect) =>
      x >= rect.xMin + PLAYER_RADIUS &&
      x <= rect.xMax - PLAYER_RADIUS &&
      z >= rect.zMin + PLAYER_RADIUS &&
      z <= rect.zMax - PLAYER_RADIUS
  );
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
