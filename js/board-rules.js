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
    && (die.state === 'normal' || die.state === 'sinking')
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
      additions,
      isChain: members.some((die) => die.state === 'sinking')
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

export function selectSpawnCandidate(candidates, random = Math.random) {
  if (candidates.length === 0) return null;
  const raw = Number(random());
  const normalized = Number.isFinite(raw)
    ? Math.min(1 - Number.EPSILON, Math.max(0, raw))
    : 0;
  return candidates[Math.floor(normalized * candidates.length)];
}

export function planFloorPush(diceByKey, boardSize, die, direction) {
  if (!die || die.state !== 'normal') {
    return { allowed: false, reason: 'not-pushable' };
  }

  const destinationRow = die.row + direction.row;
  const destinationColumn = die.column + direction.column;
  if (!isInsideBoard(destinationRow, destinationColumn, boardSize)) {
    return { allowed: false, reason: 'edge' };
  }

  const destinationKey = boardKey(destinationRow, destinationColumn);
  if (diceByKey.has(destinationKey)) {
    return { allowed: false, reason: 'occupied' };
  }

  return {
    allowed: true,
    fromKey: boardKey(die.row, die.column),
    fromRow: die.row,
    fromColumn: die.column,
    destinationKey,
    destinationRow,
    destinationColumn
  };
}
