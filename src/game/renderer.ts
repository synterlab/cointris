import { COLS, ROWS, COIN_COLORS, COIN_LABELS, COLORS, type ThemeKey } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

const CELL = 30;

export function getCellSize(canvas: HTMLCanvasElement): number {
  const maxH = canvas.height * 0.88;
  const maxW = canvas.width * 0.48;
  return Math.floor(Math.min(maxH / ROWS, maxW / COLS, 34));
}

export function getBoardOffset(canvas: HTMLCanvasElement, cell: number): { bx: number; by: number } {
  const bw = cell * COLS;
  const bh = cell * ROWS;
  const bx = Math.floor(canvas.width * 0.5 - bw * 0.5);
  const by = Math.floor((canvas.height - bh) / 2);
  return { bx, by };
}

function drawPixelCoin(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  color: string, label: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = size * 0.42;
  const cx = x + size / 2;
  const cy = y + size / 2;

  // Shadow
  ctx.beginPath();
  ctx.arc(cx + 1, cy + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  // Coin body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fill();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = `bold ${Math.max(8, Math.floor(size * 0.3))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 0.5);

  ctx.restore();
}

export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  type: string | null, themeColors: Record<string, string>,
  alpha = 1
): void {
  if (!type) return;
  const px = x;
  const py = y;

  // Cell border
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = themeColors[type] || COIN_COLORS[type] || '#888';
  // Slightly smaller than cell to show grid
  const pad = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.roundRect(px + pad, py + pad, size - pad * 2, size - pad * 2, 3);
  ctx.fill();
  ctx.restore();

  drawPixelCoin(ctx, px + pad, py + pad, size - pad * 2, themeColors[type] || COIN_COLORS[type] || '#888', COIN_LABELS[type] || '?', alpha);
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  bx: number, by: number, cellSize: number,
  themeColors: Record<string, string>,
  flashRows: number[], flashFrame: number
): void {
  // Board background
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(bx, by, cellSize * COLS, cellSize * ROWS);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(bx + c * cellSize, by);
    ctx.lineTo(bx + c * cellSize, by + ROWS * cellSize);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(bx, by + r * cellSize);
    ctx.lineTo(bx + COLS * cellSize, by + r * cellSize);
    ctx.stroke();
  }

  // Board cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const isFlash = flashRows.includes(r);
        const alpha = isFlash ? (flashFrame % 2 === 0 ? 1 : 0.3) : 1;
        drawCell(ctx, bx + c * cellSize, by + r * cellSize, cellSize, board[r][c], themeColors, alpha);
      }
    }
  }

  // Board border
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 1, by - 1, cellSize * COLS + 2, cellSize * ROWS + 2);
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  piece: Piece,
  bx: number, by: number, cellSize: number
): void {
  const ghostY = getGhostY(board, piece);
  if (ghostY === piece.y) return;
  const color = COIN_COLORS[piece.type] || '#888';
  const cells = getCells({ ...piece, y: ghostY });
  for (const cell of cells) {
    if (cell.y < 0) continue;
    const px = bx + cell.x * cellSize;
    const py = by + cell.y * cellSize;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    const pad = Math.max(1, cellSize * 0.04);
    ctx.beginPath();
    ctx.roundRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 3);
    ctx.fill();
    // Ghost coin outline
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  bx: number, by: number, cellSize: number,
  themeColors: Record<string, string>
): void {
  for (const cell of getCells(piece)) {
    if (cell.y < 0) continue;
    drawCell(ctx, bx + cell.x * cellSize, by + cell.y * cellSize, cellSize, piece.type, themeColors);
  }
}

