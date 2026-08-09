import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import {
  boardKey,
  findSpecialOneClear,
  findTriggeredGroups,
  getFloorApproachAction,
  isInsideBoard,
  listPlayerSafeSpawnCandidates,
  selectBuriedRescue,
  selectSpawnBatch
} from './board-rules.js';
import { BASE_ORIENTATION, Dice } from './dice.js';
import { GAME_PHASES, GameSession } from './game-session.js';
import {
  DEFAULT_GAME_MODE_ID,
  GAME_MODE_IDS,
  getGameMode
} from './game-modes.js';
import {
  getClearTriggeredSpawnCount,
  getSixtySecondSpawnRemaining
} from './spawn-rules.js';
import {
  BOARD_BASE_SIZE,
  CAMERA_POSITION,
  CAMERA_TARGET,
  calculateCameraFrustum
} from './camera-framing.js';
import { SimulationPause } from './simulation-pause.js';

const BOARD_SIZE = 7;
const HALF_BOARD = (BOARD_SIZE - 1) / 2;
const DICE_SIZE = 0.92;
const FLOOR_Y = 0;
const DICE_Y = 0.52;
const PLAYER_Y = 1.18;
const GROUND_PLAYER_Y = 0.18;
const SINK_DURATION = 2200;
const SINK_DEPTH = 1.18;
const SPECIAL_ONE_DURATION = 360;
const RISE_DURATION = 720;
const RISE_DEPTH = 1.18;
const BURIED_DICE_Y = -0.24;

const DIRECTIONS = {
  up: { row: -1, column: 0, axis: new THREE.Vector3(1, 0, 0), angle: -Math.PI / 2 },
  down: { row: 1, column: 0, axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
  left: { row: 0, column: -1, axis: new THREE.Vector3(0, 0, 1), angle: Math.PI / 2 },
  right: { row: 0, column: 1, axis: new THREE.Vector3(0, 0, 1), angle: -Math.PI / 2 }
};

const INITIAL_DICE = [
  [0, 1], [0, 3], [0, 5],
  [1, 0], [1, 2], [1, 4], [1, 6],
  [2, 1], [2, 3], [2, 5],
  [3, 0], [3, 2], [3, 3], [3, 5], [3, 6],
  [4, 1], [4, 4], [4, 6],
  [5, 0], [5, 2], [5, 5],
  [6, 1], [6, 3], [6, 6]
];

const DIE_BODY_GEOMETRY = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 5, 0.12);
const PIP_GEOMETRY = new THREE.SphereGeometry(0.064, 10, 7);
const PIP_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.72 });

