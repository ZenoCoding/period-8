import * as THREE from 'three';
import type { AnomalyId } from '../../game/simulation/anomalies';
import type { GameState } from '../../game/simulation/types';
import type { HallwayHandles } from '../objects/hallway';
import { MAIN_HALF_LENGTH, restoreTransform, setBulletinBoardWarning } from '../objects/hallway';

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
const BASE_FLUORESCENT_INTENSITIES = [13.8, 12.8, 11.6, 12.2, 10.8, 10.4] as const;
const BASE_FLUORESCENT_COLOR = 0xe2f2ff;

export interface LightFailureEffectState {
  progress: number;
  sparkPulse: number;
}

export function applyAnomaly(handles: HallwayHandles, anomalyId: AnomalyId | null): void {
  resetAnomalies(handles);

  switch (anomalyId) {
    case null:
      break;
    case 'locker-count-missing':
      for (const locker of handles.lockerMissingTargets) {
        locker.visible = false;
      }
      break;
    case 'clock-wrong':
      handles.clockHourPivot.rotation.z = THREE.MathUtils.degToRad(-145);
      handles.clockMinutePivot.rotation.z = THREE.MathUtils.degToRad(-55);
      handles.clockSecondPivot.visible = true;
      handles.clockSecondMaterial.emissiveIntensity = 0.45;
      break;
    case 'camera-tracking':
      handles.securityCameraLensMaterial.emissive.setHex(0x10241b);
      handles.securityCameraLensMaterial.emissiveIntensity = 0.75;
      break;
    case 'vent-open':
      handles.ventCover.position.y -= 0.045;
      handles.ventCover.position.x += 0.06;
      handles.ventCover.rotation.z = THREE.MathUtils.degToRad(2.3);
      handles.ventDarkness.scale.set(1.04, 1, 1.04);
      break;
    case 'light-failure':
      break;
    case 'bulletin-board':
      setBulletinBoardWarning(handles, true);
      break;
    case 'man-staring':
      break;
    case 'man-face-missing':
      break;
    case 'red-flood':
      handles.redFlood.visible = true;
      handles.redFloodFoam.visible = true;
      handles.redFloodWave.visible = true;
      handles.redFloodWake.visible = true;
      handles.redFloodMaterial.opacity = 0.88;
      break;
    case 'door-label-wrong':
      handles.doorLabelWrong.visible = true;
      break;
    case 'door-handle-centered':
      handles.doorHandleCentered.visible = true;
      break;
    case 'ceiling-stain-face':
      handles.ceilingStainFace.visible = true;
      break;
    case 'yellow-lights':
      for (const light of handles.fluorescentLights) {
        light.color.setHex(0xffd46f);
        light.intensity *= 0.82;
      }
      for (const material of handles.fluorescentTubeMaterials) {
        material.color.setHex(0xffe38a);
        material.emissive.setHex(0xffbb48);
        material.emissiveIntensity = 1.18;
      }
      break;
    case 'floor-extra-tile':
      handles.floorExtraTile.visible = true;
      break;
    case 'poster-eyes':
      for (const eye of handles.posterEyeTrackers) {
        eye.mesh.visible = true;
      }
      break;
    case 'poster-face-wrong':
      handles.posterFaceWrongOverlay.visible = true;
      break;
  }
}

