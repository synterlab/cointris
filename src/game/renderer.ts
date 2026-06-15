import { COLS, ROWS, COIN_COLORS, COIN_LABELS } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

export function getCellSize(canvas: HTMLCanvasElement): number {
  const w = canvas.clientWidth  || canvas.offsetWidth  || 320;
  const h = canvas.clientHeight || canvas.offsetHeight || 568;
  const isMobile = w < 640;
  const boardH = isMobile ? h * 0.62 : h * 0.88;
  const boardW = isMobile ? w * 0.54 : w * 0.44;
  return Math.max(16, Math.floor(Math.min(boardH / ROWS, boardW / COLS)));
}

export function getBoardOffset(canvas: HTMLCanvasElement, cell: number): { bx: number; by: number } {
  const w = canvas.clientWidth  || canvas.offsetWidth  || 320;
  const h = canvas.clientHeight || canvas.offsetHeight || 568;
  const isMobile = w < 640;
  const bw = cell * COLS;
  const bh = cell * ROWS;
  const bx = isMobile
    ? Math.floor((w - bw) / 2)
    : Math.floor(w * 0.5 - bw * 0.5);
  const by = isMobile
    ? Math.floor((h * 0.64 - bh) / 2 + h * 0.04)
    : Math.floor((h - bh) / 2);
  return { bx, by };
}