function gridToWorld(row, column, y = DICE_Y) {
  return new THREE.Vector3(column - HALF_BOARD, y, row - HALF_BOARD);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function createPipPositions(value) {
  const a = 0.22;
  const positions = {
    1: [[0, 0]],
    2: [[-a, a], [a, -a]],
    3: [[-a, a], [0, 0], [a, -a]],
    4: [[-a, a], [a, a], [-a, -a], [a, -a]],
    5: [[-a, a], [a, a], [0, 0], [-a, -a], [a, -a]],
    6: [[-a, a], [a, a], [-a, 0], [a, 0], [-a, -a], [a, -a]]
  };
  return positions[value];
}

function addFacePips(group, value, face) {
  for (const [u, v] of createPipPositions(value)) {
    const pip = new THREE.Mesh(PIP_GEOMETRY, PIP_MATERIAL);
    const edge = DICE_SIZE / 2 + 0.012;

    if (face === 'top') pip.position.set(u, edge, v);
    if (face === 'bottom') pip.position.set(u, -edge, -v);
    if (face === 'front') pip.position.set(u, v, edge);
    if (face === 'back') pip.position.set(-u, v, -edge);
    if (face === 'left') pip.position.set(-edge, v, u);
    if (face === 'right') pip.position.set(edge, v, -u);

    group.add(pip);
  }
}

function createDieMesh() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2ead6,
    roughness: 0.48,
    metalness: 0.02,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  const body = new THREE.Mesh(DIE_BODY_GEOMETRY, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  addFacePips(group, 1, 'top');
  addFacePips(group, 6, 'bottom');
  addFacePips(group, 2, 'front');
  addFacePips(group, 5, 'back');
  addFacePips(group, 3, 'left');
  addFacePips(group, 4, 'right');

  group.userData.bodyMaterial = bodyMaterial;
  return group;
}

function createPlayer() {
  const player = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf6bd3f, roughness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x32220f, roughness: 0.72 });

  const body = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.34, 0.20, 3, 0.07), yellow);
  body.position.y = 0.24;
  body.castShadow = true;
  player.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), yellow);
  head.position.y = 0.57;
  head.castShadow = true;
  player.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.025, 8, 6);
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(eyeGeometry, dark);
    eye.position.set(x, 0.60, 0.16);
    player.add(eye);
  }

  const limbGeometry = new THREE.CapsuleGeometry(0.035, 0.18, 4, 8);
  for (const x of [-0.13, 0.13]) {
    const arm = new THREE.Mesh(limbGeometry, yellow);
    arm.position.set(x, 0.28, 0);
    arm.rotation.z = x < 0 ? -0.28 : 0.28;
    arm.castShadow = true;
    player.add(arm);
  }
  for (const x of [-0.075, 0.075]) {
    const leg = new THREE.Mesh(limbGeometry, yellow);
    leg.position.set(x, 0.02, 0);
    leg.castShadow = true;
    player.add(leg);
  }

  player.scale.setScalar(0.9);
  return player;
}