export function updateAnomaly(
  handles: HallwayHandles,
  state: GameState,
  playerPosition: THREE.Vector3,
  elapsedSeconds: number,
  timedThreatProgress = 0,
  lightFailure: LightFailureEffectState = { progress: 0, sparkPulse: 0 }
): void {
  if (state.currentAnomalyId === 'camera-tracking') {
    const target = handles.securityCameraTrackTarget;
    // Convert player world position to hallway-local space for stable tracking
    const localTarget = handles.root.worldToLocal(
      new THREE.Vector3(playerPosition.x, playerPosition.y - 0.18, playerPosition.z)
    );
    // Smooth lag — ~1 second time constant for a creepy mechanical servo delay
    target.lerp(localTarget, 0.033);
    // Convert the lerped local target back to world space for lookAt
    const worldTarget = handles.root.localToWorld(target.clone());
    handles.securityCameraHead.lookAt(worldTarget);
    handles.securityCameraHead.rotateY(Math.PI);
  }

  if (state.currentAnomalyId === 'clock-wrong') {
    handles.clockSecondPivot.rotation.z = Math.sin(elapsedSeconds * 2.8) * 0.35 + THREE.MathUtils.degToRad(-60);
  }

  if (state.currentAnomalyId === 'light-failure') {
    updateLightFailure(handles, elapsedSeconds, lightFailure);
  }

  if (state.currentAnomalyId === 'vent-open') {
    const sway = Math.sin(elapsedSeconds * 1.9) * 0.018;
    handles.ventCover.rotation.z = THREE.MathUtils.degToRad(2.3) + sway * 0.45;
    handles.ventDarkness.scale.setScalar(1.03 + Math.max(0, Math.sin(elapsedSeconds * 2.1)) * 0.035);
  }

  if (state.currentAnomalyId === 'red-flood') {
    updateRedFlood(handles, timedThreatProgress, elapsedSeconds);
  }

  if (state.currentAnomalyId === 'yellow-lights') {
    const pulse = Math.sin(elapsedSeconds * 5.2) * 0.5 + 0.5;
    for (const [index, light] of handles.fluorescentLights.entries()) {
      light.intensity = (BASE_FLUORESCENT_INTENSITIES[index] ?? 10) * (0.78 + pulse * 0.06);
    }
  }

  if (state.currentAnomalyId === 'poster-eyes') {
    updatePosterEyes(handles, playerPosition);
  }

  if (state.currentAnomalyId === 'poster-face-wrong') {
    updatePosterFaceWrong(handles, elapsedSeconds);
  }
}

export function updateAtmosphere(
  scene: THREE.Scene,
  handles: HallwayHandles,
  state: GameState,
  ambienceLevel = state.ambienceLevel,
  blackoutProgress = 0
): void {
  const escalation =
    state.phase === 'escaped' ? 0 : THREE.MathUtils.clamp(ambienceLevel / MAX_AMBIENCE, 0, 1);
  const materialEscalation = Math.min(1, escalation * 0.82);
  const blackout = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(blackoutProgress, 0, 1), 0, 1);
  const blackoutColor = new THREE.Color(0x050706);

  if (scene.background instanceof THREE.Color) {
    scene.background.lerpColors(SCHOOL_BACKGROUND, HORROR_BACKGROUND, escalation);
    scene.background.lerp(blackoutColor, blackout * 0.74);
  }

  const fog = scene.fog;
  if (fog instanceof THREE.FogExp2) {
    fog.color.lerpColors(SCHOOL_FOG, HORROR_FOG, escalation);
    fog.color.lerp(blackoutColor, blackout * 0.82);
    fog.density = 0.006 + escalation * 0.065 + blackout * 0.035;
  }

  handles.environmentMaterials.wall.color.lerpColors(SCHOOL_WALL, HORROR_WALL, materialEscalation);
  handles.environmentMaterials.floor.color.lerpColors(SCHOOL_FLOOR, HORROR_FLOOR, materialEscalation);
  handles.environmentMaterials.ceiling.color.lerpColors(SCHOOL_CEILING, HORROR_CEILING, materialEscalation);
  handles.environmentMaterials.trim.color.lerpColors(SCHOOL_TRIM, HORROR_TRIM, materialEscalation);
  handles.environmentMaterials.wall.color.lerp(blackoutColor, blackout * 0.56);
  handles.environmentMaterials.floor.color.lerp(blackoutColor, blackout * 0.62);
  handles.environmentMaterials.ceiling.color.lerp(blackoutColor, blackout * 0.7);
  handles.environmentMaterials.trim.color.lerp(blackoutColor, blackout * 0.5);
  handles.ambientLight.color.lerpColors(SCHOOL_SKY, HORROR_SKY, escalation);
  handles.ambientLight.groundColor.lerpColors(SCHOOL_GROUND, HORROR_GROUND, escalation);
  handles.ambientLight.color.lerp(blackoutColor, blackout * 0.82);
  handles.ambientLight.groundColor.lerp(blackoutColor, blackout * 0.88);
  handles.ambientLight.intensity = (state.phase === 'escaped' ? 0.9 : 1.05 - escalation * 0.5) * (1 - blackout * 0.93);
  handles.exitGlow.visible = state.phase === 'escaped';
}

