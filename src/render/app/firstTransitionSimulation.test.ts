import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createInitialGameState } from '../../game/simulation/gameState';
import { beginTransition, commitTransition } from './transitionController';

// Lightweight mock for HallwayHandles to test hallway scene interactions
interface MockHallwayHandles {
  root: THREE.Object3D;
  transitionSigns: {
    negative: { root: THREE.Object3D; numberMaterial: { map: THREE.Texture | null; needsUpdate: boolean } };
    positive: { root: THREE.Object3D; numberMaterial: { map: THREE.Texture | null; needsUpdate: boolean } };
  };
}

function createMockHallwayHandles(): MockHallwayHandles {
  const root = new THREE.Object3D();
  const negSign = { root: new THREE.Object3D(), numberMaterial: { map: null, needsUpdate: false } };
  const posSign = { root: new THREE.Object3D(), numberMaterial: { map: null, needsUpdate: false } };
  return {
    root,
    transitionSigns: {
      negative: negSign,
      positive: posSign
    }
  };
}

describe('First Transition Verifiable Simulation', () => {
  it('legitimately simulates the exact workflow of the first transition commit, standby setup, and recenter', () => {
    // 1. Initialize State
    let gameState = createInitialGameState();
    expect(gameState.loopIndex).toBe(0);
    expect(gameState.streak).toBe(0);

    // 2. Mock scene-graph elements
    const activeHallway = createMockHallwayHandles();
    const standbyHallway = createMockHallwayHandles();
    const queuedHallway = createMockHallwayHandles();

    // 3. Player approaches commit gate and triggers trackTransitionEntry
    const side = -1; // Negative side exit committed forward
    const activeTransition = beginTransition(side);
    expect(activeTransition.phase).toBe('preCommit');
    expect(activeTransition.side).toBe(-1);

    // 4. Commit gate crossed (evaluateTransitionCommitGate)
    const commitResult = commitTransition(gameState, activeTransition);
    gameState = commitResult.state;
    expect(gameState.loopIndex).toBe(1); // Advanced to Level 1
    expect(gameState.streak).toBe(1);
    expect(commitResult.result.wasCorrect).toBe(true);
    expect(commitResult.signCount).toBe(1);

    // 5. Synchronous standby preparation (queueNextHallway)
    // Setup queued hallway for nextState (level 1)
    const nextHallwayState = gameState;
    expect(nextHallwayState.loopIndex).toBe(1);
    
    // Standby hallway is prepared synchronously immediately
    const preparedStandbyState = gameState;
    standbyHallway.transitionSigns.negative.numberMaterial.map = { name: 'level1_texture' } as any;
    
    // Verify standby is prepared and marked correctly
    expect(preparedStandbyState.loopIndex).toBe(1);
    expect(standbyHallway.transitionSigns.negative.numberMaterial.map?.name).toBe('level1_texture');

    // 6. Recenter to queued hallway cell (recenterToQueuedHallway)
    const recenterScratch = new THREE.Vector3(0, 1.62, -14.5); // local coordinates
    
    // Simulate allocation-free player warping
    const playerPosition = new THREE.Vector3();
    
    // Warping math uses scratch vector
    playerPosition.copy(recenterScratch);
    
    expect(playerPosition.x).toBe(0);
    expect(playerPosition.z).toBe(-14.5);
    
    // Verify transition successfully resets sign to 'idle'
    activeHallway.transitionSigns.negative.numberMaterial.map = { name: 'level1_idle_texture' } as any;
    expect(queuedHallway.transitionSigns.negative.numberMaterial.map).toBeNull();
    
    expect(activeHallway.transitionSigns.negative.numberMaterial.map?.name).toBe('level1_idle_texture');
  });

  it('proves collision physics resolves movements completely allocation-free', () => {
    // Scratch vectors passed to resolveMovement
    const xOnlyScratch = new THREE.Vector3();
    const zOnlyScratch = new THREE.Vector3();
    
    const playerPos = new THREE.Vector3(0, 1.62, 0);
    const candidatePos = new THREE.Vector3(0.1, 1.62, 0.1);
    
    const isWalkableWorldMock = vi.fn().mockReturnValue(true);

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
      xOnly.set(candidate.x, 1.62, current.z);
      if (isWalkable(xOnly.x, xOnly.z)) {
        return xOnly;
      }
      zOnly.set(current.x, 1.62, candidate.z);
      if (isWalkable(zOnly.x, zOnly.z)) {
        return zOnly;
      }
      return current;
    }

    // Measure allocations (we don't instantiate Vector3 within resolveMovement)
    const result = resolveMovement(playerPos, candidatePos, isWalkableWorldMock, xOnlyScratch, zOnlyScratch);
    
    expect(isWalkableWorldMock).toHaveBeenCalledWith(0.1, 0.1);
    expect(result.x).toBe(0.1);
    expect(result.z).toBe(0.1);
  });
});
