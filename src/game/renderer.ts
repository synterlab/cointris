import { COLS, ROWS, COIN_COLORS, COIN_LABELS } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

// ── Coin palette: flat pixel-art style, no gradients ──────────────────────
const COIN_PAL: Record<string, { base:string; hi:string; sh:string; rim:string }> = {
  I: { base:'#ffd84d', hi:'#fff5a8', sh:'#8a6400', rim:'#120e00' }, // Gold
  O: { base:'#bcc0cc', hi:'#e8ecf8', sh:'#50545e', rim:'#0c0c12' }, // Silver
  T: { base:'#e83048', hi:'#ff8898', sh:'#7a0018', rim:'#180008' }, // Ruby
  S: { base:'#28c858', hi:'#88ffa0', sh:'#006028', rim:'#001808' }, // Emerald
  Z: { base:'#c038c8', hi:'#f080f8', sh:'#580864', rim:'#140014' }, // Plasma
  J: { base:'#28b0e8', hi:'#88e8ff', sh:'#00608a', rim:'#001820' }, // Diamond
  L: { base:'#f07030', hi:'#ffb878', sh:'#803010', rim:'#180808' }, // Nova
};

const TAU = Math.PI * 2;

// ── Layout ─────────────────────────────────────────────────────────────────
export interface Layout {
  cs: number;   // cell size px
  bx: number;   // board left
  by: number;   // board top
  pw: number;   // panel width
  px: number;   // panel x (right side or right of board)
  isMobile: boolean;
  touchH: number;
}

export function getLayout(canvas: HTMLCanvasElement): Layout {
  const W = canvas.clientWidth  || 390;
  const H = canvas.clientHeight || 780;
  const isMobile = W < 700;
  const dpr = window.devicePixelRatio || 1;

  if (isMobile) {
    const TOUCH_H = 96;
    const PANEL_W = 80;
    const PAD = 4;
    const availW = W - PANEL_W - PAD * 3;
    const availH = H - TOUCH_H - PAD * 2 - 8;
    const cs = Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    const boardW = cs * COLS;
    const boardH = cs * ROWS;
    const bx = PAD + Math.max(0, Math.floor((availW - boardW) / 2));
    const by = PAD + 8 + Math.max(0, Math.floor((availH - boardH) / 2));
    const px = bx + boardW + PAD;
    return { cs, bx, by, pw: W - px - PAD, px, isMobile, touchH: TOUCH_H };
  }

  // Desktop
  const PANEL_W = 120;
  const PAD = 18;
  const availH = H - PAD * 2;
  const availW = W - PANEL_W * 2 - PAD * 4;
  const cs = Math.max(18, Math.floor(Math.min(availH / ROWS, availW / COLS)));
  const boardW = cs * COLS;
  const boardH = cs * ROWS;
  const bx = Math.floor((W - boardW) / 2);
  const by = Math.floor((H - boardH) / 2);
  return { cs, bx, by, pw: PANEL_W, px: bx + boardW + PAD, isMobile, touchH: 0 };
}

// Legacy shims
export function getCellSize(canvas: HTMLCanvasElement): number { return getLayout(canvas).cs; }
export function getBoardOffset(canvas: HTMLCanvasElement, _cs: number): { bx: number; by: number } {
  const l = getLayout(canvas); return { bx: l.bx, by: l.by };
}

