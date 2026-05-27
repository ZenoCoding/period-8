import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  MAIN_HALF_LENGTH,
  MAIN_HALF_WIDTH,
  TRANSITION_BRANCH_X_MAX,
  TRANSITION_ENTRY_Z_MIN
} from './hallway';

const WALKER_MODEL_PATH = '/models/characters/business-man.glb';
const WALKER_HEIGHT = 1.7;
const WALKER_SPEED = 1.08;
const WALKER_WALK_ANIMATION_TIME_SCALE = 1.18;
const WALKER_FOOTSTEP_PHASES = [0.12, 0.62] as const;
const WALKER_VISIBLE_X = -MAIN_HALF_WIDTH - 0.52;
const MODEL_FORWARD_YAW_OFFSET = Math.PI;
const WALKER_ROUTE: WalkerRoutePoint[] = [
  {
    position: new THREE.Vector3(-TRANSITION_BRANCH_X_MAX + 1.15, 0, -TRANSITION_ENTRY_Z_MIN - 0.72),
    yaw: -Math.PI / 2
  },
  {
    position: new THREE.Vector3(-MAIN_HALF_WIDTH + 0.3, 0, -TRANSITION_ENTRY_Z_MIN - 0.05),
    yaw: -2.72
  },
  {
    position: new THREE.Vector3(-MAIN_HALF_WIDTH + 0.62, 0, -MAIN_HALF_LENGTH + 3.25),
    yaw: Math.PI
  },
  {
    position: new THREE.Vector3(-MAIN_HALF_WIDTH + 0.62, 0, TRANSITION_ENTRY_Z_MIN - 1.55),
    yaw: Math.PI
  },
  {
    position: new THREE.Vector3(MAIN_HALF_WIDTH - 0.26, 0, TRANSITION_ENTRY_Z_MIN + 0.72),
    yaw: -Math.PI / 2
  },
  {
    position: new THREE.Vector3(TRANSITION_BRANCH_X_MAX - 1.15, 0, TRANSITION_ENTRY_Z_MIN + 0.72),
    yaw: -Math.PI / 2
  }
];

interface CharacterAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

interface WalkerRoutePoint {
  position: THREE.Vector3;
  yaw: number;
}

interface FaceMaterialState {
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
}

export interface HallwayWalkerSnapshot {
  loaded: boolean;
  visible: boolean;
  walking: boolean;
  arrived: boolean;
  routeIndex: number;
  stepId: number;
  stepSide: -1 | 1;
  x: number;
  z: number;
}

export interface HallwayWalker {
  readonly root: THREE.Group;
  start(parent: THREE.Object3D): void;
  setAnomalyMode(mode: WalkerAnomalyMode, playerWorldPosition?: THREE.Vector3, elapsedSeconds?: number): void;
  setHeadTracking(isTracking: boolean, playerWorldPosition?: THREE.Vector3, elapsedSeconds?: number): void;
  update(deltaSeconds: number): void;
  snapshot(): HallwayWalkerSnapshot;
  dispose(): void;
}

export type WalkerAnomalyMode = 'normal' | 'staring' | 'faceMissing';

const gltfLoader = new GLTFLoader();
let characterAssetPromise: Promise<CharacterAsset> | null = null;

export function createHallwayWalker(): HallwayWalker {
  return new ImportedHallwayWalker();
}

class ImportedHallwayWalker implements HallwayWalker {
  readonly root = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private headBone: THREE.Object3D | null = null;
  private readonly headCutCollar: THREE.Mesh;
  private baseHeadRotation: THREE.Euler | null = null;
  private faceMaterialStates: FaceMaterialState[] = [];
  private anomalyMode: WalkerAnomalyMode = 'normal';
  private isHeadTracking = false;
  private headTrackingTarget = new THREE.Vector3();
  private headTrackingElapsedSeconds = 0;
  private routeIndex = 0;
  private routeSegmentDistance = 1;
  private routeSegmentProgress = 0;
  private loaded = false;
  private walking = false;
  private arrived = false;
  private disposed = false;
  private lastWalkPhase = 0;
  private stepId = 0;
  private stepSide: -1 | 1 = -1;

