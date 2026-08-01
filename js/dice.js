const ORIENTATIONS = [
  { top: 1, bottom: 6, front: 2, back: 5, left: 3, right: 4 },
  { top: 2, bottom: 5, front: 6, back: 1, left: 3, right: 4 },
  { top: 3, bottom: 4, front: 2, back: 5, left: 6, right: 1 },
  { top: 4, bottom: 3, front: 2, back: 5, left: 1, right: 6 },
  { top: 5, bottom: 2, front: 1, back: 6, left: 3, right: 4 },
  { top: 6, bottom: 1, front: 5, back: 2, left: 3, right: 4 }
];

export class Dice {
  constructor(id, row, column, orientation = Dice.randomOrientation()) {
    this.id = id;
    this.row = row;
    this.column = column;
    this.state = 'normal';
    Object.assign(this, orientation);
  }

  static randomOrientation() {
    const base = ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)];
    const dice = { ...base };
    const turns = Math.floor(Math.random() * 4);
    for (let index = 0; index < turns; index += 1) {
      Dice.rotateValues(dice, 'right');
    }
    return dice;
  }

  static rotateValues(target, direction) {
    const { top, bottom, front, back, left, right } = target;

    switch (direction) {
      case 'up':
        Object.assign(target, {
          top: front,
          bottom: back,
          front: bottom,
          back: top,
          left,
          right
        });
        break;
      case 'down':
        Object.assign(target, {
          top: back,
          bottom: front,
          front: top,
          back: bottom,
          left,
          right
        });
        break;
      case 'left':
        Object.assign(target, {
          top: right,
          bottom: left,
          left: top,
          right: bottom,
          front,
          back
        });
        break;
      case 'right':
        Object.assign(target, {
          top: left,
          bottom: right,
          left: bottom,
          right: top,
          front,
          back
        });
        break;
      default:
        throw new Error(`Unknown direction: ${direction}`);
    }
  }

  roll(direction, nextRow, nextColumn) {
    Dice.rotateValues(this, direction);
    this.row = nextRow;
    this.column = nextColumn;
  }
}