function resetAnomalies(handles: HallwayHandles): void {
  restoreTransform(handles.lockerDoor, handles.snapshots);
  restoreTransform(handles.clockHourPivot, handles.snapshots);
  restoreTransform(handles.clockMinutePivot, handles.snapshots);
  restoreTransform(handles.clockSecondPivot, handles.snapshots);
  restoreTransform(handles.securityCameraHead, handles.snapshots);
  restoreTransform(handles.hallwayFigure, handles.snapshots);
  restoreTransform(handles.hallwayFigureHead, handles.snapshots);
  restoreTransform(handles.ventCover, handles.snapshots);

  handles.lockerDoor.visible = false;
  handles.lockerInterior.visible = false;
  for (const locker of handles.lockerMissingTargets) {
    locker.visible = true;
  }
  handles.lockerInteriorMaterial.emissive.setHex(0x050202);
  handles.lockerInteriorMaterial.emissiveIntensity = 0;
  handles.clockSecondPivot.visible = false;
  handles.clockSecondMaterial.emissiveIntensity = 0;
  handles.securityCameraLensMaterial.emissive.setHex(0x001a0e);
  handles.securityCameraLensMaterial.emissiveIntensity = 0.25;
  handles.securityCameraTrackTarget.set(0, 1.5, -9);
  handles.doorLabelWrong.visible = false;
  handles.doorHandleCentered.visible = false;
  handles.ceilingStainFace.visible = false;
  handles.floorExtraTile.visible = false;
  handles.ventDarkness.scale.set(1, 1, 1);
  handles.flickerLight.intensity = 11.6;
  handles.flickerTubeMaterial.color.setHex(0xf6fbff);
  handles.flickerTubeMaterial.emissive.setHex(0xdbf0ff);
  handles.flickerTubeMaterial.emissiveIntensity = 1.85;
  for (const [index, light] of handles.fluorescentLights.entries()) {
    light.color.setHex(BASE_FLUORESCENT_COLOR);
    light.intensity = BASE_FLUORESCENT_INTENSITIES[index] ?? 10;
  }
  for (const material of handles.fluorescentTubeMaterials) {
    material.color.setHex(0xf6fbff);
    material.emissive.setHex(0xdbf0ff);
    material.emissiveIntensity = 1.85;
  }
  for (const group of handles.fluorescentSparkGroups) {
    group.visible = false;
    for (const spark of group.children) {
      spark.visible = false;
      if (spark instanceof THREE.Mesh) {
        spark.scale.setScalar(1);
        setMaterialOpacity(spark.material, 0);
      } else if (spark instanceof THREE.Points) {
        setMaterialOpacity(spark.material, 0);
      }
    }
  }
  handles.mismatchTile.visible = false;
  handles.mismatchTile.position.y = 0.014;
  setBulletinBoardWarning(handles, false);
  handles.hallwayFigure.visible = false;
  handles.hallwayFigureHeadMaterial.color.setHex(0xc99d7c);
  handles.hallwayFigureFaceMaterial.color.setHex(0x17110f);
  handles.hallwayFigureFaceMaterial.emissive.setHex(0x080302);
  handles.hallwayFigureFaceMaterial.emissiveIntensity = 0.18;
  handles.redFlood.visible = false;
  handles.redFloodFoam.visible = false;
  handles.redFloodWave.visible = false;
  handles.redFloodWake.visible = false;
  handles.redFlood.scale.z = 0.05;
  handles.redFlood.position.z = -MAIN_HALF_LENGTH;
  handles.redFloodMaterial.opacity = 0.88;
  handles.redFloodMaterial.emissiveIntensity = 0.26;
  handles.redFloodFoamMaterial.opacity = 0;
  handles.redFloodWaveMaterial.opacity = 0;
  handles.redFloodWakeMaterial.opacity = 0;
  for (const eye of handles.posterEyeTrackers) {
    eye.mesh.visible = false;
    eye.mesh.position.x = eye.baseX;
    eye.mesh.position.y = eye.baseY;
  }
  handles.posterFaceWrongOverlay.visible = false;
  handles.posterFaceWrongOverlay.position.x = 0.034;
  handles.posterFaceWrongOverlay.rotation.z = THREE.MathUtils.degToRad(-1.8);
}

function updatePosterEyes(handles: HallwayHandles, playerPosition: THREE.Vector3): void {
  for (const eye of handles.posterEyeTrackers) {
    const localPlayer = eye.poster.worldToLocal(playerPosition.clone());
    const shiftX = THREE.MathUtils.clamp(localPlayer.x * 0.004, -0.012, 0.012);
    const shiftY = THREE.MathUtils.clamp((localPlayer.y - eye.baseY) * 0.006, -0.008, 0.008);
    eye.mesh.position.x = eye.baseX + shiftX;
    eye.mesh.position.y = eye.baseY + shiftY;
  }
}

