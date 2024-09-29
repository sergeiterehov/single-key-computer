const cols = 8;
const rows = 8;

function createGrid(): number[][] {
  return new Array(rows).fill(null).map(() => new Array(cols).fill(0));
}

function randomGrid(): number[][] {
  return new Array(rows).fill(null).map(() => new Array(cols).fill(null).map(() => Math.floor(Math.random() * 2)));
}

let grid = randomGrid();

function nextGeneration(grid: number[][]): number[][] {
  const nextGen = createGrid();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const numNeighbors = countNeighbors(grid, row, col);

      if (cell === 1 && (numNeighbors < 2 || numNeighbors > 3)) {
        nextGen[row][col] = 0;
      } else if (cell === 0 && numNeighbors === 3) {
        nextGen[row][col] = 1;
      } else {
        nextGen[row][col] = cell;
      }
    }
  }

  return nextGen;
}

function countNeighbors(grid: number[][], row: number, col: number): number {
  let count = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const x = row + i;
      const y = col + j;

      if (x >= 0 && x < rows && y >= 0 && y < cols) {
        count += grid[x]?.[y] || 0;
      }
    }
  }
  return count;
}

let timer = Date.now();

export const lifeContext = {
  onDraw: (_grid: number[][]) => {},

  randomize() {
    grid = randomGrid();
  },
};

function update() {
  const now = Date.now();

  if (now - timer >= 100) {
    timer = now;

    grid = nextGeneration(grid);
    lifeContext.onDraw(grid);
  }

  requestAnimationFrame(update);
}

lifeContext.onDraw(grid);
requestAnimationFrame(update);
