/**
 * Amberline Cataclysm: compact framework-free survival simulation.
 * Every entity owns its Babylon mesh; the world owns combat timing and phases.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { GAME_ASSETS } from "./assets";
import { MODULE_UPGRADES, STANDARD_UPGRADES, UPGRADE_CATALOG, type AttackStatus, type GamePhase, type GameSnapshot, type ModuleId, type UpgradeId, type UpgradeOption } from "./types";

type EnemyKind = "scout" | "striker" | "bulwark";
type BossAction = "none" | "shockwave" | "charge" | "artillery" | "barrage";
type StrikerAction = "none" | "windup" | "dash";
type PlayerDamageSource = "idle-needle" | "contact" | "striker-dash" | "bulwark-barrage" | "bulwark-shockwave" | "bulwark-artillery" | "bulwark-charge" | "bulwark-destruction";
type Enemy = { mesh: AbstractMesh; kind: EnemyKind; hp: number; maxHp: number; speed: number; scale: number; contactDamage: number; xpValue: number; healthFill?: AbstractMesh; hitFlash: number; orbitCooldown: number; cryoTime: number; corrosionTime: number; corrosionStacks: number; corrosionTick: number; corrosionMark?: AbstractMesh; enteringContainment: boolean; strikerAction: StrikerAction; strikerTimer: number; strikerCooldown: number; strikerVector: Vector3; strikerDashHit: boolean; strikerMarker?: AbstractMesh; bossAction: BossAction; bossTimer: number; bossCooldown: number; bossTarget: Vector3; bossVector: Vector3; bossChargeHit: boolean; bossBursts: number; bossEnraged: boolean; bossMarker?: AbstractMesh };
type Projectile = { mesh: AbstractMesh; velocity: Vector3; damage: number; life: number; hitRadius: number };
type Gem = { mesh: AbstractMesh; value: number };
type RecoveryItem = { mesh: AbstractMesh; amount: number; life: number };
type MagnetItem = { mesh: AbstractMesh; life: number };
type Pylon = { mesh: AbstractMesh; life: number; cooldown: number; formationOffset: Vector3; core: AbstractMesh; aura: AbstractMesh; thrust: AbstractMesh };
type Shockwave = { mesh: AbstractMesh; life: number; maxLife: number };
type RicochetShot = { mesh: AbstractMesh; target: Enemy; life: number; damage: number; bounces: number; hitTargets: Set<AbstractMesh> };
type GravityCore = { mesh: AbstractMesh; life: number; pulse: number };
type Decoy = { mesh: AbstractMesh; life: number; pulse: number };
type ArcShell = { mesh: AbstractMesh; start: Vector3; target: Vector3; progress: number; duration: number; damage: number; radius: number };
type SplitShell = { mesh: AbstractMesh; target: Enemy; life: number; damage: number; fragments: number };
type ReturnBlade = { mesh: AbstractMesh; direction: Vector3; traveled: number; maxTravel: number; damage: number; returning: boolean; hitTargets: Set<AbstractMesh>; life: number };
type EnergyTrace = { mesh: AbstractMesh; life: number; maxLife: number };
type ProximityMine = { mesh: AbstractMesh; life: number; armed: number };
type SkyfallStrike = { marker: AbstractMesh; target: Vector3; delay: number; radius: number; damage: number };
type NeedleDrop = { mesh: AbstractMesh; target: Vector3; life: number; maxLife: number; damage: number };
type IdleNeedle = { mesh: AbstractMesh; marker: AbstractMesh; target: Vector3; life: number; maxLife: number };
type ChainHarpoon = { mesh: AbstractMesh; cable: AbstractMesh; target: Enemy; life: number; damage: number; latched: boolean };
type ClusterCore = { mesh: AbstractMesh; target: Enemy; life: number; damage: number; fragments: number };
type ClusterShard = { mesh: AbstractMesh; target: Enemy; life: number; damage: number };

const PLAYER_SAFE_BOUND = 31;
const ENEMY_ARENA_BOUND = 35;
const CONTAINMENT_WALL_BOUND = 32.3;
const MIN_COMBAT_RADIUS = 19;
const INGRESS_TARGET_BUFFER = 17;
const PROJECTILE_HEIGHT = 0.86;
const DROP_LIFETIME = 14;
const DROP_WARNING_WINDOW = 4.5;
const DROP_FADE_WINDOW = 1.25;
const RECOVERY_DROP_CHANCE = 0.06;
const MAGNET_DROP_CHANCE = 0.065 / 3;
const PLAYER_RING_RADIUS = 1.28;
const MAX_REROLLS_PER_RUN = 3;

export class GameWorld {
  private readonly player: AbstractMesh;
  private readonly playerCore: AbstractMesh;
  private readonly playerRing: AbstractMesh;
  private readonly playerHitRing: AbstractMesh;
  private readonly enemyMaterial: StandardMaterial;
  private readonly strikerMaterial: StandardMaterial;
  private readonly bulwarkMaterial: StandardMaterial;
  private readonly enemyEyeMaterial: StandardMaterial;
  private readonly projectileMaterial: StandardMaterial;
  private readonly gemMaterial: StandardMaterial;
  private readonly recoveryMaterial: StandardMaterial;
  private readonly magnetMaterial: StandardMaterial;
  private readonly ringMaterial: StandardMaterial;
  private readonly idleNeedleRedMaterial: StandardMaterial;
  private readonly idleNeedleWhiteMaterial: StandardMaterial;
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly gems: Gem[] = [];
  private readonly recoveryItems: RecoveryItem[] = [];
  private readonly magnetItems: MagnetItem[] = [];
  private readonly orbitBlades: AbstractMesh[] = [];
  private readonly mirageDrones: AbstractMesh[] = [];
  private readonly pylons: Pylon[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly ricochetShots: RicochetShot[] = [];
  private readonly gravityCores: GravityCore[] = [];
  private readonly decoys: Decoy[] = [];
  private readonly arcShells: ArcShell[] = [];
  private readonly splitShells: SplitShell[] = [];
  private readonly returnBlades: ReturnBlade[] = [];
  private readonly energyTraces: EnergyTrace[] = [];
  private readonly mines: ProximityMine[] = [];
  private readonly skyfallStrikes: SkyfallStrike[] = [];
  private readonly needleDrops: NeedleDrop[] = [];
  private readonly idleNeedles: IdleNeedle[] = [];
  private readonly sawBlades: AbstractMesh[] = [];
  private readonly harpoons: ChainHarpoon[] = [];
  private readonly clusterCores: ClusterCore[] = [];
  private readonly clusterShards: ClusterShard[] = [];
  private readonly keys = new Set<string>();
  private touchDirection = Vector3.Zero();
  private cameraForward = new Vector3(0, 0, 1);
  private cameraRight = new Vector3(1, 0, 0);
  private phase: GamePhase = "playing";
  private health = 100;
  private maxHealth = 100;
  private damageFlash = 0;
  private xp = 0;
  private xpNeeded = 9;
  private level = 1;
  private kills = 0;
  private elapsed = 0;
  private weaponTier = 1;
  private scatterTier = 0;
  private orbitTier = 0;
  private readonly moduleTiers: Record<ModuleId, number> = { vector: 0, nova: 0, mirage: 0, pylon: 0, reactive: 0, cryo: 0, ricochet: 0, gravity: 0, decoy: 0, mortar: 0, split: 0, boomerang: 0, laser: 0, chain: 0, mine: 0, fan: 0, skyfall: 0, cleaver: 0, needle: 0, saw: 0, harpoon: 0, thermal: 0, sonic: 0, cluster: 0, corrosion: 0 };
  private upgradeOptions: UpgradeOption[] = [];
  private rerollsRemaining = MAX_REROLLS_PER_RUN;
  private moduleSelection = false;
  private hasScatter = false;
  private hasOrbit = false;
  private damage = 14;
  private shotDelay = 0.48;
  private playerSpeed = 8.5;
  private magnetRadius = 5.2;
  private combatRadius = 22;
  private shootTimer = 0;
  private scatterTimer = 0;
  private orbitAngle = 0;
  private vectorTimer = 0;
  private novaTimer = 0;
  private mirageTimer = 0;
  private pylonTimer = 0;
  private mirageAngle = 0;
  private ricochetTimer = 0;
  private gravityTimer = 0;
  private decoyTimer = 0;
  private mortarTimer = 0;
  private splitTimer = 0;
  private boomerangTimer = 0;
  private laserTimer = 0;
  private chainTimer = 0;
  private mineTimer = 0;
  private fanTimer = 0;
  private skyfallTimer = 0;
  private cleaverTimer = 0;
  private needleTimer = 0;
  private sawHitTimer = 0;
  private harpoonTimer = 0;
  private thermalTimer = 0;
  private sonicTimer = 0;
  private clusterTimer = 0;
  private sawAngle = 0;
  private spawnTimer = 0;
  private damageTimer = 0;
  private lastDamageSource: PlayerDamageSource | "none" = "none";
  private idleSeconds = 0;
  private idleStrikeCooldown = 0;
  private debugHits = 0;
  private debugKills = 0;
  private debugEntries = 0;
  private debugProjectilesFired = 0;
  private debugProjectileCollisions = 0;
  private emitTimer = 0;
  private disposed = false;
  private readonly keyDown: (event: KeyboardEvent) => void;
  private readonly keyUp: (event: KeyboardEvent) => void;

  constructor(
    private readonly scene: Scene,
    private readonly onSnapshot: (snapshot: GameSnapshot) => void,
    private readonly demoMode: boolean,
    private readonly forceUpgrade: boolean,
    private readonly forceModulePreview: boolean,
    private readonly bossPreview: boolean,
    private readonly strikerPreview: boolean,
    private readonly idlePreview: boolean,
    private readonly explosionPreview: boolean,
    private readonly bossExplosionPreview: boolean,
    private readonly bossExplosionFarPreview: boolean,
    private readonly debugMode: boolean,
    private readonly rerollPreview: number,
  ) {
    this.enemyMaterial = this.makeMaterial("drone-shell", new Color3(0.025, 0.15, 0.17), new Color3(0.02, 0.85, 0.95));
    this.enemyMaterial.diffuseTexture = new Texture(GAME_ASSETS.dronePanel, scene, true, false);
    this.enemyMaterial.emissiveTexture = new Texture(GAME_ASSETS.dronePanel, scene, true, false);
    this.strikerMaterial = this.makeMaterial("striker-shell", new Color3(0.28, 0.025, 0.01), new Color3(0.92, 0.075, 0.02));
    this.bulwarkMaterial = this.makeMaterial("bulwark-shell", new Color3(0.23, 0.14, 0.035), new Color3(1, 0.3, 0.025));
    this.enemyEyeMaterial = this.makeMaterial("drone-eye", new Color3(0.03, 0.3, 0.34), new Color3(0.18, 0.95, 1));
    this.projectileMaterial = this.makeMaterial("amber-bolt", new Color3(1, 0.28, 0.01), new Color3(1, 0.58, 0.02));
    this.gemMaterial = this.makeMaterial("recovery-crystal", new Color3(0.18, 0.42, 0.01), new Color3(0.52, 1, 0.08));
    this.recoveryMaterial = this.makeMaterial("field-medkit", new Color3(0.64, 0.06, 0.025), new Color3(1, 0.18, 0.04));
    this.magnetMaterial = this.makeMaterial("xp-magnet", new Color3(0.035, 0.12, 0.68), new Color3(0.1, 0.42, 1));
    this.ringMaterial = this.makeMaterial("safety-ring", new Color3(0.9, 0.22, 0.015), new Color3(1, 0.5, 0.03));
    this.idleNeedleRedMaterial = this.makeMaterial("idle-needle-red", new Color3(0.72, 0.015, 0.01), new Color3(1, 0.05, 0.025));
    this.idleNeedleWhiteMaterial = this.makeMaterial("idle-needle-white", new Color3(0.92, 0.92, 0.86), new Color3(1, 0.95, 0.84));

    const suit = this.makeMaterial("responder-suit", new Color3(0.58, 0.52, 0.37), new Color3(0.22, 0.08, 0.005));
    const visor = this.makeMaterial("responder-visor", new Color3(0.12, 0.05, 0.01), new Color3(1, 0.52, 0.02));
    this.player = MeshBuilder.CreateCylinder("operative", { height: 1.65, diameterTop: 0.78, diameterBottom: 0.92, tessellation: 8 }, scene);
    this.player.position.y = 0.88;
    this.player.material = suit;
    this.playerCore = MeshBuilder.CreateSphere("operative-core", { diameter: 0.52, segments: 8 }, scene);
    this.playerCore.position = new Vector3(0, 1.48, 0.08);
    this.playerCore.material = visor;
    const ring = MeshBuilder.CreateTorus("containment-ring", { diameter: 2.45, thickness: 0.08, tessellation: 48 }, scene);
    ring.position.y = 0.075;
    ring.material = this.ringMaterial;
    ring.parent = this.player;
    this.playerRing = ring;
    const hitRing = MeshBuilder.CreateTorus("containment-hit-ring", { diameter: 2.78, thickness: 0.13, tessellation: 48 }, scene);
    hitRing.position.y = 0.095;
    hitRing.material = this.recoveryMaterial;
    hitRing.parent = this.player;
    hitRing.isVisible = false;
    this.playerHitRing = hitRing;
    this.playerCore.parent = this.player;

    this.keyDown = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        this.keys.add(key);
        event.preventDefault();
      }
    };
    this.keyUp = (event) => this.keys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    if (this.demoMode) {
      this.xp = 5;
      this.damage = 30;
      this.shotDelay = 0.18;
      this.weaponTier = 2;
      this.activateScatter();
      this.activateOrbit();
      this.moduleTiers.fan = 3;
      this.moduleTiers.skyfall = 3;
      this.moduleTiers.cleaver = 3;
      this.moduleTiers.needle = 3;
      this.moduleTiers.saw = 3;
      this.moduleTiers.harpoon = 3;
      this.moduleTiers.thermal = 3;
      this.moduleTiers.sonic = 3;
      this.moduleTiers.cluster = 3;
      this.moduleTiers.corrosion = 3;
      this.ensureSawHalo();
      this.health = 72;
      this.createRecoveryItem(this.player.position.add(new Vector3(5.2, 0, 2.3)), 5.2);
      this.createMagnetItem(this.player.position.add(new Vector3(-5.2, 0, -1.8)), 6.2);
    }
    if (this.bossPreview) {
      this.spawnEnemy("bulwark");
      const boss = this.enemies[this.enemies.length - 1];
      boss.mesh.position.copyFrom(this.player.position.add(new Vector3(0, 0.8, -8.4)));
      boss.hp *= 4;
      boss.maxHp = boss.hp;
      boss.bossCooldown = 0.55;
      if (this.demoMode) {
        boss.hp = Math.ceil(boss.maxHp * 0.45);
        boss.bossEnraged = true;
        boss.bossAction = "barrage";
        boss.bossTimer = 0.72;
        boss.bossBursts = 3;
        boss.bossTarget.copyFrom(this.player.position);
        boss.bossMarker = this.createBossWarning(boss.bossTarget, 1.85);
      }
    }
    if (this.strikerPreview) {
      this.spawnEnemy("striker");
      const striker = this.enemies[this.enemies.length - 1];
      striker.mesh.position.copyFrom(this.player.position.add(new Vector3(0, 0.8, -6.8)));
      striker.hp *= 40;
      striker.maxHp = striker.hp;
      const previewVector = this.player.position.subtract(striker.mesh.position);
      previewVector.y = 0;
      previewVector.normalize();
      striker.strikerAction = "windup";
      striker.strikerTimer = 2.7;
      striker.strikerVector.copyFrom(previewVector);
      striker.strikerMarker = this.createStrikerDashWarning(striker.mesh.position, striker.mesh.position.add(previewVector.scale(6.1)));
    }
    if (this.idlePreview) {
      this.launchIdleNeedle(this.player.position.clone(), 4.2);
      this.idleStrikeCooldown = 9;
    }
    if (this.explosionPreview) {
      this.spawnEnemy("scout");
      const previewEnemy = this.enemies[this.enemies.length - 1];
      previewEnemy.mesh.position.copyFrom(this.player.position.add(new Vector3(1.45, 0.8, 0)));
      previewEnemy.hp = 1;
      previewEnemy.maxHp = 1;
    }
    if (this.bossExplosionPreview || this.bossExplosionFarPreview) {
      this.spawnEnemy("bulwark");
      const previewBoss = this.enemies[this.enemies.length - 1];
      previewBoss.mesh.position.copyFrom(this.player.position.add(new Vector3(this.bossExplosionFarPreview ? 4.2 : 1.55, 0.8, 0)));
      previewBoss.hp = 1;
      previewBoss.maxHp = 1;
      previewBoss.enteringContainment = false;
    }
    if (this.debugMode) {
      this.xpNeeded = 999;
      this.setupCombatDebugScenario();
    }
    if (this.forceModulePreview) {
      this.level = 10;
      this.phase = "upgrade";
      this.prepareUpgradeChoices();
    } else if (this.forceUpgrade) {
      this.phase = "upgrade";
      this.prepareUpgradeChoices();
    }
    for (let index = 0; index < Math.min(MAX_REROLLS_PER_RUN, this.rerollPreview); index += 1) this.rerollUpgradeChoices();
    this.emitSnapshot();
  }

  update(delta: number) {
    if (this.disposed) return;
    if (this.phase !== "playing") return;
    if (this.tryAdvanceLevel()) return;
    const safeDelta = Math.min(delta, 0.05);
    this.elapsed += safeDelta;
    const playerMoved = this.updatePlayer(safeDelta);
    this.updateDamageWarning(safeDelta);
    this.updateIdleHazard(safeDelta, playerMoved);
    this.updateModules(safeDelta);
    this.updateSpawning(safeDelta);
    this.updateCombat(safeDelta);
    this.updateOrbit(safeDelta);
    this.updateCorrosion(safeDelta);
    this.updateEnemies(safeDelta);
    this.updateMagnetItems(safeDelta);
    this.updateGems(safeDelta);
    this.updateRecoveryItems(safeDelta);
    this.emitTimer -= safeDelta;
    if (this.emitTimer <= 0) {
      this.emitTimer = 0.1;
      this.emitSnapshot();
    }
  }

  setTouchDirection(x: number, z: number) {
    this.touchDirection.set(x, 0, z);
    if (this.touchDirection.lengthSquared() > 1) this.touchDirection.normalize();
  }

  setCameraBasis(forward: Vector3, right: Vector3) {
    this.cameraForward.copyFrom(forward);
    this.cameraRight.copyFrom(right);
  }

  setCombatRadius(radius: number) {
    this.combatRadius = Math.max(MIN_COMBAT_RADIUS, radius);
  }

  getFramingState() {
    const nearbyEnemyCount = this.enemies.filter((enemy) => this.isCombatTarget(enemy)).length;
    return { playerPosition: this.player.position.clone(), nearbyEnemyCount };
  }

  chooseUpgrade(id: UpgradeId) {
    if (this.phase !== "upgrade") return;
    if (this.isModuleId(id)) {
      this.moduleTiers[id] = Math.min(3, this.moduleTiers[id] + 1);
      this.activateModule(id);
    } else if (id === "pulse") {
      this.damage += 8;
      this.weaponTier += 1;
    } else if (id === "scatter") {
      this.activateScatter();
    } else if (id === "orbit") {
      this.activateOrbit();
    } else if (id === "relay") {
      this.shotDelay = Math.max(0.16, this.shotDelay - 0.08);
      this.playerSpeed += 0.7;
    } else {
      this.maxHealth += 16;
      this.health = Math.min(this.maxHealth, this.health + 36);
      this.magnetRadius += 0.45;
    }
    this.phase = "playing";
    this.upgradeOptions = [];
    this.emitSnapshot();
  }

  rerollUpgradeChoices() {
    if (this.phase !== "upgrade" || this.rerollsRemaining <= 0) return;
    const currentIds = new Set(this.upgradeOptions.map((option) => option.id));
    this.rerollsRemaining -= 1;
    this.prepareUpgradeChoices(currentIds);
    this.emitSnapshot();
  }

  restart() {
    [...this.idleNeedles].forEach((needle) => { needle.mesh.dispose(); needle.marker.dispose(); });
    [...this.enemies].forEach((enemy) => { enemy.strikerMarker?.dispose(); enemy.bossMarker?.dispose(); enemy.mesh.dispose(); });
    [...this.projectiles].forEach((projectile) => projectile.mesh.dispose());
    [...this.gems].forEach((gem) => gem.mesh.dispose());
    [...this.recoveryItems].forEach((item) => item.mesh.dispose());
    [...this.magnetItems].forEach((item) => item.mesh.dispose());
    [...this.orbitBlades].forEach((blade) => blade.dispose());
    [...this.mirageDrones].forEach((drone) => drone.dispose());
    [...this.pylons].forEach((pylon) => pylon.mesh.dispose());
    [...this.shockwaves].forEach((shockwave) => shockwave.mesh.dispose());
    [...this.ricochetShots].forEach((shot) => shot.mesh.dispose());
    [...this.gravityCores].forEach((core) => core.mesh.dispose());
    [...this.decoys].forEach((decoy) => decoy.mesh.dispose());
    [...this.arcShells].forEach((shell) => shell.mesh.dispose());
    [...this.splitShells].forEach((shell) => shell.mesh.dispose());
    [...this.returnBlades].forEach((blade) => blade.mesh.dispose());
    [...this.energyTraces].forEach((trace) => trace.mesh.dispose());
    [...this.mines].forEach((mine) => mine.mesh.dispose());
    [...this.skyfallStrikes].forEach((strike) => strike.marker.dispose());
    [...this.needleDrops].forEach((needle) => needle.mesh.dispose());
    [...this.sawBlades].forEach((blade) => blade.dispose());
    [...this.harpoons].forEach((harpoon) => { harpoon.mesh.dispose(); harpoon.cable.dispose(); });
    [...this.clusterCores].forEach((core) => core.mesh.dispose());
    [...this.clusterShards].forEach((shard) => shard.mesh.dispose());
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.gems.length = 0;
    this.recoveryItems.length = 0;
    this.magnetItems.length = 0;
    this.orbitBlades.length = 0;
    this.mirageDrones.length = 0;
    this.pylons.length = 0;
    this.shockwaves.length = 0;
    this.ricochetShots.length = 0;
    this.gravityCores.length = 0;
    this.decoys.length = 0;
    this.arcShells.length = 0;
    this.splitShells.length = 0;
    this.returnBlades.length = 0;
    this.energyTraces.length = 0;
    this.mines.length = 0;
    this.skyfallStrikes.length = 0;
    this.needleDrops.length = 0;
    this.idleNeedles.length = 0;
    this.sawBlades.length = 0;
    this.harpoons.length = 0;
    this.clusterCores.length = 0;
    this.clusterShards.length = 0;
    this.player.position.x = 0;
    this.player.position.z = 0;
    this.phase = "playing";
    this.health = 100;
    this.maxHealth = 100;
    this.damageFlash = 0;
    this.playerRing.scaling.setAll(1);
    this.playerHitRing.isVisible = false;
    this.xp = 0;
    this.xpNeeded = 9;
    this.level = 1;
    this.kills = 0;
    this.elapsed = 0;
    this.weaponTier = 1;
    this.scatterTier = 0;
    this.orbitTier = 0;
    this.moduleTiers.vector = 0;
    this.moduleTiers.nova = 0;
    this.moduleTiers.mirage = 0;
    this.moduleTiers.pylon = 0;
    this.moduleTiers.reactive = 0;
    this.moduleTiers.cryo = 0;
    this.moduleTiers.ricochet = 0;
    this.moduleTiers.gravity = 0;
    this.moduleTiers.decoy = 0;
    this.moduleTiers.mortar = 0;
    this.moduleTiers.split = 0;
    this.moduleTiers.boomerang = 0;
    this.moduleTiers.laser = 0;
    this.moduleTiers.chain = 0;
    this.moduleTiers.mine = 0;
    this.moduleTiers.fan = 0;
    this.moduleTiers.skyfall = 0;
    this.moduleTiers.cleaver = 0;
    this.moduleTiers.needle = 0;
    this.moduleTiers.saw = 0;
    this.moduleTiers.harpoon = 0;
    this.moduleTiers.thermal = 0;
    this.moduleTiers.sonic = 0;
    this.moduleTiers.cluster = 0;
    this.moduleTiers.corrosion = 0;
    this.upgradeOptions = [];
    this.rerollsRemaining = MAX_REROLLS_PER_RUN;
    this.moduleSelection = false;
    this.hasScatter = false;
    this.hasOrbit = false;
    this.damage = 14;
    this.shotDelay = 0.48;
    this.playerSpeed = 8.5;
    this.magnetRadius = 5.2;
    this.shootTimer = 0;
    this.scatterTimer = 0;
    this.orbitAngle = 0;
    this.vectorTimer = 0;
    this.novaTimer = 0;
    this.mirageTimer = 0;
    this.pylonTimer = 0;
    this.mirageAngle = 0;
    this.ricochetTimer = 0;
    this.gravityTimer = 0;
    this.decoyTimer = 0;
    this.mortarTimer = 0;
    this.splitTimer = 0;
    this.boomerangTimer = 0;
    this.laserTimer = 0;
    this.chainTimer = 0;
    this.mineTimer = 0;
    this.fanTimer = 0;
    this.skyfallTimer = 0;
    this.cleaverTimer = 0;
    this.needleTimer = 0;
    this.sawHitTimer = 0;
    this.harpoonTimer = 0;
    this.thermalTimer = 0;
    this.sonicTimer = 0;
    this.clusterTimer = 0;
    this.sawAngle = 0;
    this.spawnTimer = 0;
    this.damageTimer = 0;
    this.lastDamageSource = "none";
    this.idleSeconds = 0;
    this.idleStrikeCooldown = 0;
    this.emitSnapshot();
  }

  dispose() {
    this.disposed = true;
    [...this.idleNeedles].forEach((needle) => { needle.mesh.dispose(); needle.marker.dispose(); });
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.player.dispose();
    [...this.orbitBlades].forEach((blade) => blade.dispose());
    [...this.mirageDrones].forEach((drone) => drone.dispose());
    [...this.pylons].forEach((pylon) => pylon.mesh.dispose());
    [...this.shockwaves].forEach((shockwave) => shockwave.mesh.dispose());
    [...this.ricochetShots].forEach((shot) => shot.mesh.dispose());
    [...this.gravityCores].forEach((core) => core.mesh.dispose());
    [...this.decoys].forEach((decoy) => decoy.mesh.dispose());
    [...this.arcShells].forEach((shell) => shell.mesh.dispose());
    [...this.splitShells].forEach((shell) => shell.mesh.dispose());
    [...this.returnBlades].forEach((blade) => blade.mesh.dispose());
    [...this.energyTraces].forEach((trace) => trace.mesh.dispose());
    [...this.mines].forEach((mine) => mine.mesh.dispose());
    [...this.skyfallStrikes].forEach((strike) => strike.marker.dispose());
    [...this.needleDrops].forEach((needle) => needle.mesh.dispose());
    [...this.sawBlades].forEach((blade) => blade.dispose());
    [...this.harpoons].forEach((harpoon) => { harpoon.mesh.dispose(); harpoon.cable.dispose(); });
    [...this.clusterCores].forEach((core) => core.mesh.dispose());
    [...this.clusterShards].forEach((shard) => shard.mesh.dispose());
    [...this.enemies].forEach((enemy) => { enemy.strikerMarker?.dispose(); enemy.bossMarker?.dispose(); enemy.mesh.dispose(); });
    this.enemyMaterial.dispose();
    this.strikerMaterial.dispose();
    this.bulwarkMaterial.dispose();
    this.enemyEyeMaterial.dispose();
    this.projectileMaterial.dispose();
    this.gemMaterial.dispose();
    this.recoveryMaterial.dispose();
    this.magnetMaterial.dispose();
    this.ringMaterial.dispose();
    this.idleNeedleRedMaterial.dispose();
    this.idleNeedleWhiteMaterial.dispose();
  }

  private updatePlayer(delta: number) {
    const move = this.demoMode ? this.getDemoDirection() : this.getInputDirection();
    const moved = move.lengthSquared() > 0.0004;
    if (moved) {
      move.normalize();
      this.player.position.addInPlace(move.scale(this.playerSpeed * delta));
      this.player.rotation.y = Math.atan2(move.x, move.z);
    }
    this.player.position.x = Math.max(-PLAYER_SAFE_BOUND, Math.min(PLAYER_SAFE_BOUND, this.player.position.x));
    this.player.position.z = Math.max(-PLAYER_SAFE_BOUND, Math.min(PLAYER_SAFE_BOUND, this.player.position.z));
    this.playerCore.rotation.y += delta * 3;
    return moved;
  }

  private updateIdleHazard(delta: number, playerMoved: boolean) {
    if (playerMoved) this.idleSeconds = 0;
    else this.idleSeconds += delta;
    this.idleStrikeCooldown = Math.max(0, this.idleStrikeCooldown - delta);
    if (this.idleSeconds >= 5 && this.idleStrikeCooldown <= 0) {
      this.launchIdleNeedle(this.player.position.clone());
      this.idleSeconds = 0;
      this.idleStrikeCooldown = 0.7;
    }
    for (let index = this.idleNeedles.length - 1; index >= 0; index -= 1) {
      const needle = this.idleNeedles[index];
      needle.life -= delta;
      const progress = 1 - Math.max(0, needle.life) / needle.maxLife;
      const whitePhase = Math.floor(this.elapsed * 14 + index) % 2 === 0;
      const material = whitePhase ? this.idleNeedleWhiteMaterial : this.idleNeedleRedMaterial;
      needle.mesh.material = material;
      needle.marker.material = material;
      needle.mesh.position.x = needle.target.x;
      needle.mesh.position.z = needle.target.z;
      needle.mesh.position.y = 0.58 + (1 - progress) * 8.8;
      needle.mesh.scaling.y = 0.9 + progress * 0.32;
      needle.marker.scaling.setAll(0.72 + Math.sin(this.elapsed * 17) * 0.11 + progress * 0.22);
      if (needle.life > 0) continue;
      if (Vector3.DistanceSquared(this.player.position, needle.target) <= 1.05 * 1.05) this.damagePlayer(20, 0.45, "idle-needle");
      const impact = MeshBuilder.CreateTorus("idle-needle-impact", { diameter: 0.68, thickness: 0.12, tessellation: 28 }, this.scene);
      impact.position.copyFrom(needle.target);
      impact.position.y = 0.15;
      impact.material = this.idleNeedleRedMaterial;
      this.shockwaves.push({ mesh: impact, life: 0.32, maxLife: 0.32 });
      needle.mesh.dispose();
      needle.marker.dispose();
      this.idleNeedles.splice(index, 1);
    }
  }

  private launchIdleNeedle(target: Vector3, fallDuration = 2) {
    const marker = MeshBuilder.CreateTorus("idle-needle-warning", { diameter: 2.05, thickness: 0.095, tessellation: 28 }, this.scene);
    marker.position.copyFrom(target);
    marker.position.y = 0.12;
    marker.material = this.idleNeedleRedMaterial;
    const needle = MeshBuilder.CreateCylinder("idle-needle", { height: 2.25, diameterTop: 0.06, diameterBottom: 0.38, tessellation: 6 }, this.scene);
    needle.position.copyFrom(target.add(new Vector3(0, 9.38, 0)));
    needle.material = this.idleNeedleWhiteMaterial;
    this.idleNeedles.push({ mesh: needle, marker, target, life: fallDuration, maxLife: fallDuration });
  }

  private clampToArena(position: Vector3, bound: number) {
    position.x = Math.max(-bound, Math.min(bound, position.x));
    position.z = Math.max(-bound, Math.min(bound, position.z));
    return position;
  }

  private constrainEnemyToArena(enemy: Enemy) {
    this.clampToArena(enemy.mesh.position, ENEMY_ARENA_BOUND);
  }

  private getWallIngressPosition() {
    const laneLimit = CONTAINMENT_WALL_BOUND - 4.5;
    const lane = (Math.random() * 2 - 1) * laneLimit;
    const exterior = ENEMY_ARENA_BOUND - 0.18;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { spawn: new Vector3(exterior, 0.8, lane), breach: new Vector3(CONTAINMENT_WALL_BOUND, 0.12, lane) };
    if (side === 1) return { spawn: new Vector3(-exterior, 0.8, lane), breach: new Vector3(-CONTAINMENT_WALL_BOUND, 0.12, lane) };
    if (side === 2) return { spawn: new Vector3(lane, 0.8, exterior), breach: new Vector3(lane, 0.12, CONTAINMENT_WALL_BOUND) };
    return { spawn: new Vector3(lane, 0.8, -exterior), breach: new Vector3(lane, 0.12, -CONTAINMENT_WALL_BOUND) };
  }

  private createWallBreach(position: Vector3, material: StandardMaterial) {
    const breach = MeshBuilder.CreateTorus("containment-breach", { diameter: 0.78, thickness: 0.11, tessellation: 24 }, this.scene);
    breach.position.copyFrom(position);
    breach.material = material;
    this.shockwaves.push({ mesh: breach, life: 0.52, maxLife: 0.52 });
  }

  private setupCombatDebugScenario() {
    const placeDebugEnemy = (offset: Vector3, hp: number, enteringContainment: boolean) => {
      this.spawnEnemy("scout");
      const enemy = this.enemies[this.enemies.length - 1];
      enemy.mesh.position.copyFrom(this.player.position.add(offset));
      enemy.hp = hp;
      enemy.maxHp = hp;
      enemy.enteringContainment = enteringContainment;
    };
    placeDebugEnemy(new Vector3(7.4, 0.8, 0), 8, false);
    placeDebugEnemy(new Vector3(0, 0.8, CONTAINMENT_WALL_BOUND + 1.2), 12, true);
    placeDebugEnemy(new Vector3(-11.5, 0.8, 5.5), 16, false);
  }

  private getRecoverableDropPosition(position: Vector3) {
    const offset = position.subtract(this.player.position);
    offset.y = 0;
    const maximumDistance = Math.min(13.5, Math.max(8, this.combatRadius * 0.82));
    if (offset.lengthSquared() > maximumDistance * maximumDistance) offset.normalize().scaleInPlace(maximumDistance);
    const reachable = this.player.position.add(offset);
    reachable.y = 0;
    return this.clampToArena(reachable, PLAYER_SAFE_BOUND - 0.7);
  }

  private getInputDirection() {
    const screenDirection = this.touchDirection.clone();
    if (this.keys.has("w") || this.keys.has("arrowup")) screenDirection.z += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) screenDirection.z -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) screenDirection.x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) screenDirection.x += 1;
    const direction = this.cameraRight.scale(screenDirection.x).add(this.cameraForward.scale(screenDirection.z));
    if (direction.lengthSquared() > 1) direction.normalize();
    return direction;
  }

  private getDemoDirection() {
    const theta = this.elapsed * 0.76;
    return new Vector3(Math.cos(theta) * 0.72, 0, Math.sin(theta * 1.37) * 0.64);
  }

  private updateSpawning(delta: number) {
    this.spawnTimer -= delta;
    if (this.spawnTimer > 0) return;
    const enemyCap = 42 + Math.floor(Math.min(3, this.elapsed / 75)) * 10;
    const batch = this.elapsed >= 100 ? 2 : 1;
    const availableSlots = Math.max(0, enemyCap - this.enemies.length);
    for (let i = 0; i < Math.min(batch, availableSlots); i += 1) this.spawnEnemy();
    this.spawnTimer = Math.max(0.6, 0.9 - this.elapsed / 150);
  }

  private spawnEnemy(kindOverride?: EnemyKind) {
    const kind = kindOverride ?? this.pickEnemyKind();
    const baseHp = 14 + Math.floor(this.elapsed / 25) * 4;
    const baseSpeed = 2.05 + Math.min(1.55, this.elapsed / 120);
    const profile = kind === "striker"
      ? { hp: Math.max(9, Math.ceil(baseHp * 0.7)), speed: baseSpeed * 1.65, scale: 0.72, contactDamage: 3, xpValue: 1, material: this.strikerMaterial, meshType: 0, meshSize: 0.92 }
      : kind === "bulwark"
        ? { hp: Math.ceil(baseHp * 3.1), speed: baseSpeed * 0.62, scale: 1.46, contactDamage: 7, xpValue: 4, material: this.bulwarkMaterial, meshType: 2, meshSize: 1.2 }
        : { hp: baseHp, speed: baseSpeed, scale: 1, contactDamage: 4, xpValue: 2, material: this.enemyMaterial, meshType: 1, meshSize: 1.05 };
    const ingress = this.getWallIngressPosition();
    const body = MeshBuilder.CreatePolyhedron(`${kind}-drone`, { type: profile.meshType, size: profile.meshSize }, this.scene);
    body.position.copyFrom(ingress.spawn);
    body.material = profile.material;
    body.scaling.setAll(profile.scale);
    const eye = MeshBuilder.CreateSphere("drone-sensor", { diameter: 0.3, segments: 6 }, this.scene);
    eye.parent = body;
    eye.position = new Vector3(0, 0.02, -0.48);
    eye.material = this.enemyEyeMaterial;
    const healthFill = kind === "bulwark" ? this.createBossHealthBar(body) : undefined;
    this.enemies.push({ mesh: body, kind, hp: profile.hp, maxHp: profile.hp, speed: profile.speed, scale: profile.scale, contactDamage: profile.contactDamage, xpValue: profile.xpValue, healthFill, hitFlash: 0, orbitCooldown: 0, cryoTime: 0, corrosionTime: 0, corrosionStacks: 0, corrosionTick: 0, enteringContainment: true, strikerAction: "none", strikerTimer: 0, strikerCooldown: kind === "striker" ? 1.8 + Math.random() * 1.4 : 0, strikerVector: Vector3.Zero(), strikerDashHit: false, bossAction: "none", bossTimer: 0, bossCooldown: kind === "bulwark" ? 2.6 + Math.random() * 1.1 : 0, bossTarget: Vector3.Zero(), bossVector: Vector3.Zero(), bossChargeHit: false, bossBursts: 0, bossEnraged: false });
    this.createWallBreach(ingress.breach, profile.material);
  }

  private createBossHealthBar(parent: AbstractMesh) {
    const back = MeshBuilder.CreateBox("boss-health-back", { width: 1.8, height: 0.14, depth: 0.12 }, this.scene);
    back.parent = parent;
    back.position.set(0, 1.34, 0);
    back.material = this.enemyMaterial;
    const fill = MeshBuilder.CreateBox("boss-health-fill", { width: 1.62, height: 0.07, depth: 0.16 }, this.scene);
    fill.parent = back;
    fill.position.set(0, 0, -0.08);
    fill.material = this.projectileMaterial;
    return fill;
  }

  private pickEnemyKind(): EnemyKind {
    const roll = Math.random();
    if (this.demoMode) return roll < 0.34 ? "scout" : roll < 0.7 ? "striker" : "bulwark";
    if (this.elapsed < 22) return "scout";
    if (this.elapsed < 60) return roll < 0.32 ? "striker" : "scout";
    if (this.elapsed < 110) return roll < 0.2 ? "bulwark" : roll < 0.58 ? "striker" : "scout";
    return roll < 0.32 ? "bulwark" : roll < 0.68 ? "striker" : "scout";
  }

  private updateCombat(delta: number) {
    this.shootTimer -= delta;
    if (this.shootTimer <= 0 && this.enemies.length > 0) {
      this.fireAtNearest();
      this.shootTimer = this.shotDelay;
    }
    this.scatterTimer -= delta;
    if (this.hasScatter && this.scatterTimer <= 0 && this.enemies.length > 0) {
      this.fireScatter();
      this.scatterTimer = Math.max(0.74, 1.62 - this.scatterTier * 0.12);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.life -= delta;
      projectile.mesh.position.addInPlace(projectile.velocity.scale(delta));
      if (projectile.life <= 0) {
        projectile.mesh.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }
      const enemyIndex = this.enemies.findIndex((enemy) => {
        if (!this.isCombatTarget(enemy)) return false;
        const dx = enemy.mesh.position.x - projectile.mesh.position.x;
        const dz = enemy.mesh.position.z - projectile.mesh.position.z;
        return dx * dx + dz * dz <= projectile.hitRadius * projectile.hitRadius;
      });
      if (enemyIndex >= 0) {
        const enemy = this.enemies[enemyIndex];
        if (this.debugMode) this.debugProjectileCollisions += 1;
        this.applyDamage(enemy, projectile.damage);
        enemy.hitFlash = 0.12;
        projectile.mesh.dispose();
        this.projectiles.splice(i, 1);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
    }
  }

  private fireAtNearest() {
    let target: Enemy | undefined;
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!this.isCombatTarget(enemy)) continue;
      const distance = Vector3.DistanceSquared(enemy.mesh.position, this.player.position);
      if (distance < nearest) {
        nearest = distance;
        target = enemy;
      }
    }
    if (!target) return;
    const direction = target.mesh.position.subtract(this.player.position);
    direction.y = 0;
    direction.normalize();
    this.spawnBolt(direction, 23 + this.weaponTier * 1.3, this.damage, 0.29 + this.weaponTier * 0.018);
  }

  private fireScatter() {
    let target: Enemy | undefined;
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!this.isCombatTarget(enemy)) continue;
      const distance = Vector3.DistanceSquared(enemy.mesh.position, this.player.position);
      if (distance < nearest) { nearest = distance; target = enemy; }
    }
    if (!target) return;
    const aim = target.mesh.position.subtract(this.player.position);
    aim.y = 0;
    aim.normalize();
    const baseAngle = Math.atan2(aim.z, aim.x);
    const spread = 0.34;
    for (const offset of [-spread, 0, spread]) {
      const angle = baseAngle + offset;
      this.spawnBolt(new Vector3(Math.cos(angle), 0, Math.sin(angle)), 18 + this.scatterTier * 1.5, 10 + this.scatterTier * 5, 0.21);
    }
  }

  private spawnBolt(direction: Vector3, speed: number, damage: number, diameter: number) {
    const bolt = MeshBuilder.CreateSphere("rail-bolt", { diameter, segments: 6 }, this.scene);
    bolt.position = this.player.position.add(direction.scale(0.7));
    bolt.position.y = PROJECTILE_HEIGHT;
    bolt.material = this.projectileMaterial;
    this.projectiles.push({ mesh: bolt, velocity: direction.scale(speed), damage, life: 2.2, hitRadius: 0.76 + diameter });
    if (this.debugMode) this.debugProjectilesFired += 1;
  }

  private getTargetingRadius() {
    return this.combatRadius + INGRESS_TARGET_BUFFER;
  }

  private isInsideContainment(enemy: Enemy) {
    const interiorBound = CONTAINMENT_WALL_BOUND - 0.62;
    return Math.abs(enemy.mesh.position.x) <= interiorBound && Math.abs(enemy.mesh.position.z) <= interiorBound;
  }

  private isCombatTarget(enemy: Enemy) {
    const targetRadius = this.getTargetingRadius();
    return this.isInsideContainment(enemy) && Vector3.DistanceSquared(enemy.mesh.position, this.player.position) <= targetRadius * targetRadius;
  }

  private activateModule(id: ModuleId) {
    if (id === "mirage") this.ensureMirageDrones();
    if (id === "pylon") this.deployPylon();
    if (id === "decoy") this.deployDecoy();
    if (id === "saw") this.ensureSawHalo();
  }

  private updateModules(delta: number) {
    this.updateShockwaves(delta);
    this.updatePylons(delta);
    this.updateMirageDrones(delta);
    this.updateRicochetShots(delta);
    this.updateGravityCores(delta);
    this.updateDecoys(delta);
    this.updateArcShells(delta);
    this.updateSplitShells(delta);
    this.updateReturnBlades(delta);
    this.updateEnergyTraces(delta);
    this.updateMines(delta);
    this.updateSkyfallStrikes(delta);
    this.updateNeedleDrops(delta);
    this.updateSawHalo(delta);
    this.updateHarpoons(delta);
    this.updateClusterCores(delta);
    this.updateClusterShards(delta);

    if (this.moduleTiers.vector > 0) {
      this.vectorTimer -= delta;
      if (this.vectorTimer <= 0) {
        this.fireVectorLance();
        this.vectorTimer = Math.max(0.78, 2.45 - this.moduleTiers.vector * 0.36);
      }
    }
    if (this.moduleTiers.nova > 0) {
      this.novaTimer -= delta;
      if (this.novaTimer <= 0) {
        this.triggerNovaRing(this.moduleTiers.nova);
        this.novaTimer = Math.max(1.2, 3.8 - this.moduleTiers.nova * 0.52);
      }
    }
    if (this.moduleTiers.pylon > 0) {
      this.pylonTimer -= delta;
      if (this.pylonTimer <= 0) {
        this.deployPylon();
        this.pylonTimer = Math.max(5, 11 - this.moduleTiers.pylon * 1.4);
      }
    }
    if (this.moduleTiers.ricochet > 0) {
      this.ricochetTimer -= delta;
      if (this.ricochetTimer <= 0) {
        this.fireRicochetBurst();
        this.ricochetTimer = Math.max(0.56, 1.5 - this.moduleTiers.ricochet * 0.18);
      }
    }
    if (this.moduleTiers.gravity > 0) {
      this.gravityTimer -= delta;
      if (this.gravityTimer <= 0) {
        this.spawnGravityCore();
        this.gravityTimer = Math.max(3.4, 7.8 - this.moduleTiers.gravity * 1.05);
      }
    }
    if (this.moduleTiers.decoy > 0) {
      this.decoyTimer -= delta;
      if (this.decoyTimer <= 0) {
        this.deployDecoy();
        this.decoyTimer = Math.max(4.2, 8.2 - this.moduleTiers.decoy * 0.95);
      }
    }
    if (this.moduleTiers.mortar > 0) {
      this.mortarTimer -= delta;
      if (this.mortarTimer <= 0) {
        this.fireMortarArc();
        this.mortarTimer = Math.max(2.2, 5.3 - this.moduleTiers.mortar * 0.72);
      }
    }
    if (this.moduleTiers.split > 0) {
      this.splitTimer -= delta;
      if (this.splitTimer <= 0) {
        this.fireSplitShell();
        this.splitTimer = Math.max(0.82, 2.05 - this.moduleTiers.split * 0.26);
      }
    }
    if (this.moduleTiers.boomerang > 0) {
      this.boomerangTimer -= delta;
      if (this.boomerangTimer <= 0) {
        this.throwReturnBlade();
        this.boomerangTimer = Math.max(1.15, 3.1 - this.moduleTiers.boomerang * 0.35);
      }
    }
    if (this.moduleTiers.laser > 0) {
      this.laserTimer -= delta;
      if (this.laserTimer <= 0) {
        this.fireIonLance();
        this.laserTimer = Math.max(0.46, 1.45 - this.moduleTiers.laser * 0.16);
      }
    }
    if (this.moduleTiers.chain > 0) {
      this.chainTimer -= delta;
      if (this.chainTimer <= 0) {
        this.fireArcLink();
        this.chainTimer = Math.max(0.82, 2.2 - this.moduleTiers.chain * 0.24);
      }
    }
    if (this.moduleTiers.mine > 0) {
      this.mineTimer -= delta;
      if (this.mineTimer <= 0) {
        this.deployMine();
        this.mineTimer = Math.max(2.4, 5 - this.moduleTiers.mine * 0.6);
      }
    }
    if (this.moduleTiers.fan > 0) {
      this.fanTimer -= delta;
      if (this.fanTimer <= 0) {
        this.firePrismFan();
        this.fanTimer = Math.max(0.64, 1.85 - this.moduleTiers.fan * 0.2);
      }
    }
    if (this.moduleTiers.skyfall > 0) {
      this.skyfallTimer -= delta;
      if (this.skyfallTimer <= 0) {
        this.deploySkyfallMarker();
        this.skyfallTimer = Math.max(2.4, 5 - this.moduleTiers.skyfall * 0.55);
      }
    }
    if (this.moduleTiers.cleaver > 0) {
      this.cleaverTimer -= delta;
      if (this.cleaverTimer <= 0) {
        this.firePhaseCleaver();
        this.cleaverTimer = Math.max(1.1, 3.05 - this.moduleTiers.cleaver * 0.3);
      }
    }
    if (this.moduleTiers.needle > 0) {
      this.needleTimer -= delta;
      if (this.needleTimer <= 0) {
        this.fireNeedleRain();
        this.needleTimer = Math.max(1.6, 4.4 - this.moduleTiers.needle * 0.48);
      }
    }
    if (this.moduleTiers.harpoon > 0) {
      this.harpoonTimer -= delta;
      if (this.harpoonTimer <= 0) {
        this.fireChainHarpoon();
        this.harpoonTimer = Math.max(1.6, 3.7 - this.moduleTiers.harpoon * 0.4);
      }
    }
    if (this.moduleTiers.thermal > 0) {
      this.thermalTimer -= delta;
      if (this.thermalTimer <= 0) {
        this.fireThermalArc();
        this.thermalTimer = Math.max(1, 2.85 - this.moduleTiers.thermal * 0.27);
      }
    }
    if (this.moduleTiers.sonic > 0) {
      this.sonicTimer -= delta;
      if (this.sonicTimer <= 0) {
        this.fireSonicBreaker();
        this.sonicTimer = Math.max(1.1, 3.5 - this.moduleTiers.sonic * 0.36);
      }
    }
    if (this.moduleTiers.cluster > 0) {
      this.clusterTimer -= delta;
      if (this.clusterTimer <= 0) {
        this.fireClusterCore();
        this.clusterTimer = Math.max(1.35, 3.35 - this.moduleTiers.cluster * 0.32);
      }
    }
  }

  private fireVectorLance() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.vector;
    const aim = target.mesh.position.subtract(this.player.position);
    aim.y = 0;
    aim.normalize();
    const offsets = tier === 3 ? [-0.1, 0, 0.1] : [0];
    for (const offset of offsets) {
      const angle = Math.atan2(aim.z, aim.x) + offset;
      this.spawnBoltFrom(this.player.position, new Vector3(Math.cos(angle), 0, Math.sin(angle)), 32 + tier * 3, 28 + tier * 16, 0.34 + tier * 0.035);
    }
  }

  private triggerNovaRing(tier: number) {
    const radius = 3 + tier * 1.25;
    const wave = MeshBuilder.CreateTorus("nova-ring", { diameter: 0.8, thickness: 0.1, tessellation: 32 }, this.scene);
    wave.position.copyFrom(this.player.position);
    wave.position.y = 0.18;
    wave.material = this.projectileMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.42, maxLife: 0.42 });
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      const offset = enemy.mesh.position.subtract(this.player.position);
      offset.y = 0;
      if (offset.length() > radius) continue;
      this.applyDamage(enemy, 18 + tier * 13);
      if (offset.length() > 0.1) enemy.mesh.position.addInPlace(offset.normalize().scale(0.55 + tier * 0.25));
      if (enemy.hp <= 0) this.destroyEnemy(index);
    }
  }

  private fireRicochetBurst() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.ricochet;
    for (let count = 0; count < tier; count += 1) {
      const orb = MeshBuilder.CreateSphere("rico-burst", { diameter: 0.24, segments: 6 }, this.scene);
      orb.position.copyFrom(this.player.position);
      orb.position.y = 1.12;
      orb.material = this.gemMaterial;
      this.ricochetShots.push({ mesh: orb, target, life: 4.2, damage: 11 + tier * 7, bounces: 1 + tier, hitTargets: new Set() });
    }
  }

  private updateRicochetShots(delta: number) {
    for (let index = this.ricochetShots.length - 1; index >= 0; index -= 1) {
      const shot = this.ricochetShots[index];
      shot.life -= delta;
      if (shot.life <= 0) {
        shot.mesh.dispose();
        this.ricochetShots.splice(index, 1);
        continue;
      }
      if (!this.enemies.includes(shot.target) || !this.isCombatTarget(shot.target)) {
        const next = this.findBounceTarget(shot.mesh.position, shot.hitTargets);
        if (!next) { shot.mesh.dispose(); this.ricochetShots.splice(index, 1); continue; }
        shot.target = next;
      }
      const direction = shot.target.mesh.position.subtract(shot.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.05) shot.mesh.position.addInPlace(direction.scale((18 + this.moduleTiers.ricochet * 5) * delta / distance));
      if (distance > 0.72) continue;
      const hitPosition = shot.target.mesh.position.clone();
      this.applyDamage(shot.target, shot.damage);
      shot.hitTargets.add(shot.target.mesh);
      const targetIndex = this.enemies.indexOf(shot.target);
      if (shot.target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      shot.bounces -= 1;
      const next = shot.bounces > 0 ? this.findBounceTarget(hitPosition, shot.hitTargets) : undefined;
      if (!next) { shot.mesh.dispose(); this.ricochetShots.splice(index, 1); continue; }
      shot.target = next;
    }
  }

  private findBounceTarget(origin: Vector3, hitTargets: Set<AbstractMesh>) {
    let target: Enemy | undefined;
    let nearest = 11 * 11;
    for (const enemy of this.enemies) {
      if (!this.isCombatTarget(enemy) || hitTargets.has(enemy.mesh)) continue;
      const distance = Vector3.DistanceSquared(enemy.mesh.position, origin);
      if (distance < nearest) { nearest = distance; target = enemy; }
    }
    return target;
  }

  private spawnGravityCore() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const core = MeshBuilder.CreateSphere("singularity-core", { diameter: 0.78, segments: 10 }, this.scene);
    core.position.copyFrom(target.mesh.position);
    core.position.y = 0.8;
    core.material = this.magnetMaterial;
    this.gravityCores.push({ mesh: core, life: 2.3 + this.moduleTiers.gravity * 0.45, pulse: 0.15 });
  }

  private updateGravityCores(delta: number) {
    for (let index = this.gravityCores.length - 1; index >= 0; index -= 1) {
      const core = this.gravityCores[index];
      core.life -= delta;
      core.pulse -= delta;
      core.mesh.rotation.y += delta * 4;
      const tier = this.moduleTiers.gravity;
      const radius = 3.3 + tier * 0.9;
      const dealPulse = core.pulse <= 0;
      if (dealPulse) core.pulse = 0.42;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        const pull = core.mesh.position.subtract(enemy.mesh.position);
        pull.y = 0;
        const distance = pull.length();
        if (distance > radius || distance < 0.05) continue;
        enemy.mesh.position.addInPlace(pull.scale(delta * (2.8 + tier * 1.4) / distance));
        if (!dealPulse) continue;
        this.applyDamage(enemy, 3 + tier * 3);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      if (core.life > 0) continue;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, core.mesh.position) > radius * radius) continue;
        this.applyDamage(enemy, 15 + tier * 11);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      core.mesh.dispose();
      this.gravityCores.splice(index, 1);
    }
  }

  private deployDecoy() {
    const allowed = this.moduleTiers.decoy;
    if (allowed <= 0) return;
    while (this.decoys.length >= allowed) {
      const oldest = this.decoys.shift();
      oldest?.mesh.dispose();
    }
    const beacon = MeshBuilder.CreateCylinder("decoy-beacon", { height: 1.25, diameterTop: 0.22, diameterBottom: 0.72, tessellation: 6 }, this.scene);
    beacon.position.copyFrom(this.player.position);
    beacon.position.y = 0.62;
    beacon.material = this.recoveryMaterial;
    this.decoys.push({ mesh: beacon, life: 6.6 + allowed * 2, pulse: 0.18 });
  }

  private updateDecoys(delta: number) {
    for (let index = this.decoys.length - 1; index >= 0; index -= 1) {
      const decoy = this.decoys[index];
      decoy.life -= delta;
      decoy.pulse -= delta;
      decoy.mesh.rotation.y += delta * 3;
      const tier = this.moduleTiers.decoy;
      if (decoy.pulse <= 0) {
        decoy.pulse = 0.78;
        const pulseRadius = 2.8 + tier * 0.7;
        for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = this.enemies[enemyIndex];
          if (Vector3.DistanceSquared(enemy.mesh.position, decoy.mesh.position) > pulseRadius * pulseRadius) continue;
          this.applyDamage(enemy, 6 + tier * 5);
          if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
        }
      }
      if (decoy.life > 0) continue;
      const radius = 3.8 + tier * 1.05;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, decoy.mesh.position) > radius * radius) continue;
        this.applyDamage(enemy, 30 + tier * 16);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      decoy.mesh.dispose();
      this.decoys.splice(index, 1);
    }
  }

  private getDecoyTarget(enemy: Enemy) {
    let selected: Decoy | undefined;
    let nearest = (7 + this.moduleTiers.decoy * 1.5) ** 2;
    for (const decoy of this.decoys) {
      const distance = Vector3.DistanceSquared(enemy.mesh.position, decoy.mesh.position);
      if (distance < nearest) { nearest = distance; selected = decoy; }
    }
    return selected;
  }

  private fireMortarArc() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.mortar;
    const shellCount = tier === 3 ? 3 : tier;
    for (let index = 0; index < shellCount; index += 1) {
      const shell = MeshBuilder.CreateSphere("mortar-shell", { diameter: 0.3, segments: 7 }, this.scene);
      const start = this.player.position.add(new Vector3(0, 1.1, 0));
      const spread = index - (shellCount - 1) / 2;
      const targetPoint = target.mesh.position.add(new Vector3(spread * 1.3, 0, spread * 0.85));
      shell.position.copyFrom(start);
      shell.material = this.projectileMaterial;
      this.arcShells.push({ mesh: shell, start, target: targetPoint, progress: 0, duration: Math.max(0.42, 0.76 - tier * 0.08), damage: 24 + tier * 15, radius: 2.4 + tier * 0.95 });
    }
  }

  private updateArcShells(delta: number) {
    for (let index = this.arcShells.length - 1; index >= 0; index -= 1) {
      const shell = this.arcShells[index];
      shell.progress += delta / shell.duration;
      const progress = Math.min(1, shell.progress);
      shell.mesh.position.copyFrom(Vector3.Lerp(shell.start, shell.target, progress));
      shell.mesh.position.y += Math.sin(progress * Math.PI) * (2.5 + this.moduleTiers.mortar * 0.5);
      shell.mesh.rotation.x += delta * 9;
      if (progress < 1) continue;
      const wave = MeshBuilder.CreateTorus("mortar-impact", { diameter: 0.6, thickness: 0.1, tessellation: 24 }, this.scene);
      wave.position.copyFrom(shell.target);
      wave.position.y = 0.2;
      wave.material = this.projectileMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.34, maxLife: 0.34 });
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, shell.target) > shell.radius * shell.radius) continue;
        this.applyDamage(enemy, shell.damage);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      shell.mesh.dispose();
      this.arcShells.splice(index, 1);
    }
  }

  private fireSplitShell() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const shell = MeshBuilder.CreateSphere("prism-shell", { diameter: 0.32, segments: 6 }, this.scene);
    shell.position.copyFrom(this.player.position);
    shell.position.y = 1.05;
    shell.material = this.gemMaterial;
    const tier = this.moduleTiers.split;
    this.splitShells.push({ mesh: shell, target, life: 2.2, damage: 13 + tier * 8, fragments: 2 + tier * 2 });
  }

  private updateSplitShells(delta: number) {
    for (let index = this.splitShells.length - 1; index >= 0; index -= 1) {
      const shell = this.splitShells[index];
      shell.life -= delta;
      if (!this.enemies.includes(shell.target) || !this.isCombatTarget(shell.target) || shell.life <= 0) {
        shell.mesh.dispose();
        this.splitShells.splice(index, 1);
        continue;
      }
      const direction = shell.target.mesh.position.subtract(shell.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.05) shell.mesh.position.addInPlace(direction.scale(24 * delta / distance));
      shell.mesh.rotation.y += delta * 12;
      if (distance > 0.68) continue;
      const hitPosition = shell.target.mesh.position.clone();
      this.applyDamage(shell.target, shell.damage);
      const targetIndex = this.enemies.indexOf(shell.target);
      if (shell.target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      const targets = [...this.enemies]
        .filter((enemy) => this.isCombatTarget(enemy) && enemy !== shell.target)
        .sort((left, right) => Vector3.DistanceSquared(left.mesh.position, hitPosition) - Vector3.DistanceSquared(right.mesh.position, hitPosition))
        .slice(0, shell.fragments);
      for (const target of targets) {
        const fragmentDirection = target.mesh.position.subtract(hitPosition);
        fragmentDirection.y = 0;
        if (fragmentDirection.lengthSquared() > 0.01) this.spawnBoltFrom(hitPosition, fragmentDirection.normalize(), 24, Math.max(6, shell.damage * 0.55), 0.16);
      }
      shell.mesh.dispose();
      this.splitShells.splice(index, 1);
    }
  }

  private throwReturnBlade() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const direction = target.mesh.position.subtract(this.player.position);
    direction.y = 0;
    direction.normalize();
    const tier = this.moduleTiers.boomerang;
    for (const spread of tier === 3 ? [-0.12, 0.12] : [0]) {
      const angle = Math.atan2(direction.z, direction.x) + spread;
      const bladeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      const blade = MeshBuilder.CreateBox("return-blade", { width: 0.22, height: 0.14, depth: 1.25 }, this.scene);
      blade.position.copyFrom(this.player.position);
      blade.position.y = 0.85;
      blade.material = this.projectileMaterial;
      this.returnBlades.push({ mesh: blade, direction: bladeDirection, traveled: 0, maxTravel: 7 + tier * 2.2, damage: 16 + tier * 12, returning: false, hitTargets: new Set(), life: 2.8 + tier * 0.35 });
    }
  }

  private updateReturnBlades(delta: number) {
    for (let index = this.returnBlades.length - 1; index >= 0; index -= 1) {
      const blade = this.returnBlades[index];
      blade.life -= delta;
      blade.mesh.rotation.y += delta * 17;
      if (blade.life <= 0) { blade.mesh.dispose(); this.returnBlades.splice(index, 1); continue; }
      if (blade.returning) {
        const home = this.player.position.subtract(blade.mesh.position);
        home.y = 0;
        const distance = home.length();
        if (distance < 0.85) { blade.mesh.dispose(); this.returnBlades.splice(index, 1); continue; }
        blade.mesh.position.addInPlace(home.scale((18 + this.moduleTiers.boomerang * 2) * delta / distance));
      } else {
        const step = (18 + this.moduleTiers.boomerang * 2) * delta;
        blade.mesh.position.addInPlace(blade.direction.scale(step));
        blade.traveled += step;
        if (blade.traveled >= blade.maxTravel) blade.returning = true;
      }
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (blade.hitTargets.has(enemy.mesh) || Vector3.DistanceSquared(enemy.mesh.position, blade.mesh.position) > 1.25) continue;
        blade.hitTargets.add(enemy.mesh);
        this.applyDamage(enemy, blade.damage);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
    }
  }

  private fireIonLance() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.laser;
    const start = this.player.position.add(new Vector3(0, 1.04, 0));
    const direction = target.mesh.position.subtract(start);
    direction.y = 0;
    direction.normalize();
    const end = start.add(direction.scale(13 + tier * 3));
    this.createEnergyTrace(start, end, 0.12 + tier * 0.04, this.projectileMaterial, 0.16);
    const widthSquared = (0.85 + tier * 0.24) ** 2;
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      if (!this.isCombatTarget(enemy) || this.distanceToSegmentSquared(enemy.mesh.position, start, end) > widthSquared) continue;
      this.applyDamage(enemy, 15 + tier * 11);
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private fireArcLink() {
    const tier = this.moduleTiers.chain;
    let target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const visited = new Set<AbstractMesh>();
    let origin = this.player.position.add(new Vector3(0, 0.96, 0));
    const jumps = 2 + tier * 2;
    for (let jump = 0; jump < jumps && target; jump += 1) {
      this.createEnergyTrace(origin, target.mesh.position, 0.08 + tier * 0.025, this.gemMaterial, 0.12);
      this.applyDamage(target, 9 + tier * 7);
      visited.add(target.mesh);
      const targetIndex = this.enemies.indexOf(target);
      if (target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      origin = target.mesh.position.clone();
      target = this.getNearestUnlinkedTarget(origin, visited, 8.5 + tier * 1.1);
    }
  }

  private getNearestUnlinkedTarget(origin: Vector3, visited: Set<AbstractMesh>, range: number) {
    let target: Enemy | undefined;
    let nearest = range * range;
    for (const enemy of this.enemies) {
      if (!this.isCombatTarget(enemy) || visited.has(enemy.mesh)) continue;
      const distance = Vector3.DistanceSquared(enemy.mesh.position, origin);
      if (distance < nearest) { nearest = distance; target = enemy; }
    }
    return target;
  }

  private deployMine() {
    const tier = this.moduleTiers.mine;
    if (tier <= 0) return;
    while (this.mines.length >= tier) {
      const oldest = this.mines.shift();
      if (oldest) this.detonateMine(oldest, 0.72);
    }
    const angle = this.elapsed * 2.3 + this.mines.length * 2.1;
    const mine = MeshBuilder.CreateCylinder("prox-mine", { height: 0.26, diameterTop: 0.45, diameterBottom: 0.64, tessellation: 8 }, this.scene);
    mine.position.copyFrom(this.player.position.add(new Vector3(Math.cos(angle) * 1.5, 0.18, Math.sin(angle) * 1.5)));
    mine.material = this.recoveryMaterial;
    this.mines.push({ mesh: mine, life: 9 + tier * 1.8, armed: 0.55 });
  }

  private updateMines(delta: number) {
    for (let index = this.mines.length - 1; index >= 0; index -= 1) {
      const mine = this.mines[index];
      mine.life -= delta;
      mine.armed -= delta;
      mine.mesh.rotation.y += delta * 4;
      const tier = this.moduleTiers.mine;
      const triggerRadius = 1.45 + tier * 0.18;
      const triggered = mine.armed <= 0 && this.enemies.some((enemy) => Vector3.DistanceSquared(enemy.mesh.position, mine.mesh.position) <= triggerRadius * triggerRadius);
      if (mine.life > 0 && !triggered) continue;
      this.detonateMine(mine);
      this.mines.splice(index, 1);
    }
  }

  private detonateMine(mine: ProximityMine, damageScale = 1) {
    const tier = this.moduleTiers.mine;
    const blastRadius = 2.8 + tier * 0.95;
      const wave = MeshBuilder.CreateTorus("mine-blast", { diameter: 0.5, thickness: 0.1, tessellation: 24 }, this.scene);
      wave.position.copyFrom(mine.mesh.position);
      wave.position.y = 0.18;
      wave.material = this.recoveryMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.3, maxLife: 0.3 });
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, mine.mesh.position) > blastRadius * blastRadius) continue;
        this.applyDamage(enemy, (30 + tier * 18) * damageScale);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      if (tier >= 3 && damageScale >= 1) {
        for (const chainedMine of this.mines) {
          if (chainedMine === mine || chainedMine.armed > 0) continue;
          if (Vector3.DistanceSquared(chainedMine.mesh.position, mine.mesh.position) <= (blastRadius * 0.8) ** 2) chainedMine.life = 0;
        }
      }
      mine.mesh.dispose();
  }

  private createEnergyTrace(start: Vector3, end: Vector3, thickness: number, material: StandardMaterial, life: number) {
    const direction = end.subtract(start);
    direction.y = 0;
    const length = direction.length();
    if (length < 0.05) return;
    const trace = MeshBuilder.CreateBox("energy-trace", { width: thickness, height: thickness, depth: length }, this.scene);
    trace.position.copyFrom(start.add(end).scale(0.5));
    trace.rotation.y = Math.atan2(direction.x, direction.z);
    trace.material = material;
    this.energyTraces.push({ mesh: trace, life, maxLife: life });
  }

  private updateEnergyTraces(delta: number) {
    for (let index = this.energyTraces.length - 1; index >= 0; index -= 1) {
      const trace = this.energyTraces[index];
      trace.life -= delta;
      trace.mesh.visibility = Math.max(0, trace.life / trace.maxLife);
      if (trace.life > 0) continue;
      trace.mesh.dispose();
      this.energyTraces.splice(index, 1);
    }
  }

  private firePrismFan() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.fan;
    const start = this.player.position.add(new Vector3(0, 0.96, 0));
    const aim = target.mesh.position.subtract(start);
    aim.y = 0;
    if (aim.lengthSquared() < 0.01) return;
    aim.normalize();
    const beamCount = 3 + tier * 2;
    const beamLength = 6.6 + tier * 1.45;
    const beamHalfWidth = 0.47 + tier * 0.08;
    for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
      const spread = (beamIndex - (beamCount - 1) / 2) * Math.max(0.1, 0.25 - tier * 0.025);
      const angle = Math.atan2(aim.z, aim.x) + spread;
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      const end = start.add(direction.scale(beamLength));
      const centralBeam = beamIndex === Math.floor(beamCount / 2);
      this.createEnergyTrace(start, end, centralBeam ? 0.12 + tier * 0.035 : 0.075 + tier * 0.018, this.gemMaterial, 0.14);
      const widthSquared = (centralBeam ? beamHalfWidth * 1.35 : beamHalfWidth) ** 2;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (!this.isCombatTarget(enemy) || this.distanceToSegmentSquared(enemy.mesh.position, start, end) > widthSquared) continue;
        this.applyDamage(enemy, 7 + tier * 5);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
    }
  }

  private deploySkyfallMarker() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.skyfall;
    const strikeCount = tier;
    for (let strikeIndex = 0; strikeIndex < strikeCount; strikeIndex += 1) {
      const angle = this.elapsed * 1.9 + strikeIndex * (Math.PI * 2 / Math.max(1, strikeCount));
      const spread = strikeIndex === 0 ? 0 : 1.15 + tier * 0.35;
      const targetPoint = target.mesh.position.add(new Vector3(Math.cos(angle) * spread, 0.08, Math.sin(angle) * spread));
      const marker = MeshBuilder.CreateTorus("skyfall-marker", { diameter: 1.15 + tier * 0.3, thickness: 0.075, tessellation: 32 }, this.scene);
      marker.position.copyFrom(targetPoint);
      marker.material = this.magnetMaterial;
      this.skyfallStrikes.push({ marker, target: targetPoint, delay: 0.5 + strikeIndex * 0.1, radius: 2.15 + tier * 0.7, damage: 22 + tier * 16 });
    }
  }

  private updateSkyfallStrikes(delta: number) {
    for (let index = this.skyfallStrikes.length - 1; index >= 0; index -= 1) {
      const strike = this.skyfallStrikes[index];
      strike.delay -= delta;
      strike.marker.rotation.y += delta * 5;
      const pulse = 1 + Math.max(0, strike.delay) * 0.35;
      strike.marker.scaling.setAll(pulse);
      if (strike.delay > 0) continue;
      const bolt = MeshBuilder.CreateCylinder("skyfall-bolt", { height: 8.5, diameter: 0.13, tessellation: 6 }, this.scene);
      bolt.position.copyFrom(strike.target.add(new Vector3(0, 4.2, 0)));
      bolt.material = this.magnetMaterial;
      this.energyTraces.push({ mesh: bolt, life: 0.13, maxLife: 0.13 });
      const wave = MeshBuilder.CreateTorus("skyfall-impact", { diameter: 0.6, thickness: 0.12, tessellation: 28 }, this.scene);
      wave.position.copyFrom(strike.target);
      wave.position.y = 0.16;
      wave.material = this.magnetMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.34, maxLife: 0.34 });
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, strike.target) > strike.radius * strike.radius) continue;
        this.applyDamage(enemy, strike.damage);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      strike.marker.dispose();
      this.skyfallStrikes.splice(index, 1);
    }
  }

  private firePhaseCleaver() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.cleaver;
    const start = this.player.position.add(new Vector3(0, 0.92, 0));
    const aim = target.mesh.position.subtract(start);
    aim.y = 0;
    if (aim.lengthSquared() < 0.01) return;
    aim.normalize();
    const side = new Vector3(aim.z, 0, -aim.x);
    const slashCount = tier;
    const halfLength = 2.9 + tier * 1.05;
    const hitWidthSquared = (0.75 + tier * 0.12) ** 2;
    for (let slashIndex = 0; slashIndex < slashCount; slashIndex += 1) {
      const distance = 2.55 + slashIndex * 1.05;
      const center = start.add(aim.scale(distance));
      const slashStart = center.subtract(side.scale(halfLength));
      const slashEnd = center.add(side.scale(halfLength));
      this.createEnergyTrace(slashStart, slashEnd, 0.14 + tier * 0.035, this.recoveryMaterial, 0.18);
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (!this.isCombatTarget(enemy) || this.distanceToSegmentSquared(enemy.mesh.position, slashStart, slashEnd) > hitWidthSquared) continue;
        this.applyDamage(enemy, 15 + tier * 10);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
    }
  }

  private fireNeedleRain() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.needle;
    const needleCount = 4 + tier * 3;
    const spreadRadius = 2.4 + tier * 0.9;
    for (let needleIndex = 0; needleIndex < needleCount; needleIndex += 1) {
      const angle = this.elapsed * 1.7 + needleIndex * 2.399;
      const distance = (needleIndex % 3) * (spreadRadius / 2.2);
      const targetPoint = target.mesh.position.add(new Vector3(Math.cos(angle) * distance, 0.08, Math.sin(angle) * distance));
      const needle = MeshBuilder.CreateCylinder("needle-rain", { height: 0.9, diameter: 0.09 + tier * 0.012, tessellation: 5 }, this.scene);
      needle.position.copyFrom(targetPoint.add(new Vector3(0, 5.5 + (needleIndex % 4) * 0.45, 0)));
      needle.material = this.gemMaterial;
      this.needleDrops.push({ mesh: needle, target: targetPoint, life: 0.58 + (needleIndex % 4) * 0.055, maxLife: 0.58 + (needleIndex % 4) * 0.055, damage: 8 + tier * 6 });
    }
  }

  private updateNeedleDrops(delta: number) {
    for (let index = this.needleDrops.length - 1; index >= 0; index -= 1) {
      const needle = this.needleDrops[index];
      needle.life -= delta;
      const progress = 1 - Math.max(0, needle.life) / needle.maxLife;
      needle.mesh.position.x = needle.target.x;
      needle.mesh.position.z = needle.target.z;
      needle.mesh.position.y = 0.48 + (1 - progress) * 5.4;
      needle.mesh.rotation.y += delta * 15;
      if (needle.life > 0) continue;
      const tier = this.moduleTiers.needle;
      const hitRadius = 0.78 + tier * 0.16;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (Vector3.DistanceSquared(enemy.mesh.position, needle.target) > hitRadius * hitRadius) continue;
        this.applyDamage(enemy, needle.damage);
        if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
      }
      const impact = MeshBuilder.CreateTorus("needle-impact", { diameter: 0.32, thickness: 0.05, tessellation: 16 }, this.scene);
      impact.position.copyFrom(needle.target);
      impact.position.y = 0.12;
      impact.material = this.gemMaterial;
      this.shockwaves.push({ mesh: impact, life: 0.18, maxLife: 0.18 });
      needle.mesh.dispose();
      this.needleDrops.splice(index, 1);
    }
  }

  private ensureSawHalo() {
    while (this.sawBlades.length < this.moduleTiers.saw) {
      const blade = MeshBuilder.CreateBox("saw-halo", { width: 0.3, height: 0.14, depth: 1.28 }, this.scene);
      blade.material = this.recoveryMaterial;
      this.sawBlades.push(blade);
    }
    while (this.sawBlades.length > this.moduleTiers.saw) this.sawBlades.pop()?.dispose();
  }

  private updateSawHalo(delta: number) {
    const tier = this.moduleTiers.saw;
    if (tier <= 0) return;
    this.ensureSawHalo();
    this.sawAngle += delta * (2.8 + tier * 0.7);
    const radius = 1.95 + tier * 0.22;
    this.sawBlades.forEach((blade, index) => {
      const angle = this.sawAngle + (Math.PI * 2 * index) / this.sawBlades.length;
      blade.position.copyFrom(this.player.position.add(new Vector3(Math.cos(angle) * radius, 0.85, Math.sin(angle) * radius)));
      blade.rotation.y = -angle;
      blade.rotation.z += delta * 20;
    });
    this.sawHitTimer -= delta;
    if (this.sawHitTimer > 0) return;
    this.sawHitTimer = Math.max(0.1, 0.26 - tier * 0.025);
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      const hit = this.sawBlades.some((blade) => Vector3.DistanceSquared(enemy.mesh.position, blade.position) <= 1.65);
      if (!hit) continue;
      this.applyDamage(enemy, 4 + tier * 4);
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private fireChainHarpoon() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.harpoon;
    const harpoon = MeshBuilder.CreateCylinder("chain-harpoon", { height: 0.72, diameterTop: 0.08, diameterBottom: 0.22, tessellation: 6 }, this.scene);
    harpoon.position.copyFrom(this.player.position.add(new Vector3(0, 0.94, 0)));
    harpoon.material = this.magnetMaterial;
    const cable = MeshBuilder.CreateBox("harpoon-cable", { width: 0.045, height: 0.045, depth: 1 }, this.scene);
    cable.material = this.magnetMaterial;
    this.harpoons.push({ mesh: harpoon, cable, target, life: 1.15 + tier * 0.38, damage: 22 + tier * 12, latched: false });
  }

  private updateHarpoons(delta: number) {
    for (let index = this.harpoons.length - 1; index >= 0; index -= 1) {
      const harpoon = this.harpoons[index];
      harpoon.life -= delta;
      const tier = this.moduleTiers.harpoon;
      if (!this.enemies.includes(harpoon.target) || !this.isCombatTarget(harpoon.target)) {
        harpoon.mesh.dispose();
        harpoon.cable.dispose();
        this.harpoons.splice(index, 1);
        continue;
      }
      if (!harpoon.latched) {
        const direction = harpoon.target.mesh.position.subtract(harpoon.mesh.position);
        direction.y = 0;
        const distance = direction.length();
        if (distance > 0.06) harpoon.mesh.position.addInPlace(direction.scale((28 + tier * 3) * delta / distance));
        if (distance <= 0.78) {
          harpoon.latched = true;
          this.applyDamage(harpoon.target, harpoon.damage);
          const targetIndex = this.enemies.indexOf(harpoon.target);
          if (harpoon.target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
        }
      } else {
        harpoon.mesh.position.copyFrom(harpoon.target.mesh.position.add(new Vector3(0, 0.8, 0)));
        const pull = this.player.position.subtract(harpoon.target.mesh.position);
        pull.y = 0;
        const distance = pull.length();
        if (distance > 1.35) harpoon.target.mesh.position.addInPlace(pull.scale((4.2 + tier * 1.7) * delta / distance));
      }
      this.updateHarpoonCable(harpoon.cable, this.player.position.add(new Vector3(0, 0.92, 0)), harpoon.mesh.position);
      if (harpoon.life > 0) continue;
      if (harpoon.latched && tier >= 3 && this.enemies.includes(harpoon.target)) {
        const wave = MeshBuilder.CreateTorus("harpoon-release", { diameter: 0.45, thickness: 0.09, tessellation: 24 }, this.scene);
        wave.position.copyFrom(harpoon.target.mesh.position);
        wave.position.y = 0.18;
        wave.material = this.magnetMaterial;
        this.shockwaves.push({ mesh: wave, life: 0.24, maxLife: 0.24 });
        for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = this.enemies[enemyIndex];
          if (Vector3.DistanceSquared(enemy.mesh.position, harpoon.target.mesh.position) > 8.4) continue;
          this.applyDamage(enemy, Math.max(7, harpoon.damage * 0.55));
          if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
        }
      }
      harpoon.mesh.dispose();
      harpoon.cable.dispose();
      this.harpoons.splice(index, 1);
    }
  }

  private updateHarpoonCable(cable: AbstractMesh, start: Vector3, end: Vector3) {
    const direction = end.subtract(start);
    direction.y = 0;
    const length = direction.length();
    cable.position.copyFrom(start.add(end).scale(0.5));
    cable.rotation.y = Math.atan2(direction.x, direction.z);
    cable.scaling.z = Math.max(0.01, length);
  }

  private fireThermalArc() {
    const tier = this.moduleTiers.thermal;
    let target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const visited = new Set<AbstractMesh>();
    let origin = this.player.position.add(new Vector3(0, 0.98, 0));
    const jumps = 2 + tier * 2;
    for (let jump = 0; jump < jumps && target; jump += 1) {
      this.createEnergyTrace(origin, target.mesh.position, 0.085 + tier * 0.024, this.recoveryMaterial, 0.13);
      this.applyDamage(target, 8 + tier * 7 + jump * 2);
      visited.add(target.mesh);
      const targetIndex = this.enemies.indexOf(target);
      const impact = target.mesh.position.clone();
      if (target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      origin = impact;
      target = this.getNearestUnlinkedTarget(origin, visited, 7.5 + tier * 1.25);
    }
    if (tier < 3 || visited.size === 0) return;
    const finalPoint = origin;
    const wave = MeshBuilder.CreateTorus("thermal-overheat", { diameter: 0.42, thickness: 0.09, tessellation: 24 }, this.scene);
    wave.position.copyFrom(finalPoint);
    wave.position.y = 0.16;
    wave.material = this.recoveryMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.25, maxLife: 0.25 });
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      if (Vector3.DistanceSquared(enemy.mesh.position, finalPoint) > 7.8) continue;
      this.applyDamage(enemy, 10 + tier * 7);
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private fireSonicBreaker() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.sonic;
    const start = this.player.position.add(new Vector3(0, 0.9, 0));
    const aim = target.mesh.position.subtract(start);
    aim.y = 0;
    if (aim.lengthSquared() < 0.01) return;
    aim.normalize();
    const radius = 5.2 + tier * 1.45;
    const halfAngle = 0.42 + tier * 0.14;
    const lineCount = 3 + tier * 2;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const spread = (lineIndex - (lineCount - 1) / 2) * (halfAngle * 2 / Math.max(1, lineCount - 1));
      const angle = Math.atan2(aim.z, aim.x) + spread;
      const end = start.add(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      this.createEnergyTrace(start, end, 0.055 + tier * 0.015, this.magnetMaterial, 0.16);
    }
    const threshold = Math.cos(halfAngle);
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      const offset = enemy.mesh.position.subtract(this.player.position);
      offset.y = 0;
      const distance = offset.length();
      if (!this.isCombatTarget(enemy) || distance > radius || distance < 0.01) continue;
      const facing = Vector3.Dot(aim, offset.scale(1 / distance));
      if (facing < threshold) continue;
        this.applyDamage(enemy, 18 + tier * 10);
      enemy.mesh.position.addInPlace(offset.scale((0.8 + tier * 0.4) / distance));
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private fireClusterCore() {
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    const tier = this.moduleTiers.cluster;
    const core = MeshBuilder.CreatePolyhedron("cluster-core", { type: 2, size: 0.34 + tier * 0.045 }, this.scene);
    core.position.copyFrom(this.player.position.add(new Vector3(0, 1.02, 0)));
    core.material = this.magnetMaterial;
    this.clusterCores.push({ mesh: core, target, life: 2.45, damage: 16 + tier * 10, fragments: 2 + tier * 2 });
  }

  private updateClusterCores(delta: number) {
    for (let index = this.clusterCores.length - 1; index >= 0; index -= 1) {
      const core = this.clusterCores[index];
      core.life -= delta;
      if (!this.enemies.includes(core.target) || !this.isCombatTarget(core.target)) {
        const replacement = this.getNearestTarget(core.mesh.position, 13);
        if (replacement) core.target = replacement;
      }
      if (!this.enemies.includes(core.target) || core.life <= 0) {
        core.mesh.dispose();
        this.clusterCores.splice(index, 1);
        continue;
      }
      const direction = core.target.mesh.position.subtract(core.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.05) core.mesh.position.addInPlace(direction.scale((17 + this.moduleTiers.cluster * 4) * delta / distance));
      core.mesh.rotation.y += delta * 9;
      if (distance > 0.78) continue;
      const impactPoint = core.target.mesh.position.clone();
      const targets = [...this.enemies]
        .filter((enemy) => this.isCombatTarget(enemy) && enemy !== core.target)
        .sort((left, right) => Vector3.DistanceSquared(left.mesh.position, impactPoint) - Vector3.DistanceSquared(right.mesh.position, impactPoint))
        .slice(0, core.fragments);
      this.applyDamage(core.target, core.damage);
      const targetIndex = this.enemies.indexOf(core.target);
      if (core.target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      for (const target of targets) {
        if (!this.enemies.includes(target)) continue;
        const shard = MeshBuilder.CreateSphere("cluster-shard", { diameter: 0.17, segments: 6 }, this.scene);
        shard.position.copyFrom(impactPoint.add(new Vector3(0, 0.72, 0)));
        shard.material = this.magnetMaterial;
        this.clusterShards.push({ mesh: shard, target, life: 1.75, damage: Math.max(7, core.damage * 0.52) });
      }
      const wave = MeshBuilder.CreateTorus("cluster-burst", { diameter: 0.42, thickness: 0.08, tessellation: 24 }, this.scene);
      wave.position.copyFrom(impactPoint);
      wave.position.y = 0.15;
      wave.material = this.magnetMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.22, maxLife: 0.22 });
      core.mesh.dispose();
      this.clusterCores.splice(index, 1);
    }
  }

  private updateClusterShards(delta: number) {
    for (let index = this.clusterShards.length - 1; index >= 0; index -= 1) {
      const shard = this.clusterShards[index];
      shard.life -= delta;
      if (!this.enemies.includes(shard.target) || !this.isCombatTarget(shard.target)) {
        const replacement = this.getNearestTarget(shard.mesh.position, 11);
        if (replacement) shard.target = replacement;
      }
      if (!this.enemies.includes(shard.target) || shard.life <= 0) {
        shard.mesh.dispose();
        this.clusterShards.splice(index, 1);
        continue;
      }
      const direction = shard.target.mesh.position.subtract(shard.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.05) shard.mesh.position.addInPlace(direction.scale((23 + this.moduleTiers.cluster * 3) * delta / distance));
      shard.mesh.rotation.y += delta * 14;
      if (distance > 0.6) continue;
      this.applyDamage(shard.target, shard.damage);
      const targetIndex = this.enemies.indexOf(shard.target);
      if (shard.target.hp <= 0 && targetIndex >= 0) this.destroyEnemy(targetIndex);
      shard.mesh.dispose();
      this.clusterShards.splice(index, 1);
    }
  }

  private distanceToSegmentSquared(point: Vector3, start: Vector3, end: Vector3) {
    const segment = end.subtract(start);
    const pointOffset = point.subtract(start);
    const lengthSquared = segment.lengthSquared();
    if (lengthSquared <= 0.0001) return Vector3.DistanceSquared(point, start);
    const t = Math.max(0, Math.min(1, Vector3.Dot(pointOffset, segment) / lengthSquared));
    const closest = start.add(segment.scale(t));
    return Vector3.DistanceSquared(point, closest);
  }

  private ensureMirageDrones() {
    while (this.mirageDrones.length < this.moduleTiers.mirage) {
      const drone = MeshBuilder.CreatePolyhedron("mirage-drone", { type: 0, size: 0.42 }, this.scene);
      drone.material = this.gemMaterial;
      this.mirageDrones.push(drone);
    }
  }

  private updateMirageDrones(delta: number) {
    if (this.moduleTiers.mirage <= 0) return;
    this.mirageAngle += delta * 2.4;
    this.mirageDrones.forEach((drone, index) => {
      const angle = this.mirageAngle + (Math.PI * 2 * index) / this.mirageDrones.length;
      drone.position.copyFrom(this.player.position.add(new Vector3(Math.cos(angle) * 2.1, 1.25, Math.sin(angle) * 2.1)));
      drone.rotation.y = -angle;
    });
    this.mirageTimer -= delta;
    if (this.mirageTimer > 0) return;
    const target = this.getNearestTarget(this.player.position);
    if (!target) return;
    for (const drone of this.mirageDrones) {
      const direction = target.mesh.position.subtract(drone.position);
      direction.y = 0;
      direction.normalize();
      this.spawnBoltFrom(drone.position, direction, 22, 7 + this.moduleTiers.mirage * 5, 0.19);
    }
    this.mirageTimer = Math.max(0.44, 1.12 - this.moduleTiers.mirage * 0.18);
  }

  private deployPylon() {
    const allowed = this.moduleTiers.pylon;
    if (allowed <= 0) return;
    while (this.pylons.length >= allowed) {
      const oldest = this.pylons.shift();
      oldest?.mesh.dispose();
    }
    const pylon = MeshBuilder.CreateCylinder("sentry-pylon", { height: 1.1, diameterTop: 0.24, diameterBottom: 0.64, tessellation: 6 }, this.scene);
    pylon.position.copyFrom(this.player.position);
    pylon.position.y = 0.55;
    pylon.material = this.projectileMaterial;
    const core = MeshBuilder.CreateSphere("pylon-core", { diameter: 0.26, segments: 8 }, this.scene);
    core.parent = pylon;
    core.position.set(0, 0.24, 0);
    core.material = this.magnetMaterial;
    const aura = MeshBuilder.CreateTorus("pylon-aura", { diameter: 0.88, thickness: 0.035, tessellation: 28 }, this.scene);
    aura.parent = pylon;
    aura.position.set(0, -0.5, 0);
    aura.material = this.gemMaterial;
    const thrust = MeshBuilder.CreateCylinder("pylon-thrust", { height: 0.3, diameterTop: 0.05, diameterBottom: 0.16, tessellation: 8 }, this.scene);
    thrust.parent = pylon;
    thrust.position.set(0, -0.27, -0.42);
    thrust.rotation.x = Math.PI / 2;
    thrust.material = this.magnetMaterial;
    thrust.visibility = 0.06;
    const formationAngle = this.elapsed * 1.7 + this.pylons.length * (Math.PI * 2 / Math.max(1, allowed));
    const deployedPylon = {
      mesh: pylon,
      life: 8 + allowed * 2,
      cooldown: 0.52,
      formationOffset: new Vector3(Math.cos(formationAngle) * 2.5, 0.55, Math.sin(formationAngle) * 2.5),
      core,
      aura,
      thrust,
    };
    this.pylons.push(deployedPylon);
    this.firePylonDeploymentBurst(deployedPylon, allowed);
  }

  private updatePylons(delta: number) {
    for (let index = this.pylons.length - 1; index >= 0; index -= 1) {
      const pylon = this.pylons[index];
      pylon.life -= delta;
      pylon.cooldown -= delta;
      if (pylon.life <= 0) {
        pylon.mesh.dispose();
        this.pylons.splice(index, 1);
        continue;
      }
      const trackingTarget = this.getNearestTarget(pylon.mesh.position, 20 + this.moduleTiers.pylon * 3);
      const moving = this.updatePylonPosition(pylon, index, trackingTarget, delta);
      this.updatePylonVisuals(pylon, trackingTarget, moving, delta);
      if (pylon.cooldown > 0) continue;
      const target = this.getNearestTarget(pylon.mesh.position, 12 + this.moduleTiers.pylon * 2);
      if (!target) continue;
      const direction = target.mesh.position.subtract(pylon.mesh.position);
      direction.y = 0;
      direction.normalize();
      this.createEnergyTrace(pylon.mesh.position.add(new Vector3(0, 0.72, 0)), target.mesh.position, 0.035 + this.moduleTiers.pylon * 0.008, this.magnetMaterial, 0.1);
      this.spawnBoltFrom(pylon.mesh.position, direction, 19, 9 + this.moduleTiers.pylon * 6, 0.18);
      pylon.cooldown = Math.max(0.45, 1.12 - this.moduleTiers.pylon * 0.16);
    }
  }

  private firePylonDeploymentBurst(pylon: Pylon, tier: number) {
    const range = 17 + tier * 2.5;
    const targets = [...this.enemies]
      .filter((enemy) => this.isCombatTarget(enemy) && Vector3.DistanceSquared(enemy.mesh.position, pylon.mesh.position) <= range * range)
      .sort((left, right) => Vector3.DistanceSquared(left.mesh.position, pylon.mesh.position) - Vector3.DistanceSquared(right.mesh.position, pylon.mesh.position))
      .slice(0, 1 + tier);
    if (targets.length === 0) return;
    const wave = MeshBuilder.CreateTorus("pylon-deploy-burst", { diameter: 0.62, thickness: 0.075, tessellation: 24 }, this.scene);
    wave.position.copyFrom(pylon.mesh.position);
    wave.position.y = 0.16;
    wave.material = this.projectileMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.22, maxLife: 0.22 });
    for (const target of targets) {
      const direction = target.mesh.position.subtract(pylon.mesh.position);
      direction.y = 0;
      if (direction.lengthSquared() < 0.01) continue;
      direction.normalize();
      this.createEnergyTrace(pylon.mesh.position.add(new Vector3(0, 0.72, 0)), target.mesh.position, 0.04 + tier * 0.008, this.magnetMaterial, 0.12);
      this.spawnBoltFrom(pylon.mesh.position, direction, 25 + tier * 2, 8 + tier * 5, 0.17);
    }
  }

  private updatePylonPosition(pylon: Pylon, index: number, target: Enemy | undefined, delta: number) {
    const tier = this.moduleTiers.pylon;
    if (tier < 2) return false;
    let destination = this.player.position.add(pylon.formationOffset);
    if (target) {
      const approach = target.mesh.position.subtract(this.player.position);
      approach.y = 0;
      if (approach.lengthSquared() > 0.01) {
        approach.normalize();
        destination = target.mesh.position.subtract(approach.scale(3.8 + tier * 0.55));
        destination.y = 0.55;
      }
    } else {
      const regroupAngle = this.elapsed * 0.75 + index * (Math.PI * 2 / Math.max(1, this.pylons.length));
      destination = this.player.position.add(new Vector3(Math.cos(regroupAngle) * 2.45, 0.55, Math.sin(regroupAngle) * 2.45));
    }
    const motion = destination.subtract(pylon.mesh.position);
    motion.y = 0;
    const distance = motion.length();
    if (distance <= 0.08) return false;
    const travel = Math.min(distance, (1.65 + tier * 0.6) * delta);
    pylon.mesh.position.addInPlace(motion.scale(travel / distance));
    pylon.mesh.position.y = 0.55;
    return true;
  }

  private updatePylonVisuals(pylon: Pylon, target: Enemy | undefined, moving: boolean, delta: number) {
    const pulse = 0.88 + Math.sin(this.elapsed * (moving ? 12 : 6)) * 0.12;
    pylon.core.rotation.y += delta * (moving ? 15 : 7);
    pylon.core.scaling.setAll(pulse * (target ? 1.08 : 0.92));
    pylon.aura.rotation.y += delta * (moving ? 5.6 : 2.2);
    pylon.aura.scaling.setAll((moving ? 1.16 : 1) + Math.sin(this.elapsed * 8) * 0.05);
    pylon.aura.visibility = moving ? 0.9 : target ? 0.66 : 0.4;
    pylon.thrust.visibility = moving ? 0.92 : target ? 0.26 : 0.06;
    pylon.thrust.scaling.y = moving ? 1.2 + Math.sin(this.elapsed * 18) * 0.25 : 0.45;
    if (!target) return;
    const direction = target.mesh.position.subtract(pylon.mesh.position);
    direction.y = 0;
    if (direction.lengthSquared() > 0.01) pylon.mesh.rotation.y = Math.atan2(direction.x, direction.z);
  }

  private triggerReactiveWave(tier: number) {
    const radius = 2.1 + tier * 0.8;
    const wave = MeshBuilder.CreateTorus("reactive-wave", { diameter: 0.72, thickness: 0.08, tessellation: 24 }, this.scene);
    wave.position.copyFrom(this.player.position);
    wave.position.y = 0.24;
    wave.material = this.gemMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.28, maxLife: 0.28 });
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (Vector3.DistanceSquared(enemy.mesh.position, this.player.position) > radius * radius) continue;
      this.applyDamage(enemy, 12 + tier * 10);
      if (enemy.hp <= 0) this.destroyEnemy(index);
    }
  }

  private updateShockwaves(delta: number) {
    for (let index = this.shockwaves.length - 1; index >= 0; index -= 1) {
      const shockwave = this.shockwaves[index];
      shockwave.life -= delta;
      const progress = 1 - shockwave.life / shockwave.maxLife;
      shockwave.mesh.scaling.setAll(1 + progress * 8);
      if (shockwave.life > 0) continue;
      shockwave.mesh.dispose();
      this.shockwaves.splice(index, 1);
    }
  }

  private getNearestTarget(origin: Vector3, maxDistance = this.getTargetingRadius()) {
    let target: Enemy | undefined;
    let nearest = maxDistance * maxDistance;
    for (const enemy of this.enemies) {
      if (!this.isCombatTarget(enemy)) continue;
      const distance = Vector3.DistanceSquared(enemy.mesh.position, origin);
      if (distance < nearest) { nearest = distance; target = enemy; }
    }
    return target;
  }

  private spawnBoltFrom(origin: Vector3, direction: Vector3, speed: number, damage: number, diameter: number) {
    const bolt = MeshBuilder.CreateSphere("module-bolt", { diameter, segments: 6 }, this.scene);
    bolt.position = origin.add(direction.scale(0.55));
    bolt.position.y = PROJECTILE_HEIGHT;
    bolt.material = this.projectileMaterial;
    this.projectiles.push({ mesh: bolt, velocity: direction.scale(speed), damage, life: 1.35, hitRadius: 0.76 + diameter });
    if (this.debugMode) this.debugProjectilesFired += 1;
  }

  private applyDamage(enemy: Enemy, damage: number, skipCorrosion = false) {
    if (!this.isCombatTarget(enemy)) return;
    if (this.debugMode) this.debugHits += 1;
    enemy.hp -= damage;
    if (!skipCorrosion && this.moduleTiers.corrosion > 0) this.applyCorrosion(enemy);
    if (this.moduleTiers.cryo > 0) enemy.cryoTime = Math.max(enemy.cryoTime, 0.75 + this.moduleTiers.cryo * 0.42);
    if (enemy.healthFill) {
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      enemy.healthFill.scaling.x = ratio;
      enemy.healthFill.position.x = -(1 - ratio) * 0.81;
    }
  }

  private applyCorrosion(enemy: Enemy) {
    const tier = this.moduleTiers.corrosion;
    if (tier <= 0) return;
    enemy.corrosionTime = Math.max(enemy.corrosionTime, 2.1 + tier * 0.75);
    enemy.corrosionTick = Math.min(enemy.corrosionTick || 0.34, 0.34);
    enemy.corrosionStacks = Math.min(2 + tier, enemy.corrosionStacks + 1);
    if (!enemy.corrosionMark) {
      const mark = MeshBuilder.CreateTorus("corrosion-mark", { diameter: 0.78, thickness: 0.055, tessellation: 20 }, this.scene);
      mark.parent = enemy.mesh;
      mark.position.set(0, 0.98, 0);
      mark.material = this.gemMaterial;
      enemy.corrosionMark = mark;
    }
    enemy.corrosionMark.scaling.setAll(0.75 + enemy.corrosionStacks * 0.11);
    if (enemy.corrosionStacks < 2 + tier) return;
    enemy.corrosionStacks = 0;
    this.triggerCorrosionBurst(enemy, tier);
  }

  private updateCorrosion(delta: number) {
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      if (enemy.corrosionTime <= 0) continue;
      enemy.corrosionTime = Math.max(0, enemy.corrosionTime - delta);
      if (enemy.corrosionMark) {
        enemy.corrosionMark.rotation.y += delta * 4;
        const pulse = 0.86 + Math.sin(this.elapsed * 10) * 0.08 + enemy.corrosionStacks * 0.06;
        enemy.corrosionMark.scaling.setAll(pulse);
      }
      if (enemy.corrosionTime <= 0) {
        enemy.corrosionStacks = 0;
        enemy.corrosionMark?.dispose();
        enemy.corrosionMark = undefined;
        continue;
      }
      enemy.corrosionTick -= delta;
      if (enemy.corrosionTick > 0) continue;
      enemy.corrosionTick = Math.max(0.28, 0.72 - this.moduleTiers.corrosion * 0.08);
      this.applyDamage(enemy, 2 + this.moduleTiers.corrosion * 2.3 + enemy.corrosionStacks * 1.4, true);
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private triggerCorrosionBurst(source: Enemy, tier: number) {
    if (!this.enemies.includes(source)) return;
    const origin = source.mesh.position.clone();
    const radius = 2 + tier * 0.65;
    const wave = MeshBuilder.CreateTorus("corrosion-burst", { diameter: 0.42, thickness: 0.09, tessellation: 24 }, this.scene);
    wave.position.copyFrom(origin);
    wave.position.y = 0.16;
    wave.material = this.gemMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.28, maxLife: 0.28 });
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      if (Vector3.DistanceSquared(enemy.mesh.position, origin) > radius * radius) continue;
      this.applyDamage(enemy, 6 + tier * 6, true);
      enemy.corrosionTime = Math.max(enemy.corrosionTime, 0.9 + tier * 0.3);
      if (enemy.hp <= 0) this.destroyEnemy(enemyIndex);
    }
  }

  private activateScatter() {
    if (!this.hasScatter) {
      this.hasScatter = true;
      this.scatterTier = 1;
    } else {
      this.scatterTier += 1;
    }
  }

  private activateOrbit() {
    if (!this.hasOrbit) {
      this.hasOrbit = true;
      this.orbitTier = 1;
    } else {
      this.orbitTier += 1;
    }
    const desired = 2 + Math.min(2, this.orbitTier - 1);
    while (this.orbitBlades.length < desired) {
      const blade = MeshBuilder.CreateBox("arc-sentry", { width: 0.23, height: 0.22, depth: 1.12 }, this.scene);
      blade.material = this.projectileMaterial;
      this.orbitBlades.push(blade);
    }
  }

  private updateOrbit(delta: number) {
    if (!this.hasOrbit) return;
    this.orbitAngle += delta * (2.4 + this.orbitTier * 0.45);
    const radius = 2.3 + this.orbitTier * 0.12;
    this.orbitBlades.forEach((blade, index) => {
      const angle = this.orbitAngle + (Math.PI * 2 * index) / this.orbitBlades.length;
      blade.position.copyFrom(this.player.position.add(new Vector3(Math.cos(angle) * radius, 0.78, Math.sin(angle) * radius)));
      blade.rotation.y = -angle;
    });
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - delta);
      if (enemy.orbitCooldown > 0) continue;
      const inBladeRange = this.orbitBlades.some((blade) => Vector3.DistanceSquared(blade.position, enemy.mesh.position) < 1.7);
      if (!inBladeRange) continue;
      this.applyDamage(enemy, 10 + this.orbitTier * 6);
      enemy.orbitCooldown = 0.34;
      enemy.hitFlash = 0.12;
      if (enemy.hp <= 0) this.destroyEnemy(index);
    }
  }

  private updateEnemyIngress(enemy: Enemy, delta: number) {
    const direction = this.player.position.subtract(enemy.mesh.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance > 0.1) {
      direction.scaleInPlace(1 / distance);
      const corrosionSlow = enemy.corrosionTime > 0 ? Math.max(0.52, 0.9 - enemy.corrosionStacks * 0.07) : 1;
      enemy.mesh.position.addInPlace(direction.scale(enemy.speed * 3.6 * (enemy.cryoTime > 0 ? 0.52 : corrosionSlow) * delta));
      enemy.mesh.rotation.y += delta * 3.6;
    }
    this.constrainEnemyToArena(enemy);
    if (!this.isInsideContainment(enemy)) return;
    enemy.enteringContainment = false;
    if (this.debugMode) this.debugEntries += 1;
  }

  private removeDefeatedEnemies() {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      if (this.enemies[index].hp <= 0) this.destroyEnemy(index);
    }
  }

  private updateEnemies(delta: number) {
    this.damageTimer -= delta;
    this.removeDefeatedEnemies();
    for (const enemy of this.enemies) {
      enemy.cryoTime = Math.max(0, enemy.cryoTime - delta);
      if (enemy.enteringContainment) {
        this.updateEnemyIngress(enemy, delta);
        continue;
      }
      const decoy = this.getDecoyTarget(enemy);
      if (enemy.kind === "striker" && this.updateStrikerAction(enemy, Boolean(decoy), delta)) {
        this.constrainEnemyToArena(enemy);
        continue;
      }
      if (enemy.kind === "bulwark") {
        if (!enemy.bossEnraged && enemy.hp / enemy.maxHp <= 0.52) this.triggerBulwarkOverdrive(enemy);
        if (this.updateBulwarkAction(enemy, delta)) {
          this.constrainEnemyToArena(enemy);
          continue;
        }
        enemy.bossCooldown -= delta;
        if (!decoy && enemy.bossCooldown <= 0) {
          this.prepareBulwarkAction(enemy);
          continue;
        }
      }
      const objective = decoy ? decoy.mesh.position : this.player.position;
      const direction = objective.subtract(enemy.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.1) {
        direction.scaleInPlace(1 / distance);
        const corrosionSlow = enemy.corrosionTime > 0 ? Math.max(0.52, 0.9 - enemy.corrosionStacks * 0.07) : 1;
        enemy.mesh.position.addInPlace(direction.scale(enemy.speed * (enemy.cryoTime > 0 ? 0.52 : corrosionSlow) * delta));
        enemy.mesh.rotation.y += delta * 3.6;
      }
      this.constrainEnemyToArena(enemy);
      enemy.hitFlash -= delta;
      enemy.mesh.scaling.setAll(enemy.scale * (enemy.hitFlash > 0 ? 1.18 : 1));
      const enemyContactRadius = enemy.kind === "bulwark" ? 0.82 : enemy.kind === "striker" ? 0.4 : 0.58;
      if (!decoy && distance < PLAYER_RING_RADIUS + enemyContactRadius && this.damageTimer <= 0) {
        this.damagePlayer(Math.min(9, enemy.contactDamage + Math.floor(this.elapsed / 70)), 0.6, "contact");
        if (this.phase === "gameover") return;
      }
    }
  }

  private updateStrikerAction(enemy: Enemy, distracted: boolean, delta: number) {
    enemy.hitFlash -= delta;
    enemy.mesh.scaling.setAll(enemy.scale * (enemy.hitFlash > 0 ? 1.18 : 1));
    if (enemy.strikerAction === "none") {
      enemy.strikerCooldown = Math.max(0, enemy.strikerCooldown - delta);
      if (distracted || enemy.strikerCooldown > 0) return false;
      const vector = this.player.position.subtract(enemy.mesh.position);
      vector.y = 0;
      const distance = vector.length();
      if (distance < 3.4 || distance > 9.6) return false;
      vector.scaleInPlace(1 / distance);
      enemy.strikerAction = "windup";
      enemy.strikerTimer = 0.42;
      enemy.strikerVector.copyFrom(vector);
      enemy.strikerDashHit = false;
      enemy.strikerMarker = this.createStrikerDashWarning(enemy.mesh.position, enemy.mesh.position.add(vector.scale(Math.min(6.2, distance - 0.4))));
      return true;
    }
    if (enemy.strikerAction === "windup") {
      enemy.strikerTimer -= delta;
      enemy.mesh.rotation.y = Math.atan2(enemy.strikerVector.x, enemy.strikerVector.z);
      enemy.strikerMarker?.scaling.setAll(0.84 + Math.sin(this.elapsed * 24) * 0.13);
      if (enemy.strikerTimer > 0) return true;
      enemy.strikerMarker?.dispose();
      enemy.strikerMarker = undefined;
      enemy.strikerAction = "dash";
      enemy.strikerTimer = 0.46;
      return true;
    }
    enemy.strikerTimer -= delta;
    enemy.mesh.position.addInPlace(enemy.strikerVector.scale((15.5 + Math.min(2.5, this.elapsed / 100)) * delta));
    enemy.mesh.rotation.y = Math.atan2(enemy.strikerVector.x, enemy.strikerVector.z);
    if (!enemy.strikerDashHit && Vector3.DistanceSquared(this.player.position, enemy.mesh.position) < 1.6 * 1.6) {
      enemy.strikerDashHit = true;
      this.damagePlayer(8 + Math.floor(this.elapsed / 105), 0.45, "striker-dash");
    }
    if (enemy.strikerTimer > 0) return true;
    const dashWave = MeshBuilder.CreateTorus("striker-dash-end", { diameter: 0.4, thickness: 0.065, tessellation: 20 }, this.scene);
    dashWave.position.copyFrom(enemy.mesh.position);
    dashWave.position.y = 0.16;
    dashWave.material = this.strikerMaterial;
    this.shockwaves.push({ mesh: dashWave, life: 0.2, maxLife: 0.2 });
    enemy.strikerAction = "none";
    enemy.strikerCooldown = 3.1 + Math.random() * 1.3;
    return true;
  }

  private createStrikerDashWarning(start: Vector3, end: Vector3) {
    const direction = end.subtract(start);
    const length = direction.length();
    const marker = MeshBuilder.CreateBox("striker-dash-warning", { width: 0.12, height: 0.055, depth: Math.max(0.12, length) }, this.scene);
    marker.position.copyFrom(start.add(end).scale(0.5));
    marker.position.y = 0.12;
    marker.rotation.y = Math.atan2(direction.x, direction.z);
    marker.material = this.magnetMaterial;
    return marker;
  }

  private triggerBulwarkOverdrive(enemy: Enemy) {
    enemy.bossEnraged = true;
    const wave = MeshBuilder.CreateTorus("bulwark-overdrive", { diameter: 0.8, thickness: 0.14, tessellation: 32 }, this.scene);
    wave.position.copyFrom(enemy.mesh.position);
    wave.position.y = 0.2;
    wave.material = this.gemMaterial;
    this.shockwaves.push({ mesh: wave, life: 0.6, maxLife: 0.6 });
    enemy.bossCooldown = Math.min(enemy.bossCooldown, 1.15);
  }

  private prepareBulwarkAction(enemy: Enemy) {
    const distance = Vector3.Distance(enemy.mesh.position, this.player.position);
    const roll = Math.random();
    if (enemy.bossEnraged && roll < 0.34) {
      enemy.bossAction = "barrage";
      enemy.bossTimer = 0.72;
      enemy.bossBursts = 3;
      enemy.bossTarget.copyFrom(this.player.position);
      enemy.bossMarker = this.createBossWarning(enemy.bossTarget, 1.85);
      return;
    }
    if (distance < 4.9 && roll < 0.52) {
      enemy.bossAction = "shockwave";
      enemy.bossTimer = 0.7;
      enemy.bossMarker = this.createBossWarning(enemy.mesh.position, 3.8);
      return;
    }
    if (distance > 7.2 && roll < 0.68) {
      enemy.bossAction = "charge";
      enemy.bossTimer = 0.64;
      enemy.bossTarget.copyFrom(this.player.position);
      enemy.bossVector.copyFrom(enemy.bossTarget.subtract(enemy.mesh.position));
      enemy.bossVector.y = 0;
      if (enemy.bossVector.lengthSquared() > 0.01) enemy.bossVector.normalize();
      enemy.bossChargeHit = false;
      enemy.bossMarker = this.createBossWarning(enemy.bossTarget, 2.2);
      return;
    }
    enemy.bossAction = "artillery";
    enemy.bossTimer = 0.95;
    enemy.bossTarget.copyFrom(this.player.position);
    enemy.bossMarker = this.createBossWarning(enemy.bossTarget, 3.15);
  }

  private updateBulwarkAction(enemy: Enemy, delta: number) {
    if (enemy.bossAction === "none") return false;
    if (enemy.bossAction === "barrage") {
      enemy.bossTimer -= delta;
      enemy.bossMarker?.scaling.setAll(0.82 + Math.sin(this.elapsed * 22) * 0.17);
      enemy.mesh.rotation.y += delta * 4.1;
      if (enemy.bossTimer > 0) return true;
      enemy.bossMarker?.dispose();
      enemy.bossMarker = undefined;
      const radius = 1.85;
      const strike = MeshBuilder.CreateCylinder("bulwark-barrage", { height: 5.8, diameter: 0.18, tessellation: 8 }, this.scene);
      strike.position.copyFrom(enemy.bossTarget.add(new Vector3(0, 2.9, 0)));
      strike.material = this.gemMaterial;
      this.energyTraces.push({ mesh: strike, life: 0.13, maxLife: 0.13 });
      const wave = MeshBuilder.CreateTorus("bulwark-barrage-impact", { diameter: 0.56, thickness: 0.11, tessellation: 28 }, this.scene);
      wave.position.copyFrom(enemy.bossTarget);
      wave.position.y = 0.16;
      wave.material = this.gemMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.32, maxLife: 0.32 });
      if (Vector3.DistanceSquared(this.player.position, enemy.bossTarget) <= radius * radius) this.damagePlayer(10 + Math.floor(this.elapsed / 105), 0.42, "bulwark-barrage");
      enemy.bossBursts -= 1;
      if (enemy.bossBursts <= 0) {
        this.finishBulwarkAction(enemy, 5.5);
        return true;
      }
      const offsetAngle = this.elapsed * 3.3 + enemy.bossBursts * 2.2;
      enemy.bossTarget.copyFrom(this.player.position.add(new Vector3(Math.cos(offsetAngle) * 0.9, 0, Math.sin(offsetAngle) * 0.9)));
      enemy.bossMarker = this.createBossWarning(enemy.bossTarget, radius);
      enemy.bossTimer = 0.4;
      return true;
    }
    if (enemy.bossAction === "shockwave") {
      enemy.bossTimer -= delta;
      enemy.bossMarker?.position.copyFrom(enemy.mesh.position);
      enemy.bossMarker?.scaling.setAll(0.92 + Math.sin(this.elapsed * 16) * 0.12);
      enemy.mesh.rotation.y += delta * 5.5;
      if (enemy.bossTimer > 0) return true;
      const radius = 3.8;
      const wave = MeshBuilder.CreateTorus("bulwark-shockwave", { diameter: 0.65, thickness: 0.14, tessellation: 32 }, this.scene);
      wave.position.copyFrom(enemy.mesh.position);
      wave.position.y = 0.18;
      wave.material = this.recoveryMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.46, maxLife: 0.46 });
      if (Vector3.DistanceSquared(this.player.position, enemy.mesh.position) <= radius * radius) this.damagePlayer(12 + Math.floor(this.elapsed / 95), 0.48, "bulwark-shockwave");
      this.finishBulwarkAction(enemy, 4.4);
      return true;
    }
    if (enemy.bossAction === "artillery") {
      enemy.bossTimer -= delta;
      enemy.bossMarker?.scaling.setAll(0.85 + Math.sin(this.elapsed * 18) * 0.15);
      enemy.mesh.rotation.y += delta * 2.8;
      if (enemy.bossTimer > 0) return true;
      const strike = MeshBuilder.CreateCylinder("bulwark-artillery", { height: 6.2, diameter: 0.26, tessellation: 8 }, this.scene);
      strike.position.copyFrom(enemy.bossTarget.add(new Vector3(0, 3.1, 0)));
      strike.material = this.recoveryMaterial;
      this.energyTraces.push({ mesh: strike, life: 0.16, maxLife: 0.16 });
      const wave = MeshBuilder.CreateTorus("bulwark-artillery-impact", { diameter: 0.75, thickness: 0.13, tessellation: 28 }, this.scene);
      wave.position.copyFrom(enemy.bossTarget);
      wave.position.y = 0.16;
      wave.material = this.recoveryMaterial;
      this.shockwaves.push({ mesh: wave, life: 0.42, maxLife: 0.42 });
      if (Vector3.DistanceSquared(this.player.position, enemy.bossTarget) <= 3.15 * 3.15) this.damagePlayer(14 + Math.floor(this.elapsed / 85), 0.52, "bulwark-artillery");
      this.finishBulwarkAction(enemy, 4.8);
      return true;
    }
    if (enemy.bossTimer > 0) {
      enemy.bossTimer -= delta;
      enemy.bossMarker?.scaling.setAll(0.9 + Math.sin(this.elapsed * 20) * 0.14);
      enemy.mesh.rotation.y = Math.atan2(enemy.bossVector.x, enemy.bossVector.z);
      if (enemy.bossTimer > 0) return true;
      enemy.bossMarker?.dispose();
      enemy.bossMarker = undefined;
      enemy.bossTimer = -0.58;
    }
    enemy.bossTimer += delta;
    enemy.mesh.position.addInPlace(enemy.bossVector.scale((13.5 + Math.min(2.5, this.elapsed / 100)) * delta));
    if (!enemy.bossChargeHit && Vector3.DistanceSquared(this.player.position, enemy.mesh.position) < 1.85 * 1.85) {
      enemy.bossChargeHit = true;
      this.damagePlayer(16 + Math.floor(this.elapsed / 80), 0.42, "bulwark-charge");
    }
    if (enemy.bossTimer < 0) return true;
    this.finishBulwarkAction(enemy, 5.1);
    return true;
  }

  private createBossWarning(position: Vector3, diameter: number) {
    const marker = MeshBuilder.CreateTorus("bulwark-warning", { diameter, thickness: 0.1, tessellation: 28 }, this.scene);
    marker.position.copyFrom(position);
    marker.position.y = 0.14;
    marker.material = this.magnetMaterial;
    return marker;
  }

  private finishBulwarkAction(enemy: Enemy, cooldown: number) {
    enemy.bossMarker?.dispose();
    enemy.bossMarker = undefined;
    enemy.bossAction = "none";
    enemy.bossTimer = 0;
    enemy.bossCooldown = cooldown + Math.random() * 1.2;
  }

  private damagePlayer(amount: number, cooldown: number, source: PlayerDamageSource) {
    if (this.damageTimer > 0 || this.phase !== "playing") return;
    this.health = Math.max(0, this.health - amount);
    this.damageTimer = cooldown;
    this.lastDamageSource = source;
    this.damageFlash = Math.max(this.damageFlash, 0.46);
    if (this.moduleTiers.reactive > 0) this.triggerReactiveWave(this.moduleTiers.reactive);
    if (this.health > 0) {
      this.emitSnapshot();
      return;
    }
    this.phase = "gameover";
    this.emitSnapshot();
  }

  private updateDamageWarning(delta: number) {
    this.damageFlash = Math.max(0, this.damageFlash - delta);
    if (this.damageFlash <= 0) {
      this.playerRing.scaling.setAll(1);
      this.playerHitRing.isVisible = false;
      return;
    }
    const pulse = 1 + Math.sin((0.46 - this.damageFlash) * 46) * 0.1;
    this.playerRing.scaling.setAll(pulse);
    this.playerHitRing.scaling.setAll(1.02 + Math.sin((0.46 - this.damageFlash) * 40) * 0.12);
    this.playerHitRing.isVisible = Math.floor((0.46 - this.damageFlash) * 18) % 2 === 0;
  }

  private destroyEnemy(index: number) {
    const enemy = this.enemies[index];
    if (!enemy || enemy.hp > 0) return;
    const position = enemy.mesh.position.clone();
    const dropPosition = this.getRecoverableDropPosition(position);
    // 破棄中に被弾反撃・腐食連鎖が発生しても、同一敵を再度破棄しないよう先に管理配列から外す。
    this.enemies.splice(index, 1);
    enemy.corrosionMark?.dispose();
    enemy.strikerMarker?.dispose();
    enemy.bossMarker?.dispose();
    enemy.mesh.dispose();
    this.kills += 1;
    if (this.debugMode) this.debugKills += 1;
    if (enemy.kind === "bulwark") {
      const blastRadius = 2.6;
      const explosion = MeshBuilder.CreateTorus("bulwark-destruction-blast", { diameter: 0.92, thickness: 0.16, tessellation: 28 }, this.scene);
      explosion.position.copyFrom(position);
      explosion.position.y = 0.18;
      explosion.material = this.recoveryMaterial;
      this.shockwaves.push({ mesh: explosion, life: 0.44, maxLife: 0.44 });
      const dx = this.player.position.x - position.x;
      const dz = this.player.position.z - position.z;
      if (dx * dx + dz * dz <= blastRadius * blastRadius) this.damagePlayer(10, 0.42, "bulwark-destruction");
    }
    const gem = MeshBuilder.CreateCylinder("energy-shard", { height: 0.42, diameterTop: 0.08, diameterBottom: 0.4, tessellation: 6 }, this.scene);
    gem.position = new Vector3(dropPosition.x, 0.33, dropPosition.z);
    gem.rotation.x = Math.PI;
    gem.material = this.gemMaterial;
    this.gems.push({ mesh: gem, value: enemy.xpValue });
    const shouldDropRecovery = this.health < this.maxHealth && Math.random() < RECOVERY_DROP_CHANCE;
    if (shouldDropRecovery) this.createRecoveryItem(dropPosition);
    const shouldDropMagnet = Math.random() < MAGNET_DROP_CHANCE;
    if (shouldDropMagnet) this.createMagnetItem(this.getRecoverableDropPosition(dropPosition.add(new Vector3(0.5, 0, -0.5))));
  }

  private createRecoveryItem(position: Vector3, life = DROP_LIFETIME) {
    const medkit = MeshBuilder.CreateBox("field-recovery", { width: 0.62, height: 0.42, depth: 0.62 }, this.scene);
    medkit.position = new Vector3(position.x, 0.38, position.z);
    medkit.material = this.recoveryMaterial;
    const crossVertical = MeshBuilder.CreateBox("recovery-cross-v", { width: 0.12, height: 0.45, depth: 0.05 }, this.scene);
    crossVertical.parent = medkit;
    crossVertical.position.set(0, 0.24, -0.34);
    crossVertical.material = this.projectileMaterial;
    const crossHorizontal = MeshBuilder.CreateBox("recovery-cross-h", { width: 0.45, height: 0.12, depth: 0.05 }, this.scene);
    crossHorizontal.parent = medkit;
    crossHorizontal.position.set(0, 0.24, -0.34);
    crossHorizontal.material = this.projectileMaterial;
    this.recoveryItems.push({ mesh: medkit, amount: Math.max(18, Math.ceil(this.maxHealth * 0.22)), life });
  }

  private createMagnetItem(position: Vector3, life = DROP_LIFETIME) {
    const magnet = MeshBuilder.CreateTorus("xp-field-magnet", { diameter: 0.95, thickness: 0.16, tessellation: 20 }, this.scene);
    magnet.position = new Vector3(position.x, 0.4, position.z);
    magnet.material = this.magnetMaterial;
    const leftPole = MeshBuilder.CreateBox("magnet-pole-left", { width: 0.22, height: 0.5, depth: 0.22 }, this.scene);
    leftPole.parent = magnet;
    leftPole.position.set(-0.42, 0.12, 0);
    leftPole.material = this.projectileMaterial;
    const rightPole = MeshBuilder.CreateBox("magnet-pole-right", { width: 0.22, height: 0.5, depth: 0.22 }, this.scene);
    rightPole.parent = magnet;
    rightPole.position.set(0.42, 0.12, 0);
    rightPole.material = this.projectileMaterial;
    this.magnetItems.push({ mesh: magnet, life });
  }

  private updateGems(delta: number) {
    for (let i = this.gems.length - 1; i >= 0; i -= 1) {
      const gem = this.gems[i];
      gem.mesh.rotation.y += delta * 3;
      const offset = this.player.position.subtract(gem.mesh.position);
      offset.y = 0;
      const distance = offset.length();
      if (distance < this.magnetRadius) gem.mesh.position.addInPlace(offset.scale(Math.min(1, delta * (5 + (this.magnetRadius - distance) * 2))));
      if (distance < 0.88) {
        this.addExperience(gem.value);
        gem.mesh.dispose();
        this.gems.splice(i, 1);
        if (this.phase !== "playing") return;
      }
    }
  }

  private updateMagnetItems(delta: number) {
    for (let i = this.magnetItems.length - 1; i >= 0; i -= 1) {
      const item = this.magnetItems[i];
      item.life -= delta;
      if (item.life <= 0) {
        item.mesh.dispose();
        this.magnetItems.splice(i, 1);
        continue;
      }
      item.mesh.rotation.y += delta * 2.8;
      item.mesh.position.y = 0.42 + Math.sin(this.elapsed * 3.4 + i) * 0.09;
      this.animateExpiringDrop(item.mesh, item.life, i + 0.45);
      const offset = this.player.position.subtract(item.mesh.position);
      offset.y = 0;
      const distance = offset.length();
      const pickupRadius = this.magnetRadius * 0.9;
      if (distance < pickupRadius && distance > 0.1) item.mesh.position.addInPlace(offset.scale(Math.min(1, delta * (4.5 + (pickupRadius - distance) * 2.5))));
      if (distance < 0.95) {
        item.mesh.dispose();
        this.magnetItems.splice(i, 1);
        this.collectAllExperience();
        this.emitSnapshot();
      }
    }
  }

  private collectAllExperience() {
    let collected = 0;
    for (const gem of this.gems) {
      collected += gem.value;
      gem.mesh.dispose();
    }
    this.gems.length = 0;
    this.addExperience(collected);
  }

  private addExperience(amount: number) {
    this.xp += amount;
    this.tryAdvanceLevel();
  }

  private tryAdvanceLevel() {
    if (this.xp < this.xpNeeded) return false;
    this.xp -= this.xpNeeded;
    this.level += 1;
    this.xpNeeded = 8 + this.level * 5;
    this.phase = "upgrade";
    this.prepareUpgradeChoices();
    this.emitSnapshot();
    return true;
  }

  private updateRecoveryItems(delta: number) {
    for (let i = this.recoveryItems.length - 1; i >= 0; i -= 1) {
      const item = this.recoveryItems[i];
      item.life -= delta;
      if (item.life <= 0) {
        item.mesh.dispose();
        this.recoveryItems.splice(i, 1);
        continue;
      }
      item.mesh.rotation.y += delta * 2.2;
      item.mesh.position.y = 0.4 + Math.sin(this.elapsed * 3 + i) * 0.08;
      this.animateExpiringDrop(item.mesh, item.life, i);
      const offset = this.player.position.subtract(item.mesh.position);
      offset.y = 0;
      const distance = offset.length();
      const pickupRadius = this.magnetRadius * 0.8;
      if (distance < pickupRadius && distance > 0.1) item.mesh.position.addInPlace(offset.scale(Math.min(1, delta * (4 + (pickupRadius - distance) * 2.3))));
      if (distance < 0.95) {
        this.health = Math.min(this.maxHealth, this.health + item.amount);
        item.mesh.dispose();
        this.recoveryItems.splice(i, 1);
        this.emitSnapshot();
      }
    }
  }

  private animateExpiringDrop(mesh: AbstractMesh, life: number, phaseOffset: number) {
    if (life > DROP_WARNING_WINDOW) {
      mesh.setEnabled(true);
      mesh.scaling.setAll(1);
      return;
    }
    const warningProgress = 1 - life / DROP_WARNING_WINDOW;
    const blinkFrequency = 7 + warningProgress * 10;
    const blinkOn = Math.sin((this.elapsed + phaseOffset) * blinkFrequency * Math.PI * 2) > -0.15;
    const fadeProgress = life < DROP_FADE_WINDOW ? life / DROP_FADE_WINDOW : 1;
    mesh.setEnabled(blinkOn || fadeProgress < 0.35);
    const scale = Math.max(0.05, fadeProgress * (blinkOn ? 1 : 0.72));
    mesh.scaling.setAll(scale);
  }

  private makeMaterial(name: string, diffuse: Color3, emissive: Color3) {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = Color3.Black();
    return material;
  }

  private emitSnapshot() {
    const attacks: AttackStatus[] = [
      { id: "rail", label: "レールパルス", detail: "自動追尾", iconId: "rail", tier: this.weaponTier, active: true },
      { id: "scatter", label: "散弾アレイ", detail: this.hasScatter ? "拡散射撃" : "武器追加", iconId: "scatter", tier: this.scatterTier, active: this.hasScatter },
      { id: "orbit", label: "周回センチネル", detail: this.hasOrbit ? "周回防衛" : "武器追加", iconId: "orbit", tier: this.orbitTier, active: this.hasOrbit },
    ];
    for (const option of MODULE_UPGRADES) {
      if (!this.isModuleId(option.id) || this.moduleTiers[option.id] === 0) continue;
      attacks.push({ id: option.id, label: option.title, detail: "戦術モジュール", iconId: option.iconId, tier: this.moduleTiers[option.id], active: true });
    }
    this.onSnapshot({
      phase: this.phase,
      health: this.health,
      maxHealth: this.maxHealth,
      damageFlash: this.damageFlash,
      xp: this.xp,
      xpNeeded: this.xpNeeded,
      level: this.level,
      kills: this.kills,
      seconds: Math.floor(this.elapsed),
      weaponTier: this.weaponTier,
      weaponCount: this.getAdditionalWeaponCount(),
      weaponLimit: this.getWeaponLimit(),
      rerollsRemaining: this.rerollsRemaining,
      enemyCount: this.enemies.length,
      debugStatus: this.debugMode ? `DBG IN:${this.enemies.filter((enemy) => this.isInsideContainment(enemy)).length} OUT:${this.enemies.filter((enemy) => !this.isInsideContainment(enemy)).length} FIRE:${this.debugProjectilesFired} COL:${this.debugProjectileCollisions} HIT:${this.debugHits} KILL:${this.debugKills} ENTRY:${this.debugEntries} DMG:${this.lastDamageSource}` : undefined,
      attacks,
      upgrades: this.getUpgradeOptions(),
    });
  }

  private prepareUpgradeChoices(excludedIds = new Set<UpgradeId>()) {
    this.moduleSelection = this.level >= 10;
    const pool = this.getUpgradeCandidatePool();
    const freshPool = pool.filter((option) => !excludedIds.has(option.id));
    this.upgradeOptions = this.pickRandomOptions(freshPool.length >= 3 ? freshPool : pool, 3);
  }

  private getUpgradeCandidatePool() {
    const catalog = this.level >= 10 ? UPGRADE_CATALOG : STANDARD_UPGRADES;
    return catalog.filter((option) => this.canOfferUpgrade(option));
  }

  private canOfferUpgrade(option: UpgradeOption) {
    const id = option.id;
    if (this.isModuleId(id)) {
      const tier = this.moduleTiers[id];
      if (tier >= 3) return false;
      return tier > 0 || !this.isWeaponModule(id) || this.getAdditionalWeaponCount() < this.getWeaponLimit();
    }
    if (id === "scatter") return this.hasScatter || this.getAdditionalWeaponCount() < this.getWeaponLimit();
    if (id === "orbit") return this.hasOrbit || this.getAdditionalWeaponCount() < this.getWeaponLimit();
    return true;
  }

  private isWeaponModule(id: ModuleId) {
    return id !== "reactive" && id !== "cryo" && id !== "corrosion";
  }

  private getAdditionalWeaponCount() {
    let count = (this.hasScatter ? 1 : 0) + (this.hasOrbit ? 1 : 0);
    for (const option of MODULE_UPGRADES) {
      if (this.isModuleId(option.id) && this.isWeaponModule(option.id) && this.moduleTiers[option.id] > 0) count += 1;
    }
    return count;
  }

  private getWeaponLimit() {
    return 5 + Math.max(0, Math.floor(this.level / 10) - 2);
  }

  private pickRandomOptions(options: UpgradeOption[], count: number) {
    const pool = [...options];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const picked = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[picked]] = [pool[picked], pool[index]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  }

  private isModuleId(id: UpgradeId): id is ModuleId {
    return id === "vector" || id === "nova" || id === "mirage" || id === "pylon" || id === "reactive" || id === "cryo" || id === "ricochet" || id === "gravity" || id === "decoy" || id === "mortar" || id === "split" || id === "boomerang" || id === "laser" || id === "chain" || id === "mine" || id === "fan" || id === "skyfall" || id === "cleaver" || id === "needle" || id === "saw" || id === "harpoon" || id === "thermal" || id === "sonic" || id === "cluster" || id === "corrosion";
  }

  private getUpgradeOptions() {
    return this.upgradeOptions.length > 0 ? this.upgradeOptions : this.pickRandomOptions(this.getUpgradeCandidatePool(), 3);
  }
}
