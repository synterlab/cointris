import { useEffect, useRef, useCallback, useState } from 'react';
import {
  COLS, COIN_COLORS, COLORS, THEMES, type ThemeKey,
} from './game/constants';
import {
  createEmptyBoard, getNextPiece, isValidPosition, tryRotate, lockPiece,
  clearLines, calcScore, getGhostY, spawnPiece, createCoinParticles,
  getLevelFromLines, getDropInterval, loadStats, saveStats,
  loadHighScore, saveHighScore, loadTheme, saveTheme,
  loadUnlocked, saveUnlocked,
  type GameStats, type Particle, type FloatingText, type Piece,
} from './game/engine';
import {
  getCellSize, getBoardOffset, drawBackground, drawBoard, drawGhost,
  drawPiece, drawSidePanels, drawParticles, drawFloatingTexts,
} from './game/renderer';
import { sound } from './game/sound';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'stats' | 'themes';

interface GameRef {
  board: (string | null)[][];
  current: Piece;
  next: Array<{ type: string }>;
  held: string | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  particles: Particle[];
  floatingTexts: FloatingText[];
  bag: ReturnType<typeof getNextPiece>['newBag'];
  lockTimer: number;
  dropTimer: number;
  softDrop: boolean;
  screen: Screen;
  startTime: number;
  hiScore: number;
  stats: GameStats;
  theme: ThemeKey;
  unlocked: string[];
  shakeTimer: number;
  lastTime: number;
  animId: number;
  glowTimer: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = useRef<GameRef>(null!);
  const [screen, setScreen] = useState<Screen>('menu');
  const [displayScore, setDisplayScore] = useState(0);
  const touch = useRef({ startX: 0, startY: 0, startTime: 0, lastTap: 0 });
  const [muted, setMuted] = useState(false);

  // ── Game initialisation ──────────────────────────────────────────
  function initGame() {
    const bag: ReturnType<typeof getNextPiece>['newBag'] = [];
    const { piece, newBag } = getNextPiece(bag);
    g.current = {
      board: createEmptyBoard(),
      current: piece,
      next: newBag.slice(0, 5).map(t => ({ type: t })),
      held: null, canHold: true,
      score: 0, lines: 0, level: 0, combo: 0, backToBack: false,
      particles: [], floatingTexts: [],
      bag: newBag.slice(5),
      lockTimer: 0, dropTimer: 0, softDrop: false,
      screen: 'playing',
      startTime: Date.now(),
      hiScore: loadHighScore(),
      stats: loadStats(),
      theme: loadTheme() as ThemeKey,
      unlocked: loadUnlocked(),
      shakeTimer: 0,
      lastTime: performance.now(),
      animId: 0,
      glowTimer: 0,
    };
  }

  const startGame = useCallback(() => {
    initGame();
    setDisplayScore(0);
    setScreen('playing');
  }, []);

  const getThemeColors = useCallback((): Record<string, string> => {
    if (!g.current) return COIN_COLORS;
    const theme = THEMES[g.current.theme];
    return (theme?.colors as Record<string, string>) ?? COIN_COLORS;
  }, []);

  // ── Spawn next piece ─────────────────────────────────────────────
  const spawnNext = useCallback((): boolean => {
    const ref = g.current;
    if (!ref) return false;
    const nextType = ref.next[0]?.type || 'I';
    const piece = spawnPiece(nextType as any);
    const { piece: bagPiece, newBag } = getNextPiece(ref.bag);
    ref.bag = newBag;
    ref.next = [...ref.next.slice(1), { type: bagPiece.type }];
    if (!isValidPosition(ref.board, piece)) return false;
    ref.current = piece;
    ref.canHold = true;
    ref.lockTimer = 0;
    ref.glowTimer = 0.18;
    return true;
  }, []);

