import { useEffect, useRef, useCallback, useState } from 'react';
import {
  COLS, ROWS, COIN_COLORS, COLORS, THEMES, type ThemeKey,
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
  clearRows: number[];
  clearAnim: number;
  lockDelay: number;
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
}

function initialPiece(bag: ReturnType<typeof getNextPiece>['newBag']) {
  return getNextPiece(bag);
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = useRef<GameRef>(null!);
  const [screen, setScreen] = useState<Screen>('menu');
  const [, forceUpdate] = useState(0);

  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  // Touch tracking
  const touch = useRef({ startX: 0, startY: 0, startTime: 0, lastTap: 0 });
  const [muted, setMuted] = useState(false);

  function initGame(ref: React.MutableRefObject<GameRef>) {
    const bag: ReturnType<typeof getNextPiece>['newBag'] = [];
    const { piece, newBag } = getNextPiece(bag);
    const nexts: typeof newBag = newBag;
    const stats = loadStats();
    const hiScore = loadHighScore();
    const theme = loadTheme() as ThemeKey;
    const unlocked = loadUnlocked();

    ref.current = {
      board: createEmptyBoard(),
      current: piece,
      next: nexts.slice(0, 5).map(t => ({ type: t })),
      held: null,
      canHold: true,
      score: 0,
      lines: 0,
      level: 0,
      combo: 0,
      backToBack: false,
      particles: [],
      floatingTexts: [],
      bag: nexts.slice(5),
      clearRows: [],
      clearAnim: 0,
      lockDelay: 0,
      lockTimer: 0,
      dropTimer: 0,
      softDrop: false,
      screen: 'playing',
      startTime: Date.now(),
      hiScore,
      stats,
      theme,
      unlocked,
      shakeTimer: 0,
      lastTime: performance.now(),
      animId: 0,
    };
  }

  const startGame = useCallback(() => {
    initGame(g);
    setScreen('playing');
  }, []);

  const getThemeColors = useCallback((): Record<string, string> => {
    if (!g.current) return COIN_COLORS;
    const t = g.current.theme;
    const theme = THEMES[t];
    if (theme?.colors) return theme.colors as Record<string, string>;
    return COIN_COLORS;
  }, []);

  // Spawn next piece
  const spawnNext = useCallback(() => {
    const ref = g.current;
    if (!ref) return false;
    const nextType = ref.next[0]?.type || 'I';
    const piece = spawnPiece(nextType as any);

    // Get more pieces from bag
    const { piece: bagPiece, newBag } = getNextPiece(ref.bag);
    ref.bag = newBag;
    ref.next = [...ref.next.slice(1), { type: bagPiece.type }];

    // Check game over
    if (!isValidPosition(ref.board, piece)) {
      return false; // game over
    }
    ref.current = piece;
    ref.canHold = true;
    ref.lockTimer = 0;
    return true;
  }, []);

  const lockCurrent = useCallback(() => {
    const ref = g.current;
    if (!ref) return;

    const { board: newBoard } = { board: lockPiece(ref.board, ref.current) };
    const { board: clearedBoard, cleared, lines: clearedRows } = clearLines(newBoard);

    ref.board = clearedBoard;

    // Scoring
    const prevBackToBack = ref.backToBack;
    const perfectClear = clearedBoard.every(row => row.every(c => c === null));

    if (cleared > 0) {
      ref.combo++;
      const newBackToBack = cleared === 4 || (prevBackToBack && cleared >= 4);
      const pts = calcScore(cleared, ref.level, ref.combo, prevBackToBack, perfectClear);
      ref.score += pts;
      ref.lines += cleared;
      const newLevel = getLevelFromLines(ref.lines);
      if (newLevel > ref.level) {
        ref.level = newLevel;
        sound.levelUp();
      }
      ref.backToBack = cleared === 4;

      // Particles for cleared lines
      const canvas = canvasRef.current;
      if (canvas) {
        const cellSize = getCellSize(canvas);
        const { bx, by } = getBoardOffset(canvas, cellSize);
        ref.particles.push(...createCoinParticles(ref.board, clearedRows, cellSize, bx, by));
      }

      // Floating score text
      const canvas2 = canvasRef.current;
      if (canvas2) {
        const cellSize = getCellSize(canvas2);
        const { bx, by } = getBoardOffset(canvas2, cellSize);
        ref.floatingTexts.push({
          x: bx + COLS * cellSize / 2,
          y: by + ROWS * cellSize / 2,
          text: cleared === 4 ? '✦ COINTRIS! ✦' : cleared === 3 ? '✦ TRIPLE ✦' : cleared === 2 ? '✦ DOUBLE ✦' : '+' + pts,
          life: 1.2,
          maxLife: 1.2,
          color: cleared === 4 ? COLORS.gold : COLORS.accent,
          vy: -0.8,
        });
        if (ref.combo > 2) {
          ref.floatingTexts.push({
            x: bx + COLS * cellSize / 2,
            y: by + ROWS * cellSize / 2 + 28,
            text: `COMBO ×${ref.combo}`,
            life: 1.0,
            maxLife: 1.0,
            color: '#FF6BFF',
            vy: -0.6,
          });
        }
        if (perfectClear) {
          ref.floatingTexts.push({
            x: bx + COLS * cellSize / 2,
            y: by + ROWS * cellSize / 2 - 28,
            text: '✦ PERFECT! ✦',
            life: 1.5,
            maxLife: 1.5,
            color: COLORS.gold,
            vy: -0.5,
          });
          sound.perfectClear();
        }
      }

      sound.lineClear(cleared);
      if (ref.combo > 2) sound.combo(ref.combo);
      ref.shakeTimer = 0.15;

      // Unlock themes
      if (ref.score >= 5000 && !ref.unlocked.includes('gold-rush')) {
        ref.unlocked.push('gold-rush');
        saveUnlocked(ref.unlocked);
      }
      if (ref.score >= 15000 && !ref.unlocked.includes('midnight')) {
        ref.unlocked.push('midnight');
        saveUnlocked(ref.unlocked);
      }
      if (ref.score >= 30000 && !ref.unlocked.includes('neon-arcade')) {
        ref.unlocked.push('neon-arcade');
        saveUnlocked(ref.unlocked);
      }
    } else {
      ref.combo = 0;
      ref.backToBack = false;
    }

    if (ref.score > ref.hiScore) {
      ref.hiScore = ref.score;
      saveHighScore(ref.score);
    }

    ref.dropTimer = 0;
    ref.lockTimer = 0;
    const ok = spawnNext();
    if (!ok) {
      // Game over
      sound.gameOver();
      const elapsed = (Date.now() - ref.startTime) / 1000;
      ref.stats.totalGames++;
      ref.stats.linesCleared += ref.lines;
      ref.stats.highestLevel = Math.max(ref.stats.highestLevel, ref.level + 1);
      ref.stats.totalPlayTime += elapsed;
      ref.stats.bestScore = Math.max(ref.stats.bestScore, ref.score);
      ref.stats.bestCombo = Math.max(ref.stats.bestCombo, ref.combo);
      saveStats(ref.stats);
      setScreen('gameover');
    }
  }, [spawnNext]);

  // Game loop
  const gameLoop = useCallback((now: number) => {
    const ref = g.current;
    if (!ref || ref.screen !== 'playing') return;
    if (screen !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = Math.min((now - ref.lastTime) / 1000, 0.05);
    ref.lastTime = now;

    // Drop timer
    const interval = ref.softDrop ? 50 : getDropInterval(ref.level);
    ref.dropTimer += dt * 1000;
    if (ref.dropTimer >= interval) {
      ref.dropTimer = 0;
      if (isValidPosition(ref.board, ref.current, 0, 1)) {
        ref.current = { ...ref.current, y: ref.current.y + 1 };
        if (ref.softDrop) ref.score += 1;
      } else {
        // Lock delay
        ref.lockTimer += interval;
        if (ref.lockTimer >= 500 || ref.softDrop) {
          lockCurrent();
          ref.animId = requestAnimationFrame(gameLoop);
          return;
        }
      }
    }

    // Shake
    if (ref.shakeTimer > 0) ref.shakeTimer -= dt;

    // Render
    const cellSize = getCellSize(canvas);
    const { bx: baseBx, by } = getBoardOffset(canvas, cellSize);
    const shakeX = ref.shakeTimer > 0 ? (Math.random() - 0.5) * 5 : 0;
    const shakeY = ref.shakeTimer > 0 ? (Math.random() - 0.5) * 5 : 0;
    const bx = baseBx + shakeX;

    const themeColors = getThemeColors();

    drawBackground(ctx, canvas.width, canvas.height, now);
    drawBoard(ctx, ref.board, bx, by + shakeY, cellSize, themeColors, [], 0);
    if (ref.current) {
      drawGhost(ctx, ref.board, ref.current, bx, by + shakeY, cellSize);
      drawPiece(ctx, ref.current, bx, by + shakeY, cellSize, themeColors);
    }
    ref.particles = drawParticles(ctx, ref.particles, dt);
    ref.floatingTexts = drawFloatingTexts(ctx, ref.floatingTexts, dt);

    drawSidePanels(
      ctx, bx, by + shakeY, cellSize * COLS, cellSize * ROWS,
      ref.score, ref.hiScore, ref.level, ref.lines, ref.combo,
      ref.next.map(n => n.type),
      ref.held, ref.canHold, themeColors,
      canvas.width
    );

    // HUD top - COINTRIS logo on mobile
    if (canvas.width < 500) {
      ctx.save();
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = COLORS.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('COINTRIS', canvas.width / 2, 6);
      ctx.restore();
    }

    ref.animId = requestAnimationFrame(gameLoop);
  }, [screen, getThemeColors, lockCurrent]);

  // Resize canvas
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Start animation when screen changes to playing
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
  }, [screen, gameLoop]);

  // Draw static screens
  useEffect(() => {
    if (screen === 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    drawBackground(ctx, w, h, 0);

    if (screen === 'gameover' && g.current) {
      const ref = g.current;
      // Draw ghosted board
      const cellSize = getCellSize(canvas);
      const { bx, by } = getBoardOffset(canvas, cellSize);
      ctx.save();
      ctx.globalAlpha = 0.3;
      drawBoard(ctx, ref.board, bx, by, cellSize, getThemeColors(), [], 0);
      ctx.restore();

      // Overlay
      ctx.fillStyle = 'rgba(14,14,17,0.82)';
      ctx.fillRect(0, 0, w, h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = 'bold 36px monospace';
      ctx.fillStyle = COLORS.danger;
      ctx.fillText('GAME OVER', w / 2, h / 2 - 120);

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText('SCORE', w / 2, h / 2 - 70);
      ctx.font = 'bold 42px monospace';
      ctx.fillStyle = COLORS.gold;
      ctx.fillText(ref.score.toLocaleString(), w / 2, h / 2 - 42);

      const rows: [string, string, string][] = [
        ['LINES', String(ref.lines), COLORS.accent],
        ['LEVEL', String(ref.level + 1), COLORS.accent],
        ['BEST COMBO', `×${ref.stats.bestCombo}`, '#FF6BFF'],
        ['HIGH SCORE', ref.hiScore.toLocaleString(), COLORS.gold],
      ];
      rows.forEach(([label, val, color], i) => {
        ctx.font = '11px monospace';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(label, w / 2 - 40, h / 2 + 10 + i * 32);
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = color;
        ctx.fillText(val, w / 2 + 60, h / 2 + 10 + i * 32);
      });

      // Buttons
      drawButton(ctx, w / 2, h / 2 + 155, 160, 40, 'PLAY AGAIN', COLORS.accent, '#000');
      drawButton(ctx, w / 2, h / 2 + 205, 160, 36, 'MENU', COLORS.muted, COLORS.text);
    }
  }, [screen, getThemeColors]);

  function drawButton(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, w: number, h: number,
    text: string, bg: string, fg: string
  ) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  // Keyboard controls
  useEffect(() => {
    if (screen !== 'playing') return;

    function handleKey(e: KeyboardEvent) {
      const ref = g.current;
      if (!ref) return;

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          if (isValidPosition(ref.board, ref.current, -1, 0)) {
            ref.current = { ...ref.current, x: ref.current.x - 1 };
            ref.lockTimer = 0;
            sound.move();
          }
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          if (isValidPosition(ref.board, ref.current, 1, 0)) {
            ref.current = { ...ref.current, x: ref.current.x + 1 };
            ref.lockTimer = 0;
            sound.move();
          }
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          ref.softDrop = true;
          break;
        case 'ArrowUp':
        case 'KeyX':
        case 'KeyW':
          e.preventDefault();
          {
            const rotated = tryRotate(ref.board, ref.current, 1);
            if (rotated) {
              ref.current = rotated;
              ref.lockTimer = 0;
              sound.rotate();
            }
          }
          break;
        case 'KeyZ':
          e.preventDefault();
          {
            const rotated = tryRotate(ref.board, ref.current, -1);
            if (rotated) {
              ref.current = rotated;
              ref.lockTimer = 0;
              sound.rotate();
            }
          }
          break;
        case 'Space':
          e.preventDefault();
          {
            // Hard drop
            const dy = getGhostY(ref.board, ref.current) - ref.current.y;
            ref.score += dy * 2;
            ref.current = { ...ref.current, y: ref.current.y + dy };
            sound.hardDrop();
            lockCurrent();
          }
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyC':
          e.preventDefault();
          handleHold();
          break;
        case 'KeyP':
        case 'Escape':
          e.preventDefault();
          setScreen('paused');
          break;
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const ref = g.current;
      if (!ref) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        ref.softDrop = false;
      }
    }

    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screen, lockCurrent]);

  function handleHold() {
    const ref = g.current;
    if (!ref || !ref.canHold) return;
    const prevHeld = ref.held;
    ref.held = ref.current.type;
    ref.canHold = false;
    sound.hold();
    if (prevHeld) {
      ref.current = spawnPiece(prevHeld as any);
    } else {
      const ok = spawnNext();
      if (!ok) {
        setScreen('gameover');
      }
    }
  }

  // Touch controls
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current.startX = t.clientX;
    touch.current.startY = t.clientY;
    touch.current.startTime = Date.now();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (screen !== 'playing') return;
    const ref = g.current;
    if (!ref) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.startX;
    const dy = t.clientY - touch.current.startY;
    const dt = Date.now() - touch.current.startTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDy > 60 && absDy > absDx * 1.5) {
      // Swipe down = hard drop
      const dropDy = getGhostY(ref.board, ref.current) - ref.current.y;
      ref.score += dropDy * 2;
      ref.current = { ...ref.current, y: ref.current.y + dropDy };
      sound.hardDrop();
      lockCurrent();
      return;
    }

    if (absDx > 30 && absDx > absDy * 1.5) {
      // Swipe left/right
      const dir = dx > 0 ? 1 : -1;
      let moved = 0;
      const steps = Math.min(5, Math.floor(absDx / 30));
      for (let i = 0; i < steps; i++) {
        if (isValidPosition(ref.board, { ...ref.current, x: ref.current.x + dir }, 0, 0)) {
          ref.current = { ...ref.current, x: ref.current.x + dir };
          moved++;
        }
      }
      if (moved) { sound.move(); ref.lockTimer = 0; }
      return;
    }

    // Tap = check double tap for rotate, or single tap for left/right
    const now = Date.now();
    const timeSinceLastTap = now - touch.current.lastTap;

    if (timeSinceLastTap < 300 && dt < 200) {
      // Double tap = rotate
      const rotated = tryRotate(ref.board, ref.current, 1);
      if (rotated) {
        ref.current = rotated;
        ref.lockTimer = 0;
        sound.rotate();
      }
      touch.current.lastTap = 0;
      return;
    }

    touch.current.lastTap = now;

    // Single tap: left half = left, right half = right
    if (dt < 200 && absDx < 20 && absDy < 20) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const tapX = t.clientX - rect.left;
      const dir = tapX < rect.width / 2 ? -1 : 1;
      if (isValidPosition(ref.board, ref.current, dir, 0)) {
        ref.current = { ...ref.current, x: ref.current.x + dir };
        ref.lockTimer = 0;
        sound.move();
      }
    }
  }

  function handleSoftDropStart() {
    if (g.current) g.current.softDrop = true;
  }

  function handleSoftDropEnd() {
    if (g.current) g.current.softDrop = false;
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (screen !== 'gameover') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const cy1 = h / 2 + 155;
    const cy2 = h / 2 + 205;
    if (y >= cy1 - 20 && y <= cy1 + 20 && x >= w / 2 - 80 && x <= w / 2 + 80) {
      startGame();
    } else if (y >= cy2 - 18 && y <= cy2 + 18 && x >= w / 2 - 80 && x <= w / 2 + 80) {
      setScreen('menu');
    }
  }

  const toggleMute = useCallback(() => {
    const m = !sound.isMuted();
    sound.setMuted(m);
    setMuted(m);
  }, []);

  // MENU SCREEN
  if (screen === 'menu') {
    return <MenuScreen
      onStart={startGame}
      onStats={() => setScreen('stats')}
      onThemes={() => setScreen('themes')}
      hiScore={g.current?.hiScore ?? loadHighScore()}
      muted={muted}
      onMute={toggleMute}
    />;
  }

  if (screen === 'stats') {
    const stats = g.current?.stats ?? loadStats();
    return <StatsScreen stats={stats} onBack={() => setScreen('menu')} />;
  }

  if (screen === 'themes') {
    const unlocked = g.current?.unlocked ?? loadUnlocked();
    const currentTheme = g.current?.theme ?? loadTheme() as ThemeKey;
    return <ThemesScreen
      unlocked={unlocked}
      currentTheme={currentTheme}
      onSelect={(t) => {
        if (g.current) { g.current.theme = t; saveTheme(t); }
        else saveTheme(t);
        setScreen('menu');
      }}
      onBack={() => setScreen('menu')}
    />;
  }

  if (screen === 'paused') {
    return (
      <div className="game-wrap" style={{ background: COLORS.background }}>
        <canvas ref={canvasRef} className="game-canvas" />
        <div className="overlay-center" style={{ background: 'rgba(14,14,17,0.92)' }}>
          <div style={{ color: COLORS.accent, fontFamily: 'monospace', fontSize: 28, fontWeight: 'bold', marginBottom: 24 }}>PAUSED</div>
          <button className="game-btn" onClick={() => setScreen('playing')}>RESUME</button>
          <button className="game-btn" style={{ marginTop: 12, background: COLORS.muted }} onClick={() => setScreen('menu')}>QUIT</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="game-wrap"
      style={{ background: COLORS.background }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onClick={handleCanvasClick}
        style={{ cursor: screen === 'gameover' ? 'pointer' : 'default' }}
      />

      {screen === 'playing' && (
        <div className="touch-controls">
          <div className="touch-row">
            <button className="touch-btn" onTouchStart={() => {
              const ref = g.current;
              if (!ref) return;
              if (isValidPosition(ref.board, ref.current, -1, 0)) {
                ref.current = { ...ref.current, x: ref.current.x - 1 };
                ref.lockTimer = 0; sound.move();
              }
            }}>◀</button>
            <button className="touch-btn rotate-btn" onTouchStart={() => {
              const ref = g.current;
              if (!ref) return;
              const r = tryRotate(ref.board, ref.current, 1);
              if (r) { ref.current = r; ref.lockTimer = 0; sound.rotate(); }
            }}>↻</button>
            <button className="touch-btn" onTouchStart={() => {
              const ref = g.current;
              if (!ref) return;
              if (isValidPosition(ref.board, ref.current, 1, 0)) {
                ref.current = { ...ref.current, x: ref.current.x + 1 };
                ref.lockTimer = 0; sound.move();
              }
            }}>▶</button>
          </div>
          <div className="touch-row">
            <button className="touch-btn hold-btn" onTouchStart={() => handleHold()}>HOLD</button>
            <button
              className="touch-btn drop-btn"
              onTouchStart={handleSoftDropStart}
              onTouchEnd={handleSoftDropEnd}
            >▼</button>
            <button className="touch-btn hard-drop-btn" onTouchStart={() => {
              const ref = g.current;
              if (!ref) return;
              const dy = getGhostY(ref.board, ref.current) - ref.current.y;
              ref.score += dy * 2;
              ref.current = { ...ref.current, y: ref.current.y + dy };
              sound.hardDrop();
              lockCurrent();
            }}>⬇</button>
          </div>
        </div>
      )}

      <div className="hud-btns">
        <button className="hud-btn" onClick={toggleMute}>{muted ? '🔇' : '🔊'}</button>
        {screen === 'playing' && (
          <button className="hud-btn" onClick={() => setScreen('paused')}>⏸</button>
        )}
      </div>
    </div>
  );
}

// ─── MENU SCREEN ─────────────────────────────────────────────────────────────
function MenuScreen({
  onStart, onStats, onThemes, hiScore, muted, onMute,
}: {
  onStart: () => void;
  onStats: () => void;
  onThemes: () => void;
  hiScore: number;
  muted: boolean;
  onMute: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const coins = ['G', 'S', 'R', 'E', 'P', 'D', 'N'];
  const coinColors = Object.values(COIN_COLORS);

  return (
    <div style={{
      background: COLORS.background,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      position: 'relative',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Floating background coins */}
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${(i * 8 + 4) % 100}%`,
          top: `${((i * 7 + tick * 0.5) % 110) - 10}%`,
          width: 20, height: 20,
          borderRadius: '50%',
          background: coinColors[i % coinColors.length],
          opacity: 0.06 + (i % 3) * 0.04,
          transition: 'top 0.08s linear',
          boxShadow: `0 0 8px ${coinColors[i % coinColors.length]}`,
        }} />
      ))}

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          fontSize: 'clamp(36px, 10vw, 64px)',
          fontWeight: 900,
          letterSpacing: '0.05em',
          color: COLORS.accent,
          textShadow: `0 0 30px ${COLORS.accent}55`,
          lineHeight: 1,
        }}>
          COIN
          <span style={{ color: COLORS.gold, textShadow: `0 0 30px ${COLORS.gold}66` }}>TRIS</span>
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 8, letterSpacing: '0.3em' }}>
          CRYPTO ARCADE PUZZLE
        </div>

        {/* Animated coin row */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
          {coins.map((label, i) => (
            <div key={label} style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: coinColors[i],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 'bold',
              color: 'rgba(0,0,0,0.6)',
              boxShadow: `0 0 ${8 + Math.sin((tick * 0.2 + i) * 0.8) * 6}px ${coinColors[i]}`,
              transform: `translateY(${Math.sin((tick * 0.15 + i) * 0.9) * 4}px)`,
              transition: 'transform 0.08s',
            }}>
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Hi score */}
      {hiScore > 0 && (
        <div style={{
          color: COLORS.gold,
          fontSize: 14,
          marginBottom: 28,
          padding: '8px 20px',
          border: `1px solid ${COLORS.gold}44`,
          borderRadius: 8,
          background: `${COLORS.gold}11`,
        }}>
          BEST SCORE: {hiScore.toLocaleString()}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '80%', maxWidth: 260 }}>
        <button
          onClick={onStart}
          style={{
            background: COLORS.accent,
            color: '#000',
            border: 'none',
            borderRadius: 10,
            padding: '16px 0',
            fontSize: 18,
            fontWeight: 900,
            fontFamily: 'monospace',
            cursor: 'pointer',
            letterSpacing: '0.1em',
            boxShadow: `0 4px 24px ${COLORS.accent}44`,
          }}
        >
          ▶ PLAY
        </button>
        <button onClick={onStats} style={menuBtnStyle()}>STATS</button>
        <button onClick={onThemes} style={menuBtnStyle()}>THEMES</button>
      </div>

      {/* Controls hint */}
      <div style={{ marginTop: 32, color: COLORS.muted, fontSize: 11, textAlign: 'center', lineHeight: 1.8 }}>
        <div>← → MOVE &nbsp;·&nbsp; ↑/X ROTATE &nbsp;·&nbsp; Z CCW</div>
        <div>↓ SOFT DROP &nbsp;·&nbsp; SPACE HARD DROP</div>
        <div>C/SHIFT HOLD &nbsp;·&nbsp; P PAUSE</div>
      </div>

      {/* Mute */}
      <button onClick={onMute} style={{
        position: 'absolute', top: 16, right: 16,
        background: 'rgba(255,255,255,0.07)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '6px 12px',
        color: COLORS.text,
        fontFamily: 'monospace',
        fontSize: 16,
        cursor: 'pointer',
      }}>
        {muted ? '🔇' : '🔊'}
      </button>

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

function menuBtnStyle(): React.CSSProperties {
  return {
    background: 'rgba(255,255,255,0.06)',
    color: COLORS.text,
    border: `1px solid rgba(255,255,255,0.1)`,
    borderRadius: 10,
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.1em',
  };
}

// ─── STATS SCREEN ────────────────────────────────────────────────────────────
function StatsScreen({ stats, onBack }: { stats: GameStats; onBack: () => void }) {
  const rows: [string, string][] = [
    ['Total Games', stats.totalGames.toString()],
    ['Lines Cleared', stats.linesCleared.toLocaleString()],
    ['Highest Level', stats.highestLevel.toString()],
    ['Best Score', stats.bestScore.toLocaleString()],
    ['Best Combo', `×${stats.bestCombo}`],
    ['Total Play Time', formatTime(stats.totalPlayTime)],
  ];

  return (
    <div style={{
      background: COLORS.background, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', padding: 24,
    }}>
      <div style={{ color: COLORS.accent, fontSize: 24, fontWeight: 900, marginBottom: 28, letterSpacing: '0.2em' }}>
        STATISTICS
      </div>
      <div style={{ width: '100%', maxWidth: 320 }}>
        {rows.map(([label, val]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: 8,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
          }}>
            <span style={{ color: COLORS.muted, fontSize: 13 }}>{label}</span>
            <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{val}</span>
          </div>
        ))}
      </div>
      <button onClick={onBack} style={{ ...menuBtnStyle(), width: 200, marginTop: 28 }}>← BACK</button>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── THEMES SCREEN ───────────────────────────────────────────────────────────
function ThemesScreen({
  unlocked, currentTheme, onSelect, onBack,
}: {
  unlocked: string[];
  currentTheme: ThemeKey;
  onSelect: (t: ThemeKey) => void;
  onBack: () => void;
}) {
  return (
    <div style={{
      background: COLORS.background, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', padding: 24,
    }}>
      <div style={{ color: COLORS.accent, fontSize: 24, fontWeight: 900, marginBottom: 8, letterSpacing: '0.2em' }}>
        THEMES
      </div>
      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 24 }}>
        Unlock new themes by earning points!
      </div>
      <div style={{ width: '100%', maxWidth: 340 }}>
        {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => {
          const isUnlocked = unlocked.includes(key);
          const isActive = key === currentTheme;
          return (
            <div
              key={key}
              onClick={() => isUnlocked && onSelect(key)}
              style={{
                padding: '14px 16px',
                marginBottom: 10,
                borderRadius: 10,
                border: `1px solid ${isActive ? COLORS.accent : COLORS.border}`,
                background: isActive ? `${COLORS.accent}15` : 'rgba(255,255,255,0.04)',
                cursor: isUnlocked ? 'pointer' : 'default',
                opacity: isUnlocked ? 1 : 0.5,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.values(theme.colors as Record<string, string>).slice(0, 4).map((c, i) => (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: isUnlocked ? c : COLORS.muted,
                    boxShadow: isUnlocked ? `0 0 6px ${c}88` : 'none',
                  }} />
                ))}
              </div>
              <div>
                <div style={{ color: isUnlocked ? COLORS.text : COLORS.muted, fontWeight: 700, fontSize: 14 }}>
                  {theme.name}
                </div>
                {!isUnlocked && (
                  <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
                    {key === 'gold-rush' ? 'Earn 5,000 pts' : key === 'midnight' ? 'Earn 15,000 pts' : 'Earn 30,000 pts'}
                  </div>
                )}
              </div>
              {isActive && <div style={{ marginLeft: 'auto', color: COLORS.accent, fontSize: 12 }}>✦ ACTIVE</div>}
            </div>
          );
        })}
      </div>
      <button onClick={onBack} style={{ ...menuBtnStyle(), width: 200, marginTop: 20 }}>← BACK</button>
    </div>
  );
}