function updatePosterFaceWrong(handles: HallwayHandles, elapsedSeconds: number): void {
  handles.posterFaceWrongOverlay.position.x = 0.034 + Math.sin(elapsedSeconds * 0.7) * 0.004;
  handles.posterFaceWrongOverlay.rotation.z = THREE.MathUtils.degToRad(-1.8 + Math.sin(elapsedSeconds * 0.46) * 0.8);
}

function updateLightFailure(
  handles: HallwayHandles,
  elapsedSeconds: number,
  effect: LightFailureEffectState
): void {
  const progress = THREE.MathUtils.clamp(effect.progress, 0, 1);
  const outage = THREE.MathUtils.smoothstep(progress, 0, 1);
  const preFlicker = progress <= 0
    ? 0.05 + Math.max(0, Math.sin(elapsedSeconds * 22) * Math.sin(elapsedSeconds * 5.2)) * 0.14
    : 0;
  const collapseFlicker = progress > 0 && progress < 0.86
    ? Math.max(0, Math.sin(elapsedSeconds * 62) * Math.sin(elapsedSeconds * 17.3)) * (1 - outage)
    : 0;
  const lightMultiplier = THREE.MathUtils.clamp(1 - outage * 1.08 + preFlicker + collapseFlicker * 0.82, 0, 1.25);
  const tubeGlow = THREE.MathUtils.clamp(1.85 * lightMultiplier + collapseFlicker * 1.6, 0.015, 2.8);

  for (const [index, light] of handles.fluorescentLights.entries()) {
    const base = BASE_FLUORESCENT_INTENSITIES[index] ?? 10;
    const jitter = 0.86 + Math.sin(elapsedSeconds * (21 + index * 3.7)) * collapseFlicker * 0.34;
    light.intensity = base * lightMultiplier * jitter;
  }

  for (const [index, material] of handles.fluorescentTubeMaterials.entries()) {
    const dying = progress > 0.72;
    material.color.setHex(dying ? 0x6d7570 : 0xf6fbff);
    material.emissive.setHex(progress > 0.86 ? 0x0d1312 : 0xdbf0ff);
    material.emissiveIntensity = tubeGlow * (0.92 + Math.sin(elapsedSeconds * (31 + index)) * collapseFlicker * 0.18);
  }

  updateFluorescentSparks(handles, effect.sparkPulse, elapsedSeconds);
}

function updateFluorescentSparks(handles: HallwayHandles, sparkPulse: number, elapsedSeconds: number): void {
  const pulse = THREE.MathUtils.clamp(sparkPulse, 0, 1);

  for (const [groupIndex, group] of handles.fluorescentSparkGroups.entries()) {
    group.visible = pulse > 0.02;
    for (const [sparkIndex, spark] of group.children.entries()) {
      if (spark instanceof THREE.PointLight) {
        spark.intensity = pulse * (7.5 + Math.sin(elapsedSeconds * 30 + groupIndex) * 2.5);
        spark.distance = 1.15 + pulse * 1.2;
        continue;
      }

      if (spark instanceof THREE.Points) {
        updateSparkParticles(spark, pulse, elapsedSeconds, groupIndex);
        continue;
      }

      if (!(spark instanceof THREE.Mesh)) {
        continue;
      }

      const seed = Number(spark.userData.seed ?? groupIndex * 19 + sparkIndex * 7);
      const angle = seed * 1.73;
      const drift = elapsedSeconds * (1.8 + sparkIndex * 0.09);
      const distance = (0.09 + (seed % 5) * 0.045) * (0.45 + pulse);
      spark.visible = pulse > 0.02;
      spark.position.set(
        Math.cos(angle + drift) * distance,
        -0.05 - pulse * (0.18 + (sparkIndex % 4) * 0.055),
        Math.sin(angle * 1.41 + drift * 0.7) * distance
      );
      spark.rotation.set(
        Math.PI / 2 + Math.sin(angle) * 0.55,
        angle,
        Math.sin(angle * 0.7 + elapsedSeconds * 8) * 0.6
      );
      spark.scale.set(1, 1 + pulse * (1.8 + (sparkIndex % 3) * 0.5), 1);
      setMaterialOpacity(spark.material, Math.min(1, pulse * (0.78 + (sparkIndex % 4) * 0.1)));
    }
  }
}