  // ── Lock piece ───────────────────────────────────────────────────
  const lockCurrent = useCallback(() => {
    const ref = g.current;
    if (!ref) return;
    const newBoard = lockPiece(ref.board, ref.current);
    const { board: clearedBoard, cleared, lines: clearedRows } = clearLines(newBoard);
    ref.board = clearedBoard;

    const perfectClear = clearedBoard.every(row => row.every(c => c === null));
    if (cleared > 0) {
      ref.combo++;
      const pts = calcScore(cleared, ref.level, ref.combo, ref.backToBack, perfectClear);
      ref.score += pts;
      ref.lines += cleared;
      const newLevel = getLevelFromLines(ref.lines);
      if (newLevel > ref.level) { ref.level = newLevel; sound.levelUp(); }
      ref.backToBack = cleared === 4;

      const canvas = canvasRef.current;
      if (canvas) {
        const cs = getCellSize(canvas);
        const { bx, by } = getBoardOffset(canvas, cs);
        ref.particles.push(...createCoinParticles(ref.board, clearedRows, cs, bx, by));

        const bw = cs * COLS;
        const texts: [string, string, number][] = [];
        if (cleared === 4)    texts.push(['✦ COINTRIS! ✦', COLORS.gold, 0]);
        else if (cleared === 3) texts.push(['✦ TRIPLE ✦', COLORS.accent, 0]);
        else if (cleared === 2) texts.push(['DOUBLE', COLORS.accent, 0]);
        texts.push([`+${pts.toLocaleString()}`, COLORS.gold, 30]);
        if (ref.combo > 2)    texts.push([`COMBO ×${ref.combo}`, '#FF6BFF', 60]);
        if (perfectClear)     texts.push(['✦ PERFECT! ✦', '#FFD84D', -30]);

        texts.forEach(([text, color, dy]) => {
          ref.floatingTexts.push({
            x: bx + bw / 2, y: by + 9 * cs + dy,
            text, color, vy: -0.7,
            life: 1.4, maxLife: 1.4,
          });
        });
      }

      sound.lineClear(cleared);
      if (ref.combo > 2) sound.combo(ref.combo);
      if (perfectClear) sound.perfectClear();
      ref.shakeTimer = cleared >= 4 ? 0.22 : 0.12;

      // Unlock themes
      if (ref.score >= 5000  && !ref.unlocked.includes('gold-rush'))  { ref.unlocked.push('gold-rush');  saveUnlocked(ref.unlocked); }
      if (ref.score >= 15000 && !ref.unlocked.includes('midnight'))    { ref.unlocked.push('midnight');    saveUnlocked(ref.unlocked); }
      if (ref.score >= 30000 && !ref.unlocked.includes('neon-arcade')) { ref.unlocked.push('neon-arcade'); saveUnlocked(ref.unlocked); }
    } else {
      ref.combo = 0;
      ref.backToBack = false;
    }

    if (ref.score > ref.hiScore) { ref.hiScore = ref.score; saveHighScore(ref.score); }

    setDisplayScore(ref.score);
    ref.dropTimer = 0; ref.lockTimer = 0;

    const ok = spawnNext();
    if (!ok) {
      sound.gameOver();
      const elapsed = (Date.now() - ref.startTime) / 1000;
      ref.stats.totalGames++;
      ref.stats.linesCleared  += ref.lines;
      ref.stats.highestLevel   = Math.max(ref.stats.highestLevel, ref.level + 1);
      ref.stats.totalPlayTime  += elapsed;
      ref.stats.bestScore      = Math.max(ref.stats.bestScore, ref.score);
      ref.stats.bestCombo      = Math.max(ref.stats.bestCombo, ref.combo);
      saveStats(ref.stats);
      setScreen('gameover');
    }
  }, [spawnNext]);