export function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+(255-r)*t)|0},${Math.min(255,g+(255-g)*t)|0},${Math.min(255,b+(255-b)*t)|0})`;
}
export function darken(hex: string, t: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${(r*(1-t))|0},${(g*(1-t))|0},${(b*(1-t))|0})`;
}
function hexToRgb(hex: string): [number,number,number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

let _bgTime = 0;
let _starField: {x:number;y:number;r:number;o:number;s:number}[] = [];
let _bgW = 0, _bgH = 0;

function ensureStars(w: number, h: number) {
  if (_starField.length === 0 || _bgW !== w || _bgH !== h) {
    _bgW = w; _bgH = h;
    _starField = Array.from({length:90}, () => ({
      x: Math.random()*w, y: Math.random()*h,
      r: 0.5 + Math.random()*1.5,
      o: 0.2 + Math.random()*0.7,
      s: 0.3 + Math.random()*1.2
    }));
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, dt = 0.016): void {
  _bgTime += dt;
  ensureStars(w, h);

  // Deep space base
  const base = ctx.createRadialGradient(w*0.5, h*0.38, 0, w*0.5, h*0.5, h*0.95);
  base.addColorStop(0, '#0d0d18');
  base.addColorStop(0.5, '#080810');
  base.addColorStop(1, '#04040a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Aurora 1
  ctx.save();
  ctx.globalAlpha = 0.07 + 0.03*Math.sin(_bgTime * 0.4);
  const a1 = ctx.createRadialGradient(w*0.2, h*0.15, 0, w*0.2, h*0.15, w*0.7);
  a1.addColorStop(0, '#6dff8b'); a1.addColorStop(1, 'transparent');
  ctx.fillStyle = a1; ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Aurora 2
  ctx.save();
  ctx.globalAlpha = 0.05 + 0.03*Math.sin(_bgTime * 0.3 + 2);
  const a2 = ctx.createRadialGradient(w*0.8, h*0.25, 0, w*0.8, h*0.25, w*0.6);
  a2.addColorStop(0, '#ffd84d'); a2.addColorStop(1, 'transparent');
  ctx.fillStyle = a2; ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Aurora 3
  ctx.save();
  ctx.globalAlpha = 0.04 + 0.02*Math.sin(_bgTime * 0.5 + 4);
  const a3 = ctx.createRadialGradient(w*0.5, h*0.8, 0, w*0.5, h*0.8, w*0.55);
  a3.addColorStop(0, '#6bddff'); a3.addColorStop(1, 'transparent');
  ctx.fillStyle = a3; ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Twinkling stars
  ctx.save();
  for (const star of _starField) {
    const twinkle = 0.5 + 0.5 * Math.sin(_bgTime * star.s + star.x);
    ctx.globalAlpha = star.o * twinkle;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  // Fine pixel grid
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = '#6dff8b';
  ctx.lineWidth = 0.5;
  const gs = 32;
  for (let x=0; x<w; x+=gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y=0; y<h; y+=gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#000';
  for (let y=0; y<h; y+=4) ctx.fillRect(0, y, w, 2);
  ctx.restore();

  // CRT vignette
  const vg = ctx.createRadialGradient(w/2, h/2, h*0.12, w/2, h/2, h*0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, size: number,
  type: string | null,
  themeColors: Record<string, string>,
  alpha = 1,
  glow = false,
  brightness = 1
): void {
  if (!type) return;
  const base = themeColors[type] || COIN_COLORS[type] || '#888888';
  const pad  = Math.max(1, size * 0.07);
  const cx   = px + size / 2;
  const cy   = py + size / 2;
  const r    = (size - pad * 2) * 0.46;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow square
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(px + pad, py + pad, size - pad*2, size - pad*2, 4);
  ctx.fill();

  if (glow) {
    ctx.shadowColor = base;
    ctx.shadowBlur = 18 * brightness;
  }

  // Drop shadow under coin
  ctx.shadowBlur = glow ? 0 : 0;
  ctx.beginPath();
  ctx.arc(cx + 1.5, cy + 2.5, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();

  if (glow) { ctx.shadowColor = base; ctx.shadowBlur = 18 * brightness; }

  // Metallic base — multi-stop radial gradient
  const g1 = ctx.createRadialGradient(cx - r*.32, cy - r*.32, r*.02, cx, cy, r);
  const [br,bg,bb] = hexToRgb(base);
  g1.addColorStop(0, `rgb(${Math.min(255,br+80)},${Math.min(255,bg+80)},${Math.min(255,bb+80)})`);
  g1.addColorStop(0.3, base);
  g1.addColorStop(0.7, darken(base, 0.25));
  g1.addColorStop(1,   darken(base, 0.52));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g1;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Outer rim
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = `rgba(${Math.min(255,br+120)},${Math.min(255,bg+120)},${Math.min(255,bb+120)},0.5)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inner rim
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Primary specular — large soft glare
  const g2 = ctx.createRadialGradient(cx - r*.28, cy - r*.38, 0, cx - r*.1, cy - r*.1, r*.6);
  g2.addColorStop(0,   'rgba(255,255,255,0.78)');
  g2.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  g2.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g2;
  ctx.fill();

  // Secondary specular — small sharp highlight
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx - r*.3, cy - r*.35, r*.18, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.restore();

  // Bottom darkening
  const g3 = ctx.createRadialGradient(cx, cy + r*.5, 0, cx, cy, r);
  g3.addColorStop(0,   'rgba(0,0,0,0)');
  g3.addColorStop(0.65,'rgba(0,0,0,0)');
  g3.addColorStop(1,   'rgba(0,0,0,0.42)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g3;
  ctx.fill();

  // Coin letter shadow
  const fs = Math.max(7, (r * .75)|0);
  ctx.font = `900 ${fs}px "Orbitron", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(COIN_LABELS[type] || '?', cx + .8, cy + 1.2);
  // Coin letter
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.fillText(COIN_LABELS[type] || '?', cx, cy);

  ctx.restore();
}

export function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: string | null,
  cx: number, cy: number, cellSize: number,
  themeColors: Record<string, string>,
  alpha = 1
): void {
  if (!type) return;
  const shape = getShape({ type: type as any, x:0, y:0, rotation:0 });
  let minC=4,maxC=0,minR=4,maxR=0;
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
    if (shape[r][c]) { minC=Math.min(minC,c); maxC=Math.max(maxC,c); minR=Math.min(minR,r); maxR=Math.max(maxR,r); }
  }
  const pw=(maxC-minC+1)*cellSize, ph=(maxR-minR+1)*cellSize;
  const ox=cx-pw/2, oy=cy-ph/2;
  for (let r=minR;r<=maxR;r++) for (let c=minC;c<=maxC;c++) {
    if (shape[r][c]) drawCell(ctx, ox+(c-minC)*cellSize, oy+(r-minR)*cellSize, cellSize, type, themeColors, alpha);
  }
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string|null)[][],
  bx: number, by: number, cs: number,
  themeColors: Record<string,string>,
  flashRows: number[], flashFrame: number
): void {
  const bw = cs*COLS, bh = cs*ROWS;

  // Board outer glow — double layer
  ctx.save();
  ctx.shadowColor = 'rgba(109,255,139,0.35)';
  ctx.shadowBlur = 28;
  ctx.strokeStyle = 'rgba(109,255,139,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(109,255,139,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.restore();

  // Board background with gradient
  const bg = ctx.createLinearGradient(bx, by, bx, by+bh);
  bg.addColorStop(0,   '#1c1c28');
  bg.addColorStop(0.5, '#161620');
  bg.addColorStop(1,   '#121219');
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);

  // Subtle dot grid instead of lines
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = '#6dff8b';
  for (let row=1; row<ROWS; row++) {
    for (let col=1; col<COLS; col++) {
      ctx.beginPath();
      ctx.arc(bx + col*cs, by + row*cs, 1, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Grid lines (subtle)
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = '#6dff8b';
  ctx.lineWidth = .5;
  for (let c=1;c<COLS;c++) { ctx.beginPath(); ctx.moveTo(bx+c*cs,by); ctx.lineTo(bx+c*cs,by+bh); ctx.stroke(); }
  for (let r=1;r<ROWS;r++) { ctx.beginPath(); ctx.moveTo(bx,by+r*cs); ctx.lineTo(bx+bw,by+r*cs); ctx.stroke(); }
  ctx.restore();

  // Cells
  for (let r=0;r<ROWS;r++) {
    for (let c=0;c<COLS;c++) {
      if (!board[r][c]) continue;
      const flash = flashRows.includes(r);
      if (flash && flashFrame % 2 === 1) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(bx+c*cs+1, by+r*cs+1, cs-2, cs-2, 4);
        ctx.fill();
        ctx.restore();
      } else {
        drawCell(ctx, bx+c*cs, by+r*cs, cs, board[r][c], themeColors, flash ? 0.55 : 1);
      }
    }
  }

  // Top/bottom vignette
  const vt = ctx.createLinearGradient(bx, by, bx, by+bh);
  vt.addColorStop(0,    'rgba(0,0,0,0.28)');
  vt.addColorStop(0.12, 'rgba(0,0,0,0)');
  vt.addColorStop(0.88, 'rgba(0,0,0,0)');
  vt.addColorStop(1,    'rgba(0,0,0,0.35)');
  ctx.fillStyle = vt;
  ctx.fillRect(bx, by, bw, bh);

  // Corner brackets — L-shaped neon
  const al = 16;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#6dff8b';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#6dff8b';
  const corners = [
    [bx,       by,       al, 0, al, 0],
    [bx+bw,    by,      -al, 0, al, 0],
    [bx,       by+bh,    al, 0,-al, 0],
    [bx+bw,    by+bh,   -al, 0,-al, 0],
  ] as const;
  for (const [ox, oy, hx, , , vy] of corners) {
    const signY = vy < 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(ox + hx, oy);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox, oy + signY * al);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  board: (string|null)[][],
  piece: Piece,
  bx: number, by: number, cs: number
): void {
  const ghostY = getGhostY(board, piece);
  if (ghostY === piece.y) return;
  const color = COIN_COLORS[piece.type] || '#888';
  for (const cell of getCells({ ...piece, y: ghostY })) {
    if (cell.y < 0) continue;
    const px = bx + cell.x * cs, py = by + cell.y * cs;
    ctx.save();
    ctx.globalAlpha = .22;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px + cs/2, py + cs/2, cs * .44, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = .45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(px + cs/2, py + cs/2, cs * .44, 0, Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece, bx: number, by: number, cs: number,
  themeColors: Record<string,string>, glow = false
): void {
  for (const cell of getCells(piece)) {
    if (cell.y < 0) continue;
    drawCell(ctx, bx+cell.x*cs, by+cell.y*cs, cs, piece.type, themeColors, 1, glow);
  }
}

function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = false) {
  ctx.save();
  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  // Glass background
  const grad = ctx.createLinearGradient(x, y, x, y+h);
  grad.addColorStop(0, 'rgba(30,30,45,0.95)');
  grad.addColorStop(1, 'rgba(18,18,28,0.95)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Border
  if (accent) {
    ctx.strokeStyle = 'rgba(109,255,139,0.35)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(109,255,139,0.2)';
    ctx.shadowBlur = 6;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.stroke();
  // Top shine
  const shine = ctx.createLinearGradient(x, y, x, y+h*0.3);
  shine.addColorStop(0, 'rgba(255,255,255,0.06)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.roundRect(x+1, y+1, w-2, h*0.3, [9,9,0,0]);
  ctx.fill();
  ctx.restore();
}

export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, boardW: number, boardH: number,
  score: number, hiScore: number, level: number, lines: number, combo: number,
  nextPieces: (string|null)[], held: string|null, canHold: boolean,
  themeColors: Record<string,string>,
  cw: number
): void {
  const RIGHT_GAP = 10, LEFT_GAP = 10;

  function lbl(text: string, x: number, y: number, color = '#44445a') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '600 9px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '0.08em';
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
  }
  function bigNum(text: string, x: number, y: number, color = '#f0f0f0', size = 20) {
    ctx.save();
    ctx.font = `800 ${size}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function small(text: string, x: number, y: number, color = '#44445a', align: CanvasTextAlign = 'left') {
    ctx.save();
    ctx.font = '11px "Space Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── LEFT PANEL ────────────────────────────────
  const lw = Math.max(90, bx - LEFT_GAP*2 - 4);
  const lx = bx - lw - LEFT_GAP;
  if (lw < 80) return;

  let ly = by;

  // Score panel
  glassPanel(ctx, lx, ly, lw, 74, true);
  lbl('Score', lx+10, ly+9);
  const scoreText = score.toLocaleString();
  const scoreFontSize = Math.min(20, Math.max(12, lw * 0.21)) | 0;
  bigNum(scoreText, lx+lw/2, ly+24, '#ffd84d', scoreFontSize);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(lx+10, ly+52, lw-20, 1);
  lbl('Best', lx+10, ly+57);
  small(hiScore.toLocaleString(), lx+lw-10, ly+57, '#5a5a72', 'right');
  ly += 82;

  // Level + Lines
  glassPanel(ctx, lx, ly, lw, 74);
  const hw = (lw-4) / 2;
  lbl('Lv', lx+10, ly+9);
  bigNum(String(level+1), lx+hw/2, ly+24, '#6dff8b', 20);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(lx+hw+2, ly+10, 1, 54);
  lbl('Lines', lx+hw+10, ly+9);
  bigNum(String(lines), lx+hw+hw/2, ly+24, '#f0f0f0', 20);
  // XP bar
  const prog = (lines%10) / 10;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(lx+10, ly+60, lw-20, 5, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  if (prog > 0) {
    ctx.beginPath();
    ctx.roundRect(lx+10, ly+60, (lw-20)*prog, 5, 3);
    ctx.fillStyle = '#6dff8b';
    ctx.shadowColor = '#6dff8b';
    ctx.shadowBlur = 6;
    ctx.fill();
  }
  ctx.restore();
  ly += 82;

  // Combo
  glassPanel(ctx, lx, ly, lw, 50);
  lbl('Combo', lx+10, ly+8);
  if (combo > 1) {
    ctx.save();
    ctx.font = `800 ${Math.min(20, lw*.22)|0}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6bff';
    ctx.shadowColor = '#ff6bff';
    ctx.shadowBlur = 16;
    ctx.textBaseline = 'top';
    ctx.fillText(`×${combo}`, lx+lw/2, ly+22);
    ctx.restore();
  } else {
    small('—', lx+lw/2, ly+24, 'rgba(255,255,255,0.1)', 'center');
  }
  ly += 58;

  // Hold
  glassPanel(ctx, lx, ly, lw, 80);
  lbl('Hold', lx+10, ly+9);
  if (held) {
    ctx.save();
    if (!canHold) ctx.globalAlpha = 0.3;
    drawMiniPiece(ctx, held, lx+lw/2, ly+50, 12, themeColors);
    ctx.restore();
  } else {
    small('—', lx+lw/2, ly+46, 'rgba(255,255,255,0.1)', 'center');
  }

  // ── RIGHT PANEL ───────────────────────────────
  const rx = bx + boardW + RIGHT_GAP;
  const rw = Math.min(120, cw - rx - 8);
  if (rw < 76) return;

  const panelH = Math.min(boardH, 230);
  glassPanel(ctx, rx, by, rw, panelH);
  lbl('Next', rx+10, by+9);

  const slots = [{cy: by+52, cs: 13}, {cy: by+120, cs: 11}, {cy: by+182, cs: 9}];
  for (let i=0; i<Math.min(3, nextPieces.length); i++) {
    ctx.save();
    if (i > 0) ctx.globalAlpha = 0.55;
    drawMiniPiece(ctx, nextPieces[i]||null, rx+rw/2, slots[i].cy, slots[i].cs, themeColors);
    ctx.restore();
    if (i < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(rx+10, by+84+i*62, rw-20, 1);
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += .22 * dt * 60;
    if (p.life > 0) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = t * t;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      alive.push(p);
    }
  }
  return alive;
}

export function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[], dt: number): FloatingText[] {
  const alive: FloatingText[] = [];
  for (const t of texts) {
    t.life -= dt;
    t.y += t.vy * dt * 60;
    if (t.life > 0) {
      const a = Math.min(1, t.life/t.maxLife < .28 ? t.life/(t.maxLife*.28) : 1);
      const scale = 1 + (1 - t.life/t.maxLife) * 0.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 22;
      ctx.font = `800 22px "Orbitron", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
      alive.push(t);
    }
  }
  return alive;
}