export function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: string | null,
  cx: number, cy: number, size: number,
  themeColors: Record<string, string>
): void {
  if (!type) return;
  const shape = getShape({ type: type as any, x: 0, y: 0, rotation: 0 });
  const miniCell = size;
  // Find bounding box
  let minC = 4, maxC = 0, minR = 4, maxR = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (shape[r][c]) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
  }
  const pw = (maxC - minC + 1) * miniCell;
  const ph = (maxR - minR + 1) * miniCell;
  const ox = cx - pw / 2;
  const oy = cy - ph / 2;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (shape[r][c]) {
        drawCell(ctx, ox + (c - minC) * miniCell, oy + (r - minR) * miniCell, miniCell, type, themeColors);
      }
    }
  }
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dt: number
): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += 0.15 * dt * 60;
    if (p.life > 0) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      alive.push(p);
    }
  }
  return alive;
}

export function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  texts: FloatingText[],
  dt: number
): FloatingText[] {
  const alive: FloatingText[] = [];
  for (const t of texts) {
    t.life -= dt;
    t.y += t.vy * dt * 60;
    if (t.life > 0) {
      const alpha = Math.min(1, t.life / (t.maxLife * 0.4));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
      alive.push(t);
    }
  }
  return alive;
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number): void {
  // Deep background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.03;
  for (let y = 0; y < h; y += 3) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}

export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number,
  boardW: number, boardH: number,
  score: number, hiScore: number,
  level: number, lines: number,
  combo: number,
  nextPieces: (string | null)[],
  held: string | null,
  canHold: boolean,
  themeColors: Record<string, string>,
  canvasW: number
): void {
  const panelFont = '12px monospace';
  const labelFont = 'bold 11px monospace';
  const valueFont = 'bold 18px monospace';

  // LEFT PANEL
  const lx = Math.max(4, bx - 130);
  const pw = bx - lx - 8;

  function drawPanel(x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#16161D';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawLabel(text: string, x: number, y: number, color = COLORS.muted): void {
    ctx.fillStyle = color;
    ctx.font = labelFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function drawValue(text: string, x: number, y: number, color = COLORS.text, align: CanvasTextAlign = 'left'): void {
    ctx.fillStyle = color;
    ctx.font = valueFont;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  // Score panel
  drawPanel(lx, by, pw, 72);
  drawLabel('SCORE', lx + 8, by + 8);
  drawValue(score.toLocaleString(), lx + pw / 2, by + 24, COLORS.gold, 'center');
  drawLabel('BEST', lx + 8, by + 50);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(hiScore.toLocaleString(), lx + 38, by + 51);

  // Level & Lines panel
  drawPanel(lx, by + 80, pw, 64);
  drawLabel('LEVEL', lx + 8, by + 88);
  drawValue(String(level + 1), lx + pw / 2, by + 102, COLORS.accent, 'center');
  drawLabel('LINES', lx + 8, by + 126);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(lines), lx + 40, by + 127);

  // Combo panel
  if (combo > 1) {
    drawPanel(lx, by + 152, pw, 48);
    drawLabel('COMBO', lx + 8, by + 160);
    drawValue(`×${combo}`, lx + pw / 2, by + 174, '#FF6BFF', 'center');
  }

  // Hold panel
  const holdY = by + 208;
  drawPanel(lx, holdY, pw, 72);
  drawLabel('HOLD', lx + 8, holdY + 8);
  if (held) {
    ctx.save();
    if (!canHold) ctx.globalAlpha = 0.4;
    drawMiniPiece(ctx, held, lx + pw / 2, holdY + 44, 10, themeColors);
    ctx.restore();
  }

  // RIGHT PANEL - Next pieces
  const rx = bx + boardW + 8;
  const rpw = Math.min(120, canvasW - rx - 4);

  drawPanel(rx, by, rpw, 200);
  drawLabel('NEXT', rx + 8, by + 8);
  for (let i = 0; i < Math.min(3, nextPieces.length); i++) {
    const ny = by + 28 + i * 58;
    drawMiniPiece(ctx, nextPieces[i] || null, rx + rpw / 2, ny + 22, i === 0 ? 12 : 9, themeColors);
  }
}
