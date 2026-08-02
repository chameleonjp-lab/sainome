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
  return die && die.state !== 'cleared' && die.top >= 2;
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