export class WebGLSainome {
  constructor(canvas, callbacks = {}, initialModeId = DEFAULT_GAME_MODE_ID) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1018);
    this.scene.fog = new THREE.Fog(0x0b1018, 10, 19);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
    this.camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);

    this.clock = new THREE.Clock();
    this.dice = new Map();
    this.player = createPlayer();
    this.scene.add(this.player);
    this.activeKey = null;
    this.playerRow = 3;
    this.playerColumn = 3;
    this.busy = false;
    this.queuedDirection = null;
    this.queueTimerId = null;
    this.rollCount = 0;
    this.chainCount = 0;
    this.clearedCount = 0;
    this.diceSequence = 0;
    this.epoch = 0;
    this.isVisible = !document.hidden;
    this.contextLost = false;
    this.simulationPause = new SimulationPause();
    this.mode = getGameMode(initialModeId);
    this.sixtySecondSpawnedCount = 0;
    this.pendingSpawnCount = 0;
    this.spawnBlockedNotified = false;
    this.pendingMatchResolution = false;
    this.session = new GameSession({ modeId: this.mode.id });
    this.lastSessionSignature = '';
    this.syncSimulationPause();

    this.createLights();
    this.createBoard();
    this.reset();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.bindLifecycleEvents();
    this.animate();
  }

  bindLifecycleEvents() {
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.syncSimulationPause();
      this.callbacks.onMessage?.('3D表示を復帰しています…操作を一時停止します');
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.syncSimulationPause();
      this.callbacks.onMessage?.('3D表示が復帰しました');
      this.resize();
      this.clock.getDelta();
    });

    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      this.syncSimulationPause();
      if (this.isVisible) {
        this.clock.getDelta();
      } else {
        this.queuedDirection = null;
        window.clearTimeout(this.queueTimerId);
        this.queueTimerId = null;
      }
    });
  }

  syncSimulationPause(now = performance.now()) {
    this.simulationPause.sync(!this.isVisible || this.contextLost, now);
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(0xfff1ce, 0x192235, 1.55);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe0a0, 3.2);
    key.position.set(-4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0008;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6d8fd8, 1.25);
    rim.position.set(7, 5, -7);
    this.scene.add(rim);
  }

  createBoard() {
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD_BASE_SIZE, 0.48, BOARD_BASE_SIZE, 5, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.78, metalness: 0.08 })
    );
    base.position.y = -0.28;
    base.receiveShadow = true;
    base.castShadow = true;
    this.scene.add(base);

    const tileGeometry = new RoundedBoxGeometry(0.92, 0.10, 0.92, 3, 0.08);
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.82 }),
      new THREE.MeshStandardMaterial({ color: 0x282c33, roughness: 0.86 })
    ];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const tile = new THREE.Mesh(tileGeometry, materials[(row + column) % 2]);
        tile.position.set(column - HALF_BOARD, FLOOR_Y, row - HALF_BOARD);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    const grid = new THREE.GridHelper(7, 7, 0x8a6a31, 0x4a4e57);
    grid.position.y = 0.065;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.scene.add(grid);
  }

  reset(modeId = this.mode.id) {
    this.mode = getGameMode(modeId);
    this.session = new GameSession({ modeId: this.mode.id });
    this.epoch += 1;
    for (const die of this.dice.values()) this.removeDie(die, true);
    this.dice.clear();
    this.diceSequence = 0;

    for (const [row, column] of INITIAL_DICE) this.addDie(row, column);
    this.removeOpeningMatches();

    this.activeKey = boardKey(3, 3);
    if (!this.dice.has(this.activeKey)) this.addDie(3, 3);
    this.playerRow = 3;
    this.playerColumn = 3;
    this.rollCount = 0;
    this.chainCount = 0;
    this.clearedCount = 0;
    this.sixtySecondSpawnedCount = 0;
    this.pendingSpawnCount = 0;
    this.spawnBlockedNotified = false;
    this.pendingMatchResolution = false;
    this.busy = false;
    this.queuedDirection = null;
    window.clearTimeout(this.queueTimerId);
    this.queueTimerId = null;
    this.player.rotation.set(0, 0, 0);
    this.placePlayer();
    this.lastSessionSignature = '';
    this.emitSession(this.session.start(this.getGameTime()), true);
    this.callbacks.onRoll?.(this.rollCount, this.dice.get(this.activeKey)?.top);
    this.callbacks.onChain?.({ chain: 0, count: 0, value: 0, isChain: false });
    this.callbacks.onClear?.(this.clearedCount);
    this.callbacks.onMessage?.('同じ目を、目の数以上つなげます');
  }

  addDie(row, column, state = 'normal') {
    this.diceSequence += 1;
    const die = new Dice(`die-${this.diceSequence}`, row, column, { ...BASE_ORIENTATION });
    die.mesh = createDieMesh();
    die.mesh.position.copy(gridToWorld(row, column));
    die.state = state;
    die.sinkStartedAt = 0;
    die.riseStartedAt = 0;
    die.riseStartY = DICE_Y - RISE_DEPTH;
    this.randomizeOrientation(die);
    this.scene.add(die.mesh);
    this.dice.set(boardKey(row, column), die);
    return die;
  }

  randomizeOrientation(die) {
    Object.assign(die, BASE_ORIENTATION);
    die.mesh.quaternion.identity();
    const directions = Object.keys(DIRECTIONS);
    const turns = 3 + Math.floor(Math.random() * 6);
    for (let index = 0; index < turns; index += 1) {
      this.applyQuarterTurn(die, directions[Math.floor(Math.random() * directions.length)]);
    }
  }

  removeOpeningMatches() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const groups = findTriggeredGroups(this.dice, BOARD_SIZE);
      if (groups.length === 0) return;
      for (const group of groups) {
        for (const die of group.additions) this.randomizeOrientation(die);
      }
    }
  }

  applyQuarterTurn(die, directionName) {
    const direction = DIRECTIONS[directionName];
    Dice.rotateValues(die, directionName);
    const turn = new THREE.Quaternion().setFromAxisAngle(direction.axis, direction.angle);
    die.mesh.quaternion.premultiply(turn).normalize();
  }

  placePlayer() {
    const die = this.activeKey ? this.dice.get(this.activeKey) : null;
    const y = die ? die.mesh.position.y + (PLAYER_Y - DICE_Y) : GROUND_PLAYER_Y;
    this.player.position.copy(gridToWorld(this.playerRow, this.playerColumn, y));
  }

  move(directionName) {
    if (!DIRECTIONS[directionName]) return;
    if (!this.isVisible) return;
    if (this.contextLost) {
      this.callbacks.onMessage?.('3D表示を復帰するまで操作できません');
      return;
    }
    this.emitSession(this.session.tick(this.getGameTime()));
    if (!this.session.isAcceptingInput()) {
      this.callbacks.onMessage?.(
        this.session.getSnapshot().phase === GAME_PHASES.FINISHING
          ? `${this.mode.label}終了。消去が終わるまで待ちます`
          : 'ゲーム終了。やり直すと再開します'
      );
      return;
    }
    if (this.busy) {
      this.queuedDirection = directionName;
      return;
    }

    const direction = DIRECTIONS[directionName];
    const nextRow = this.playerRow + direction.row;
    const nextColumn = this.playerColumn + direction.column;
    if (!isInsideBoard(nextRow, nextColumn, BOARD_SIZE)) {
      this.callbacks.onMessage?.('盤面の端です');
      return;
    }

    const nextKey = boardKey(nextRow, nextColumn);
    const targetDie = this.dice.get(nextKey);
    const currentDie = this.activeKey ? this.dice.get(this.activeKey) : null;

    if (currentDie?.state === 'normal') {
      this.callbacks.onMove?.();
      if (targetDie) void this.hopTo(targetDie, nextKey, directionName);
      else void this.rollDie(currentDie, nextRow, nextColumn, nextKey, directionName);
      return;
    }

    if (currentDie?.state === 'sinking') {
      this.callbacks.onMove?.();
      if (targetDie) void this.hopTo(targetDie, nextKey, directionName);
      else void this.moveOnFloor(nextRow, nextColumn, directionName, true);
      return;
    }

    if (currentDie?.state === 'rising') {
      this.callbacks.onMessage?.('サイコロが上がりきるまで待ちます');
      return;
    }

    const floorAction = getFloorApproachAction(
      targetDie,
      targetDie?.mesh.position.y
    );

    if (floorAction === 'walk') {
      this.callbacks.onMove?.();
      void this.moveOnFloor(nextRow, nextColumn, directionName, false);
      return;
    }

    if (floorAction === 'climb') {
      this.callbacks.onMove?.();
      void this.hopTo(targetDie, nextKey, directionName);
      return;
    }

    this.callbacks.onMessage?.('サイコロが低くなるまで待ちます');
  }

  async hopTo(targetDie, nextKey, directionName) {
    const wasBuried = targetDie.state === 'buried';
    const epoch = this.epoch;
    this.busy = true;
    const start = this.player.position.clone();
    const end = gridToWorld(
      targetDie.row,
      targetDie.column,
      targetDie.mesh.position.y + (PLAYER_Y - DICE_Y)
    );
    const completed = await this.animatePlayerMove(start, end, 210, 0.34, epoch);
    if (!completed || epoch !== this.epoch) return;

    const currentTarget = this.dice.get(nextKey);
    this.playerRow = targetDie.row;
    this.playerColumn = targetDie.column;
    this.activeKey = currentTarget === targetDie ? nextKey : null;
    if (!this.activeKey) this.player.position.y = GROUND_PLAYER_Y;
    this.faceDirection(directionName);
    this.busy = false;
    if (wasBuried && this.activeKey) {
      targetDie.state = 'rising';
      targetDie.riseStartedAt = this.getGameTime();
      targetDie.riseStartY = targetDie.mesh.position.y;
      this.callbacks.onMessage?.('沈んだサイコロに乗りました。上へ戻ります');
    }
    const matched = this.resolvePendingMatches();
    if (!matched && !wasBuried) {
      this.callbacks.onMessage?.(this.activeKey ? 'サイコロの上を移動' : '床へ着地');
    }
    this.consumeQueue();
  }

  async moveOnFloor(nextRow, nextColumn, directionName, steppingDown) {
    const epoch = this.epoch;
    this.busy = true;
    const start = this.player.position.clone();
    const end = gridToWorld(nextRow, nextColumn, GROUND_PLAYER_Y);
    const completed = await this.animatePlayerMove(start, end, steppingDown ? 230 : 170, steppingDown ? 0.12 : 0.04, epoch);
    if (!completed || epoch !== this.epoch) return;

    this.playerRow = nextRow;
    this.playerColumn = nextColumn;
    this.activeKey = null;
    this.faceDirection(directionName);
    this.busy = false;
    const matched = this.resolvePendingMatches();
    if (!matched) {
      this.callbacks.onMessage?.('床を移動中。近くのサイコロへ移動すると登れます');
    }
    this.consumeQueue();
  }

  animatePlayerMove(start, end, duration, jumpHeight, epoch) {
    const startTime = this.getGameTime();
    return new Promise((resolve) => {
      const step = () => {
        if (epoch !== this.epoch) {
          resolve(false);
          return;
        }
        const raw = Math.min(1, (this.getGameTime() - startTime) / duration);
        const t = easeInOutCubic(raw);
        this.player.position.lerpVectors(start, end, t);
        this.player.position.y += Math.sin(Math.PI * raw) * jumpHeight;
        if (raw < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  async rollDie(die, nextRow, nextColumn, nextKey, directionName) {
    const epoch = this.epoch;
    this.busy = true;
    this.callbacks.onRollStart?.();
    const direction = DIRECTIONS[directionName];
    const oldKey = boardKey(die.row, die.column);
    const startPosition = die.mesh.position.clone();
    const endPosition = gridToWorld(nextRow, nextColumn);
    const startQuaternion = die.mesh.quaternion.clone();
    const turn = new THREE.Quaternion().setFromAxisAngle(direction.axis, direction.angle);
    const endQuaternion = turn.clone().multiply(startQuaternion);
    const startTime = this.getGameTime();
    const duration = 280;

    const completed = await new Promise((resolve) => {
      const step = () => {
        if (epoch !== this.epoch) {
          resolve(false);
          return;
        }
        const raw = Math.min(1, (this.getGameTime() - startTime) / duration);
        const t = easeInOutCubic(raw);
        die.mesh.position.lerpVectors(startPosition, endPosition, t);
        die.mesh.position.y = DICE_Y + Math.sin(Math.PI * raw) * 0.26;
        die.mesh.quaternion.slerpQuaternions(startQuaternion, endQuaternion, t);
        this.player.position.set(
          die.mesh.position.x,
          PLAYER_Y + Math.sin(Math.PI * raw) * 0.18,
          die.mesh.position.z
        );
        this.player.rotation.z = Math.sin(Math.PI * raw)
          * (directionName === 'left' ? 0.12 : directionName === 'right' ? -0.12 : 0);
        if (raw < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });

    if (!completed || epoch !== this.epoch) return;
    die.mesh.position.copy(endPosition);
    die.mesh.quaternion.copy(endQuaternion).normalize();
    die.roll(directionName, nextRow, nextColumn);
    this.dice.delete(oldKey);
    this.dice.set(nextKey, die);
    this.activeKey = nextKey;
    this.playerRow = nextRow;
    this.playerColumn = nextColumn;
    this.player.position.set(endPosition.x, PLAYER_Y, endPosition.z);
    this.player.rotation.z = 0;
    this.faceDirection(directionName);

    this.rollCount += 1;
    this.callbacks.onRoll?.(this.rollCount, die.top);
    this.callbacks.onImpact?.();
    const matched = this.resolveMatches();
    if (!matched) this.callbacks.onMessage?.(`上面は${die.top}。同じ目を${die.top}個以上つなげます`);
    this.busy = false;
    this.consumeQueue();
  }

  resolveMatches() {
    if (this.session.getSnapshot().phase === GAME_PHASES.FINISHED) return false;
    this.pendingMatchResolution = false;
    const groups = findTriggeredGroups(this.dice, BOARD_SIZE);
    const now = this.getGameTime();
    for (const group of groups) {
      this.chainCount = group.isChain ? this.chainCount + 1 : 1;
      for (const die of group.additions) {
        die.state = 'sinking';
        die.sinkStartedAt = now;
        const material = die.mesh.userData.bodyMaterial;
        material.emissive.setHex(group.isChain ? 0x8a2700 : 0x694000);
        material.emissiveIntensity = group.isChain ? 0.72 : 0.46;
      }

      this.callbacks.onClearStart?.({
        type: 'normal',
        value: group.value,
        count: group.additions.length,
        chain: this.chainCount
      });

      this.callbacks.onChain?.({
        chain: this.chainCount,
        count: group.additions.length,
        value: group.value,
        isChain: group.isChain
      });
      this.recordClearScore({
        type: 'normal',
        value: group.value,
        count: group.additions.length,
        chain: this.chainCount
      });
      this.callbacks.onMessage?.(
        group.isChain
          ? `${this.chainCount}連鎖！ ${group.value}の目を追加`
          : `${group.value}の目が${group.members.length}個つながりました`
      );
    }

    const specialOne = this.resolveSpecialOnes(now);
    return groups.length > 0 || specialOne;
  }

  resolvePendingMatches() {
    if (this.busy || !this.pendingMatchResolution) return false;
    return this.resolveMatches();
  }

  resolveSpecialOnes(now = this.getGameTime()) {
    const protectedDieId = this.activeKey ? this.dice.get(this.activeKey)?.id : null;
    const special = findSpecialOneClear(this.dice, BOARD_SIZE, protectedDieId);
    if (!special || special.members.length === 0) return false;

    for (const die of special.members) {
      die.state = 'one-clearing';
      die.sinkStartedAt = now;
      const material = die.mesh.userData.bodyMaterial;
      material.emissive.setHex(0x6a1d7a);
      material.emissiveIntensity = 0.82;
    }

    this.callbacks.onClearStart?.({
      type: 'special-one',
      value: 1,
      count: special.members.length,
      chain: Math.max(1, this.chainCount)
    });

    this.recordClearScore({
      type: 'special-one',
      value: 1,
      count: special.members.length,
      chain: Math.max(1, this.chainCount)
    });

    this.callbacks.onMessage?.(
      special.protected
        ? `1の特殊消去！ 足元以外の${special.members.length}個が消えます`
        : `1の特殊消去！ ${special.members.length}個が消えます`
    );
    return true;
  }

  updateSinking(now) {
    const completed = [];
    for (const [key, die] of this.dice) {
      if (die.state !== 'sinking' && die.state !== 'one-clearing') continue;
      const duration = die.state === 'one-clearing' ? SPECIAL_ONE_DURATION : SINK_DURATION;
      const raw = Math.min(1, Math.max(0, (now - die.sinkStartedAt) / duration));
      const progress = easeInOutCubic(raw);
      die.mesh.position.y = DICE_Y - progress * SINK_DEPTH;
      die.mesh.scale.setScalar(1 - progress * 0.08);
      die.mesh.userData.bodyMaterial.emissiveIntensity = 0.34 + Math.sin(raw * Math.PI * 7) * 0.16;

      if (!this.busy && this.activeKey === key) {
        this.player.position.y = die.mesh.position.y + (PLAYER_Y - DICE_Y);
      }
      if (raw >= 1) completed.push([key, die]);
    }

    const hasBuriedRescue = [...this.dice.values()].some(
      (die) => die.state === 'buried'
    );
    const rescueCandidates = completed
      .map(([, die]) => die)
      .filter((die) => die.state === 'sinking');
    const preferredDieId = this.activeKey
      ? this.dice.get(this.activeKey)?.id ?? null
      : null;
    const buriedRescue = hasBuriedRescue
      ? null
      : selectBuriedRescue(
        rescueCandidates,
        this.playerRow,
        this.playerColumn,
        preferredDieId
      );

    for (const [key, die] of completed) {
      if (this.activeKey === key) {
        this.activeKey = null;
        this.player.position.y = GROUND_PLAYER_Y;
      }
      this.clearedCount += 1;
      this.callbacks.onClear?.(this.clearedCount);

      if (die === buriedRescue) {
        die.state = 'buried';
        die.sinkStartedAt = 0;
        die.mesh.position.y = BURIED_DICE_Y;
        die.mesh.scale.setScalar(1);
        this.randomizeOrientation(die);
        die.mesh.userData.bodyMaterial.emissive.setHex(0x12304a);
        die.mesh.userData.bodyMaterial.emissiveIntensity = 0.28;
        continue;
      }

      this.dice.delete(key);
      die.state = 'cleared';
      this.removeDie(die, true);
    }

    if (
      completed.length > 0
      && ![...this.dice.values()].some(
        (die) => die.state === 'sinking' || die.state === 'one-clearing'
      )
    ) {
      this.chainCount = 0;
      this.callbacks.onChain?.({ chain: 0, count: 0, value: 0, isChain: false });
      this.callbacks.onMessage?.(
        buriedRescue && !this.activeKey
          ? '床に沈んだサイコロへ乗ると上へ戻れます'
          : '消去完了。空きマスを使って次の目をそろえます'
      );
    }
  }

  updateRising(now) {
    let completed = false;
    for (const [key, die] of this.dice) {
      if (die.state !== 'rising') continue;
      const raw = Math.min(1, Math.max(0, (now - die.riseStartedAt) / RISE_DURATION));
      const progress = easeInOutCubic(raw);
      const startY = Number.isFinite(die.riseStartY)
        ? die.riseStartY
        : DICE_Y - RISE_DEPTH;
      die.mesh.position.y = startY + progress * (DICE_Y - startY);

      if (!this.busy && this.activeKey === key) {
        this.player.position.y = die.mesh.position.y + (PLAYER_Y - DICE_Y);
      }

      if (raw >= 1) {
        die.mesh.position.y = DICE_Y;
        die.state = 'normal';
        die.riseStartedAt = 0;
        die.riseStartY = DICE_Y - RISE_DEPTH;
        die.mesh.userData.bodyMaterial.emissive.setHex(0x000000);
        die.mesh.userData.bodyMaterial.emissiveIntensity = 0;
        if (this.activeKey === key) {
          this.callbacks.onMessage?.('サイコロの上へ戻りました');
        }
        completed = true;
      }
    }

    if (completed && this.session.getSnapshot().phase !== GAME_PHASES.FINISHED) {
      this.pendingMatchResolution = true;
    }
  }

  updateSpawning(now) {
    if (!this.session.isAcceptingInput() || this.busy) return;
    const sessionState = this.session.getSnapshot();
    const isOneEightySecondMode = this.mode.id
      === GAME_MODE_IDS.ONE_EIGHTY_SECONDS;
    const hasAnimatingDice = [...this.dice.values()].some(
      (die) => die.state === 'sinking'
        || die.state === 'one-clearing'
        || die.state === 'rising'
    );
    if (
      isOneEightySecondMode
      && (hasAnimatingDice || this.pendingMatchResolution)
    ) return;

    const spawnCount = isOneEightySecondMode
      ? this.pendingSpawnCount
      : getSixtySecondSpawnRemaining(
        sessionState.elapsedMs,
        this.sixtySecondSpawnedCount
      );
    if (spawnCount === 0) return;

    const candidates = listPlayerSafeSpawnCandidates(
      this.dice,
      BOARD_SIZE,
      this.playerRow,
      this.playerColumn
    );
    const cells = selectSpawnBatch(candidates, spawnCount);
    if (cells.length === 0) {
      if (!this.spawnBlockedNotified) {
        this.callbacks.onMessage?.(
          isOneEightySecondMode
            ? '生成できる安全な空きマスがありません'
            : '盤面がいっぱいです。サイコロを消してください'
        );
        this.spawnBlockedNotified = true;
      }
      return;
    }

    this.spawnBlockedNotified = false;
    if (isOneEightySecondMode) {
      this.pendingSpawnCount = Math.max(
        0,
        this.pendingSpawnCount - cells.length
      );
    } else {
      this.sixtySecondSpawnedCount += cells.length;
    }

    for (const cell of cells) {
      const die = this.addDie(cell.row, cell.column, 'rising');
      die.riseStartedAt = now;
      die.riseStartY = DICE_Y - RISE_DEPTH;
      die.mesh.position.y = die.riseStartY;
    }
    this.callbacks.onSpawn?.({ count: cells.length });
    this.callbacks.onMessage?.(`新しいサイコロが${cells.length}個現れます`);
  }

  removeDie(die, disposeMaterial) {
    this.scene.remove(die.mesh);
    if (disposeMaterial) die.mesh.userData.bodyMaterial?.dispose();
  }

  faceDirection(directionName) {
    const rotations = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
    this.player.rotation.y = rotations[directionName] ?? 0;
  }

  consumeQueue() {
    if (!this.queuedDirection) return;
    const queued = this.queuedDirection;
    this.queuedDirection = null;
    window.clearTimeout(this.queueTimerId);
    this.queueTimerId = window.setTimeout(() => {
      this.queueTimerId = null;
      this.move(queued);
    }, 30);
  }

  getGameTime() {
    const now = performance.now();
    return now - this.simulationPause.getPausedDuration(now);
  }

  recordClearScore(clear) {
    const wasAcceptingInput = this.session.isAcceptingInput();
    const scoreEvent = this.session.recordClear(clear);
    if (!scoreEvent) return null;
    if (wasAcceptingInput) {
      this.pendingSpawnCount += getClearTriggeredSpawnCount(
        this.mode.id,
        scoreEvent.count
      );
    }
    this.callbacks.onScore?.(scoreEvent);
    this.emitSession(this.session.getSnapshot(), true);
    return scoreEvent;
  }

  emitSession(snapshot, force = false) {
    const signature = `${snapshot.modeId}:${snapshot.phase}:${Math.ceil(snapshot.remainingMs / 1000)}:${snapshot.score}`;
    if (!force && signature === this.lastSessionSignature) return;
    this.lastSessionSignature = signature;
    this.callbacks.onSessionChange?.(snapshot);
  }

  finishSessionIfSettled() {
    if (this.session.getSnapshot().phase === GAME_PHASES.FINISHING) {
      this.pendingSpawnCount = 0;
    }
    const hasPendingWork = this.busy
      || this.pendingMatchResolution
      || [...this.dice.values()].some(
        (die) => die.state === 'sinking'
          || die.state === 'one-clearing'
          || die.state === 'rising'
      );
    const result = this.session.finishWhenSettled(hasPendingWork);
    if (!result) return;

    this.pendingMatchResolution = false;
    this.queuedDirection = null;
    window.clearTimeout(this.queueTimerId);
    this.queueTimerId = null;
    this.emitSession(result, true);
    this.callbacks.onFinish?.(result);
    this.callbacks.onMessage?.(`${this.mode.label}終了。得点は${result.score}点です`);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    const frustum = calculateCameraFrustum(width, height);
    this.camera.left = frustum.left;
    this.camera.right = frustum.right;
    this.camera.top = frustum.top;
    this.camera.bottom = frustum.bottom;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const now = this.getGameTime();
    if (this.isVisible && !this.contextLost) {
      const sessionState = this.session.tick(now);
      this.emitSession(sessionState);
      this.updateSinking(now);
      this.updateRising(now);
      this.updateSpawning(now);
      this.resolvePendingMatches();
      this.finishSessionIfSettled();
      const elapsed = this.clock.getElapsedTime();
      if (!this.busy) {
        const activeDie = this.activeKey ? this.dice.get(this.activeKey) : null;
        if (!activeDie || activeDie.state === 'normal') {
          const baseY = activeDie ? activeDie.mesh.position.y + (PLAYER_Y - DICE_Y) : GROUND_PLAYER_Y;
          this.player.position.y = baseY + Math.sin(elapsed * 4.2) * 0.025;
        }
        this.player.rotation.x = Math.sin(elapsed * 3.2) * 0.018;
      }
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(() => this.animate());
  }
}
