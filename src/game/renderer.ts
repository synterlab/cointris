import { COLS, ROWS, COIN_COLORS, COIN_LABELS } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

// ── Sizing helpers ──────────────────────────────────────────────────────────

export function getCellSize(canvas: HTMLCanvasElement): number {
  const w = canvas.clientWidth  || canvas.offsetWidth  || 320;
  const h = canvas.clientHeight || canvas.offsetHeight || 568;
  const isMobile = w < 640;
  const boardH = isMobile ? h * 0.64 : h * 0.88;
  const boardW = isMobile ? w * 0.55 : w * 0.44;
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

// ── Colour helpers ──────────────────────────────────────────────────────────

export function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+(255-r)*t)|0},${Math.min(255,g+(255-g)*t)|0},${Math.min(255,b+(255-b)*t)|0})`;
}
export function darken(hex: string, t: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${(r*(1-t))|0},${(g*(1-t))|0},${(b*(1-t))|0})`;
}

// ── Cell drawing ────────────────────────────────────────────────────────────

export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, size: number,
  type: string | null,
  themeColors: Record<string, string>,
  alpha = 1,
  glow = false
): void {
  if (!type) return;
  const base = themeColors[type] || COIN_COLORS[type] || '#888888';
  const pad  = Math.max(1, size * 0.065);
  const cx   = px + size / 2;
  const cy   = py + size / 2;
  const r    = (size - pad * 2) * 0.46;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Cell background square
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.roundRect(px + pad, py + pad, size - pad*2, size - pad*2, 3);
  ctx.fill();

  if (glow) { ctx.shadowColor = base; ctx.shadowBlur = 14; }

  // Drop shadow under coin
  ctx.beginPath(); ctx.arc(cx+1.5, cy+2, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  ctx.shadowBlur = 0;

  // Metallic base — radial gradient
  const g1 = ctx.createRadialGradient(cx-r*.28, cy-r*.28, r*.04, cx, cy, r);
  g1.addColorStop(0,   lighten(base, 0.5));
  g1.addColorStop(0.4, base);
  g1.addColorStop(0.8, darken(base, 0.28));
  g1.addColorStop(1,   darken(base, 0.48));
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g1; ctx.fill();

  // Inner rim ring
  ctx.beginPath(); ctx.arc(cx, cy, r*.82, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();

  // Specular glare (upper-left)
  const g2 = ctx.createRadialGradient(cx-r*.3, cy-r*.36, 0, cx-r*.12, cy-r*.12, r*.55);
  g2.addColorStop(0, 'rgba(255,255,255,0.72)');
  g2.addColorStop(.45, 'rgba(255,255,255,0.16)');
  g2.addColorStop(1,  'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g2; ctx.fill();

  // Bottom edge darkening
  const g3 = ctx.createRadialGradient(cx, cy+r*.4, 0, cx, cy, r);
  g3.addColorStop(0, 'rgba(0,0,0,0)');
  g3.addColorStop(.7,'rgba(0,0,0,0)');
  g3.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g3; ctx.fill();

  // Coin letter
  const fs = Math.max(7, (r * .72)|0);
  ctx.font = `900 ${fs}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fillText(COIN_LABELS[type] || '?', cx+.5, cy+1);
  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.fillText(COIN_LABELS[type] || '?', cx, cy);

  ctx.restore();
}

// ── Mini piece (hold / next) ────────────────────────────────────────────────

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

// ── Background ──────────────────────────────────────────────────────────────

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Base
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // Pixel grid
  ctx.save(); ctx.globalAlpha = 0.038; ctx.strokeStyle = '#6dff8b'; ctx.lineWidth = .5;
  const gs = 30;
  for (let x=0; x<w; x+=gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y=0; y<h; y+=gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();

  // Scanlines
  ctx.save(); ctx.globalAlpha = 0.045; ctx.fillStyle = '#000';
  for (let y=0; y<h; y+=4) ctx.fillRect(0, y, w, 2);
  ctx.restore();

  // CRT vignette
  const vg = ctx.createRadialGradient(w/2, h/2, h*.18, w/2, h/2, h*.88);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

// ── Board ───────────────────────────────────────────────────────────────────

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string|null)[][],
  bx: number, by: number, cs: number,
  themeColors: Record<string,string>,
  flashRows: number[], flashFrame: number
): void {
  const bw = cs*COLS, bh = cs*ROWS;

  // Outer glow halo
  ctx.save();
  ctx.shadowColor = '#6dff8b'; ctx.shadowBlur = 22;
  ctx.strokeStyle = 'rgba(109,255,139,0.6)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx-1, by-1, bw+2, bh+2);
  ctx.restore();

  // Board background
  const bg = ctx.createLinearGradient(bx, by, bx, by+bh);
  bg.addColorStop(0, '#1c1c25'); bg.addColorStop(1, '#141419');
  ctx.fillStyle = bg; ctx.fillRect(bx, by, bw, bh);

  // Grid lines
  ctx.save(); ctx.globalAlpha = 0.065; ctx.strokeStyle = '#6dff8b'; ctx.lineWidth = .5;
  for (let c=1;c<COLS;c++) { ctx.beginPath(); ctx.moveTo(bx+c*cs,by); ctx.lineTo(bx+c*cs,by+bh); ctx.stroke(); }
  for (let r=1;r<ROWS;r++) { ctx.beginPath(); ctx.moveTo(bx,by+r*cs); ctx.lineTo(bx+bw,by+r*cs); ctx.stroke(); }
  ctx.restore();

  // Cells
  for (let r=0;r<ROWS;r++) {
    for (let c=0;c<COLS;c++) {
      if (!board[r][c]) continue;
      const flash = flashRows.includes(r);
      if (flash && flashFrame % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(bx+c*cs+1, by+r*cs+1, cs-2, cs-2);
      } else {
        drawCell(ctx, bx+c*cs, by+r*cs, cs, board[r][c], themeColors, flash ? 0.55 : 1);
      }
    }
  }

  // Top/bottom vignette
  const vt = ctx.createLinearGradient(bx, by, bx, by+bh);
  vt.addColorStop(0, 'rgba(0,0,0,0.22)'); vt.addColorStop(.1,'rgba(0,0,0,0)');
  vt.addColorStop(.9,'rgba(0,0,0,0)');    vt.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vt; ctx.fillRect(bx, by, bw, bh);

  // Corner brackets
  const al = 13;
  ctx.save(); ctx.strokeStyle = '#6dff8b'; ctx.lineWidth = 2.5; ctx.shadowColor='#6dff8b'; ctx.shadowBlur=9;
  [[ bx-1, by-1,  1, 0, 0, 1 ],
   [ bx+bw+1, by-1, -1, 0, 0, 1 ],
   [ bx-1, by+bh+1,  1, 0, 0,-1 ],
   [ bx+bw+1, by+bh+1,-1, 0, 0,-1 ]
  ].forEach(([ox,oy,hx,,vx,vy]) => {
    ctx.beginPath(); ctx.moveTo(ox+hx*al, oy); ctx.lineTo(ox,oy); ctx.lineTo(ox,oy+vy*al); ctx.stroke();
  });
  ctx.restore();
}

// ── Ghost piece ─────────────────────────────────────────────────────────────

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
    const px = bx+cell.x*cs, py = by+cell.y*cs;
    ctx.save();
    ctx.globalAlpha = .3;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.arc(px+cs/2, py+cs/2, cs*.43, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = .07; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px+cs/2, py+cs/2, cs*.43, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Active piece ────────────────────────────────────────────────────────────

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

// ── Side panels ─────────────────────────────────────────────────────────────

export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, boardW: number, boardH: number,
  score: number, hiScore: number, level: number, lines: number, combo: number,
  nextPieces: (string|null)[], held: string|null, canHold: boolean,
  themeColors: Record<string,string>,
  cw: number
): void {
  const RIGHT_GAP = 8, LEFT_GAP = 8;

  // Panel helpers
  function panel(x:number,y:number,w:number,h:number,accentBorder=false) {
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.55)'; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
    const g = ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,'#1e1e28'); g.addColorStop(1,'#18181f');
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill();
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    ctx.strokeStyle = accentBorder ? 'rgba(109,255,139,0.3)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth=1; ctx.stroke(); ctx.restore();
  }
  function lbl(text:string,x:number,y:number,color='#555568') {
    ctx.save(); ctx.fillStyle=color; ctx.font='600 9px monospace';
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(text.toUpperCase(),x,y); ctx.restore();
  }
  function bigNum(text:string,x:number,y:number,color='#f0f0f0',size=20) {
    ctx.save(); ctx.font=`bold ${size}px monospace`; ctx.textAlign='center';
    ctx.textBaseline='top'; ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=8;
    ctx.fillText(text,x,y); ctx.restore();
  }
  function small(text:string,x:number,y:number,color='#555568',align:CanvasTextAlign='left') {
    ctx.save(); ctx.font='11px monospace'; ctx.fillStyle=color;
    ctx.textAlign=align; ctx.textBaseline='top'; ctx.fillText(text,x,y); ctx.restore();
  }

  // ── LEFT PANEL ────────────────────────────────
  const lw = Math.max(90, bx - LEFT_GAP*2 - 4);
  const lx = bx - lw - LEFT_GAP;
  if (lw < 80) return;

  let ly = by;

  // Score
  panel(lx, ly, lw, 72, true);
  lbl('Score', lx+8, ly+8);
  bigNum(score.toLocaleString(), lx+lw/2, ly+22, '#ffd84d', Math.min(20, lw*0.22)|0);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(lx+8,ly+50,lw-16,1);
  lbl('Best', lx+8, ly+55); small(hiScore.toLocaleString(), lx+lw-8, ly+55,'#6a6a80','right');
  ly += 80;

  // Level + Lines
  panel(lx, ly, lw, 70);
  const hw = (lw-4)/2;
  lbl('Lv', lx+8, ly+8); bigNum(String(level+1), lx+hw/2, ly+22,'#6dff8b',20);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(lx+hw,ly+8,1,54);
  lbl('Lines', lx+hw+8, ly+8); bigNum(String(lines), lx+hw+hw/2, ly+22,'#f0f0f0',20);
  // XP bar
  const prog = (lines%10)/10;
  ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.roundRect(lx+8,ly+56,lw-16,5,3); ctx.fill();
  if (prog>0) {
    ctx.save(); ctx.fillStyle='#6dff8b'; ctx.shadowColor='#6dff8b'; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.roundRect(lx+8,ly+56,(lw-16)*prog,5,3); ctx.fill(); ctx.restore();
  }
  ly += 78;

  // Combo
  panel(lx, ly, lw, 46);
  lbl('Combo', lx+8, ly+7);
  if (combo>1) {
    ctx.save(); ctx.font='bold 18px monospace'; ctx.textAlign='center';
    ctx.fillStyle='#ff6bff'; ctx.shadowColor='#ff6bff'; ctx.shadowBlur=14;
    ctx.textBaseline='top'; ctx.fillText(`×${combo}`, lx+lw/2, ly+20); ctx.restore();
  } else {
    small('—', lx+lw/2, ly+22,'rgba(255,255,255,0.12)','center');
  }
  ly += 54;

  // Hold
  panel(lx, ly, lw, 76);
  lbl('Hold', lx+8, ly+8);
  if (held) {
    ctx.save(); if (!canHold) ctx.globalAlpha=0.35;
    drawMiniPiece(ctx, held, lx+lw/2, ly+47, 11, themeColors);
    ctx.restore();
  } else {
    small('—', lx+lw/2, ly+42,'rgba(255,255,255,0.1)','center');
  }

  // ── RIGHT PANEL ───────────────────────────────
  const rx = bx+boardW+RIGHT_GAP;
  const rw = Math.min(120, cw-rx-6);
  if (rw < 76) return;

  // Next
  panel(rx, by, rw, Math.min(boardH, 220));
  lbl('Next', rx+8, by+8);

  const slots=[{cy:by+46,cs:12},{cy:by+112,cs:10},{cy:by+170,cs:9}];
  for (let i=0;i<Math.min(3,nextPieces.length);i++) {
    ctx.save(); if (i>0) ctx.globalAlpha=0.6;
    drawMiniPiece(ctx, nextPieces[i]||null, rx+rw/2, slots[i].cy, slots[i].cs, themeColors);
    ctx.restore();
    if (i<2) { ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(rx+8, by+78+i*60, rw-16, 1); }
  }
}

// ── Particles ───────────────────────────────────────────────────────────────

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt; p.x += p.vx*dt*60; p.y += p.vy*dt*60; p.vy += .18*dt*60;
    if (p.life > 0) {
      ctx.save(); ctx.globalAlpha = p.life/p.maxLife;
      ctx.shadowColor=p.color; ctx.shadowBlur=6; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(p.life/p.maxLife), 0, Math.PI*2); ctx.fill();
      ctx.restore(); alive.push(p);
    }
  }
  return alive;
}

export function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[], dt: number): FloatingText[] {
  const alive: FloatingText[] = [];
  for (const t of texts) {
    t.life -= dt; t.y += t.vy*dt*60;
    if (t.life > 0) {
      const a = Math.min(1, t.life/t.maxLife < .3 ? t.life/(t.maxLife*.3) : 1);
      ctx.save(); ctx.globalAlpha=a; ctx.shadowColor=t.color; ctx.shadowBlur=18;
      ctx.font='bold 20px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=3; ctx.strokeText(t.text,t.x,t.y);
      ctx.fillStyle=t.color; ctx.fillText(t.text,t.x,t.y);
      ctx.restore(); alive.push(t);
    }
  }
  return alive;
}