function updateSparkParticles(points: THREE.Points, pulse: number, elapsedSeconds: number, groupIndex: number): void {
  const geometry = points.geometry;
  const positionAttribute = geometry.getAttribute('position');
  if (!(positionAttribute instanceof THREE.BufferAttribute)) {
    return;
  }

  const seedBase = Number(points.userData.seed ?? groupIndex * 19);
  for (let index = 0; index < positionAttribute.count; index += 1) {
    const seed = seedBase + index * 13;
    const time = (elapsedSeconds * (1.2 + (index % 5) * 0.18) + seed * 0.017) % 1;
    const fall = time * time;
    const side = Math.sin(seed * 12.9898) * 0.46;
    const forward = Math.cos(seed * 78.233) * 0.38;
    positionAttribute.setXYZ(
      index,
      side * pulse * time,
      -0.04 - fall * (0.42 + (index % 4) * 0.06),
      forward * pulse * time
    );
  }

  positionAttribute.needsUpdate = true;
  if (points.material instanceof THREE.PointsMaterial) {
    points.material.opacity = Math.min(1, pulse * 1.3);
    points.material.size = 0.06 + pulse * 0.09;
  }
}

function setMaterialOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => setMaterialOpacity(entry, opacity));
    return;
  }

  material.opacity = opacity;
}

function updateRedFlood(handles: HallwayHandles, progress: number, elapsedSeconds: number): void {
  const eased = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1);
  const depth = THREE.MathUtils.lerp(0.4, MAIN_HALF_LENGTH * 2 + 1.2, eased);
  const frontZ = -MAIN_HALF_LENGTH;
  const leadingZ = frontZ + depth;
  const waveBob = Math.sin(elapsedSeconds * 8.3) * 0.035 + Math.sin(elapsedSeconds * 15.7) * 0.014;
  handles.redFlood.scale.z = depth;
  handles.redFlood.position.z = frontZ + depth / 2;
  handles.redFlood.position.y = 0.032 + waveBob * 0.24;
  handles.redFloodMaterial.opacity = 0.7 + eased * 0.22;
  handles.redFloodMaterial.emissiveIntensity = 0.24 + eased * 0.62 + Math.max(0, Math.sin(elapsedSeconds * 12)) * 0.12;
  if (handles.redFloodMaterial.map) {
    handles.redFloodMaterial.map.offset.y = -elapsedSeconds * (0.28 + eased * 0.38);
    handles.redFloodMaterial.map.offset.x = Math.sin(elapsedSeconds * 0.8) * 0.03;
  }

  const crestOpacity = THREE.MathUtils.clamp(0.25 + eased * 0.82, 0, 1);
  handles.redFloodFoam.position.z = leadingZ - 0.28;
  handles.redFloodFoam.position.y = 0.108 + waveBob;
  handles.redFloodFoam.scale.set(1 + Math.sin(elapsedSeconds * 5.1) * 0.035, 1, 1 + Math.sin(elapsedSeconds * 6.7) * 0.08);
  handles.redFloodFoamMaterial.opacity = crestOpacity;
  if (handles.redFloodFoamMaterial.map) {
    handles.redFloodFoamMaterial.map.offset.x = elapsedSeconds * 0.42;
    handles.redFloodFoamMaterial.map.offset.y = -elapsedSeconds * 0.18;
  }

  handles.redFloodWave.position.z = leadingZ - 0.58;
  handles.redFloodWave.position.y = 0.18 + waveBob * 1.6;
  handles.redFloodWave.rotation.x = -Math.PI / 2.35 + Math.sin(elapsedSeconds * 7.5) * 0.08;
  handles.redFloodWave.scale.set(1 + Math.sin(elapsedSeconds * 4.5) * 0.06, 1 + eased * 0.16, 1);
  handles.redFloodWaveMaterial.opacity = THREE.MathUtils.clamp(0.18 + eased * 0.7, 0, 0.9);
  if (handles.redFloodWaveMaterial.map) {
    handles.redFloodWaveMaterial.map.offset.x = -elapsedSeconds * 0.22;
  }

  const wakeDepth = Math.min(depth, 4.4);
  handles.redFloodWake.position.z = leadingZ - wakeDepth / 2 - 0.52;
  handles.redFloodWake.position.y = 0.105 + waveBob * 0.45;
  handles.redFloodWake.scale.z = Math.max(0.2, wakeDepth / 4.4);
  handles.redFloodWakeMaterial.opacity = THREE.MathUtils.clamp(eased * 0.44, 0, 0.44);
  if (handles.redFloodWakeMaterial.map) {
    handles.redFloodWakeMaterial.map.repeat.set(1.2, 2.8);
    handles.redFloodWakeMaterial.map.offset.y = elapsedSeconds * 0.34;
    handles.redFloodWakeMaterial.map.offset.x = Math.sin(elapsedSeconds * 1.4) * 0.08;
  }
}
