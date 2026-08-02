import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BOARD_SIZE = 7;
const HALF_BOARD = (BOARD_SIZE - 1) / 2;
const DICE_SIZE = 0.92;
const FLOOR_Y = 0;
const DICE_Y = 0.52;
const PLAYER_Y = 1.18;

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

function gridToWorld(row, column) {
  return new THREE.Vector3(column - HALF_BOARD, DICE_Y, row - HALF_BOARD);
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

function addFacePips(group, value, face, geometry, material) {
  for (const [u, v] of createPipPositions(value)) {
    const pip = new THREE.Mesh(geometry, material);
    const edge = DICE_SIZE / 2 + 0.012;

    if (face === 'top') pip.position.set(u, edge, v);
    if (face === 'bottom') pip.position.set(u, -edge, -v);
    if (face === 'front') pip.position.set(u, v, edge);
    if (face === 'back') pip.position.set(-u, v, -edge);
    if (face === 'left') pip.position.set(-edge, v, u);
    if (face === 'right') pip.position.set(edge, v, -u);

    pip.castShadow = true;
    group.add(pip);
  }
}

function createDieMesh() {
  const group = new THREE.Group();
  const bodyGeometry = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 5, 0.12);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2ead6,
    roughness: 0.48,
    metalness: 0.02
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const pipGeometry = new THREE.SphereGeometry(0.064, 12, 8);
  const pipMaterial = new THREE.MeshStandardMaterial({
    color: 0x17130f,
    roughness: 0.72
  });

  addFacePips(group, 1, 'top', pipGeometry, pipMaterial);
  addFacePips(group, 6, 'bottom', pipGeometry, pipMaterial);
  addFacePips(group, 2, 'front', pipGeometry, pipMaterial);
  addFacePips(group, 5, 'back', pipGeometry, pipMaterial);
  addFacePips(group, 3, 'left', pipGeometry, pipMaterial);
  addFacePips(group, 4, 'right', pipGeometry, pipMaterial);

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
  constructor(canvas, callbacks = {}) {
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
    this.camera.position.set(7.8, 9.2, 8.8);
    this.camera.lookAt(0, 0.5, 0);

    this.clock = new THREE.Clock();
    this.dice = new Map();
    this.activeKey = '3,3';
    this.player = createPlayer();
    this.scene.add(this.player);
    this.busy = false;
    this.queuedDirection = null;
    this.rollCount = 0;
    this.animationFrame = 0;

    this.createLights();
    this.createBoard();
    this.reset();
    this.resize();
    this.animate();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(0xfff1ce, 0x192235, 1.55);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe0a0, 3.2);
    key.position.set(-4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
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
      new RoundedBoxGeometry(8.2, 0.48, 8.2, 5, 0.24),
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

  reset() {
    for (const die of this.dice.values()) this.scene.remove(die.mesh);
    this.dice.clear();

    for (const [row, column] of INITIAL_DICE) {
      const key = `${row},${column}`;
      const mesh = createDieMesh();
      mesh.position.copy(gridToWorld(row, column));
      const turnsX = (row * 2 + column) % 4;
      const turnsZ = (row + column * 3) % 4;
      mesh.rotation.set(turnsX * Math.PI / 2, 0, turnsZ * Math.PI / 2);
      this.scene.add(mesh);
      this.dice.set(key, { row, column, mesh });
    }

    this.activeKey = '3,3';
    if (!this.dice.has(this.activeKey)) {
      const mesh = createDieMesh();
      mesh.position.copy(gridToWorld(3, 3));
      this.scene.add(mesh);
      this.dice.set(this.activeKey, { row: 3, column: 3, mesh });
    }

    this.rollCount = 0;
    this.busy = false;
    this.queuedDirection = null;
    this.placePlayer(false);
    this.callbacks.onRoll?.(this.rollCount);
    this.callbacks.onMessage?.('空いているマスへ進むとサイコロが転がります');
  }

  placePlayer(animate = true) {
    const die = this.dice.get(this.activeKey);
    if (!die) return;
    const target = gridToWorld(die.row, die.column);
    target.y = PLAYER_Y;
    if (!animate) this.player.position.copy(target);
  }

  move(directionName) {
    if (!DIRECTIONS[directionName]) return;
    if (this.busy) {
      this.queuedDirection = directionName;
      return;
    }

    const current = this.dice.get(this.activeKey);
    if (!current) return;
    const direction = DIRECTIONS[directionName];
    const nextRow = current.row + direction.row;
    const nextColumn = current.column + direction.column;

    if (nextRow < 0 || nextRow >= BOARD_SIZE || nextColumn < 0 || nextColumn >= BOARD_SIZE) {
      this.callbacks.onMessage?.('盤面の端です');
      return;
    }

    const nextKey = `${nextRow},${nextColumn}`;
    const targetDie = this.dice.get(nextKey);
    if (targetDie) {
      this.hopTo(targetDie, nextKey, directionName);
      return;
    }

    this.rollDie(current, nextRow, nextColumn, nextKey, directionName);
  }

  async hopTo(targetDie, nextKey, directionName) {
    this.busy = true;
    const start = this.player.position.clone();
    const end = gridToWorld(targetDie.row, targetDie.column);
    end.y = PLAYER_Y;
    const startTime = performance.now();
    const duration = 210;

    await new Promise((resolve) => {
      const step = (now) => {
        const raw = Math.min(1, (now - startTime) / duration);
        const t = easeInOutCubic(raw);
        this.player.position.lerpVectors(start, end, t);
        this.player.position.y += Math.sin(Math.PI * raw) * 0.34;
        if (raw < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    this.activeKey = nextKey;
    this.faceDirection(directionName);
    this.busy = false;
    this.callbacks.onMessage?.('サイコロの上を移動');
    this.consumeQueue();
  }

  async rollDie(die, nextRow, nextColumn, nextKey, directionName) {
    this.busy = true;
    const direction = DIRECTIONS[directionName];
    const oldKey = `${die.row},${die.column}`;
    const startPosition = die.mesh.position.clone();
    const endPosition = gridToWorld(nextRow, nextColumn);
    const startQuaternion = die.mesh.quaternion.clone();
    const turn = new THREE.Quaternion().setFromAxisAngle(direction.axis, direction.angle);
    const endQuaternion = turn.clone().multiply(startQuaternion);
    const startTime = performance.now();
    const duration = 280;

    await new Promise((resolve) => {
      const step = (now) => {
        const raw = Math.min(1, (now - startTime) / duration);
        const t = easeInOutCubic(raw);
        die.mesh.position.lerpVectors(startPosition, endPosition, t);
        die.mesh.position.y = DICE_Y + Math.sin(Math.PI * raw) * 0.26;
        die.mesh.quaternion.slerpQuaternions(startQuaternion, endQuaternion, t);
        this.player.position.set(die.mesh.position.x, PLAYER_Y + Math.sin(Math.PI * raw) * 0.18, die.mesh.position.z);
        this.player.rotation.z = Math.sin(Math.PI * raw) * (directionName === 'left' ? 0.12 : directionName === 'right' ? -0.12 : 0);
        if (raw < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    die.mesh.position.copy(endPosition);
    die.mesh.quaternion.copy(endQuaternion).normalize();
    die.row = nextRow;
    die.column = nextColumn;
    this.dice.delete(oldKey);
    this.dice.set(nextKey, die);
    this.activeKey = nextKey;
    this.player.position.set(endPosition.x, PLAYER_Y, endPosition.z);
    this.player.rotation.z = 0;
    this.faceDirection(directionName);

    this.rollCount += 1;
    this.callbacks.onRoll?.(this.rollCount);
    this.callbacks.onImpact?.();
    this.callbacks.onMessage?.('サイコロが隣のマスへ転がりました');
    this.busy = false;
    this.consumeQueue();
  }

  faceDirection(directionName) {
    const rotations = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
    this.player.rotation.y = rotations[directionName] ?? 0;
  }

  consumeQueue() {
    if (!this.queuedDirection) return;
    const queued = this.queuedDirection;
    this.queuedDirection = null;
    window.setTimeout(() => this.move(queued), 30);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    const aspect = width / height;
    const viewHeight = aspect < 0.9 ? 9.2 : 8.2;
    const viewWidth = viewHeight * aspect;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const elapsed = this.clock.getElapsedTime();
    if (!this.busy) {
      this.player.position.y = PLAYER_Y + Math.sin(elapsed * 4.2) * 0.025;
      this.player.rotation.x = Math.sin(elapsed * 3.2) * 0.018;
    }
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}