  constructor() {
    this.root.name = 'opposite-side-hallway-walker';
    this.root.visible = false;
    this.headCutCollar = createHeadCutCollar();
    this.root.add(this.headCutCollar);
    void this.loadModel();
  }

  start(parent: THREE.Object3D): void {
    parent.add(this.root);
    this.routeIndex = 0;
    this.routeSegmentProgress = 0;
    this.routeSegmentDistance = getRouteSegmentDistance(0);
    this.root.position.copy(WALKER_ROUTE[0].position);
    this.root.rotation.set(0, WALKER_ROUTE[0].yaw, 0);
    this.root.visible = false;
    this.walking = true;
    this.arrived = false;
    this.lastWalkPhase = 0;
    this.stepId = 0;
    this.stepSide = -1;
    this.playWalk();
    this.setHeadTracking(false);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }

    const previousWalkPhase = this.getWalkPhase();

    if (this.walking) {
      this.advanceRoute(deltaSeconds);
    }

    this.mixer?.update(deltaSeconds);
    this.updateHeadTracking();
    this.updateFootstepPulse(previousWalkPhase);
  }

  setHeadTracking(isTracking: boolean, playerWorldPosition?: THREE.Vector3, elapsedSeconds = 0): void {
    this.setAnomalyMode(isTracking ? 'staring' : 'normal', playerWorldPosition, elapsedSeconds);
  }

  setAnomalyMode(mode: WalkerAnomalyMode, playerWorldPosition?: THREE.Vector3, elapsedSeconds = 0): void {
    this.anomalyMode = mode;
    const isTracking = mode === 'staring';
    this.isHeadTracking = isTracking;
    this.headTrackingElapsedSeconds = elapsedSeconds;

    if (playerWorldPosition) {
      this.headTrackingTarget.copy(playerWorldPosition);
    }

    if (!isTracking) {
      this.restoreHeadRotation();
    }

    this.headCutCollar.visible = isTracking;
    this.applyFaceMissing(mode === 'faceMissing');
  }

  snapshot(): HallwayWalkerSnapshot {
    return {
      loaded: this.loaded,
      visible: this.root.visible,
      walking: this.walking,
      arrived: this.arrived,
      routeIndex: this.routeIndex,
      stepId: this.stepId,
      stepSide: this.stepSide,
      x: roundForSnapshot(this.root.position.x),
      z: roundForSnapshot(this.root.position.z)
    };
  }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
  }

  private async loadModel(): Promise<void> {
    try {
      const asset = await loadCharacterAsset();
      if (this.disposed) {
        return;
      }

      const model = cloneSkeleton(asset.scene);
      model.name = 'business-man-model';
      cloneModelMaterials(model);
      fitModelToHallway(model);
      model.rotation.y = MODEL_FORWARD_YAW_OFFSET;
      ageBusinessManMaterials(model);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });

      this.headBone = model.getObjectByName('Head') ?? null;
      this.baseHeadRotation = this.headBone?.rotation.clone() ?? null;
      this.faceMaterialStates = collectFaceMaterialStates(model);
      this.applyFaceMissing(this.anomalyMode === 'faceMissing');
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      this.walkAction = createAction(this.mixer, asset.animations, 'Walk');
      this.idleAction = createAction(this.mixer, asset.animations, 'Idle');
      this.loaded = true;
      this.syncVisibility();

      if (this.root.visible && this.walking) {
        this.playWalk();
      } else if (this.root.visible && this.arrived) {
        this.playIdle();
      }
    } catch (error: unknown) {
      console.warn(`Could not load hallway walker model ${WALKER_MODEL_PATH}`, error);
    }
  }

  private playWalk(): void {
    if (!this.walkAction) {
      return;
    }

    this.walkAction.timeScale = WALKER_WALK_ANIMATION_TIME_SCALE;
    this.idleAction?.fadeOut(0.18);
    this.walkAction.enabled = true;
    this.walkAction.paused = false;
    this.walkAction.reset().fadeIn(0.18).play();
    this.lastWalkPhase = 0;
  }

  private playIdle(): void {
    if (!this.idleAction) {
      this.walkAction?.stop();
      return;
    }

    this.walkAction?.fadeOut(0.22);
    this.idleAction.enabled = true;
    this.idleAction.paused = false;
    this.idleAction.reset().fadeIn(0.22).play();
  }

  private stopAtEnd(): void {
    this.walking = false;
    this.arrived = true;
    this.routeIndex = WALKER_ROUTE.length - 1;
    this.routeSegmentProgress = 1;
    this.root.position.copy(WALKER_ROUTE[WALKER_ROUTE.length - 1].position);
    this.root.rotation.y = WALKER_ROUTE[WALKER_ROUTE.length - 1].yaw;
    this.root.visible = true;
    this.playIdle();
  }

  private getWalkPhase(): number {
    if (!this.walkAction) {
      return this.lastWalkPhase;
    }

    const duration = this.walkAction.getClip().duration;
    if (duration <= 0) {
      return this.lastWalkPhase;
    }

    return (this.walkAction.time % duration) / duration;
  }

  private updateFootstepPulse(previousPhase: number): void {
    const nextPhase = this.getWalkPhase();
    if (!this.root.visible || !this.walking || !this.walkAction) {
      this.lastWalkPhase = nextPhase;
      return;
    }

    for (const phase of WALKER_FOOTSTEP_PHASES) {
      if (!phaseWasCrossed(previousPhase, nextPhase, phase)) {
        continue;
      }

      this.stepId += 1;
      this.stepSide = this.stepSide === -1 ? 1 : -1;
    }

    this.lastWalkPhase = nextPhase;
  }

  private updateHeadTracking(): void {
    if (!this.headBone || !this.baseHeadRotation) {
      return;
    }

    if (!this.isHeadTracking || !this.root.visible) {
      this.restoreHeadRotation();
      this.headCutCollar.visible = false;
      return;
    }

    this.headCutCollar.visible = true;

    const target = this.root.worldToLocal(this.headTrackingTarget.clone());
    const dx = target.x;
    const dz = target.z;
    const dy = target.y - WALKER_HEIGHT * 0.9;
    const yaw = Math.atan2(dx, dz) + Math.PI + Math.sin(this.headTrackingElapsedSeconds * 0.75) * 0.04;
    const pitch = THREE.MathUtils.clamp(-dy * 0.16, -0.28, 0.28);

    this.headBone.rotation.set(
      this.baseHeadRotation.x + pitch,
      this.baseHeadRotation.y + yaw,
      this.baseHeadRotation.z + Math.sin(this.headTrackingElapsedSeconds * 1.25) * 0.035
    );
  }

  private restoreHeadRotation(): void {
    if (!this.headBone || !this.baseHeadRotation) {
      return;
    }

    this.headBone.rotation.copy(this.baseHeadRotation);
  }

  private applyFaceMissing(isMissing: boolean): void {
    for (const state of this.faceMaterialStates) {
      if (isMissing) {
        state.material.color.setHex(0xc99d7c);
        state.material.emissive.setHex(0x000000);
        state.material.emissiveIntensity = 0;
      } else {
        state.material.color.copy(state.color);
        state.material.emissive.copy(state.emissive);
        state.material.emissiveIntensity = state.emissiveIntensity;
      }
    }
  }

  private advanceRoute(deltaSeconds: number): void {
    if (this.routeIndex >= WALKER_ROUTE.length - 1) {
      this.stopAtEnd();
      return;
    }

    const start = WALKER_ROUTE[this.routeIndex];
    const end = WALKER_ROUTE[this.routeIndex + 1];
    const distance = Math.max(this.routeSegmentDistance, 0.001);
    this.routeSegmentProgress += (WALKER_SPEED * deltaSeconds) / distance;
    const t = smoothstep(THREE.MathUtils.clamp(this.routeSegmentProgress, 0, 1));
    this.root.position.lerpVectors(start.position, end.position, t);
    this.root.rotation.y = lerpAngle(start.yaw, end.yaw, t);
    this.syncVisibility();

    if (this.routeSegmentProgress < 1) {
      return;
    }

    this.routeIndex += 1;
    this.routeSegmentProgress = 0;
    this.routeSegmentDistance = getRouteSegmentDistance(this.routeIndex);

    if (this.routeIndex >= WALKER_ROUTE.length - 1) {
      this.stopAtEnd();
    }
  }

  private syncVisibility(): void {
    this.root.visible = this.loaded && (
      this.arrived ||
      this.root.visible ||
      shouldShowWalker(this.routeIndex, this.root.position)
    );
  }
}

