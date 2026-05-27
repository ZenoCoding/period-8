import { ANOMALY_BY_ID } from '../game/simulation/anomalies';
import type { GameState } from '../game/simulation/types';

export interface HudElements {
  root: HTMLDivElement;
  message: HTMLDivElement;
  debug: HTMLDivElement;
  fps: HTMLDivElement;
  prompt: HTMLButtonElement;
  screenEffects: HTMLDivElement;
  fade: HTMLDivElement;
  setLocked(isLocked: boolean): void;
  setPaused(isPaused: boolean): void;
  setDebugVisible(isVisible: boolean): void;
  setFps(averageFps: number, lastFrameMs: number, maxFrameMs: number, isLow: boolean): void;
  setScreenEffects(fuzz: number, jitter: number): void;
  flashPortal(): void;
}

export function createHud(parent: HTMLElement): HudElements {
  const root = document.createElement('div');
  root.className = 'hud';

  const message = document.createElement('div');
  message.className = 'hud__message';

  const debug = document.createElement('div');
  debug.className = 'hud__debug';

  const fps = document.createElement('div');
  fps.className = 'hud__fps';
  fps.textContent = 'FPS -- | -- ms';

  const prompt = document.createElement('button');
  prompt.className = 'hud__prompt';
  prompt.type = 'button';
  prompt.textContent = 'Click to enter';

  const screenEffects = document.createElement('div');
  screenEffects.className = 'hud__screen-effects';

  const fade = document.createElement('div');
  fade.className = 'hud__fade';

  root.append(screenEffects, message, debug, fps, prompt, fade);
  parent.append(root);

  let fadeTimer = 0;

  return {
    root,
    message,
    debug,
    fps,
    prompt,
    screenEffects,
    fade,
    setLocked(isLocked: boolean) {
      root.classList.toggle('hud--locked', isLocked);
    },
    setPaused(isPaused: boolean) {
      root.classList.toggle('hud--paused', isPaused);
      if (!prompt.disabled) {
        prompt.textContent = isPaused ? 'Paused' : 'Click to enter';
      }
    },
    setDebugVisible(isVisible: boolean) {
      debug.classList.toggle('hud__debug--visible', isVisible);
    },
    setFps(averageFps: number, lastFrameMs: number, maxFrameMs: number, isLow: boolean) {
      fps.textContent = `FPS ${Math.round(averageFps)} | ${Math.round(lastFrameMs)} ms (Max: ${Math.round(maxFrameMs)} ms)`;
      fps.classList.toggle('hud__fps--low', isLow);
    },
    setScreenEffects(fuzz: number, jitter: number) {
      root.style.setProperty('--screen-fuzz', fuzz.toFixed(3));
      root.style.setProperty('--screen-jitter', jitter.toFixed(3));
    },
    flashPortal() {
      fade.classList.remove('hud__fade--flash');
      window.clearTimeout(fadeTimer);
      requestAnimationFrame(() => {
        fade.classList.add('hud__fade--flash');
        fadeTimer = window.setTimeout(() => fade.classList.remove('hud__fade--flash'), 520);
      });
    }
  };
}

export function renderHud(hud: HudElements, state: GameState): void {
  const anomaly = state.currentAnomalyId ? ANOMALY_BY_ID.get(state.currentAnomalyId) : null;
  hud.message.textContent = '';
  hud.debug.textContent = [
    `Correct: ${state.streak}/${state.targetLoops}`,
    `Period: ${state.loopIndex}/${state.targetLoops}`,
    `Expected: ${state.expectedAction}`,
    `Active anomaly: ${anomaly?.label ?? 'none'}`,
    `Subtlety: ${anomaly?.subtlety ?? 'n/a'}`,
    `Encounter: ${Math.round(state.encounterChance * 100)}% roll ${state.encounterRoll.toFixed(2)}`,
    `Recent: ${state.recentAnomalyIds.join(', ') || 'none'}`,
    `Streak: ${state.streak}`,
    `Fails: ${state.failCount}`
  ].join('\n');
}
