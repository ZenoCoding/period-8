import { ANOMALY_BY_ID } from '../game/simulation/anomalies';
import type { GameState } from '../game/simulation/types';

export interface HudElements {
  root: HTMLDivElement;
  message: HTMLDivElement;
  debug: HTMLDivElement;
  prompt: HTMLButtonElement;
  fade: HTMLDivElement;
  setLocked(isLocked: boolean): void;
  setPaused(isPaused: boolean): void;
  setDebugVisible(isVisible: boolean): void;
  flashPortal(): void;
}

export function createHud(parent: HTMLElement): HudElements {
  const root = document.createElement('div');
  root.className = 'hud';

  const message = document.createElement('div');
  message.className = 'hud__message';

  const debug = document.createElement('div');
  debug.className = 'hud__debug';

  const prompt = document.createElement('button');
  prompt.className = 'hud__prompt';
  prompt.type = 'button';
  prompt.textContent = 'Click to enter';

  const fade = document.createElement('div');
  fade.className = 'hud__fade';

  root.append(message, debug, prompt, fade);
  parent.append(root);

  let fadeTimer = 0;

  return {
    root,
    message,
    debug,
    prompt,
    fade,
    setLocked(isLocked: boolean) {
      root.classList.toggle('hud--locked', isLocked);
    },
    setPaused(isPaused: boolean) {
      root.classList.toggle('hud--paused', isPaused);
      prompt.textContent = isPaused ? 'Paused' : 'Click to enter';
    },
    setDebugVisible(isVisible: boolean) {
      debug.classList.toggle('hud__debug--visible', isVisible);
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
    `Loop seed: ${state.loopIndex}`,
    `Expected: ${state.expectedAction}`,
    `Active anomaly: ${anomaly?.label ?? 'none'}`,
    `Subtlety: ${anomaly?.subtlety ?? 'n/a'}`,
    `Streak: ${state.streak}`,
    `Fails: ${state.failCount}`
  ].join('\n');
}