async function loadCharacterAsset(): Promise<CharacterAsset> {
  if (!characterAssetPromise) {
    characterAssetPromise = gltfLoader.loadAsync(WALKER_MODEL_PATH).then((gltf: GLTF) => ({
      scene: gltf.scene,
      animations: gltf.animations
    }));
  }

  return characterAssetPromise;
}

function createAction(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
  name: string
): THREE.AnimationAction | null {
  const clip = clips.find((candidate) => candidate.name === name || candidate.name.endsWith(`|${name}`));
  return clip ? mixer.clipAction(clip) : null;
}

function fitModelToHallway(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y <= 0) {
    return;
  }

  model.scale.multiplyScalar(WALKER_HEIGHT / size.y);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
}

function ageBusinessManMaterials(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    applyMaterialTint(object.material);
  });
}

function cloneModelMaterials(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
}

function collectFaceMaterialStates(model: THREE.Object3D): FaceMaterialState[] {
  const states = new Map<THREE.Material, FaceMaterialState>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (
        material.name !== 'Eye' &&
        material.name !== 'Eyebrows'
      ) {
        continue;
      }

      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }

      states.set(material, {
        material,
        color: material.color.clone(),
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity
      });
    }
  });
  return [...states.values()];
}

function createHeadCutCollar(): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color: 0x050505,
    emissive: 0x120202,
    emissiveIntensity: 0.14,
    roughness: 0.86,
    metalness: 0.02
  });
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.045, 20), material);
  collar.name = 'walker-head-cut-collar';
  collar.position.set(0, WALKER_HEIGHT * 0.82, 0);
  collar.scale.z = 0.78;
  collar.visible = false;
  collar.castShadow = true;
  return collar;
}

function applyMaterialTint(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach(applyMaterialTint);
    return;
  }

  if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
    return;
  }

  if (material.name === 'Hair' || material.name === 'Eyebrows') {
    material.color.setHex(0xa8a8a0);
  }
}

function getRouteSegmentDistance(index: number): number {
  if (index >= WALKER_ROUTE.length - 1) {
    return 1;
  }

  return WALKER_ROUTE[index].position.distanceTo(WALKER_ROUTE[index + 1].position);
}

function shouldShowWalker(routeIndex: number, position: THREE.Vector3): boolean {
  return routeIndex > 0 || position.x >= WALKER_VISIBLE_X;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerpAngle(start: number, end: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * alpha;
}

function phaseWasCrossed(previous: number, next: number, target: number): boolean {
  return previous <= next
    ? target > previous && target <= next
    : target > previous || target <= next;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  material.dispose();
}

function roundForSnapshot(value: number): number {
  return Math.round(value * 100) / 100;
}
