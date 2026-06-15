import { COLS, ROWS, COIN_COLORS, COIN_LABELS } from './constants';
import { type Piece, type Particle, type FloatingText, getGhostY, getCells, getShape } from './engine';

export function getCellSize(canvas: HTMLCanvasElement): number {
  const w = canvas.clientWidth  || canvas.offsetWidth  || 375;
  const h = canvas.clientHeight || canvas.offsetHeight || 668;
  const isMobile = w < 640;
  if (isMobile) {
    // Mobile: board is 86% of width, height capped to leave room for touch controls
    const boardW = w * 0.86;
    const boardH = h * 0.68;
    return Math.max(16, Math.floor(Math.min(boardH / ROWS, boardW / COLS)));
  }
  const boardH = h * 0.88;
  const boardW = w * 0.44;
  return Math.max(18, Math.floor(Math.min(boardH / ROWS, boardW / COLS)));
}

export function getBoardOffset(canvas: HTMLCanvasElement, cell: number): { bx: number; by: number } {
  const w = canvas.clientWidth  || canvas.offsetWidth  || 375;
  const h = canvas.clientHeight || canvas.offsetHeight || 668;
  const isMobile = w < 640;
  const bw = cell * COLS;
  const bh = cell * ROWS;
  if (isMobile) {
    const bx = Math.floor((w - bw) / 2);
    const by = Math.floor((h * 0.72 - bh) / 2 + h * 0.06);
    return { bx, by };
  }
  const bx = Math.floor(w * 0.5 - bw * 0.5);
  const by = Math.floor((h - bh) / 2);
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

let _bgTime = 0;
let _stars: {x:number;y:number;r:number;speed:number;phase:number}[] = [];
let _starsW = 0, _starsH = 0;

function ensureStars(w: number, h: number) {
  if (_stars.length === 0 || _starsW !== w || _starsH !== h) {
    _starsW = w; _starsH = h;
    _stars = Array.from({length:70}, () => ({
      x: Math.random()*w, y: Math.random()*h,
      r: 0.5 + Math.random()*1.6,
      speed: 0.4 + Math.random()*1.1,
      phase: Math.random()*Math.PI*2,
    }));
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, dt = 0.016): void {
  _bgTime += dt;
  ensureStars(w, h);

  // Deep space
  const bg = ctx.createRadialGradient(w/2, h*0.35, 0, w/2, h/2, h);
  bg.addColorStop(0, '#0e0e1c');
  bg.addColorStop(0.6, '#070710');
  bg.addColorStop(1, '#030308');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Nebula green
  ctx.save();
  ctx.globalAlpha = 0.08 + 0.03*Math.sin(_bgTime*0.35);
  const n1 = ctx.createRadialGradient(w*0.15, h*0.2, 0, w*0.15, h*0.2, w*0.65);
  n1.addColorStop(0, '#6dff8b'); n1.addColorStop(1, 'transparent');
  ctx.fillStyle = n1; ctx.fillRect(0,0,w,h);
  ctx.restore();

  // Nebula gold
  ctx.save();
  ctx.globalAlpha = 0.06 + 0.025*Math.sin(_bgTime*0.28+2);
  const n2 = ctx.createRadialGradient(w*0.85, h*0.3, 0, w*0.85, h*0.3, w*0.55);
  n2.addColorStop(0, '#ffd84d'); n2.addColorStop(1, 'transparent');
  ctx.fillStyle = n2; ctx.fillRect(0,0,w,h);
  ctx.restore();

  // Nebula cyan
  ctx.save();
  ctx.globalAlpha = 0.045 + 0.02*Math.sin(_bgTime*0.44+4);
  const n3 = ctx.createRadialGradient(w*0.5, h*0.85, 0, w*0.5, h*0.85, w*0.5);
  n3.addColorStop(0, '#6bddff'); n3.addColorStop(1, 'transparent');
  ctx.fillStyle = n3; ctx.fillRect(0,0,w,h);
  ctx.restore();

  // Stars
  for (const s of _stars) {
    const twinkle = 0.3 + 0.7*Math.abs(Math.sin(_bgTime*s.speed + s.phase));
    ctx.save();
    ctx.globalAlpha = twinkle * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // Fine scan grid
  ctx.save();
  ctx.globalAlpha = 0.022;
  ctx.strokeStyle = '#7dffaa';
  ctx.lineWidth = 0.5;
  const gs = 30;
  for (let x=0;x<w;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for (let y=0;y<h;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.restore();

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = '#000';
  for (let y=0;y<h;y+=4) ctx.fillRect(0,y,w,2);
  ctx.restore();

  // Vignette
  const vg = ctx.createRadialGradient(w/2,h/2,h*0.1,w/2,h/2,h*0.82);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.62)');
  ctx.fillStyle = vg; ctx.fillRect(0,0,w,h);
}

// ── Draw a single coin cell ──────────────────────────────────────────────────
export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, size: number,
  type: string | null,
  themeColors: Record<string, string>,
  alpha = 1,
  glow = false,
): void {
  if (!type) return;
  const base = themeColors[type] || COIN_COLORS[type] || '#aaaaaa';
  const pad = Math.max(1, size * 0.06);
  const cx = px + size / 2;
  const cy = py + size / 2;
  const r  = (size - pad*2) * 0.47;

  const br = parseInt(base.slice(1,3),16);
  const bg = parseInt(base.slice(3,5),16);
  const bb = parseInt(base.slice(5,7),16);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Subtle cell background
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.roundRect(px+pad, py+pad, size-pad*2, size-pad*2, 4);
  ctx.fill();

  // Drop shadow
  ctx.beginPath();
  ctx.arc(cx+1.5, cy+2.5, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();

  // Glow halo
  if (glow) {
    ctx.save();
    ctx.shadowColor = base;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, r+2, 0, Math.PI*2);
    ctx.fillStyle = 'transparent';
    ctx.strokeStyle = base;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Metallic base — vivid colors, NOT over-darkened
  const g1 = ctx.createRadialGradient(cx-r*0.3, cy-r*0.3, r*0.02, cx, cy, r);
  const hi = (v: number) => Math.min(255, v + 80);
  const md = (v: number) => v;
  const dk = (v: number) => Math.max(0, Math.round(v * 0.62));
  g1.addColorStop(0,   `rgb(${hi(br)},${hi(bg)},${hi(bb)})`);
  g1.addColorStop(0.35, `rgb(${md(br)},${md(bg)},${md(bb)})`);
  g1.addColorStop(0.75, `rgb(${dk(br)},${dk(bg)},${dk(bb)})`);
  g1.addColorStop(1,   `rgb(${Math.max(0,br>>1)},${Math.max(0,bg>>1)},${Math.max(0,bb>>1)})`);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g1;
  if (glow) { ctx.shadowColor = base; ctx.shadowBlur = 18; }
  ctx.fill();
  ctx.shadowBlur = 0;

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = `rgba(${hi(br)},${hi(bg)},${hi(bb)},0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r*0.80, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Large soft specular
  const g2 = ctx.createRadialGradient(cx-r*0.28,cy-r*0.36, 0, cx-r*0.08,cy-r*0.1, r*0.62);
  g2.addColorStop(0,   'rgba(255,255,255,0.82)');
  g2.addColorStop(0.35,'rgba(255,255,255,0.24)');
  g2.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g2;
  ctx.fill();

  // Small sharp glare
  ctx.save();
  ctx.globalAlpha *= 0.7;
  ctx.beginPath();
  ctx.ellipse(cx-r*0.28, cy-r*0.33, r*0.15, r*0.09, -0.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();

  // Bottom shadow gradient
  const g3 = ctx.createLinearGradient(cx, cy, cx, cy+r);
  g3.addColorStop(0, 'rgba(0,0,0,0)');
  g3.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = g3;
  ctx.fill();

  // Label
  const fs = Math.max(6, Math.floor(r * 0.72));
  ctx.font = `900 ${fs}px "Orbitron", "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(COIN_LABELS[type]||'?', cx+0.7, cy+1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(COIN_LABELS[type]||'?', cx, cy);

  ctx.restore();
}

export function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: string | null,
  cx: number, cy: number, cellSize: number,
  themeColors: Record<string, string>,
  alpha = 1,
): void {
  if (!type) return;
  const shape = getShape({ type: type as any, x:0, y:0, rotation:0 });
  let minC=4,maxC=0,minR=4,maxR=0;
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
    if (shape[r][c]) { minC=Math.min(minC,c);maxC=Math.max(maxC,c);minR=Math.min(minR,r);maxR=Math.max(maxR,r); }
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
  flashRows: number[], flashFrame: number,
): void {
  const bw = cs*COLS, bh = cs*ROWS;

  // Outer glow halo
  ctx.save();
  ctx.shadowColor = '#6dff8b';
  ctx.shadowBlur = 30;
  ctx.strokeStyle = 'rgba(109,255,139,0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx-4, by-4, bw+8, bh+8);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(109,255,139,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx-1, by-1, bw+2, bh+2);
  ctx.restore();

  // Board bg
  const bbg = ctx.createLinearGradient(bx, by, bx, by+bh);
  bbg.addColorStop(0, '#1a1a27');
  bbg.addColorStop(1, '#101018');
  ctx.fillStyle = bbg;
  ctx.fillRect(bx, by, bw, bh);

  // Dot grid
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = '#6dff8b';
  for (let row=1;row<ROWS;row++) for (let col=1;col<COLS;col++) {
    ctx.beginPath(); ctx.arc(bx+col*cs, by+row*cs, 1, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // Grid lines
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = '#6dff8b';
  ctx.lineWidth = 0.5;
  for (let c=1;c<COLS;c++){ctx.beginPath();ctx.moveTo(bx+c*cs,by);ctx.lineTo(bx+c*cs,by+bh);ctx.stroke();}
  for (let r=1;r<ROWS;r++){ctx.beginPath();ctx.moveTo(bx,by+r*cs);ctx.lineTo(bx+bw,by+r*cs);ctx.stroke();}
  ctx.restore();

  // Cells
  for (let r=0;r<ROWS;r++) {
    for (let c=0;c<COLS;c++) {
      if (!board[r][c]) continue;
      const flash = flashRows.includes(r);
      if (flash && flashFrame%2===1) {
        ctx.save();
        ctx.fillStyle='rgba(255,255,255,0.95)';
        ctx.shadowColor='#ffffff'; ctx.shadowBlur=14;
        ctx.beginPath();ctx.roundRect(bx+c*cs+1,by+r*cs+1,cs-2,cs-2,4);ctx.fill();
        ctx.restore();
      } else {
        drawCell(ctx,bx+c*cs,by+r*cs,cs,board[r][c],themeColors,flash?0.5:1);
      }
    }
  }

  // Top/bottom vignette
  const vt = ctx.createLinearGradient(bx,by,bx,by+bh);
  vt.addColorStop(0,'rgba(0,0,0,0.25)');vt.addColorStop(0.1,'rgba(0,0,0,0)');
  vt.addColorStop(0.9,'rgba(0,0,0,0)');vt.addColorStop(1,'rgba(0,0,0,0.32)');
  ctx.fillStyle=vt; ctx.fillRect(bx,by,bw,bh);

  // Corner L-brackets
  const al = 18;
  ctx.save();
  ctx.strokeStyle='#6dff8b'; ctx.lineWidth=2.5; ctx.lineCap='round';
  ctx.shadowColor='#6dff8b'; ctx.shadowBlur=12;
  [[bx,by,1,1],[bx+bw,by,-1,1],[bx,by+bh,1,-1],[bx+bw,by+bh,-1,-1]].forEach(([ox,oy,sx,sy]) => {
    ctx.beginPath();ctx.moveTo(ox+sx*al,oy);ctx.lineTo(ox,oy);ctx.lineTo(ox,oy+sy*al);ctx.stroke();
  });
  ctx.restore();
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  board: (string|null)[][],
  piece: Piece,
  bx: number, by: number, cs: number,
): void {
  const ghostY = getGhostY(board, piece);
  if (ghostY === piece.y) return;
  const color = COIN_COLORS[piece.type] || '#888';
  for (const cell of getCells({...piece, y:ghostY})) {
    if (cell.y < 0) continue;
    const px=bx+cell.x*cs, py=by+cell.y*cs;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.44,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = color; ctx.lineWidth=1.5; ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.44,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece, bx: number, by: number, cs: number,
  themeColors: Record<string,string>, glow=false,
): void {
  for (const cell of getCells(piece)) {
    if (cell.y < 0) continue;
    drawCell(ctx, bx+cell.x*cs, by+cell.y*cs, cs, piece.type, themeColors, 1, glow);
  }
}

// ── Mobile top HUD bar ───────────────────────────────────────────────────────
export function drawMobileHUD(
  ctx: CanvasRenderingContext2D,
  w: number,
  score: number, hiScore: number, level: number, lines: number, combo: number,
  nextPieces: (string|null)[],
  held: string|null, canHold: boolean,
  themeColors: Record<string,string>,
): void {
  const barH = 52;
  const pad = 10;

  // Background bar
  ctx.save();
  const barGrad = ctx.createLinearGradient(0,0,0,barH+8);
  barGrad.addColorStop(0,'rgba(16,16,28,0.97)');
  barGrad.addColorStop(1,'rgba(10,10,18,0.95)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, w, barH+8);
  ctx.strokeStyle='rgba(109,255,139,0.2)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,barH+8);ctx.lineTo(w,barH+8);ctx.stroke();
  ctx.restore();

  const sectionW = w / 4;
  function hudLabel(text: string, x: number, y: number, color='#3a3a55') {
    ctx.save();
    ctx.font='bold 8px "Orbitron","Courier New",monospace';
    ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.letterSpacing='0.08em';
    ctx.fillText(text,x,y); ctx.restore();
  }
  function hudValue(text: string, x: number, y: number, color='#f0f0f0', fs=17) {
    ctx.save();
    ctx.font=`800 ${fs}px "Orbitron","Courier New",monospace`;
    ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.shadowColor=color; ctx.shadowBlur=8;
    ctx.fillText(text,x,y); ctx.restore();
  }

  const sy = 6;

  // SCORE
  hudLabel('SCORE', sectionW*0.5, sy);
  const scoreStr = score >= 10000 ? (score/1000).toFixed(1)+'K' : score.toString();
  hudValue(scoreStr, sectionW*0.5, sy+12, '#ffd84d', score>=10000?13:16);

  // LEVEL
  hudLabel('LV', sectionW*1.5, sy);
  hudValue(String(level+1), sectionW*1.5, sy+12, '#6dff8b', 18);

  // LINES
  hudLabel('LINES', sectionW*2.5, sy);
  hudValue(String(lines), sectionW*2.5, sy+12, '#e0e0f8', 17);

  // COMBO or NEXT
  if (combo > 1) {
    hudLabel('COMBO', sectionW*3.5, sy);
    hudValue(`×${combo}`, sectionW*3.5, sy+12, '#ff6bff', 17);
  } else {
    hudLabel('NEXT', sectionW*3.5, sy);
    if (nextPieces[0]) {
      drawMiniPiece(ctx, nextPieces[0], sectionW*3.5, sy+30, 9, themeColors, 1);
    }
  }

  // Level progress bar
  const prog = (lines%10)/10;
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(pad, barH+1, w-pad*2, 3, 2); ctx.fill();
  if (prog>0) {
    ctx.fillStyle='#6dff8b'; ctx.shadowColor='#6dff8b'; ctx.shadowBlur=5;
    ctx.beginPath(); ctx.roundRect(pad, barH+1, (w-pad*2)*prog, 3, 2); ctx.fill();
  }
  ctx.restore();
}

// ── Desktop side panels ──────────────────────────────────────────────────────
export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, boardW: number, boardH: number,
  score: number, hiScore: number, level: number, lines: number, combo: number,
  nextPieces: (string|null)[], held: string|null, canHold: boolean,
  themeColors: Record<string,string>,
  cw: number,
): void {
  const RIGHT_GAP=10, LEFT_GAP=10;

  function glassPanel(x:number,y:number,w:number,h:number,accent=false) {
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=12; ctx.shadowOffsetY=3;
    const g=ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,'rgba(28,28,44,0.96)'); g.addColorStop(1,'rgba(16,16,26,0.96)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,w,h,10); ctx.fill();
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    if (accent) { ctx.strokeStyle='rgba(109,255,139,0.38)'; ctx.lineWidth=1.5; ctx.shadowColor='rgba(109,255,139,0.2)'; ctx.shadowBlur=6; }
    else { ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; }
    ctx.beginPath(); ctx.roundRect(x,y,w,h,10); ctx.stroke();
    ctx.restore();
  }
  function lbl(t:string,x:number,y:number,c='#3a3a52') {
    ctx.save(); ctx.fillStyle=c; ctx.font='700 9px "Orbitron","Courier New",monospace';
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(t.toUpperCase(),x,y); ctx.restore();
  }
  function bigNum(t:string,x:number,y:number,c='#f0f0f0',fs=20) {
    ctx.save(); ctx.font=`800 ${fs}px "Orbitron","Courier New",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillStyle=c; ctx.shadowColor=c; ctx.shadowBlur=10;
    ctx.fillText(t,x,y); ctx.restore();
  }
  function small(t:string,x:number,y:number,c='#3a3a52',a:CanvasTextAlign='left') {
    ctx.save(); ctx.font='11px "Space Mono","Courier New",monospace';
    ctx.fillStyle=c; ctx.textAlign=a; ctx.textBaseline='top'; ctx.fillText(t,x,y); ctx.restore();
  }

  const lw = Math.max(88, bx-LEFT_GAP*2-4);
  const lx = bx-lw-LEFT_GAP;
  if (lw < 78) return;

  let ly = by;

  // Score
  glassPanel(lx,ly,lw,74,true);
  lbl('Score',lx+10,ly+9);
  bigNum(score.toLocaleString(),lx+lw/2,ly+24,'#ffd84d',Math.min(19,Math.max(12,lw*0.20))|0);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(lx+10,ly+52,lw-20,1);
  lbl('Best',lx+10,ly+57);
  small(hiScore.toLocaleString(),lx+lw-10,ly+57,'#4a4a62','right');
  ly += 82;

  // Level + Lines
  glassPanel(lx,ly,lw,74);
  const hw=(lw-4)/2;
  lbl('Lv',lx+10,ly+9);
  bigNum(String(level+1),lx+hw/2,ly+24,'#6dff8b',20);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(lx+hw+2,ly+10,1,54);
  lbl('Lines',lx+hw+10,ly+9);
  bigNum(String(lines),lx+hw+hw/2,ly+24,'#f0f0f0',20);
  const prog=(lines%10)/10;
  ctx.save();
  ctx.beginPath();ctx.roundRect(lx+10,ly+60,lw-20,5,3);ctx.fillStyle='rgba(255,255,255,0.07)';ctx.fill();
  if(prog>0){ctx.beginPath();ctx.roundRect(lx+10,ly+60,(lw-20)*prog,5,3);ctx.fillStyle='#6dff8b';ctx.shadowColor='#6dff8b';ctx.shadowBlur=6;ctx.fill();}
  ctx.restore();
  ly += 82;

  // Combo
  glassPanel(lx,ly,lw,50);
  lbl('Combo',lx+10,ly+8);
  if (combo>1) {
    ctx.save();ctx.font=`800 ${Math.min(20,lw*.22)|0}px "Orbitron","Courier New",monospace`;
    ctx.textAlign='center';ctx.fillStyle='#ff6bff';ctx.shadowColor='#ff6bff';ctx.shadowBlur=18;
    ctx.textBaseline='top';ctx.fillText(`×${combo}`,lx+lw/2,ly+22);ctx.restore();
  } else {
    small('—',lx+lw/2,ly+24,'rgba(255,255,255,0.09)','center');
  }
  ly += 58;

  // Hold
  glassPanel(lx,ly,lw,80);
  lbl('Hold',lx+10,ly+9);
  if (held) {
    ctx.save();if(!canHold)ctx.globalAlpha=0.3;
    drawMiniPiece(ctx,held,lx+lw/2,ly+50,12,themeColors);
    ctx.restore();
  } else {
    small('—',lx+lw/2,ly+46,'rgba(255,255,255,0.08)','center');
  }

  // Right
  const rx=bx+boardW+RIGHT_GAP;
  const rw=Math.min(116,cw-rx-8);
  if (rw<72) return;
  const ph=Math.min(boardH,230);
  glassPanel(rx,by,rw,ph);
  lbl('Next',rx+10,by+9);
  const slots=[{cy:by+52,cs:13},{cy:by+120,cs:11},{cy:by+180,cs:9}];
  for (let i=0;i<Math.min(3,nextPieces.length);i++) {
    ctx.save();if(i>0)ctx.globalAlpha=0.55;
    drawMiniPiece(ctx,nextPieces[i]||null,rx+rw/2,slots[i].cy,slots[i].cs,themeColors);
    ctx.restore();
    if(i<2){ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fillRect(rx+10,by+84+i*62,rw-20,1);}
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt; p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.vy+=.22*dt*60;
    if (p.life > 0) {
      const t = p.life/p.maxLife;
      ctx.save(); ctx.globalAlpha=t*t;
      ctx.shadowColor=p.color; ctx.shadowBlur=9;
      ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*t,0,Math.PI*2);ctx.fill();
      ctx.restore(); alive.push(p);
    }
  }
  return alive;
}

export function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[], dt: number): FloatingText[] {
  const alive: FloatingText[] = [];
  for (const t of texts) {
    t.life-=dt; t.y+=t.vy*dt*60;
    if (t.life>0) {
      const a=Math.min(1,t.life/t.maxLife<.28?t.life/(t.maxLife*.28):1);
      ctx.save(); ctx.globalAlpha=a;
      ctx.shadowColor=t.color; ctx.shadowBlur=24;
      ctx.font='800 22px "Orbitron","Courier New",monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeStyle='rgba(0,0,0,0.88)'; ctx.lineWidth=4; ctx.strokeText(t.text,t.x,t.y);
      ctx.fillStyle=t.color; ctx.fillText(t.text,t.x,t.y);
      ctx.restore(); alive.push(t);
    }
  }
  return alive;
}
