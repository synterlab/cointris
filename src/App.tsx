import { useEffect, useRef, useCallback, useState } from 'react';
import { COLS, ROWS, COIN_COLORS, COLORS, THEMES, COIN_LABELS, type ThemeKey } from './game/constants';
import {
  createEmptyBoard, getNextPiece, isValidPosition, tryRotate, lockPiece,
  clearLines, calcScore, getGhostY, spawnPiece, createCoinParticles,
  getLevelFromLines, getDropInterval,
  loadStats, saveStats, loadHighScore, saveHighScore,
  loadTheme, saveTheme, loadUnlocked, saveUnlocked,
  type GameStats, type Particle, type FloatingText, type Piece,
} from './game/engine';
import {
  getCellSize, getBoardOffset, drawBackground, drawBoard, drawGhost,
  drawPiece, drawSidePanels, drawParticles, drawFloatingTexts, drawMiniPiece,
} from './game/renderer';
import { sound } from './game/sound';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'stats' | 'themes' | 'howto' | 'about';

interface G {
  board: (string|null)[][];
  current: Piece;
  next: Array<{type:string}>;
  held: string|null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: boolean;
  particles: Particle[];
  floats: FloatingText[];
  bag: string[];
  lockMs: number;
  dropMs: number;
  softDrop: boolean;
  active: boolean;
  startTime: number;
  hiScore: number;
  stats: GameStats;
  theme: ThemeKey;
  unlocked: string[];
  shakeMs: number;
  glowMs: number;
  lastNow: number;
  raf: number;
}

