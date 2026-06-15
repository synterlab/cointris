import { COLS, ROWS, TETROMINOES, WALL_KICKS, WALL_KICKS_I, PIECE_TYPES, LEVEL_SPEEDS, SCORE_TABLE, type PieceType } from './constants';

export interface Piece {
  type: PieceType;
  x: number;
  y: number;
  rotation: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  vy: number;
}

export interface GameState {
  board: (string | null)[][];
  current: Piece;
  next: Piece[];
  held: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  gameOver: boolean;
  paused: boolean;
  linesToClear: number[];
  clearAnimFrame: number;
  particles: Particle[];
  floatingTexts: FloatingText[];
  bag: PieceType[];
  stats: GameStats;
  perfectClear: boolean;
}

export interface GameStats {
  totalGames: number;
  linesCleared: number;
  highestLevel: number;
  totalPlayTime: number;
  bestScore: number;
  bestCombo: number;
}

function createBag(): PieceType[] {
  const bag = [...PIECE_TYPES] as PieceType[];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createEmptyBoard(): (string | null)[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function getNextPiece(bag: PieceType[]): { piece: Piece; newBag: PieceType[] } {
  let newBag = [...bag];
  if (newBag.length === 0) newBag = createBag();
  const type = newBag.shift()!;
  if (newBag.length < 5) newBag = [...newBag, ...createBag()];
  return { piece: { type, x: 3, y: 0, rotation: 0 }, newBag };
}

export function getShape(piece: Piece): number[][] {
  return TETROMINOES[piece.type][piece.rotation];
}

export function getCells(piece: Piece): { x: number; y: number }[] {
  const shape = getShape(piece);
  const cells: { x: number; y: number }[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (shape[r][c]) {
        cells.push({ x: piece.x + c, y: piece.y + r });
      }
    }
  }
  return cells;
}

export function isValidPosition(board: (string | null)[][], piece: Piece, dx = 0, dy = 0, dr = 0): boolean {
  const testPiece = { ...piece, x: piece.x + dx, y: piece.y + dy, rotation: (piece.rotation + dr + 4) % 4 };
  for (const cell of getCells(testPiece)) {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
    if (cell.y >= 0 && board[cell.y][cell.x] !== null) return false;
  }
  return true;
}

export function getGhostY(board: (string | null)[][], piece: Piece): number {
  let dy = 0;
  while (isValidPosition(board, piece, 0, dy + 1)) dy++;
  return piece.y + dy;
}

export function tryRotate(board: (string | null)[][], piece: Piece, dir: 1 | -1): Piece | null {
  const newRot = (piece.rotation + dir + 4) % 4;
  const key = `${piece.rotation}->${newRot}`;
  const kicks = piece.type === 'I' ? WALL_KICKS_I[key] : WALL_KICKS[key];
  if (!kicks) return null;
  for (const [kx, ky] of kicks) {
    const testPiece = { ...piece, rotation: newRot, x: piece.x + kx, y: piece.y - ky };
    if (isValidPosition(board, testPiece)) return testPiece;
  }
  return null;
}

export function lockPiece(board: (string | null)[][], piece: Piece): (string | null)[][] {
  const newBoard = board.map(row => [...row]);
  for (const cell of getCells(piece)) {
    if (cell.y >= 0) newBoard[cell.y][cell.x] = piece.type;
  }
  return newBoard;
}

export function clearLines(board: (string | null)[][]): { board: (string | null)[][]; cleared: number; lines: number[] } {
  const lines: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(c => c !== null)) lines.push(r);
  }
  if (lines.length === 0) return { board, cleared: 0, lines: [] };
  const newBoard = board.filter((_, r) => !lines.includes(r));
  while (newBoard.length < ROWS) newBoard.unshift(Array(COLS).fill(null));
  return { board: newBoard, cleared: lines.length, lines };
}

export function calcScore(cleared: number, level: number, combo: number, backToBack: boolean, perfectClear: boolean): number {
  if (cleared === 0) return 0;
  let base = SCORE_TABLE[cleared as keyof typeof SCORE_TABLE] || 0;
  base *= (level + 1);
  if (backToBack && cleared === 4) base = Math.floor(base * 1.5);
  if (perfectClear) base += 2000 * (level + 1);
  const comboBonus = Math.max(0, combo - 1) * 50;
  return base + comboBonus;
}

export function spawnPiece(type: PieceType): Piece {
  return { type, x: 3, y: -1, rotation: 0 };
}

export function createParticles(
  x: number, y: number, color: string, count = 8
): Particle[] {
  return Array.from({ length: count }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * -4 - 1,
    life: 1,
    maxLife: 0.6 + Math.random() * 0.8,
    color,
    size: 3 + Math.random() * 4,
  }));
}

export function createCoinParticles(board: (string | null)[][], clearRows: number[], cellSize: number, boardOffsetX: number, boardOffsetY: number): Particle[] {
  const particles: Particle[] = [];
  for (const row of clearRows) {
    for (let c = 0; c < COLS; c++) {
      const x = boardOffsetX + c * cellSize + cellSize / 2;
      const y = boardOffsetY + row * cellSize + cellSize / 2;
      particles.push(...createParticles(x, y, '#FFD84D', 3));
    }
  }
  return particles;
}

export function getDropInterval(level: number): number {
  return LEVEL_SPEEDS[Math.min(level, LEVEL_SPEEDS.length - 1)];
}

export function getLevelFromLines(lines: number): number {
  return Math.floor(lines / 10);
}

export function loadStats(): GameStats {
  try {
    const s = localStorage.getItem('cointris_stats');
    if (s) return JSON.parse(s);
  } catch {}
  return { totalGames: 0, linesCleared: 0, highestLevel: 0, totalPlayTime: 0, bestScore: 0, bestCombo: 0 };
}

export function saveStats(stats: GameStats): void {
  try {
    localStorage.setItem('cointris_stats', JSON.stringify(stats));
  } catch {}
}

export function loadHighScore(): number {
  try {
    return parseInt(localStorage.getItem('cointris_hiscore') || '0', 10);
  } catch { return 0; }
}

export function saveHighScore(score: number): void {
  try {
    localStorage.setItem('cointris_hiscore', String(score));
  } catch {}
}

export function loadTheme(): string {
  try {
    return localStorage.getItem('cointris_theme') || 'classic-green';
  } catch { return 'classic-green'; }
}

export function saveTheme(theme: string): void {
  try {
    localStorage.setItem('cointris_theme', theme);
  } catch {}
}

export function loadUnlocked(): string[] {
  try {
    const s = localStorage.getItem('cointris_unlocked');
    if (s) return JSON.parse(s);
  } catch {}
  return ['classic-green'];
}

export function saveUnlocked(themes: string[]): void {
  try {
    localStorage.setItem('cointris_unlocked', JSON.stringify(themes));
  } catch {}
}
