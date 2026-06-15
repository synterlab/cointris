import { COLS, ROWS, COIN_COLORS, COIN_LABELS, COLORS } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

export function getCellSize(canvas: HTMLCanvasElement): number {
  const w = canvas.offsetWidth || canvas.width / window.devicePixelRatio;
  const h = canvas.offsetHeight || canvas.height / window.devicePixelRatio;
  const maxH = h * 0.90;
  const maxW = w * 0.50;
  return Math.floor(Math.min(maxH / ROWS, maxW / COLS, 32));
}

export function getBoardOffset(canvas: HTMLCanvasElement, cell: number): { bx: number; by: number } {
  const w = canvas.offsetWidth || canvas.width / window.devicePixelRatio;
  const h = canvas.offsetHeight || canvas.height / window.devicePixelRatio;
  const bw = cell * COLS;
  const bh = cell * ROWS;
  const bx = Math.floor(w * 0.5 - bw * 0.5);
  const by = Math.floor((h - bh) / 2);
  return { bx, by };
}

// Rich metallic coin cell
export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  type: string | null,
  themeColors: Record<string, string>,
  alpha = 1,
  glow = false
): void {
  if (!type) return;
  const base = themeColors[type] || COIN_COLORS[type] || '#888';
  const pad = Math.max(1, Math.floor(size * 0.06));
  const inner = size - pad * 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = inner * 0.46;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Cell background (subtle square)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, inner, inner, 3);
  ctx.fill();

  // Glow effect for newly placed / active piece
  if (glow) {
    ctx.shadowColor = base;
    ctx.shadowBlur = 12;
  }

  // Coin shadow
  ctx.beginPath();
  ctx.arc(cx + 1.5, cy + 2.5, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Metallic coin base — radial gradient
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  grad.addColorStop(0, lighten(base, 0.45));
  grad.addColorStop(0.4, base);
  grad.addColorStop(0.85, darken(base, 0.3));
  grad.addColorStop(1, darken(base, 0.5));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner ring (embossed rim)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Primary highlight — upper-left glare
  const hgrad = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.2, cy - r * 0.2, r * 0.55);
  hgrad.addColorStop(0, 'rgba(255,255,255,0.72)');
  hgrad.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  hgrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hgrad;
  ctx.fill();

  // Bottom edge shadow (gives 3D coin depth)
  const sgrad = ctx.createRadialGradient(cx, cy + r * 0.5, 0, cx, cy, r);
  sgrad.addColorStop(0, 'rgba(0,0,0,0)');
  sgrad.addColorStop(0.7, 'rgba(0,0,0,0)');
  sgrad.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = sgrad;
  ctx.fill();

  // Coin label
  const fontSize = Math.max(7, Math.floor(r * 0.72));
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.font = `900 ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(COIN_LABELS[type] || '?', cx + 0.5, cy + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(COIN_LABELS[type] || '?', cx, cy);

  ctx.restore();
}

function lighten(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+255*amt)|0},${Math.min(255,g+255*amt)|0},${Math.min(255,b+255*amt)|0})`;
}
function darken(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-255*amt)|0},${Math.max(0,g-255*amt)|0},${Math.max(0,b-255*amt)|0})`;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  bx: number, by: number, cellSize: number,
  themeColors: Record<string, string>,
  flashRows: number[], flashFrame: number
): void {
  const bw = cellSize * COLS;
  const bh = cellSize * ROWS;

  // Board glow halo
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.restore();

  // Board surface
  const bgGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
  bgGrad.addColorStop(0, '#1C1C24');
  bgGrad.addColorStop(1, '#14141A');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(bx, by, bw, bh);

  // Subtle grid
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(bx + c * cellSize, by);
    ctx.lineTo(bx + c * cellSize, by + bh);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(bx, by + r * cellSize);
    ctx.lineTo(bx + bw, by + r * cellSize);
    ctx.stroke();
  }
  ctx.restore();

  // Cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const isFlash = flashRows.includes(r);
        if (isFlash && flashFrame % 2 === 1) {
          // Bright flash on clear
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(bx + c * cellSize + 1, by + r * cellSize + 1, cellSize - 2, cellSize - 2);
        } else {
          const alpha = isFlash ? 0.6 : 1;
          drawCell(ctx, bx + c * cellSize, by + r * cellSize, cellSize, board[r][c], themeColors, alpha);
        }
      }
    }
  }

  // Vignette overlay on board edges
  const vgH = ctx.createLinearGradient(bx, by, bx, by + bh);
  vgH.addColorStop(0, 'rgba(0,0,0,0.18)');
  vgH.addColorStop(0.12, 'rgba(0,0,0,0)');
  vgH.addColorStop(0.88, 'rgba(0,0,0,0)');
  vgH.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vgH;
  ctx.fillRect(bx, by, bw, bh);

  // Corner accents
  const accentLen = 12;
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 8;
  const corners = [
    [bx - 1, by - 1, 1, 0, 0, 1],
    [bx + bw + 1, by - 1, -1, 0, 0, 1],
    [bx - 1, by + bh + 1, 1, 0, 0, -1],
    [bx + bw + 1, by + bh + 1, -1, 0, 0, -1],
  ] as const;
  for (const [ox, oy, hx, hy, vx, vy] of corners) {
    ctx.beginPath();
    ctx.moveTo(ox + hx * accentLen, oy);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox, oy + vy * accentLen);
    ctx.stroke();
  }
  ctx.restore();
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
    const px = bx + cell.x * cellSize + 1;
    const py = by + cell.y * cellSize + 1;
    const s = cellSize - 2;
    ctx.save();
    // Dashed coin outline
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  bx: number, by: number, cellSize: number,
  themeColors: Record<string, string>,
  glow = false
): void {
  for (const cell of getCells(piece)) {
    if (cell.y < 0) continue;
    drawCell(ctx, bx + cell.x * cellSize, by + cell.y * cellSize, cellSize, piece.type, themeColors, 1, glow);
  }
}

export function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: string | null,
  cx: number, cy: number, cellSize: number,
  themeColors: Record<string, string>
): void {
  if (!type) return;
  const shape = getShape({ type: type as any, x: 0, y: 0, rotation: 0 });
  let minC = 4, maxC = 0, minR = 4, maxR = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (shape[r][c]) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
  }
  const pw = (maxC - minC + 1) * cellSize;
  const ph = (maxR - minR + 1) * cellSize;
  const ox = cx - pw / 2;
  const oy = cy - ph / 2;
  for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
    if (shape[r][c]) drawCell(ctx, ox + (c - minC) * cellSize, oy + (r - minR) * cellSize, cellSize, type, themeColors);
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
    p.vy += 0.18 * dt * 60;
    if (p.life > 0) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
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
      const progress = t.life / t.maxLife;
      const alpha = progress < 0.3 ? progress / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 16;
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Stroke for readability
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
      alive.push(t);
    }
  }
  return alive;
}

let bgCanvas: OffscreenCanvas | null = null;
let bgCtx: OffscreenCanvasRenderingContext2D | null = null;
let bgW = 0, bgH = 0;

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  // Solid dark base
  ctx.fillStyle = '#0B0B10';
  ctx.fillRect(0, 0, w, h);

  // Animated pixel grid
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = '#6DFF8B';
  ctx.lineWidth = 0.5;
  const gridSize = 24;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1.5);
  }
  ctx.restore();

  // CRT vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
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
  canvasW: number, canvasH: number
): void {
  const RIGHT_PAD = 6;
  const LEFT_PAD = 6;

  // Left panel
  const lw = Math.max(100, bx - LEFT_PAD * 2 - 6);
  const lx = bx - lw - LEFT_PAD;
  if (lw < 80) return; // too narrow

  // Right panel
  const rx = bx + boardW + RIGHT_PAD;
  const rw = Math.min(130, canvasW - rx - RIGHT_PAD);

  function panel(x: number, y: number, w: number, h: number, accent = false): void {
    // Panel shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    // Panel background
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#1E1E28');
    grad.addColorStop(1, '#18181F');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Border
    ctx.strokeStyle = accent ? `${COLORS.accent}55` : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function label(text: string, x: number, y: number, color = COLORS.muted): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '600 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '1px';
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
  }

  function bigNum(text: string, x: number, y: number, color = COLORS.text, size = 20): void {
    ctx.save();
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function smallText(text: string, x: number, y: number, color = COLORS.muted, align: CanvasTextAlign = 'left'): void {
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── LEFT PANELS ──────────────────────────────────────────────────
  let ly = by;

  // Score panel
  panel(lx, ly, lw, 70, true);
  label('Score', lx + 8, ly + 8);
  bigNum(score.toLocaleString(), lx + lw / 2, ly + 22, COLORS.gold, Math.min(22, lw / 5));
  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(lx + 8, ly + 50, lw - 16, 1);
  label('Best', lx + 8, ly + 55, COLORS.muted);
  smallText(hiScore.toLocaleString(), lx + lw - 8, ly + 55, COLORS.muted, 'right');
  ly += 78;

  // Level + Lines panel
  panel(lx, ly, lw, 66);
  const half = (lw - 4) / 2;
  label('Level', lx + 8, ly + 8);
  bigNum(String(level + 1), lx + half / 2, ly + 22, COLORS.accent, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(lx + half, ly + 8, 1, 50);
  label('Lines', lx + half + 8, ly + 8);
  bigNum(String(lines), lx + half + half / 2, ly + 22, COLORS.text, 20);

  // Progress to next level
  const linesInLevel = lines % 10;
  const progress = linesInLevel / 10;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(lx + 8, ly + 54, lw - 16, 5, 3);
  ctx.fill();
  if (progress > 0) {
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 6;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.roundRect(lx + 8, ly + 54, (lw - 16) * progress, 5, 3);
    ctx.fill();
    ctx.restore();
  }
  ly += 74;

  // Combo panel (always show, dim when 0)
  panel(lx, ly, lw, 46);
  label('Combo', lx + 8, ly + 7);
  if (combo > 1) {
    ctx.save();
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FF6BFF';
    ctx.shadowColor = '#FF6BFF';
    ctx.shadowBlur = 12;
    ctx.textBaseline = 'top';
    ctx.fillText(`×${combo}`, lx + lw / 2, ly + 20);
    ctx.restore();
  } else {
    smallText('—', lx + lw / 2, ly + 22, 'rgba(255,255,255,0.15)', 'center' as any);
  }
  ly += 54;

  // Hold panel
  panel(lx, ly, lw, 72);
  label('Hold', lx + 8, ly + 8);
  if (held) {
    ctx.save();
    if (!canHold) ctx.globalAlpha = 0.35;
    drawMiniPiece(ctx, held, lx + lw / 2, ly + 46, 11, themeColors);
    ctx.restore();
  } else {
    smallText('—', lx + lw / 2, ly + 40, 'rgba(255,255,255,0.12)', 'center' as any);
  }

  // ── RIGHT PANELS ─────────────────────────────────────────────────
  if (rw < 80) return;

  // Next pieces panel
  panel(rx, by, rw, Math.min(boardH, 215));
  label('Next', rx + 8, by + 8);

  const nextSlots = [
    { cy: by + 46, cs: 12, dim: false },
    { cy: by + 112, cs: 10, dim: true },
    { cy: by + 170, cs: 9, dim: true },
  ];
  for (let i = 0; i < Math.min(3, nextPieces.length); i++) {
    const slot = nextSlots[i];
    ctx.save();
    if (slot.dim) ctx.globalAlpha = 0.6;
    drawMiniPiece(ctx, nextPieces[i] || null, rx + rw / 2, slot.cy, slot.cs, themeColors);
    ctx.restore();
    if (i < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(rx + 8, by + 80 + i * 60, rw - 16, 1);
    }
  }
}