const COIN_DATA = [
  { type:'I', label:'G', name:'Gold',    color:'#ffd84d', delay:'0s'   },
  { type:'O', label:'S', name:'Silver',  color:'#c8c8d8', delay:'.18s' },
  { type:'T', label:'R', name:'Ruby',    color:'#ff5d5d', delay:'.36s' },
  { type:'S', label:'E', name:'Emerald', color:'#6dff8b', delay:'.54s' },
  { type:'Z', label:'P', name:'Plasma',  color:'#ff6bff', delay:'.72s' },
  { type:'J', label:'D', name:'Diamond', color:'#6bddff', delay:'.90s' },
  { type:'L', label:'N', name:'Nova',    color:'#ff9f3f', delay:'1.08s'},
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g         = useRef<G>(null!);
  const [screen,  setScreen]  = useState<Screen>('menu');
  const [muted,   setMuted]   = useState(false);
  const touch = useRef({ sx:0, sy:0, st:0, lastTap:0 });

  // ── helpers ─────────────────────────────────────────────────────────────
  const themeColors = useCallback((): Record<string,string> => {
    if (!g.current) return COIN_COLORS;
    return (THEMES[g.current.theme]?.colors as Record<string,string>) ?? COIN_COLORS;
  }, []);

  // ── canvas always mounted — resize once ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w*dpr || canvas.height !== h*dpr) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr); }
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── menu demo loop (background animation when not playing) ───────────────
  const menuRaf = useRef(0);
  const demoRef = useRef<{board:(string|null)[][];pieces:{piece:Piece;ttl:number}[];t:number}>({
    board: createEmptyBoard(), pieces: [], t: 0,
  });

  const menuLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    drawBackground(ctx, w, h);

    const d = demoRef.current;
    d.t += 0.016;

    // occasionally spawn a falling piece
    if (d.pieces.length < 3 && Math.random() < 0.02) {
      const types = Object.keys(COIN_COLORS);
      const type  = types[Math.floor(Math.random()*types.length)];
      d.pieces.push({ piece: { type: type as any, x: Math.floor(Math.random()*(COLS-3)), y:-2, rotation: Math.floor(Math.random()*4) }, ttl: 4 });
    }

    const cs = Math.max(16, Math.floor(Math.min(w*0.045, h*0.035)));
    const cx = w/2, cy = h/2;
    const bw = cs*COLS, bh = cs*ROWS;
    const bx = cx - bw/2, by = cy - bh/2;

    // dim board backdrop
    ctx.save(); ctx.globalAlpha=0.28;
    ctx.fillStyle='#1a1a22'; ctx.fillRect(bx, by, bw, bh);
    ctx.restore();

    // falling demo coins
    d.pieces = d.pieces.filter(p => {
      p.ttl -= 0.016;
      p.piece.y += 0.04;
      if (p.ttl <= 0 || p.piece.y*cs > bh) return false;
      const tc = themeColors();
      for (const cell of [{x:p.piece.x,y:Math.floor(p.piece.y)}]) {
        if (cell.y >= 0 && cell.y < ROWS) {
          ctx.save(); ctx.globalAlpha = Math.min(1, p.ttl)*0.6;
          drawMiniPiece(ctx, p.piece.type, bx+cell.x*cs+cs/2, by+cell.y*cs+cs/2, cs, tc);
          ctx.restore();
        }
      }
      return true;
    });

    menuRaf.current = requestAnimationFrame(menuLoop);
  }, [themeColors]);

  // ── game loop ────────────────────────────────────────────────────────────
  const lockCurrent = useCallback((ref: G, setScr: typeof setScreen) => {
    const nb = lockPiece(ref.board, ref.current);
    const { board: cb, cleared, lines: rows } = clearLines(nb);
    ref.board = cb;

    if (cleared > 0) {
      ref.combo++;
      const pts = calcScore(cleared, ref.level, ref.combo, ref.b2b, cb.every(r => r.every(c => c===null)));
      ref.score  += pts;
      ref.lines  += cleared;
      const nl = getLevelFromLines(ref.lines);
      if (nl > ref.level) { ref.level = nl; sound.levelUp(); }
      ref.b2b = cleared === 4;

      const canvas = canvasRef.current;
      if (canvas) {
        const cs = getCellSize(canvas);
        const {bx,by} = getBoardOffset(canvas, cs);
        ref.particles.push(...createCoinParticles(ref.board, rows, cs, bx, by));
        const bw = cs*COLS;
        const fx = bx + bw/2;

        const msgs: [string,string,number][] = [];
        if (cleared===4)      msgs.push(['✦ COINTRIS! ✦','#ffd84d',0]);
        else if (cleared===3) msgs.push(['TRIPLE','#6dff8b',0]);
        else if (cleared===2) msgs.push(['DOUBLE','#6dff8b',0]);
        msgs.push([`+${pts.toLocaleString()}`,'#ffd84d',28]);
        if (ref.combo>2)      msgs.push([`COMBO ×${ref.combo}`,'#ff6bff',56]);

        msgs.forEach(([text,color,dy]) => ref.floats.push({ x:fx, y:by+9*cs-dy, text, color, vy:-.7, life:1.4, maxLife:1.4 }));
      }
      sound.lineClear(cleared);
      if (ref.combo>2) sound.combo(ref.combo);
      ref.shakeMs = cleared>=4 ? 220 : 120;

      if (ref.score>=5000  && !ref.unlocked.includes('gold-rush'))  { ref.unlocked.push('gold-rush');  saveUnlocked(ref.unlocked); }
      if (ref.score>=15000 && !ref.unlocked.includes('midnight'))    { ref.unlocked.push('midnight');    saveUnlocked(ref.unlocked); }
      if (ref.score>=30000 && !ref.unlocked.includes('neon-arcade')) { ref.unlocked.push('neon-arcade'); saveUnlocked(ref.unlocked); }
    } else {
      ref.combo = 0; ref.b2b = false;
    }

    if (ref.score > ref.hiScore) { ref.hiScore = ref.score; saveHighScore(ref.score); }

    ref.dropMs = 0; ref.lockMs = 0;

    // spawn next
    const nextType = ref.next[0]?.type || 'I';
    const np = spawnPiece(nextType as any);
    const { piece: bagPiece, newBag } = getNextPiece(ref.bag as any);
    ref.bag  = newBag;
    ref.next = [...ref.next.slice(1), { type: bagPiece.type }];

    if (!isValidPosition(ref.board, np)) {
      ref.active = false;
      sound.gameOver();
      const elapsed = (Date.now()-ref.startTime)/1000;
      ref.stats.totalGames++;
      ref.stats.linesCleared  += ref.lines;
      ref.stats.highestLevel   = Math.max(ref.stats.highestLevel, ref.level+1);
      ref.stats.totalPlayTime += elapsed;
      ref.stats.bestScore      = Math.max(ref.stats.bestScore, ref.score);
      ref.stats.bestCombo      = Math.max(ref.stats.bestCombo, ref.combo);
      saveStats(ref.stats);
      setScr('gameover');
      return;
    }
    ref.current = np;
    ref.canHold = true;
    ref.glowMs  = 180;
  }, []);

  const gameLoop = useCallback((now: number, ref: G, setScr: typeof setScreen) => {
    if (!ref.active) return;
    const canvas = canvasRef.current;
    if (!canvas) { ref.raf = requestAnimationFrame(n => gameLoop(n, ref, setScr)); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { ref.raf = requestAnimationFrame(n => gameLoop(n, ref, setScr)); return; }

    const dt  = Math.min((now - ref.lastNow) / 1000, 0.05);
    ref.lastNow = now;
    const dtMs  = dt * 1000;

    // gravity
    const interval = ref.softDrop ? 50 : getDropInterval(ref.level);
    ref.dropMs += dtMs;
    if (ref.dropMs >= interval) {
      ref.dropMs = 0;
      if (isValidPosition(ref.board, ref.current, 0, 1)) {
        ref.current = { ...ref.current, y: ref.current.y + 1 };
        if (ref.softDrop) ref.score += 1;
      } else {
        ref.lockMs += interval;
        if (ref.lockMs >= 500 || ref.softDrop) { lockCurrent(ref, setScr); ref.raf = requestAnimationFrame(n => gameLoop(n, ref, setScr)); return; }
      }
    }
    if (ref.shakeMs > 0) ref.shakeMs -= dtMs;
    if (ref.glowMs  > 0) ref.glowMs  -= dtMs;

    // render
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const cs = getCellSize(canvas);
    const { bx:baseBx, by } = getBoardOffset(canvas, cs);
    const shk = ref.shakeMs > 0;
    const bx  = baseBx + (shk ? (Math.random()-.5)*5 : 0);
    const sy  =           shk ? (Math.random()-.5)*3  : 0;
    const tc  = themeColors();

    drawBackground(ctx, w, h);
    drawBoard(ctx, ref.board, bx, by+sy, cs, tc, [], 0);
    drawGhost(ctx, ref.board, ref.current, bx, by+sy, cs);
    drawPiece(ctx, ref.current, bx, by+sy, cs, tc, ref.glowMs > 0);
    ref.particles = drawParticles(ctx, ref.particles, dt);
    ref.floats    = drawFloatingTexts(ctx, ref.floats, dt);
    drawSidePanels(ctx, bx, by+sy, cs*COLS, cs*ROWS, ref.score, ref.hiScore, ref.level, ref.lines, ref.combo, ref.next.map(n=>n.type), ref.held, ref.canHold, tc, w);

    ref.raf = requestAnimationFrame(n => gameLoop(n, ref, setScr));
  }, [themeColors, lockCurrent]);

  // ── screen transitions ───────────────────────────────────────────────────
  useEffect(() => {
    if (screen === 'menu' || screen === 'stats' || screen === 'themes' || screen === 'howto' || screen === 'about') {
      cancelAnimationFrame(menuRaf.current);
      menuRaf.current = requestAnimationFrame(menuLoop);
      return () => cancelAnimationFrame(menuRaf.current);
    }
    cancelAnimationFrame(menuRaf.current);
    return undefined;
  }, [screen, menuLoop]);

  // ── start game ───────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const bag0: string[] = [];
    const { piece, newBag } = getNextPiece(bag0 as any);
    const ref: G = {
      board: createEmptyBoard(),
      current: piece,
      next: newBag.slice(0,5).map(t => ({ type: t as string })),
      held: null, canHold: true,
      score: 0, lines: 0, level: 0, combo: 0, b2b: false,
      particles: [], floats: [],
      bag: newBag.slice(5),
      lockMs: 0, dropMs: 0, softDrop: false,
      active: true,
      startTime: Date.now(),
      hiScore: loadHighScore(),
      stats: loadStats(),
      theme: loadTheme() as ThemeKey,
      unlocked: loadUnlocked(),
      shakeMs: 0, glowMs: 0,
      lastNow: performance.now(),
      raf: 0,
    };
    g.current = ref;
    setScreen('playing');
    ref.raf = requestAnimationFrame(now => gameLoop(now, ref, setScreen));
  }, [gameLoop]);

  const doHold = useCallback(() => {
    const ref = g.current; if (!ref || !ref.canHold) return;
    const prev = ref.held;
    ref.held = ref.current.type;
    ref.canHold = false;
    sound.hold();
    if (prev) { ref.current = spawnPiece(prev as any); }
    else {
      const nextType = ref.next[0]?.type || 'I';
      const np = spawnPiece(nextType as any);
      const { piece: bagPiece, newBag } = getNextPiece(ref.bag as any);
      ref.bag  = newBag;
      ref.next = [...ref.next.slice(1), { type: bagPiece.type }];
      ref.current = np;
    }
  }, []);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'playing') return;
    function dn(e: KeyboardEvent) {
      const ref = g.current; if (!ref?.active) return;
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { e.preventDefault(); if (isValidPosition(ref.board,ref.current,-1,0)) { ref.current={...ref.current,x:ref.current.x-1}; ref.lockMs=0; sound.move(); } }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); if (isValidPosition(ref.board,ref.current,1,0))  { ref.current={...ref.current,x:ref.current.x+1}; ref.lockMs=0; sound.move(); } }
      if (e.code === 'ArrowDown'  || e.code === 'KeyS') { e.preventDefault(); ref.softDrop=true; }
      if (e.code === 'ArrowUp' || e.code === 'KeyX' || e.code === 'KeyW') { e.preventDefault(); const r=tryRotate(ref.board,ref.current,1);  if(r){ref.current=r;ref.lockMs=0;sound.rotate();} }
      if (e.code === 'KeyZ') { e.preventDefault(); const r=tryRotate(ref.board,ref.current,-1); if(r){ref.current=r;ref.lockMs=0;sound.rotate();} }
      if (e.code === 'Space') {
        e.preventDefault();
        const dy=getGhostY(ref.board,ref.current)-ref.current.y;
        ref.score+=dy*2; ref.current={...ref.current,y:ref.current.y+dy};
        sound.hardDrop(); lockCurrent(ref, setScreen);
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') { e.preventDefault(); doHold(); }
      if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); ref.active=false; cancelAnimationFrame(ref.raf); setScreen('paused'); }
    }
    function up(e: KeyboardEvent) {
      const ref = g.current; if (!ref) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') ref.softDrop = false;
    }
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [screen, doHold, lockCurrent]);

  // ── touch ────────────────────────────────────────────────────────────────
  function onTS(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { sx:t.clientX, sy:t.clientY, st:Date.now(), lastTap:touch.current.lastTap };
  }
  function onTE(e: React.TouchEvent) {
    if (screen !== 'playing') return;
    const ref = g.current; if (!ref?.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX-touch.current.sx, dy = t.clientY-touch.current.sy;
    const elapsed = Date.now()-touch.current.st;
    // swipe down = hard drop
    if (dy>55 && Math.abs(dy)>Math.abs(dx)*1.4) {
      const d=getGhostY(ref.board,ref.current)-ref.current.y;
      ref.score+=d*2; ref.current={...ref.current,y:ref.current.y+d};
      sound.hardDrop(); lockCurrent(ref, setScreen); return;
    }
    // swipe left/right
    if (Math.abs(dx)>28 && Math.abs(dx)>Math.abs(dy)*1.4) {
      const dir=dx>0?1:-1, steps=Math.min(5,Math.floor(Math.abs(dx)/28));
      for (let i=0;i<steps;i++) if(isValidPosition(ref.board,{...ref.current,x:ref.current.x+dir})){ ref.current={...ref.current,x:ref.current.x+dir}; ref.lockMs=0; sound.move(); }
      return;
    }
    // double tap = rotate
    const now = Date.now();
    if (now-touch.current.lastTap<280 && elapsed<200) {
      const r=tryRotate(ref.board,ref.current,1); if(r){ref.current=r;ref.lockMs=0;sound.rotate();}
      touch.current.lastTap=0; return;
    }
    touch.current.lastTap=now;
    // single tap sides = move
    if (elapsed<200 && Math.abs(dx)<18 && Math.abs(dy)<18) {
      const canvas=canvasRef.current; if(!canvas) return;
      const rect=canvas.getBoundingClientRect();
      const dir=(t.clientX-rect.left)<rect.width/2?-1:1;
      if(isValidPosition(ref.board,ref.current,dir,0)){ref.current={...ref.current,x:ref.current.x+dir};ref.lockMs=0;sound.move();}
    }
  }

  const toggleMute = useCallback(() => {
    const m = !sound.isMuted(); sound.setMuted(m); setMuted(m);
  }, []);

  const resumeGame = useCallback(() => {
    const ref = g.current; if (!ref) return;
    ref.active = true;
    ref.lastNow = performance.now();
    ref.raf = requestAnimationFrame(now => gameLoop(now, ref, setScreen));
    setScreen('playing');
  }, [gameLoop]);

  // ── render ───────────────────────────────────────────────────────────────
  const isGameScreen = screen === 'playing' || screen === 'paused' || screen === 'gameover';
  const hiScore = g.current?.hiScore ?? loadHighScore();

  return (
    <div className="root-wrap" onTouchStart={onTS} onTouchEnd={onTE}>
      {/* canvas ALWAYS mounted */}
      <canvas ref={canvasRef} className="game-canvas" />

      {/* ── MENU ─── */}
      {!isGameScreen && (
        <div className="overlay">
          <div className="menu-bg" />
          <div className="menu-grid" />
          <div className="menu-scanlines" />
          <div className="menu-vignette" />

          {/* floating background coins */}
          {Array.from({length:8},(_,i) => (
            <div key={i} style={{
              position:'absolute', left:`${8+i*12}%`, bottom:'-24px',
              width:14+i%3*4, height:14+i%3*4, borderRadius:'50%',
              background:COIN_DATA[i%7].color,
              opacity:0.06+(i%3)*0.04,
              animation:`floatUp ${4.5+i*.6}s ${i*.55}s linear infinite`,
              boxShadow:`0 0 8px ${COIN_DATA[i%7].color}`,
              pointerEvents:'none',
            }}/>
          ))}

          {screen === 'menu' && (
            <div className="menu-body">
              {/* Logo */}
              <div className="logo-lockup">
                <span className="logo-main"><span className="logo-coin">COIN</span><span className="logo-tris">TRIS</span></span>
                <div className="logo-sub">✦ &nbsp; CRYPTO ARCADE PUZZLE &nbsp; ✦</div>
              </div>

              <div className="menu-divider" />

              {/* Coin showcase */}
              <div className="coin-showcase">
                {COIN_DATA.map((c,i) => (
                  <div key={c.type} className="coin-item">
                    <div className="coin-ball" style={{
                      background:`radial-gradient(circle at 35% 30%, ${lightenColor(c.color,.42)}, ${c.color} 48%, ${darkenColor(c.color,.32)})`,
                      boxShadow:`0 3px 12px rgba(0,0,0,.5), 0 0 18px ${c.color}44, inset 0 1px 2px rgba(255,255,255,.26)`,
                      color:'rgba(0,0,0,0.62)',
                      animationDelay:c.delay,
                      animationDuration:`${2.2+i*0.18}s`,
                    }}>
                      {c.label}
                    </div>
                    <div className="coin-name">{c.name}</div>
                  </div>
                ))}
              </div>

              {/* Hi-score */}
              {hiScore > 0 && (
                <div className="hiscore-strip">
                  <span className="hs-label">BEST SCORE</span>
                  <span className="hs-value">{hiScore.toLocaleString()}</span>
                </div>
              )}

              {/* Buttons */}
              <button className="btn-play" onClick={startGame}>▶ &nbsp; PLAY NOW</button>

              <div className="btn-grid" style={{marginBottom:8}}>
                <button className="btn-sec" onClick={() => setScreen('howto')}>HOW TO PLAY</button>
                <button className="btn-sec" onClick={() => setScreen('themes')}>THEMES</button>
              </div>
              <div className="btn-grid">
                <button className="btn-sec" onClick={() => setScreen('stats')}>STATISTICS</button>
                <button className="btn-sec" onClick={() => setScreen('about')}>ABOUT</button>
              </div>

              <div style={{marginTop:22,textAlign:'center',color:'#3a3a50',fontSize:10,lineHeight:2,letterSpacing:'0.05em'}}>
                <div><span style={{color:'#5a5a72'}}>← →</span> MOVE &nbsp;·&nbsp; <span style={{color:'#5a5a72'}}>↑ / X</span> ROTATE &nbsp;·&nbsp; <span style={{color:'#5a5a72'}}>Z</span> CCW</div>
                <div><span style={{color:'#5a5a72'}}>↓</span> SOFT DROP &nbsp;·&nbsp; <span style={{color:'#5a5a72'}}>SPACE</span> HARD DROP</div>
                <div><span style={{color:'#5a5a72'}}>C / SHIFT</span> HOLD &nbsp;·&nbsp; <span style={{color:'#5a5a72'}}>P</span> PAUSE</div>
              </div>
            </div>
          )}

          {/* ── HOW TO PLAY ── */}
          {screen === 'howto' && (
            <div className="modal-wrap">
              <div className="modal-card">
                <div className="modal-title">HOW TO PLAY</div>
                <div className="modal-subtitle">master the coins</div>

                <div className="htp-section">
                  <div className="htp-heading">⌨ CONTROLS</div>
                  <div className="htp-grid">
                    {[
                      ['← / →','Move left / right'],
                      ['↑ / X','Rotate clockwise'],
                      ['Z','Rotate counter-CW'],
                      ['↓','Soft drop'],
                      ['SPACE','Hard drop'],
                      ['C / SHIFT','Hold piece'],
                      ['P / ESC','Pause'],
                      ['Double-tap','Rotate (mobile)'],
                    ].map(([k,d]) => (
                      <div key={k} className="htp-key">
                        <span className="kbd">{k}</span>
                        <span className="htp-key-desc">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="htp-section">
                  <div className="htp-heading">🪙 THE 7 COINS</div>
                  <div className="htp-coin-grid">
                    {COIN_DATA.map(c => (
                      <div key={c.type} className="htp-coin">
                        <div className="htp-coin-dot" style={{
                          background:`radial-gradient(circle at 35% 30%, ${lightenColor(c.color,.4)}, ${c.color} 48%, ${darkenColor(c.color,.3)})`,
                          boxShadow:`0 2px 6px rgba(0,0,0,.35), 0 0 10px ${c.color}55`,
                          color:'rgba(0,0,0,0.65)',
                        }}>{c.label}</div>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:'#d0d0e0'}}>{c.name}</div>
                          <div className="htp-coin-name">{c.type}-Piece</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="htp-section">
                  <div className="htp-heading">🏆 SCORING</div>
                  <table className="score-table">
                    <tbody>
                      {[
                        ['1 line cleared','100 × level'],
                        ['2 lines (Double)','300 × level'],
                        ['3 lines (Triple)','500 × level'],
                        ['4 lines (COINTRIS!)','800 × level'],
                        ['Combo bonus','×50 per chain'],
                        ['Back-to-back x4','×1.5 multiplier'],
                        ['Perfect clear','+2000 × level'],
                        ['Hard drop','2 pts per cell'],
                      ].map(([a,b]) => (
                        <tr key={a}><td>{a}</td><td>{b}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="htp-section" style={{marginBottom:0}}>
                  <div className="htp-heading">💡 TIPS</div>
                  {[
                    'Use the ghost piece (dashed outline) to aim before dropping.',
                    'Hold a piece with C or SHIFT — save it for the perfect moment.',
                    'Chain combos by clearing lines back-to-back for huge bonus points.',
                    'Unlock 3 extra color themes by reaching 5k, 15k, and 30k points.',
                  ].map((tip,i) => (
                    <div key={i} style={{fontSize:11,color:'#707080',marginBottom:7,paddingLeft:10,borderLeft:'2px solid rgba(109,255,139,0.25)',lineHeight:1.55}}>
                      {tip}
                    </div>
                  ))}
                </div>

                <button className="btn-back" onClick={() => setScreen('menu')}>← BACK TO MENU</button>
              </div>
            </div>
          )}

          {/* ── ABOUT ── */}
          {screen === 'about' && (
            <div className="modal-wrap">
              <div className="modal-card">
                <div className="about-logo">
                  <div className="about-logo-text">
                    <span style={{color:'#6dff8b'}}>COIN</span><span style={{color:'#ffd84d'}}>TRIS</span>
                  </div>
                  <div className="about-version">Version 1.0 &nbsp;·&nbsp; 2025</div>
                </div>
                <div className="about-desc">
                  A retro-inspired arcade puzzle game where classic Tetris gameplay meets crypto culture. Stack 7 unique coin tetrominoes — Gold, Silver, Ruby, Emerald, Plasma, Diamond, and Nova — to clear lines and build massive combos.
                </div>
                <div className="about-tags">
                  {['React 18','Vite 7','TypeScript','Canvas 2D','Web Audio API','SRS Rotation'].map(t => (
                    <span key={t} className="about-tag">{t}</span>
                  ))}
                </div>
                <div style={{marginBottom:14}}>
                  {[
                    ['Gameplay','Full SRS wall-kick rotation system'],
                    ['Sound','Retro chiptune via Web Audio API'],
                    ['Persistence','High scores & stats via localStorage'],
                    ['Themes','4 colour palettes, 3 unlockable'],
                    ['Mobile','Touch swipe & tap controls'],
                    ['Source','github.com/synterlab/cointris'],
                  ].map(([k,v]) => (
                    <div key={k} className="stat-row" style={{marginBottom:6}}>
                      <span className="stat-label">{k}</span>
                      <span className="stat-val" style={{fontSize:11,color:'#a0a0b8',textAlign:'right',maxWidth:'55%'}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{textAlign:'center',fontSize:10,color:'#3a3a52',letterSpacing:'0.08em'}}>
                  Built with ♥ by Synterlab
                </div>
                <button className="btn-back" onClick={() => setScreen('menu')}>← BACK TO MENU</button>
              </div>
            </div>
          )}

          {/* ── STATS ── */}
          {screen === 'stats' && (
            <div className="modal-wrap">
              <div className="modal-card">
                <div className="modal-title">STATISTICS</div>
                <div className="modal-subtitle">your cointris career</div>
                {(()=>{
                  const s = g.current?.stats ?? loadStats();
                  return [
                    ['Total Games',     s.totalGames.toString(),              '#f0f0f0'],
                    ['Lines Cleared',   s.linesCleared.toLocaleString(),      '#6dff8b'],
                    ['Highest Level',   s.highestLevel.toString(),            '#6dff8b'],
                    ['Best Score',      s.bestScore.toLocaleString(),         '#ffd84d'],
                    ['Best Combo',      `×${s.bestCombo}`,                   '#ff6bff'],
                    ['Total Play Time', fmtTime(s.totalPlayTime),             '#f0f0f0'],
                  ].map(([label, val, col]) => (
                    <div key={label} className="stat-row">
                      <span className="stat-label">{label}</span>
                      <span className="stat-val" style={{color:col}}>{val}</span>
                    </div>
                  ));
                })()}
                <button className="btn-back" onClick={() => setScreen('menu')}>← BACK</button>
              </div>
            </div>
          )}

          {/* ── THEMES ── */}
          {screen === 'themes' && (
            <div className="modal-wrap">
              <div className="modal-card">
                <div className="modal-title">THEMES</div>
                <div className="modal-subtitle">unlock by earning points</div>
                {(()=>{
                  const unlocked = g.current?.unlocked ?? loadUnlocked();
                  const cur = (g.current?.theme ?? loadTheme()) as ThemeKey;
                  const hints: Record<string,string> = { 'gold-rush':'Reach 5,000 pts', midnight:'Reach 15,000 pts', 'neon-arcade':'Reach 30,000 pts' };
                  return (Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => {
                    const isLocked = !unlocked.includes(key);
                    const isActive = key === cur;
                    const dots = Object.values(theme.colors as Record<string,string>).slice(0,5);
                    return (
                      <div key={key} className={`theme-row${isActive?' active':''}${isLocked?' locked':''}`}
                        onClick={() => {
                          if (isLocked) return;
                          if (g.current) { g.current.theme = key; }
                          saveTheme(key);
                          setScreen('menu');
                        }}>
                        <div className="theme-dots">
                          {dots.map((c,i) => <div key={i} className="theme-dot" style={{background:isLocked?'#3a3a4a':c, boxShadow:isLocked?'none':`0 0 5px ${c}88`}} />)}
                        </div>
                        <div className="theme-info">
                          <div className="theme-name">{theme.name}</div>
                          {isLocked && <div className="theme-hint">{hints[key]}</div>}
                        </div>
                        {isActive && <span className="theme-badge">✦ ON</span>}
                      </div>
                    );
                  });
                })()}
                <button className="btn-back" onClick={() => setScreen('menu')}>← BACK</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PAUSE ── */}
      {screen === 'paused' && (
        <div className="pause-overlay">
          <div className="pause-title">PAUSED</div>
          <button className="pause-btn pause-btn-primary" onClick={resumeGame}>▶ RESUME</button>
          <button className="pause-btn pause-btn-ghost" onClick={toggleMute}>{muted?'🔇 UNMUTE':'🔊 MUTE'}</button>
          <button className="pause-btn pause-btn-ghost" style={{marginTop:4}} onClick={() => { cancelAnimationFrame(g.current?.raf||0); setScreen('menu'); }}>✕ QUIT TO MENU</button>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {screen === 'gameover' && g.current && (
        <div className="gameover-overlay">
          {/* floating coins */}
          {Array.from({length:9},(_,i) => (
            <div key={i} style={{
              position:'absolute', left:`${5+i*11}%`, bottom:'-10px',
              width:12+(i%3)*5, height:12+(i%3)*5, borderRadius:'50%',
              background:COIN_DATA[i%7].color, opacity:.45,
              animation:`floatUp ${2.6+i*.38}s ${i*.28}s linear infinite`,
              boxShadow:`0 0 8px ${COIN_DATA[i%7].color}`, pointerEvents:'none',
            }}/>
          ))}
          <div style={{position:'relative',zIndex:2,width:'100%',maxWidth:320}}>
            <div className="gameover-title">GAME OVER</div>
            <div className="gameover-sub">✦ FINAL RESULTS ✦</div>
            <div className="gameover-score-card">
              <div className="gameover-score-label">SCORE</div>
              <div className="gameover-score-val">{g.current.score.toLocaleString()}</div>
              {g.current.score >= g.current.hiScore && g.current.score > 0 && (
                <div className="gameover-new-best">✦ NEW BEST SCORE ✦</div>
              )}
            </div>
            <div className="gameover-grid">
              {[
                {label:'LINES',    val:String(g.current.lines),              color:'#6dff8b'},
                {label:'LEVEL',    val:String(g.current.level+1),            color:'#6dff8b'},
                {label:'COMBO',    val:`×${g.current.combo}`,               color:'#ff6bff'},
                {label:'HIGH SCORE',val:g.current.hiScore.toLocaleString(),  color:'#ffd84d'},
              ].map(({label,val,color}) => (
                <div key={label} className="gameover-cell">
                  <div className="gameover-cell-label">{label}</div>
                  <div className="gameover-cell-val" style={{color}}>{val}</div>
                </div>
              ))}
            </div>
            <div className="gameover-btns">
              <button className="btn-play" onClick={startGame}>▶ &nbsp; PLAY AGAIN</button>
              <button className="btn-sec" style={{width:'100%',padding:'13px 0'}} onClick={() => setScreen('menu')}>← MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOUCH controls (playing only) ── */}
      {screen === 'playing' && (
        <div className="touch-panel">
          <div className="touch-row">
            <button className="tbtn" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;if(isValidPosition(ref.board,ref.current,-1,0)){ref.current={...ref.current,x:ref.current.x-1};ref.lockMs=0;sound.move();}}}>◀</button>
            <button className="tbtn tbtn-rot" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;const r=tryRotate(ref.board,ref.current,1);if(r){ref.current=r;ref.lockMs=0;sound.rotate();}}}>↻</button>
            <button className="tbtn" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;if(isValidPosition(ref.board,ref.current,1,0)){ref.current={...ref.current,x:ref.current.x+1};ref.lockMs=0;sound.move();}}}>▶</button>
          </div>
          <div className="touch-row">
            <button className="tbtn tbtn-hold" onTouchStart={e=>{e.preventDefault();doHold();}}>HOLD</button>
            <button className="tbtn tbtn-soft"
              onTouchStart={e=>{e.preventDefault();if(g.current)g.current.softDrop=true;}}
              onTouchEnd={e=>{e.preventDefault();if(g.current)g.current.softDrop=false;}}>▼</button>
            <button className="tbtn tbtn-drop" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;const dy=getGhostY(ref.board,ref.current)-ref.current.y;ref.score+=dy*2;ref.current={...ref.current,y:ref.current.y+dy};sound.hardDrop();lockCurrent(ref,setScreen);}}>⬇</button>
          </div>
        </div>
      )}

      {/* ── HUD buttons ── */}
      <div className="hud-row">
        <button className="hud-btn" onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
        {screen === 'playing' && (
          <button className="hud-btn" onClick={() => {
            const ref=g.current; if(!ref) return;
            ref.active=false; cancelAnimationFrame(ref.raf); setScreen('paused');
          }}>⏸</button>
        )}
      </div>
    </div>
  );
}

// ── Colour helpers (UI only) ─────────────────────────────────────────────────
function lightenColor(hex: string, t: number): string {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+(255-r)*t)|0},${Math.min(255,g+(255-g)*t)|0},${Math.min(255,b+(255-b)*t)|0})`;
}
function darkenColor(hex: string, t: number): string {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${(r*(1-t))|0},${(g*(1-t))|0},${(b*(1-t))|0})`;
}
function fmtTime(s: number): string {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  if (h>0) return `${h}h ${m}m`; if (m>0) return `${m}m ${sec}s`; return `${sec}s`;
}
