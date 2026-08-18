/**
 * Amberline Cataclysm: top-down containment-yard scene, using procedural meshes
 * plus managed generated textures. The camera profile follows the live viewport
 * aspect ratio so portrait, landscape, and desktop playfields retain a natural scale.
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Scene } from "@babylonjs/core/scene";
import { GAME_ASSETS } from "./assets";
import { GameWorld } from "./GameWorld";
import type { GameSnapshot, UpgradeId } from "./types";

export interface GameHandle {
  scene: Scene;
  setTouchDirection: (x: number, z: number) => void;
  chooseUpgrade: (id: UpgradeId) => void;
  rerollUpgrades: () => void;
  restart: () => void;
  dispose: () => void;
}

export interface GameSceneOptions {
  demoMode: boolean;
  forceUpgrade: boolean;
  forceModulePreview: boolean;
  bossPreview: boolean;
  strikerPreview: boolean;
  idlePreview: boolean;
  explosionPreview: boolean;
  bossExplosionPreview: boolean;
  bossExplosionFarPreview: boolean;
  debugMode: boolean;
  rerollPreview: number;
  onSnapshot: (snapshot: GameSnapshot) => void;
}

type ViewportCameraProfile = { fov: number; beta: number; radiusScale: number; combatRadiusScale: number };

const getViewportCameraProfile = (width: number, height: number): ViewportCameraProfile => {
  const aspect = width / Math.max(1, height);
  if (aspect < 0.68) return { fov: 0.7, beta: 1.24, radiusScale: 0.91, combatRadiusScale: 0.63 };
  if (aspect < 0.94) return { fov: 0.78, beta: 1.17, radiusScale: 0.97, combatRadiusScale: 0.67 };
  if (aspect < 1.28) return { fov: 0.82, beta: 1.13, radiusScale: 0.93, combatRadiusScale: 0.69 };
  if (aspect < 1.75) return { fov: 0.92, beta: 1.02, radiusScale: 1, combatRadiusScale: 0.72 };
  return { fov: 0.86, beta: 1, radiusScale: 1.07, combatRadiusScale: 0.74 };
};

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement, options: GameSceneOptions): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.017, 0.021, 1);
  scene.ambientColor = new Color3(0.12, 0.11, 0.08);

  const initialProfile = getViewportCameraProfile(canvas.clientWidth, canvas.clientHeight);
  const camera = new ArcRotateCamera("tactical-overlook", -Math.PI / 2, initialProfile.beta, 31 * initialProfile.radiusScale, new Vector3(0, 0, 0), scene);
  camera.lowerBetaLimit = 0.92;
  camera.upperBetaLimit = 1.32;
  camera.lowerRadiusLimit = 22;
  camera.upperRadiusLimit = 44;
  camera.fov = initialProfile.fov;
  camera.attachControl(canvas, false);
  camera.inputs.clear();

  const hemi = new HemisphericLight("containment-fill", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 1.1;
  hemi.diffuse = new Color3(0.5, 0.62, 0.66);
  hemi.groundColor = new Color3(0.05, 0.06, 0.07);
  const key = new DirectionalLight("amber-key", new Vector3(-0.45, -1, 0.3), scene);
  key.position = new Vector3(10, 18, -8);
  key.intensity = 1.45;
  key.diffuse = new Color3(1, 0.45, 0.12);
  const glow = new GlowLayer("safety-bloom", scene, { blurKernelSize: 40 });
  glow.intensity = 0.42;

  const ground = MeshBuilder.CreateGround("containment-floor", { width: 76, height: 76, subdivisions: 2 }, scene);
  const groundMaterial = new StandardMaterial("floor-plating", scene);
  groundMaterial.diffuseColor = new Color3(0.04, 0.048, 0.055);
  groundMaterial.specularColor = Color3.Black();
  const floorTexture = new Texture(GAME_ASSETS.floor, scene, true, false);
  floorTexture.uScale = 8;
  floorTexture.vScale = 8;
  groundMaterial.diffuseTexture = floorTexture;
  ground.material = groundMaterial;

  const stripeMaterial = new StandardMaterial("warning-rail", scene);
  stripeMaterial.diffuseColor = new Color3(0.75, 0.16, 0.01);
  stripeMaterial.emissiveColor = new Color3(0.72, 0.16, 0.01);
  stripeMaterial.specularColor = Color3.Black();
  for (let i = -3; i <= 3; i += 1) {
    const rail = MeshBuilder.CreateBox(`rail-${i}`, { width: 0.18, height: 0.06, depth: 61 }, scene);
    rail.position = new Vector3(i * 10, 0.04, 0);
    rail.material = stripeMaterial;
  }

  const blockMaterial = new StandardMaterial("barrier-block", scene);
  blockMaterial.diffuseColor = new Color3(0.075, 0.11, 0.12);
  blockMaterial.emissiveColor = new Color3(0.01, 0.07, 0.08);
  blockMaterial.specularColor = Color3.Black();
  const blockPositions = [
    [-17, -12, 2.4, 2.8], [18, 12, 2.8, 2.2], [-21, 16, 2.2, 3.4], [19, -17, 3.2, 2.1], [-8, 22, 3.1, 2.3], [9, -23, 2.4, 2.7],
  ];
  blockPositions.forEach(([x, z, width, depth], index) => {
    const block = MeshBuilder.CreateBox(`obstruction-${index}`, { width, height: 1.4, depth }, scene);
    block.position = new Vector3(x, 0.7, z);
    block.material = blockMaterial;
  });

  // The player boundary is ±31 in GameWorld; this engineered buffer makes the limit legible before contact.
  const containmentBoundary = 32.3;
  const containmentWallMaterial = new StandardMaterial("containment-wall", scene);
  containmentWallMaterial.diffuseColor = new Color3(0.035, 0.075, 0.08);
  containmentWallMaterial.emissiveColor = new Color3(0.008, 0.065, 0.07);
  containmentWallMaterial.specularColor = Color3.Black();
  containmentWallMaterial.alpha = 0.72;
  containmentWallMaterial.backFaceCulling = false;
  const containmentCapMaterial = new StandardMaterial("containment-wall-amber", scene);
  containmentCapMaterial.diffuseColor = new Color3(0.88, 0.18, 0.01);
  containmentCapMaterial.emissiveColor = new Color3(0.92, 0.23, 0.015);
  containmentCapMaterial.specularColor = Color3.Black();
  const containmentPostMaterial = new StandardMaterial("containment-post", scene);
  containmentPostMaterial.diffuseColor = new Color3(0.09, 0.12, 0.12);
  containmentPostMaterial.emissiveColor = new Color3(0.018, 0.04, 0.04);
  containmentPostMaterial.specularColor = Color3.Black();
  const wallLength = containmentBoundary * 2 + 0.8;
  const wallHeight = 2.7;
  const wallThickness = 0.55;
  const walls = [
    { name: "containment-wall-east", position: new Vector3(containmentBoundary, wallHeight / 2, 0), width: wallThickness, depth: wallLength },
    { name: "containment-wall-west", position: new Vector3(-containmentBoundary, wallHeight / 2, 0), width: wallThickness, depth: wallLength },
    { name: "containment-wall-north", position: new Vector3(0, wallHeight / 2, containmentBoundary), width: wallLength, depth: wallThickness },
    { name: "containment-wall-south", position: new Vector3(0, wallHeight / 2, -containmentBoundary), width: wallLength, depth: wallThickness },
  ];
  walls.forEach((wallSpec) => {
    const wall = MeshBuilder.CreateBox(wallSpec.name, { width: wallSpec.width, height: wallHeight, depth: wallSpec.depth }, scene);
    wall.position.copyFrom(wallSpec.position);
    wall.material = containmentWallMaterial;
    const cap = MeshBuilder.CreateBox(`${wallSpec.name}-cap`, { width: wallSpec.width + 0.06, height: 0.11, depth: wallSpec.depth + 0.06 }, scene);
    cap.position.copyFrom(wallSpec.position);
    cap.position.y = wallHeight + 0.05;
    cap.material = containmentCapMaterial;
  });
  const postPositions = [
    [-containmentBoundary, -containmentBoundary], [-containmentBoundary, containmentBoundary], [containmentBoundary, -containmentBoundary], [containmentBoundary, containmentBoundary],
    [-containmentBoundary, 0], [containmentBoundary, 0], [0, -containmentBoundary], [0, containmentBoundary],
  ];
  postPositions.forEach(([x, z], index) => {
    const post = MeshBuilder.CreateBox(`containment-post-${index}`, { width: 0.92, height: 3.6, depth: 0.92 }, scene);
    post.position.set(x, 1.8, z);
    post.material = containmentPostMaterial;
    const beacon = MeshBuilder.CreateSphere(`containment-beacon-${index}`, { diameter: 0.36, segments: 8 }, scene);
    beacon.position.set(x, 3.72, z);
    beacon.material = containmentCapMaterial;
    const warningBand = MeshBuilder.CreateBox(`containment-band-${index}`, { width: 1.02, height: 0.18, depth: 1.02 }, scene);
    warningBand.position.set(x, 2.7, z);
    warningBand.material = containmentCapMaterial;
  });

  const world = new GameWorld(scene, options.onSnapshot, options.demoMode, options.forceUpgrade, options.forceModulePreview, options.bossPreview, options.strikerPreview, options.idlePreview, options.explosionPreview, options.bossExplosionPreview, options.bossExplosionFarPreview, options.debugMode, options.rerollPreview);
  scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    const forward = camera.target.subtract(camera.position);
    forward.y = 0;
    if (forward.lengthSquared() > 0.001) forward.normalize();
    const right = new Vector3(forward.z, 0, -forward.x);
    world.setCameraBasis(forward, right);
    world.update(delta);
    const framing = world.getFramingState();
    const profile = getViewportCameraProfile(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight());
    const desiredRadius = Math.min(40, 30 + Math.min(10, framing.nearbyEnemyCount * 0.38)) * profile.radiusScale;
    const cameraEase = Math.min(1, delta * 2.8);
    camera.radius += (desiredRadius - camera.radius) * cameraEase;
    camera.fov += (profile.fov - camera.fov) * Math.min(1, delta * 4.4);
    camera.beta += (profile.beta - camera.beta) * Math.min(1, delta * 4.4);
    camera.target.copyFrom(framing.playerPosition);
    world.setCombatRadius(Math.max(15, camera.radius * profile.combatRadiusScale));
  });

  return {
    scene,
    setTouchDirection: (x, z) => world.setTouchDirection(x, z),
    chooseUpgrade: (id) => world.chooseUpgrade(id),
    rerollUpgrades: () => world.rerollUpgradeChoices(),
    restart: () => world.restart(),
    dispose: () => {
      world.dispose();
      camera.detachControl();
      scene.dispose();
    },
  };
}
