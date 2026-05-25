import * as THREE from 'three';
import type { AnomalyId } from '../../game/simulation/anomalies';
import type { GameState } from '../../game/simulation/types';
import type { HallwayHandles } from '../objects/hallway';
import { restoreTransform } from '../objects/hallway';

const SCHOOL_BACKGROUND = new THREE.Color(0xf7f9fb);
const HORROR_BACKGROUND = new THREE.Color(0x050606);
const SCHOOL_FOG = new THREE.Color(0xf1f5f8);
const HORROR_FOG = new THREE.Color(0x050606);
const SCHOOL_SKY = new THREE.Color(0xf4f9ff);
const HORROR_SKY = new THREE.Color(0xdce7df);
const SCHOOL_GROUND = new THREE.Color(0xd8dee5);
const HORROR_GROUND = new THREE.Color(0x10120f);
const SCHOOL_WALL = new THREE.Color(0xfff7ed);
const HORROR_WALL = new THREE.Color(0xb7beb6);
const SCHOOL_FLOOR = new THREE.Color(0xe7e9e2);
const HORROR_FLOOR = new THREE.Color(0x8f9991);
const SCHOOL_CEILING = new THREE.Color(0xfffdf8);
const HORROR_CEILING = new THREE.Color(0x141816);
const SCHOOL_TRIM = new THREE.Color(0xc7beb2);
const HORROR_TRIM = new THREE.Color(0x59615c);
const MAX_AMBIENCE = 5;

export function applyAnomaly(handles: HallwayHandles, anomalyId: AnomalyId | null): void {
  resetAnomalies(handles);

  switch (anomalyId) {
    case null:
      break;
    case 'locker-ajar':
      handles.lockerDoor.visible = true;
      handles.lockerInterior.visible = true;
      handles.lockerDoor.rotation.y = -0.82;
      handles.lockerDoor.position.x -= 0.05;
      handles.lockerInteriorMaterial.emissive.setHex(0x160302);
      handles.lockerInteriorMaterial.emissiveIntensity = 0.4;
      break;
    case 'clock-wrong':
      handles.clockHourPivot.rotation.z = THREE.MathUtils.degToRad(-359);
      handles.clockMinutePivot.rotation.z = THREE.MathUtils.degToRad(-348);
      handles.clockSecondPivot.visible = true;
      handles.clockSecondMaterial.emissiveIntensity = 1.5;
      break;
    case 'camera-tracking':
      handles.securityCameraLensMaterial.emissive.setHex(0x123f22);
      handles.securityCameraLensMaterial.emissiveIntensity = 1.6;
      break;
    case 'vent-open':
      handles.ventCover.position.y -= 0.09;
      handles.ventCover.position.x += 0.12;
      handles.ventCover.rotation.z = THREE.MathUtils.degToRad(4.5);
      handles.ventDarkness.scale.set(1.08, 1, 1.08);
      break;
    case 'light-failure':
      handles.flickerLight.intensity = 0.04;
      handles.flickerTubeMaterial.emissiveIntensity = 0.02;
      handles.flickerTubeMaterial.color.setHex(0x485049);
      break;
    case 'tile-mismatch':
      handles.mismatchTile.visible = true;
      handles.mismatchTile.position.y = 0.036;
      break;
  }
}

export function updateAnomaly(
  handles: HallwayHandles,
  state: GameState,
  playerPosition: THREE.Vector3,
  elapsedSeconds: number
): void {
  if (state.currentAnomalyId === 'camera-tracking') {
    handles.securityCameraHead.lookAt(playerPosition.x, playerPosition.y - 0.18, playerPosition.z);
  }

  if (state.currentAnomalyId === 'clock-wrong') {
    handles.clockSecondPivot.rotation.z = -elapsedSeconds * 1.6;
  }

  if (state.currentAnomalyId === 'light-failure') {
    const pulse = Math.max(0, Math.sin(elapsedSeconds * 28) * Math.sin(elapsedSeconds * 7.3));
    handles.flickerLight.intensity = 0.04 + pulse * 4.2;
    handles.flickerTubeMaterial.emissiveIntensity = 0.02 + pulse * 0.55;
  }
}

export function updateAtmosphere(
  scene: THREE.Scene,
  handles: HallwayHandles,
  state: GameState,
  ambienceLevel = state.ambienceLevel
): void {
  const escalation =
    state.phase === 'escaped' ? 0 : THREE.MathUtils.clamp(ambienceLevel / MAX_AMBIENCE, 0, 1);
  const materialEscalation = Math.min(1, escalation * 0.82);

  if (scene.background instanceof THREE.Color) {
    scene.background.lerpColors(SCHOOL_BACKGROUND, HORROR_BACKGROUND, escalation);
  }

  const fog = scene.fog;
  if (fog instanceof THREE.FogExp2) {
    fog.color.lerpColors(SCHOOL_FOG, HORROR_FOG, escalation);
    fog.density = 0.006 + escalation * 0.065;
  }

  handles.environmentMaterials.wall.color.lerpColors(SCHOOL_WALL, HORROR_WALL, materialEscalation);
  handles.environmentMaterials.floor.color.lerpColors(SCHOOL_FLOOR, HORROR_FLOOR, materialEscalation);
  handles.environmentMaterials.ceiling.color.lerpColors(SCHOOL_CEILING, HORROR_CEILING, materialEscalation);
  handles.environmentMaterials.trim.color.lerpColors(SCHOOL_TRIM, HORROR_TRIM, materialEscalation);
  handles.ambientLight.color.lerpColors(SCHOOL_SKY, HORROR_SKY, escalation);
  handles.ambientLight.groundColor.lerpColors(SCHOOL_GROUND, HORROR_GROUND, escalation);
  handles.ambientLight.intensity = state.phase === 'escaped' ? 0.9 : 1.05 - escalation * 0.5;
  handles.exitGlow.visible = state.phase === 'escaped';
}

function resetAnomalies(handles: HallwayHandles): void {
  restoreTransform(handles.lockerDoor, handles.snapshots);
  restoreTransform(handles.clockHourPivot, handles.snapshots);
  restoreTransform(handles.clockMinutePivot, handles.snapshots);
  restoreTransform(handles.clockSecondPivot, handles.snapshots);
  restoreTransform(handles.securityCameraHead, handles.snapshots);
  restoreTransform(handles.ventCover, handles.snapshots);

  handles.lockerDoor.visible = false;
  handles.lockerInterior.visible = false;
  handles.lockerInteriorMaterial.emissive.setHex(0x050202);
  handles.lockerInteriorMaterial.emissiveIntensity = 0;
  handles.clockSecondPivot.visible = false;
  handles.clockSecondMaterial.emissiveIntensity = 0;
  handles.securityCameraLensMaterial.emissive.setHex(0x001a0e);
  handles.securityCameraLensMaterial.emissiveIntensity = 0.25;
  handles.ventDarkness.scale.set(1, 1, 1);
  handles.flickerLight.intensity = 11.6;
  handles.flickerTubeMaterial.color.setHex(0xf6fbff);
  handles.flickerTubeMaterial.emissive.setHex(0xdbf0ff);
  handles.flickerTubeMaterial.emissiveIntensity = 1.85;
  handles.mismatchTile.visible = false;
  handles.mismatchTile.position.y = 0.014;
}