// ── Background ─────────────────────────────────────────────────────────────
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Very simple, deliberate background — no aurora soup
  ctx.fillStyle = '#0a0916';
  ctx.fillRect(0, 0, w, h);

  // Barely-visible dot grid for depth
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  const gs = 20;
  for (let x = gs; x < w; x += gs)
    for (let y = gs; y < h; y += gs) {
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    }

  // Subtle vignette
  const vg = ctx.createRadialGradient(w/2, h/2, h * 0.1, w/2, h/2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ── Coin cell ──────────────────────────────────────────────────────────────
export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, cs: number,
  type: string | null,
  _themeColors: Record<string, string>,
  alpha = 1,
  glow = false,
): void {
  if (!type) return;
  const p = COIN_PAL[type];
  if (!p) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = Math.max(1, cs * 0.055);
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const r  = (cs / 2) - pad;

  // ─ Outline ─
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, TAU);
  ctx.fillStyle = p.rim;
  ctx.fill();

  // ─ Base fill ─
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = p.base;
  ctx.fill();

  // ─ Shadow half (bottom-right pie) ─
  ctx.save();
  ctx.globalAlpha *= 0.58;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, Math.PI * 0.3, Math.PI * 1.3);
  ctx.closePath();
  ctx.fillStyle = p.sh;
  ctx.fill();
  ctx.restore();

  // ─ Highlight half (top-left pie) ─
  ctx.save();
  ctx.globalAlpha *= 0.42;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, Math.PI * 1.3, Math.PI * 0.3, true);
  ctx.closePath();
  ctx.fillStyle = p.hi;
  ctx.fill();
  ctx.restore();

  // ─ Inner ring ─
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.76, 0, TAU);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // ─ Specular dot ─
  const dr = Math.max(2, r * 0.17);
  ctx.beginPath();
  ctx.arc(cx - r * 0.31, cy - r * 0.31, dr, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill();

  // ─ Glow ─
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = p.base;
    ctx.shadowBlur = cs * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = p.base;
    ctx.fill();
    ctx.restore();
  }

  // ─ Label ─
  const fs = Math.max(6, Math.floor(r * 0.6));
  ctx.font = `bold ${fs}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillText(COIN_LABELS[type] || '?', cx + 0.6, cy + 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.fillText(COIN_LABELS[type] || '?', cx, cy);

  ctx.restore();
}

// ── Mini piece for panels ──────────────────────────────────────────────────
export function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: string | null,
  cx: number, cy: number, cellSize: number,
  themeColors: Record<string, string>,
  alpha = 1,
): void {
  if (!type) return;
  const shape = getShape({ type: type as any, x: 0, y: 0, rotation: 0 });
  let minC = 4, maxC = 0, minR = 4, maxR = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (shape[r][c]) {
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      }
  const pw = (maxC - minC + 1) * cellSize;
  const ph = (maxR - minR + 1) * cellSize;
  const ox = cx - pw / 2, oy = cy - ph / 2;
  for (let r = minR; r <= maxR; r++)
    for (let c = minC; c <= maxC; c++)
      if (shape[r][c])
        drawCell(ctx, ox + (c - minC) * cellSize, oy + (r - minR) * cellSize, cellSize, type, themeColors, alpha);
}

// ── Board ──────────────────────────────────────────────────────────────────
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  bx: number, by: number, cs: number,
  themeColors: Record<string, string>,
  flashRows: number[], flashFrame: number,
): void {
  const bw = cs * COLS, bh = cs * ROWS;

  // Board background
  ctx.fillStyle = '#0e0c1a';
  ctx.fillRect(bx, by, bw, bh);

  // Subtle grid lines
  ctx.strokeStyle = '#1a1828';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath(); ctx.moveTo(bx + c * cs, by); ctx.lineTo(bx + c * cs, by + bh); ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(bx, by + r * cs); ctx.lineTo(bx + bw, by + r * cs); ctx.stroke();
  }

  // Cells
  for (let r = 0; r < ROWS; r++) {
    const flash = flashRows.includes(r);
    for (let c = 0; c < COLS; c++) {
      if (!board[r][c]) continue;
      if (flash && flashFrame % 2 === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + c * cs + 1, by + r * cs + 1, cs - 2, cs - 2);
      } else {
        drawCell(ctx, bx + c * cs, by + r * cs, cs, board[r][c], themeColors, flash ? 0.6 : 1);
      }
    }
  }

  // Board border — chunky, 3px double-rule
  ctx.strokeStyle = '#2e2c40';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
  ctx.strokeStyle = '#3e3c58';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.strokeStyle = '#1a1828';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
}

// ── Ghost ──────────────────────────────────────────────────────────────────
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  piece: Piece,
  bx: number, by: number, cs: number,
): void {
  const ghostY = getGhostY(board, piece);
  if (ghostY === piece.y) return;
  const p = COIN_PAL[piece.type];
  if (!p) return;

  for (const cell of getCells({ ...piece, y: ghostY })) {
    if (cell.y < 0) continue;
    const px = bx + cell.x * cs + cs / 2;
    const py = by + cell.y * cs + cs / 2;
    const r  = (cs / 2) - 2;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU);
    ctx.fillStyle = p.base; ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU);
    ctx.strokeStyle = p.base;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ── Active piece ───────────────────────────────────────────────────────────
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece, bx: number, by: number, cs: number,
  themeColors: Record<string, string>, glow = false,
): void {
  for (const cell of getCells(piece)) {
    if (cell.y < 0) continue;
    drawCell(ctx, bx + cell.x * cs, by + cell.y * cs, cs, piece.type, themeColors, 1, glow);
  }
}

// ── Panel drawing helper ───────────────────────────────────────────────────
function panel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
) {
  ctx.fillStyle = '#13111f';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2e2c40';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#3e3c58';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function pixelLabel(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color = '#3a3852', size = 6, align: CanvasTextAlign = 'center',
) {
  ctx.save();
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function pixelValue(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color = '#e8e6f8', size = 13, align: CanvasTextAlign = 'center',
) {
  ctx.save();
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ── Right-side game panel (both mobile and desktop) ────────────────────────
export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  score: number, hiScore: number,
  level: number, lines: number, combo: number,
  nextPieces: (string | null)[],
  held: string | null, canHold: boolean,
  themeColors: Record<string, string>,
): void {
  const { bx, by, px, pw, cs } = layout;
  const bh = cs * ROWS;
  const bw = cs * COLS;
  const mx = px + Math.floor(pw / 2);

  // Gap between items
  const gap = 6;

  // For mobile, pw is small (~80px) so use compact layout
  const isMobile = layout.isMobile;
  const vPad = isMobile ? 4 : 8;

  let cy = by;

  // ── SCORE panel ──
  const scoreH = isMobile ? 38 : 54;
  panel(ctx, px, cy, pw, scoreH);
  pixelLabel(ctx, 'SCORE', mx, cy + vPad, '#3a3852', isMobile ? 5 : 6);
  const scoreStr = score >= 100000 ? `${(score/1000).toFixed(0)}K` : score.toLocaleString();
  pixelValue(ctx, scoreStr, mx, cy + vPad + (isMobile ? 13 : 20), '#ffd84d', isMobile ? 9 : 12);
  cy += scoreH + gap;

  // ── BEST panel ──
  const bestH = isMobile ? 28 : 40;
  panel(ctx, px, cy, pw, bestH);
  pixelLabel(ctx, 'BEST', mx, cy + vPad - 1, '#2a2840', isMobile ? 5 : 6);
  const bestStr = hiScore >= 100000 ? `${(hiScore/1000).toFixed(0)}K` : hiScore.toLocaleString();
  pixelValue(ctx, bestStr, mx, cy + vPad + (isMobile ? 8 : 14), '#5a5878', isMobile ? 8 : 11);
  cy += bestH + gap;

  // ── LV / LINES ──
  const lvH = isMobile ? 36 : 52;
  const hw = Math.floor((pw - 4) / 2);
  // Level box
  panel(ctx, px, cy, hw, lvH);
  pixelLabel(ctx, 'LV', px + hw/2, cy + vPad, '#3a3852', isMobile ? 5 : 6);
  pixelValue(ctx, String(level + 1), px + hw/2, cy + vPad + (isMobile ? 12 : 18), '#6dff8b', isMobile ? 10 : 13);
  // Lines box
  panel(ctx, px + hw + 4, cy, hw, lvH);
  pixelLabel(ctx, 'LNS', px + hw + 4 + hw/2, cy + vPad, '#3a3852', isMobile ? 5 : 6);
  pixelValue(ctx, String(lines), px + hw + 4 + hw/2, cy + vPad + (isMobile ? 12 : 18), '#e8e6f8', isMobile ? 10 : 13);
  cy += lvH + gap;

  // ── Progress bar ──
  const prog = (lines % 10) / 10;
  ctx.fillStyle = '#1a1828';
  ctx.fillRect(px, cy, pw, 5);
  if (prog > 0) {
    ctx.fillStyle = '#6dff8b';
    ctx.fillRect(px, cy, Math.floor(pw * prog), 5);
  }
  cy += 5 + gap;

  // ── COMBO ──
  if (combo > 1) {
    const comboH = isMobile ? 28 : 40;
    panel(ctx, px, cy, pw, comboH);
    pixelLabel(ctx, 'COMBO', mx, cy + vPad - 1, '#3a3852', isMobile ? 5 : 6);
    pixelValue(ctx, `x${combo}`, mx, cy + vPad + (isMobile ? 8 : 14), '#ff6bff', isMobile ? 9 : 12);
    cy += comboH + gap;
  }

  // ── NEXT ──
  const nextPiece = nextPieces[0];
  const nextH = isMobile ? 44 : 64;
  panel(ctx, px, cy, pw, nextH);
  pixelLabel(ctx, 'NEXT', mx, cy + vPad, '#3a3852', isMobile ? 5 : 6);
  if (nextPiece) {
    const miniCs = isMobile ? 9 : 13;
    drawMiniPiece(ctx, nextPiece, mx, cy + (isMobile ? 32 : 46), miniCs, themeColors);
  }
  cy += nextH + gap;

  // ── HOLD (only if space permits) ──
  const holdH = isMobile ? 44 : 64;
  if (cy + holdH <= by + bh) {
    panel(ctx, px, cy, pw, holdH);
    pixelLabel(ctx, 'HOLD', mx, cy + vPad, '#3a3852', isMobile ? 5 : 6);
    if (held) {
      const miniCs = isMobile ? 9 : 13;
      ctx.save();
      if (!canHold) ctx.globalAlpha = 0.28;
      drawMiniPiece(ctx, held, mx, cy + (isMobile ? 32 : 46), miniCs, themeColors);
      ctx.restore();
    }
    cy += holdH + gap;
  }

  // ── Left panel (desktop only) ──
  if (!isMobile) {
    const lx = bx - layout.pw - 18;
    const lw = layout.pw;
    let ly = by;
    // Decorative next pieces 2 & 3
    for (let i = 1; i <= 2; i++) {
      if (!nextPieces[i]) continue;
      const nh = 56;
      panel(ctx, lx, ly, lw, nh);
      pixelLabel(ctx, `NEXT ${i+1}`, lx + lw/2, ly + 8, '#2a2840', 5);
      drawMiniPiece(ctx, nextPieces[i], lx + lw/2, ly + 40, 11, themeColors, 0.65);
      ly += nh + gap;
    }
  }
}

// ── Mobile top status strip (score + level only, very compact) ─────────────
export function drawMobileHUD(
  ctx: CanvasRenderingContext2D,
  _w: number, _score: number, _hiScore: number,
  _level: number, _lines: number, _combo: number,
  _nextPieces: (string | null)[],
  _held: string | null, _canHold: boolean,
  _themeColors: Record<string, string>,
): void {
  // Now handled by drawSidePanels in the right panel
}

// ── Particles ──────────────────────────────────────────────────────────────
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[], dt: number,
): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.25 * dt * 60;
    if (p.life > 0) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = t * t;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fill();
      ctx.restore();
      alive.push(p);
    }
  }
  return alive;
}

// ── Floating texts ─────────────────────────────────────────────────────────
export function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  texts: FloatingText[], dt: number,
): FloatingText[] {
  const alive: FloatingText[] = [];
  for (const t of texts) {
    t.life -= dt; t.y += t.vy * dt * 60;
    if (t.life > 0) {
      const a = Math.min(1, t.life / t.maxLife < 0.3 ? t.life / (t.maxLife * 0.3) : 1);
      const sz = Math.round(16 + (1 - t.life / t.maxLife) * 4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `${sz}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
      alive.push(t);
    }
  }
  return alive;
}
