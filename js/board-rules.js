export const CARDINAL_DIRECTIONS = Object.freeze([
  Object.freeze({ row: -1, column: 0 }),
  Object.freeze({ row: 1, column: 0 }),
  Object.freeze({ row: 0, column: -1 }),
  Object.freeze({ row: 0, column: 1 })
]);

export function boardKey(row, column) {
  return `${row},${column}`;
}

export function isInsideBoard(row, column, boardSize) {
  return row >= 0 && row < boardSize && column >= 0 && column < boardSize;
}

function isMatchable(die) {
  return die
    && die.state === 'normal'
    && die.top >= 2;
}

export function findTriggeredGroups(diceByKey, boardSize) {
  const visited = new Set();
  const triggered = [];

  for (const [startKey, start] of diceByKey) {
    if (visited.has(startKey) || !isMatchable(start)) continue;

    const members = [];
    const queue = [start];
    visited.add(startKey);

    while (queue.length > 0) {
      const die = queue.shift();
      members.push(die);

      for (const delta of CARDINAL_DIRECTIONS) {
        const row = die.row + delta.row;
        const column = die.column + delta.column;
        if (!isInsideBoard(row, column, boardSize)) continue;

        const key = boardKey(row, column);
        const neighbor = diceByKey.get(key);
        if (
          visited.has(key)
          || !isMatchable(neighbor)
          || neighbor.top !== start.top
        ) continue;

        visited.add(key);
        queue.push(neighbor);
      }
    }

    const additions = members.filter((die) => die.state === 'normal');
    if (members.length < start.top || additions.length === 0) continue;

    triggered.push({
      value: start.top,
      members,
      additions
    });
  }

  return triggered;
}

export function findSpecialOneClear(diceByKey, boardSize, protectedDieId = null) {
  const ones = [...diceByKey.values()].filter(
    (die) => die.state === 'normal' && die.top === 1
  );

  const trigger = ones.find((die) => CARDINAL_DIRECTIONS.some((delta) => {
    const row = die.row + delta.row;
    const column = die.column + delta.column;
    if (!isInsideBoard(row, column, boardSize)) return false;
    return diceByKey.get(boardKey(row, column))?.state === 'sinking';
  }));

  if (!trigger) return null;

  return {
    trigger,
    members: ones.filter((die) => die.id !== protectedDieId),
    protected: ones.find((die) => die.id === protectedDieId) ?? null
  };
}

export function listSpawnCandidates(diceByKey, boardSize, excludedKeys = new Set()) {
  const candidates = [];

  for (let row = 0; row < boardSize; row += 1) {
    for (let column = 0; column < boardSize; column += 1) {
      const key = boardKey(row, column);
      if (diceByKey.has(key) || excludedKeys.has(key)) continue;
      candidates.push({ row, column, key });
    }
  }

  return candidates;
}

export function listPlayerSafeSpawnCandidates(
  diceByKey,
  boardSize,
  playerRow,
  playerColumn
) {
  const protectedKeys = new Set([boardKey(playerRow, playerColumn)]);
  for (const delta of CARDINAL_DIRECTIONS) {
    const row = playerRow + delta.row;
    const column = playerColumn + delta.column;
    if (isInsideBoard(row, column, boardSize)) {
      protectedKeys.add(boardKey(row, column));
    }
  }
  return listSpawnCandidates(diceByKey, boardSize, protectedKeys);
}

export function selectSpawnCandidate(candidates, random = Math.random) {
  if (candidates.length === 0) return null;
  const raw = Number(random());
  const normalized = Number.isFinite(raw)
    ? Math.min(1 - Number.EPSILON, Math.max(0, raw))
    : 0;
  return candidates[Math.floor(normalized * candidates.length)];
}

export function selectSpawnBatch(candidates, count, random = Math.random) {
  if (!Array.isArray(candidates) || !Number.isInteger(count) || count < 1) {
    return [];
  }

  const remaining = [...candidates];
  const selected = [];
  while (remaining.length > 0 && selected.length < count) {
    const candidate = selectSpawnCandidate(remaining, random);
    selected.push(candidate);
    remaining.splice(remaining.indexOf(candidate), 1);
  }
  return selected;
}

export function selectBuriedRescue(
  completedDice,
  playerRow,
  playerColumn,
  preferredDieId = null
) {
  if (!Array.isArray(completedDice) || completedDice.length === 0) return null;

  const preferred = preferredDieId
    ? completedDice.find((die) => die.id === preferredDieId)
    : null;
  if (preferred) return preferred;

  return completedDice.reduce((nearest, die) => {
    const nearestDistance = Math.abs(nearest.row - playerRow)
      + Math.abs(nearest.column - playerColumn);
    const dieDistance = Math.abs(die.row - playerRow)
      + Math.abs(die.column - playerColumn);
    return dieDistance < nearestDistance ? die : nearest;
  });
}

export function getFloorApproachAction(targetDie, targetHeight = Infinity) {
  if (!targetDie) return 'walk';
  if (targetDie.state === 'normal' || targetDie.state === 'buried') {
    return 'climb';
  }
  if (
    (targetDie.state === 'sinking' || targetDie.state === 'rising')
    && Number.isFinite(targetHeight)
    && targetHeight <= 0.30
  ) {
    return 'climb';
  }
  return 'blocked';
}