  // ── Game loop ────────────────────────────────────────────────────
  const gameLoop = useCallback((now: number) => {
    const ref = g.current;
    if (!ref || ref.screen !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = Math.min((now - ref.lastTime) / 1000, 0.05);
    ref.lastTime = now;

    const interval = ref.softDrop ? 50 : getDropInterval(ref.level);
    ref.dropTimer += dt * 1000;

    if (ref.dropTimer >= interval) {
      ref.dropTimer = 0;
      if (isValidPosition(ref.board, ref.current, 0, 1)) {
        ref.current = { ...ref.current, y: ref.current.y + 1 };
        if (ref.softDrop) ref.score += 1;
      } else {
        ref.lockTimer += interval;
        if (ref.lockTimer >= 500 || ref.softDrop) {
          lockCurrent();
          ref.animId = requestAnimationFrame(gameLoop);
          return;
        }
      }
    }

    if (ref.shakeTimer > 0) ref.shakeTimer -= dt;
    if (ref.glowTimer  > 0) ref.glowTimer  -= dt;

    // ── Render ───────────────────────────────────────────────────
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const cs = getCellSize(canvas);
    const { bx: baseBx, by } = getBoardOffset(canvas, cs);
    const sx = ref.shakeTimer > 0 ? (Math.random() - 0.5) * 5 : 0;
    const sy = ref.shakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
    const bx = baseBx + sx;
    const themeColors = getThemeColors();

    drawBackground(ctx, w, h, now);
    drawBoard(ctx, ref.board, bx, by + sy, cs, themeColors, [], 0);
    drawGhost(ctx, ref.board, ref.current, bx, by + sy, cs);
    drawPiece(ctx, ref.current, bx, by + sy, cs, themeColors, ref.glowTimer > 0);
    ref.particles    = drawParticles(ctx, ref.particles, dt);
    ref.floatingTexts = drawFloatingTexts(ctx, ref.floatingTexts, dt);
    drawSidePanels(
      ctx, bx, by + sy, cs * COLS, cs * 20,
      ref.score, ref.hiScore, ref.level, ref.lines, ref.combo,
      ref.next.map(n => n.type),
      ref.held, ref.canHold, themeColors, w, h
    );

    ref.animId = requestAnimationFrame(gameLoop);
  }, [getThemeColors, lockCurrent]);

  // ── Canvas resize ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Screen transitions ───────────────────────────────────────────
  useEffect(() => {
    if (screen === 'playing' && g.current) {
      g.current.screen = 'playing';
      g.current.lastTime = performance.now();
      const id = requestAnimationFrame(gameLoop);
      g.current.animId = id;
      return () => { cancelAnimationFrame(id); };
    }
    if (screen !== 'playing' && g.current) {
      g.current.screen = screen as any;
      cancelAnimationFrame(g.current.animId);
    }
    return undefined;
  }, [screen, gameLoop]);

  // ── Keyboard controls ────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'playing') return;
    const ref = () => g.current;
    function onKey(e: KeyboardEvent) {
      const r = ref(); if (!r) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA':
          e.preventDefault();
          if (isValidPosition(r.board, r.current, -1, 0)) { r.current = { ...r.current, x: r.current.x - 1 }; r.lockTimer = 0; sound.move(); }
          break;
        case 'ArrowRight': case 'KeyD':
          e.preventDefault();
          if (isValidPosition(r.board, r.current, 1, 0)) { r.current = { ...r.current, x: r.current.x + 1 }; r.lockTimer = 0; sound.move(); }
          break;
        case 'ArrowDown': case 'KeyS':
          e.preventDefault(); r.softDrop = true; break;
        case 'ArrowUp': case 'KeyX': case 'KeyW': {
          e.preventDefault();
          const rot = tryRotate(r.board, r.current, 1);
          if (rot) { r.current = rot; r.lockTimer = 0; sound.rotate(); } break;
        }
        case 'KeyZ': {
          e.preventDefault();
          const rot = tryRotate(r.board, r.current, -1);
          if (rot) { r.current = rot; r.lockTimer = 0; sound.rotate(); } break;
        }
        case 'Space': {
          e.preventDefault();
          const dy = getGhostY(r.board, r.current) - r.current.y;
          r.score += dy * 2;
          r.current = { ...r.current, y: r.current.y + dy };
          sound.hardDrop(); lockCurrent(); break;
        }
        case 'ShiftLeft': case 'ShiftRight': case 'KeyC':
          e.preventDefault(); doHold(); break;
        case 'KeyP': case 'Escape':
          e.preventDefault(); setScreen('paused'); break;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const r = ref(); if (!r) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') r.softDrop = false;
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [screen, lockCurrent]);

  function doHold() {
    const ref = g.current; if (!ref || !ref.canHold) return;
    const prev = ref.held;
    ref.held = ref.current.type;
    ref.canHold = false;
    sound.hold();
    if (prev) { ref.current = spawnPiece(prev as any); }
    else { if (!spawnNext()) setScreen('gameover'); }
  }

  // ── Touch controls ───────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), lastTap: touch.current.lastTap };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (screen !== 'playing') return;
    const ref = g.current; if (!ref) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.startX;
    const dy = t.clientY - touch.current.startY;
    const dt = Date.now() - touch.current.startTime;

    if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      const d = getGhostY(ref.board, ref.current) - ref.current.y;
      ref.score += d * 2; ref.current = { ...ref.current, y: ref.current.y + d };
      sound.hardDrop(); lockCurrent(); return;
    }
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const dir = dx > 0 ? 1 : -1;
      const steps = Math.min(5, Math.floor(Math.abs(dx) / 28));
      let moved = 0;
      for (let i = 0; i < steps; i++) {
        if (isValidPosition(ref.board, { ...ref.current, x: ref.current.x + dir })) { ref.current = { ...ref.current, x: ref.current.x + dir }; moved++; }
      }
      if (moved) { sound.move(); ref.lockTimer = 0; } return;
    }
    const now = Date.now();
    if (now - touch.current.lastTap < 280 && dt < 200) {
      const rot = tryRotate(ref.board, ref.current, 1);
      if (rot) { ref.current = rot; ref.lockTimer = 0; sound.rotate(); }
      touch.current.lastTap = 0; return;
    }
    touch.current.lastTap = now;
    if (dt < 200 && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dir = (t.clientX - rect.left) < rect.width / 2 ? -1 : 1;
      if (isValidPosition(ref.board, ref.current, dir, 0)) { ref.current = { ...ref.current, x: ref.current.x + dir }; ref.lockTimer = 0; sound.move(); }
    }
  }

  const toggleMute = useCallback(() => {
    const m = !sound.isMuted(); sound.setMuted(m); setMuted(m);
  }, []);

  // ── Screens ──────────────────────────────────────────────────────
  if (screen === 'menu') {
    return <MenuScreen
      onStart={startGame}
      onStats={() => setScreen('stats')}
      onThemes={() => setScreen('themes')}
      hiScore={g.current?.hiScore ?? loadHighScore()}
      muted={muted} onMute={toggleMute}
    />;
  }
  if (screen === 'stats') {
    return <StatsScreen stats={g.current?.stats ?? loadStats()} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'themes') {
    const unlocked = g.current?.unlocked ?? loadUnlocked();
    const cur = (g.current?.theme ?? loadTheme()) as ThemeKey;
    return <ThemesScreen unlocked={unlocked} currentTheme={cur}
      onSelect={t => { if (g.current) { g.current.theme = t; saveTheme(t); } else saveTheme(t); setScreen('menu'); }}
      onBack={() => setScreen('menu')}
    />;
  }
  if (screen === 'paused') {
    return (
      <div className="game-wrap" style={{ background: '#0B0B10' }}>
        <canvas ref={canvasRef} className="game-canvas" />
        <div className="pause-overlay">
          <div className="pause-title">PAUSED</div>
          <button className="pause-btn pause-btn-primary" onClick={() => setScreen('playing')}>▶ RESUME</button>
          <button className="pause-btn pause-btn-secondary" onClick={() => { toggleMute(); }}>{muted ? '🔇 UNMUTE' : '🔊 MUTE'}</button>
          <button className="pause-btn pause-btn-secondary" style={{ marginTop: 4 }} onClick={() => setScreen('menu')}>✕ QUIT</button>
        </div>
      </div>
    );
  }

  // Playing / Game Over — canvas screen
  return (
    <div className="game-wrap" style={{ background: '#0B0B10' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <canvas ref={canvasRef} className="game-canvas" />

      {/* Game over overlay */}
      {screen === 'gameover' && g.current && (
        <GameOverOverlay
          score={g.current.score}
          hiScore={g.current.hiScore}
          lines={g.current.lines}
          level={g.current.level + 1}
          combo={g.current.stats.bestCombo}
          onRestart={startGame}
          onMenu={() => setScreen('menu')}
        />
      )}

      {/* Touch controls */}
      {screen === 'playing' && (
        <div className="touch-controls">
          <div className="touch-row">
            <button className="touch-btn" onTouchStart={() => {
              const r = g.current; if (!r) return;
              if (isValidPosition(r.board, r.current, -1, 0)) { r.current = { ...r.current, x: r.current.x - 1 }; r.lockTimer = 0; sound.move(); }
            }}>◀</button>
            <button className="touch-btn rotate-btn" onTouchStart={() => {
              const r = g.current; if (!r) return;
              const rot = tryRotate(r.board, r.current, 1);
              if (rot) { r.current = rot; r.lockTimer = 0; sound.rotate(); }
            }}>↻</button>
            <button className="touch-btn" onTouchStart={() => {
              const r = g.current; if (!r) return;
              if (isValidPosition(r.board, r.current, 1, 0)) { r.current = { ...r.current, x: r.current.x + 1 }; r.lockTimer = 0; sound.move(); }
            }}>▶</button>
          </div>
          <div className="touch-row">
            <button className="touch-btn hold-btn" onTouchStart={() => doHold()}>HOLD</button>
            <button className="touch-btn drop-btn"
              onTouchStart={() => { if (g.current) g.current.softDrop = true; }}
              onTouchEnd={() => { if (g.current) g.current.softDrop = false; }}>▼</button>
            <button className="touch-btn hard-drop-btn" onTouchStart={() => {
              const r = g.current; if (!r) return;
              const dy = getGhostY(r.board, r.current) - r.current.y;
              r.score += dy * 2; r.current = { ...r.current, y: r.current.y + dy };
              sound.hardDrop(); lockCurrent();
            }}>⬇</button>
          </div>
        </div>
      )}

      <div className="hud-btns">
        <button className="hud-btn" onClick={toggleMute}>{muted ? '🔇' : '🔊'}</button>
        {screen === 'playing' && <button className="hud-btn" onClick={() => setScreen('paused')}>⏸</button>}
      </div>
    </div>
  );
}

// ─── MENU ────────────────────────────────────────────────────────────────────
const COIN_DATA = [
  { label: 'G', name: 'Gold',    color: '#FFD84D', delay: '0s' },
  { label: 'S', name: 'Silver',  color: '#C8C8D8', delay: '0.18s' },
  { label: 'R', name: 'Ruby',    color: '#FF5D5D', delay: '0.36s' },
  { label: 'E', name: 'Emerald', color: '#6DFF8B', delay: '0.54s' },
  { label: 'P', name: 'Plasma',  color: '#FF6BFF', delay: '0.72s' },
  { label: 'D', name: 'Diamond', color: '#6BDDFF', delay: '0.90s' },
  { label: 'N', name: 'Nova',    color: '#FF9F3F', delay: '1.08s' },
];

function MenuScreen({ onStart, onStats, onThemes, hiScore, muted, onMute }:
  { onStart: () => void; onStats: () => void; onThemes: () => void; hiScore: number; muted: boolean; onMute: () => void; }) {

  return (
    <div className="menu-screen">
      {/* Layered background */}
      <div className="menu-bg-grid" />
      <div className="menu-scanline" />
      <div className="menu-vignette" />

      {/* Floating background coins */}
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${10 + i * 12}%`,
          bottom: '-20px',
          width: 16, height: 16,
          borderRadius: '50%',
          background: COIN_DATA[i % 7].color,
          opacity: 0.08 + (i % 3) * 0.04,
          animation: `float-up ${4 + i * 0.7}s ${i * 0.5}s linear infinite`,
          boxShadow: `0 0 8px ${COIN_DATA[i % 7].color}`,
          pointerEvents: 'none',
        }} />
      ))}

      <div className="menu-content">
        {/* Logo */}
        <div className="logo-wrap">
          <div className="logo-text">
            <span className="logo-coin">COIN</span><span className="logo-tris">TRIS</span>
          </div>
          <div className="logo-tagline">✦ CRYPTO ARCADE PUZZLE ✦</div>
        </div>

        {/* Coin row */}
        <div className="coin-row">
          {COIN_DATA.map(coin => (
            <div key={coin.label} className="coin-chip">
              <div className="coin-circle" style={{
                background: `radial-gradient(circle at 35% 32%, ${lightenHex(coin.color, 0.4)}, ${coin.color} 50%, ${darkenHex(coin.color, 0.3)})`,
                boxShadow: `0 3px 10px rgba(0,0,0,0.45), 0 0 14px ${coin.color}44, inset 0 1px 2px rgba(255,255,255,0.28)`,
                animationDelay: coin.delay,
                '--bob-delay': coin.delay,
              } as React.CSSProperties}>
                {coin.label}
              </div>
            </div>
          ))}
        </div>

        {/* Hi-score */}
        {hiScore > 0 && (
          <div className="hiscore-badge">
            <span className="hiscore-label">BEST</span>
            <span className="hiscore-value">{hiScore.toLocaleString()}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="menu-buttons">
          <button className="play-btn" onClick={onStart}>▶ &nbsp; PLAY</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="menu-btn" onClick={onStats}>STATS</button>
            <button className="menu-btn" onClick={onThemes}>THEMES</button>
          </div>
        </div>

        {/* Controls */}
        <div className="controls-hint">
          <div><span>← →</span> MOVE &nbsp;·&nbsp; <span>↑ / X</span> ROTATE &nbsp;·&nbsp; <span>Z</span> CCW</div>
          <div><span>↓</span> SOFT DROP &nbsp;·&nbsp; <span>SPACE</span> HARD DROP</div>
          <div><span>C / SHIFT</span> HOLD &nbsp;·&nbsp; <span>P</span> PAUSE</div>
        </div>
      </div>

      <button className="menu-mute" onClick={onMute}>{muted ? '🔇' : '🔊'}</button>
    </div>
  );
}

// ─── GAME OVER ───────────────────────────────────────────────────────────────
function GameOverOverlay({ score, hiScore, lines, level, combo, onRestart, onMenu }:
  { score: number; hiScore: number; lines: number; level: number; combo: number; onRestart: () => void; onMenu: () => void; }) {

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40,
      background: 'rgba(11,11,16,0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fadeInUp 0.3s ease both',
      padding: '0 20px',
    }}>
      {/* Floating coin particles */}
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${5 + i * 10}%`,
          bottom: '-10px',
          width: 12 + (i % 3) * 4, height: 12 + (i % 3) * 4,
          borderRadius: '50%',
          background: COIN_DATA[i % 7].color,
          opacity: 0.5,
          animation: `float-up ${2.5 + i * 0.4}s ${i * 0.3}s linear infinite`,
          boxShadow: `0 0 8px ${COIN_DATA[i % 7].color}`,
          pointerEvents: 'none',
        }} />
      ))}

      <div style={{ maxWidth: 320, width: '100%', position: 'relative', zIndex: 2 }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#FF5D5D', letterSpacing: '0.15em',
            textShadow: '0 0 30px rgba(255,93,93,0.55)', fontFamily: 'monospace' }}>
            GAME OVER
          </div>
          <div style={{ fontSize: 11, color: '#5A5A6A', letterSpacing: '0.3em', marginTop: 4, fontFamily: 'monospace' }}>
            ✦ FINAL RESULTS ✦
          </div>
        </div>

        {/* Score hero */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,216,77,0.12), rgba(255,216,77,0.06))',
          border: '1px solid rgba(255,216,77,0.3)',
          borderRadius: 16, padding: '20px 0', textAlign: 'center', marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: '#8C8C99', letterSpacing: '0.2em', fontFamily: 'monospace', marginBottom: 6 }}>SCORE</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: '#FFD84D', fontFamily: 'monospace',
            textShadow: '0 0 24px rgba(255,216,77,0.5)' }}>{score.toLocaleString()}</div>
          {score >= hiScore && score > 0 && (
            <div style={{ fontSize: 11, color: '#6DFF8B', marginTop: 6, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
              ✦ NEW BEST SCORE ✦
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'LINES',    value: String(lines),       color: COLORS.accent },
            { label: 'LEVEL',    value: String(level),       color: COLORS.accent },
            { label: 'BEST COMBO', value: `×${combo}`,      color: '#FF6BFF' },
            { label: 'HIGH SCORE', value: hiScore.toLocaleString(), color: '#FFD84D' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10, padding: '12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: '#5A5A6A', letterSpacing: '0.15em', fontFamily: 'monospace', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <button className="play-btn" style={{ width: '100%', marginBottom: 10 }} onClick={onRestart}>
          ▶ &nbsp; PLAY AGAIN
        </button>
        <button className="menu-btn" style={{ width: '100%' }} onClick={onMenu}>← MENU</button>
      </div>
    </div>
  );
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function StatsScreen({ stats, onBack }: { stats: GameStats; onBack: () => void }) {
  const rows: [string, string, string][] = [
    ['Total Games',     stats.totalGames.toString(),         COLORS.text],
    ['Lines Cleared',   stats.linesCleared.toLocaleString(), COLORS.accent],
    ['Highest Level',   stats.highestLevel.toString(),       COLORS.accent],
    ['Best Score',      stats.bestScore.toLocaleString(),    '#FFD84D'],
    ['Best Combo',      `×${stats.bestCombo}`,              '#FF6BFF'],
    ['Total Play Time', formatTime(stats.totalPlayTime),     COLORS.text],
  ];
  return (
    <div className="inner-screen">
      <div className="inner-screen-bg-grid" />
      <div className="inner-screen-content">
        <div className="screen-title">STATISTICS</div>
        <div className="screen-subtitle">your cointris career</div>
        {rows.map(([label, value, color]) => (
          <div key={label} className="stat-row">
            <span className="stat-label">{label}</span>
            <span className="stat-value" style={{ color }}>{value}</span>
          </div>
        ))}
        <button className="back-btn" onClick={onBack}>← BACK</button>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ─── THEMES ──────────────────────────────────────────────────────────────────
function ThemesScreen({ unlocked, currentTheme, onSelect, onBack }:
  { unlocked: string[]; currentTheme: ThemeKey; onSelect: (t: ThemeKey) => void; onBack: () => void }) {

  const UNLOCK_HINTS: Record<string, string> = {
    'gold-rush': 'Earn 5,000 pts', midnight: 'Earn 15,000 pts', 'neon-arcade': 'Earn 30,000 pts',
  };

  return (
    <div className="inner-screen">
      <div className="inner-screen-bg-grid" />
      <div className="inner-screen-content">
        <div className="screen-title">THEMES</div>
        <div className="screen-subtitle">unlock by earning points</div>
        {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => {
          const isUnlocked = unlocked.includes(key);
          const isActive   = key === currentTheme;
          const dots = Object.values(theme.colors as Record<string, string>).slice(0, 5);
          return (
            <div key={key}
              className={`theme-row${isActive ? ' theme-row-active' : ''}${!isUnlocked ? ' theme-row-locked' : ''}`}
              onClick={() => isUnlocked && onSelect(key)}>
              <div className="theme-dots">
                {dots.map((c, i) => (
                  <div key={i} className="theme-dot" style={{ background: isUnlocked ? c : '#3A3A4A', boxShadow: isUnlocked ? `0 0 5px ${c}88` : 'none', color: c }} />
                ))}
              </div>
              <div>
                <div className="theme-name">{theme.name}</div>
                {!isUnlocked && <div className="theme-unlock-hint">{UNLOCK_HINTS[key]}</div>}
              </div>
              {isActive && <div className="theme-active-badge">✦ ON</div>}
            </div>
          );
        })}
        <button className="back-btn" onClick={onBack}>← BACK</button>
      </div>
    </div>
  );
}

// ─── Colour utils ─────────────────────────────────────────────────────────────
function lightenHex(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+255*amt)|0},${Math.min(255,g+255*amt)|0},${Math.min(255,b+255*amt)|0})`;
}
function darkenHex(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-255*amt)|0},${Math.max(0,g-255*amt)|0},${Math.max(0,b-255*amt)|0})`;
}
