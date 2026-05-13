export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  debug: boolean;
}

const KEY_TO_ACTION: Record<string, keyof InputState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint'
};

export function createInputState(): InputState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    debug: false
  };
}

export function applyKeyChange(input: InputState, code: string, isDown: boolean): boolean {
  if (code === 'Backquote' && isDown) {
    input.debug = !input.debug;
    return true;
  }

  const action = KEY_TO_ACTION[code];
  if (!action) {
    return false;
  }

  input[action] = isDown;
  return true;
}
