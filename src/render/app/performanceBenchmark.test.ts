import { describe, it } from 'vitest';
import * as THREE from 'three';
import { updateAtmosphere, updateAnomaly } from '../adapters/anomalyRenderer';
import type { GameState } from '../../game/simulation/types';

function createMockHandles() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1.0);
  ambientLight.visible = true;

  const exitGlow = new THREE.Object3D();
  exitGlow.visible = false;

  const root = new THREE.Group();

  const poster1 = new THREE.Object3D();
  const eyeMesh = new THREE.Object3D();
  const posterEyeTrackers = [
    { poster: poster1, mesh: eyeMesh, baseX: 0, baseY: 0 }
  ];

  return {
    root,
    environmentMaterials: {
      wall: wallMat,
      floor: floorMat,
      ceiling: ceilingMat,
      trim: trimMat
    },
    ambientLight,
    exitGlow,
    snapshots: new Map(),
    // Anomaly handles
    securityCameraHead: new THREE.Object3D(),
    securityCameraTrackTarget: new THREE.Vector3(),
    securityCameraLensMaterial: new THREE.MeshStandardMaterial(),
    clockSecondPivot: new THREE.Object3D(),
    clockSecondMaterial: new THREE.MeshStandardMaterial(),
    clockHourPivot: new THREE.Object3D(),
    clockMinutePivot: new THREE.Object3D(),
    ventCover: new THREE.Object3D(),
    ventDarkness: new THREE.Object3D(),
    flickerLight: new THREE.RectAreaLight(),
    flickerTubeMaterial: new THREE.MeshStandardMaterial(),
    fluorescentLights: [],
    fluorescentTubeMaterials: [],
    fluorescentSparkGroups: [],
    mismatchTile: new THREE.Object3D(),
    floorExtraTile: new THREE.Object3D(),
    ceilingStainFace: new THREE.Object3D(),
    bulletinBoardMaterial: new THREE.MeshStandardMaterial(),
    hallwayFigure: new THREE.Object3D(),
    hallwayFigureHeadMaterial: new THREE.MeshStandardMaterial(),
    hallwayFigureFaceMaterial: new THREE.MeshStandardMaterial(),
    hallwayFigureHead: new THREE.Object3D(),
    redFlood: new THREE.Object3D(),
    redFloodFoam: new THREE.Object3D(),
    redFloodWave: new THREE.Object3D(),
    redFloodWake: new THREE.Object3D(),
    redFloodMaterial: new THREE.MeshStandardMaterial(),
    redFloodFoamMaterial: new THREE.MeshStandardMaterial(),
    redFloodWaveMaterial: new THREE.MeshStandardMaterial(),
    redFloodWakeMaterial: new THREE.MeshStandardMaterial(),
    posterEyeTrackers,
    posterFaceWrongOverlay: new THREE.Object3D(),
    lockerDoor: new THREE.Object3D(),
    lockerInterior: new THREE.Object3D(),
    lockerInteriorMaterial: new THREE.MeshStandardMaterial(),
    lockerMissingTargets: [],
    doorLabelWrong: new THREE.Object3D(),
    doorHandleCentered: new THREE.Object3D()
  } as any;
}

describe('Performance Benchmarks', () => {
  it('measures updateAtmosphere CPU time over 50,000 iterations', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.006);
    
    const handles = createMockHandles();
    const state = {
      phase: 'playing',
      loopIndex: 0,
      targetLoops: 8,
      streak: 0,
      failCount: 0,
      ambienceLevel: 0,
      encounterChance: 0.5,
      encounterRoll: 0.5,
      currentAnomalyId: null,
      recentAnomalyIds: [],
      expectedAction: 'forward',
      encounterHistory: [],
      usedAnomalyCounts: {},
      lastOutcome: null,
      lastMessage: ''
    } as unknown as GameState;

    console.log('--- STARTING ATMOSPHERE BENCHMARK ---');
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      updateAtmosphere(scene, handles, state, 0, 0);
    }
    const end = performance.now();
    console.log(`updateAtmosphere (50k iterations) took: ${(end - start).toFixed(2)} ms`);
  });

  it('measures updateAnomaly (poster-eyes and camera-tracking) CPU time over 50,000 iterations', () => {
    const handles = createMockHandles();
    const state = {
      phase: 'playing',
      loopIndex: 0,
      targetLoops: 8,
      streak: 0,
      failCount: 0,
      ambienceLevel: 2,
      encounterChance: 0.5,
      encounterRoll: 0.5,
      currentAnomalyId: 'poster-eyes',
      recentAnomalyIds: [],
      expectedAction: 'forward',
      encounterHistory: [],
      usedAnomalyCounts: {},
      lastOutcome: null,
      lastMessage: ''
    } as unknown as GameState;

    const playerPos = new THREE.Vector3(1.2, 1.62, 3.4);

    console.log('--- STARTING ANOMALY BENCHMARK ---');
    const start = performance.now();
    for (let i = 0; i < 50000; i++) {
      updateAnomaly(handles, state, playerPos, 1.0);
    }
    const end = performance.now();
    console.log(`updateAnomaly (50k iterations, poster-eyes) took: ${(end - start).toFixed(2)} ms`);
  });
});
