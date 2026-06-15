import { useEffect, useRef, useCallback, useState } from 'react';
import { COLS, COIN_COLORS, THEMES, type ThemeKey } from './game/constants';
import {
  createEmptyBoard, getNextPiece, isValidPosition, tryRotate, lockPiece,
  clearLines, calcScore, getGhostY, spawnPiece, createCoinParticles,
  getLevelFromLines, getDropInterval,
  type GameStats, type Particle, type FloatingText, type Piece,
} from './game/engine';
import {
  getCurrentUser, loginUser, logoutUser, listProfiles, getDisplayName,
  loadHighScore, saveHighScore, loadStats, saveStats,
  loadTheme, saveTheme, loadUnlocked, saveUnlocked,
} from './game/profile';
import {
  getLayout, drawBackground, drawBoard, drawGhost,
  drawPiece, drawSidePanels, drawParticles, drawFloatingTexts,
} from './game/renderer';
import { sound } from './game/sound';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'stats' | 'themes' | 'howto' | 'about' | 'login';

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
  { type:'I', label:'G', name:'Gold',    base:'#ffd84d', hi:'#fff5a8', sh:'#8a6400' },
  { type:'O', label:'S', name:'Silver',  base:'#bcc0cc', hi:'#e8ecf8', sh:'#50545e' },
  { type:'T', label:'R', name:'Ruby',    base:'#e83048', hi:'#ff8898', sh:'#7a0018' },
  { type:'S', label:'E', name:'Emerald', base:'#28c858', hi:'#88ffa0', sh:'#006028' },
  { type:'Z', label:'P', name:'Plasma',  base:'#c038c8', hi:'#f080f8', sh:'#580864' },
  { type:'J', label:'D', name:'Diamond', base:'#28b0e8', hi:'#88e8ff', sh:'#00608a' },
  { type:'L', label:'N', name:'Nova',    base:'#f07030', hi:'#ffb878', sh:'#803010' },
];

function fmtTime(s: number): string {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  if(h>0)return`${h}h ${m}m`;if(m>0)return`${m}m ${sec}s`;return`${sec}s`;
}

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const g          = useRef<G>(null!);
  const [screen,  setScreen]  = useState<Screen>('menu');
  const [muted,   setMuted]   = useState(false);
  const [user,    setUser]    = useState<string|null>(() => getCurrentUser());
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const touch = useRef({ sx:0, sy:0, st:0, lastTap:0 });

  const themeColors = useCallback((): Record<string,string> =>
    (g.current ? (THEMES[g.current.theme]?.colors as Record<string,string>) : null) ?? COIN_COLORS,
  []);

  // DPR resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const dpr=window.devicePixelRatio||1, w=canvas.clientWidth, h=canvas.clientHeight;
      if (canvas.width!==w*dpr||canvas.height!==h*dpr) {
        canvas.width=w*dpr; canvas.height=h*dpr;
        const ctx=canvas.getContext('2d');
        if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.scale(dpr,dpr);}
      }
    }
    resize();
    const ro=new ResizeObserver(resize); ro.observe(canvas); return()=>ro.disconnect();
  }, []);

  // Menu loop
  const menuRaf=useRef(0);
  const menuLoop=useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext('2d'); if(!ctx)return;
    drawBackground(ctx,canvas.clientWidth,canvas.clientHeight);
    menuRaf.current=requestAnimationFrame(menuLoop);
  },[]);
  useEffect(()=>{
    if(['menu','stats','themes','howto','about','login'].includes(screen)){
      cancelAnimationFrame(menuRaf.current);
      menuRaf.current=requestAnimationFrame(menuLoop);
      return()=>cancelAnimationFrame(menuRaf.current);
    }
    cancelAnimationFrame(menuRaf.current);
    return undefined;
  },[screen,menuLoop]);

  // Lock piece
  const lockCurrent=useCallback((ref:G,setScr:typeof setScreen)=>{
    const nb=lockPiece(ref.board,ref.current);
    const{board:cb,cleared,lines:rows}=clearLines(nb);
    ref.board=cb;
    if(cleared>0){
      ref.combo++;
      const pts=calcScore(cleared,ref.level,ref.combo,ref.b2b,cb.every(r=>r.every(c=>c===null)));
      ref.score+=pts; ref.lines+=cleared;
      const nl=getLevelFromLines(ref.lines);
      if(nl>ref.level){ref.level=nl;sound.levelUp();}
      ref.b2b=cleared===4;
      const canvas=canvasRef.current;
      if(canvas){
        const l=getLayout(canvas);
        ref.particles.push(...createCoinParticles(ref.board,rows,l.cs,l.bx,l.by));
        const fx=l.bx+l.cs*COLS/2;
        const msgs:[string,string,number][]=[];
        if(cleared===4)     msgs.push(['COINTRIS!','#ffd84d',0]);
        else if(cleared===3)msgs.push(['TRIPLE','#6dff8b',0]);
        else if(cleared===2)msgs.push(['DOUBLE','#6dff8b',0]);
        msgs.push([`+${pts}`,'#ffd84d',26]);
        if(ref.combo>2)msgs.push([`COMBO x${ref.combo}`,'#ff6bff',52]);
        msgs.forEach(([text,color,dy])=>ref.floats.push({x:fx,y:l.by+9*l.cs-dy,text,color,vy:-.7,life:1.4,maxLife:1.4}));
      }
      sound.lineClear(cleared);
      if(ref.combo>2)sound.combo(ref.combo);
      ref.shakeMs=cleared>=4?220:110;
      if(ref.score>=5000 &&!ref.unlocked.includes('gold-rush'))  {ref.unlocked.push('gold-rush');  saveUnlocked(ref.unlocked);}
      if(ref.score>=15000&&!ref.unlocked.includes('midnight'))    {ref.unlocked.push('midnight');   saveUnlocked(ref.unlocked);}
      if(ref.score>=30000&&!ref.unlocked.includes('neon-arcade')) {ref.unlocked.push('neon-arcade');saveUnlocked(ref.unlocked);}
    } else {ref.combo=0;ref.b2b=false;}
    if(ref.score>ref.hiScore){ref.hiScore=ref.score;saveHighScore(ref.score);}
    ref.dropMs=0;ref.lockMs=0;
    const nextType=ref.next[0]?.type||'I';
    const np=spawnPiece(nextType as any);
    const{piece:bagPiece,newBag}=getNextPiece(ref.bag as any);
    ref.bag=newBag;ref.next=[...ref.next.slice(1),{type:bagPiece.type}];
    if(!isValidPosition(ref.board,np)){
      ref.active=false;sound.gameOver();
      const elapsed=(Date.now()-ref.startTime)/1000;
      ref.stats.totalGames++;ref.stats.linesCleared+=ref.lines;
      ref.stats.highestLevel=Math.max(ref.stats.highestLevel,ref.level+1);
      ref.stats.totalPlayTime+=elapsed;
      ref.stats.bestScore=Math.max(ref.stats.bestScore,ref.score);
      ref.stats.bestCombo=Math.max(ref.stats.bestCombo,ref.combo);
      saveStats(ref.stats);setScr('gameover');return;
    }
    ref.current=np;ref.canHold=true;ref.glowMs=180;
  },[]);

  // Game loop
  const gameLoop=useCallback((now:number,ref:G,setScr:typeof setScreen)=>{
    if(!ref.active)return;
    const canvas=canvasRef.current;
    if(!canvas){ref.raf=requestAnimationFrame(n=>gameLoop(n,ref,setScr));return;}
    const ctx=canvas.getContext('2d');
    if(!ctx){ref.raf=requestAnimationFrame(n=>gameLoop(n,ref,setScr));return;}
    const dt=Math.min((now-ref.lastNow)/1000,0.05);
    ref.lastNow=now;
    const dtMs=dt*1000;
    const interval=ref.softDrop?50:getDropInterval(ref.level);
    ref.dropMs+=dtMs;
    if(ref.dropMs>=interval){
      ref.dropMs=0;
      if(isValidPosition(ref.board,ref.current,0,1)){
        ref.current={...ref.current,y:ref.current.y+1};
        if(ref.softDrop)ref.score+=1;
      } else {
        ref.lockMs+=interval;
        if(ref.lockMs>=500||ref.softDrop){lockCurrent(ref,setScr);ref.raf=requestAnimationFrame(n=>gameLoop(n,ref,setScr));return;}
      }
    }
    if(ref.shakeMs>0)ref.shakeMs-=dtMs;
    if(ref.glowMs>0) ref.glowMs -=dtMs;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    const shk=ref.shakeMs>0;
    const l=getLayout(canvas);
    const bx=l.bx+(shk?(Math.random()-.5)*4:0);
    const by=l.by+(shk?(Math.random()-.5)*2:0);
    const tc=themeColors();
    drawBackground(ctx,w,h);
    drawBoard(ctx,ref.board,bx,by,l.cs,tc,[],0);
    drawGhost(ctx,ref.board,ref.current,bx,by,l.cs);
    drawPiece(ctx,ref.current,bx,by,l.cs,tc,ref.glowMs>0);
    ref.particles=drawParticles(ctx,ref.particles,dt);
    ref.floats   =drawFloatingTexts(ctx,ref.floats,dt);
    drawSidePanels(ctx,l,ref.score,ref.hiScore,ref.level,ref.lines,ref.combo,ref.next.map(n=>n.type),ref.held,ref.canHold,tc);
    ref.raf=requestAnimationFrame(n=>gameLoop(n,ref,setScr));
  },[themeColors,lockCurrent]);

  const startGame=useCallback(()=>{
    const{piece,newBag}=getNextPiece([]as any);
    const ref:G={
      board:createEmptyBoard(),current:piece,
      next:newBag.slice(0,5).map(t=>({type:t as string})),
      held:null,canHold:true,
      score:0,lines:0,level:0,combo:0,b2b:false,
      particles:[],floats:[],bag:newBag.slice(5),
      lockMs:0,dropMs:0,softDrop:false,
      active:true,startTime:Date.now(),
      hiScore:loadHighScore(),stats:loadStats(),
      theme:loadTheme() as ThemeKey,unlocked:loadUnlocked(),
      shakeMs:0,glowMs:0,lastNow:performance.now(),raf:0,
    };
    g.current=ref;setScreen('playing');
    ref.raf=requestAnimationFrame(now=>gameLoop(now,ref,setScreen));
  },[gameLoop]);

  const doHold=useCallback(()=>{
    const ref=g.current;if(!ref?.canHold)return;
    const prev=ref.held;ref.held=ref.current.type;ref.canHold=false;sound.hold();
    if(prev){ref.current=spawnPiece(prev as any);}
    else{
      const nextType=ref.next[0]?.type||'I';
      const{piece:bagPiece,newBag}=getNextPiece(ref.bag as any);
      ref.bag=newBag;ref.next=[...ref.next.slice(1),{type:bagPiece.type}];
      ref.current=spawnPiece(nextType as any);
    }
  },[]);

  const resumeGame=useCallback(()=>{
    const ref=g.current;if(!ref)return;
    ref.active=true;ref.lastNow=performance.now();setScreen('playing');
    ref.raf=requestAnimationFrame(now=>gameLoop(now,ref,setScreen));
  },[gameLoop]);

  const toggleMute=useCallback(()=>{const next=!muted;setMuted(next);sound.setMuted(next);},[muted]);

  const doLogin=useCallback(()=>{
    const raw=loginInput.trim();
    if(!raw){setLoginError('Enter a username');return;}
    if(raw.length<2){setLoginError('At least 2 characters');return;}
    const key=loginUser(raw);
    setUser(key);setLoginInput('');setLoginError('');setScreen('menu');
  },[loginInput]);

  const doLogout=useCallback(()=>{
    logoutUser();setUser(null);
  },[]);

  // Keyboard
  useEffect(()=>{
    if(screen!=='playing')return;
    function dn(e:KeyboardEvent){
      const ref=g.current;if(!ref?.active)return;
      if(e.code==='ArrowLeft' ||e.code==='KeyA'){e.preventDefault();if(isValidPosition(ref.board,ref.current,-1,0)){ref.current={...ref.current,x:ref.current.x-1};ref.lockMs=0;sound.move();}}
      if(e.code==='ArrowRight'||e.code==='KeyD'){e.preventDefault();if(isValidPosition(ref.board,ref.current,1,0)) {ref.current={...ref.current,x:ref.current.x+1};ref.lockMs=0;sound.move();}}
      if(e.code==='ArrowDown' ||e.code==='KeyS'){e.preventDefault();ref.softDrop=true;}
      if(e.code==='ArrowUp'||e.code==='KeyX'||e.code==='KeyW'){e.preventDefault();const r=tryRotate(ref.board,ref.current,1);if(r){ref.current=r;ref.lockMs=0;sound.rotate();}}
      if(e.code==='KeyZ'){e.preventDefault();const r=tryRotate(ref.board,ref.current,-1);if(r){ref.current=r;ref.lockMs=0;sound.rotate();}}
      if(e.code==='Space'){e.preventDefault();const dy=getGhostY(ref.board,ref.current)-ref.current.y;ref.score+=dy*2;ref.current={...ref.current,y:ref.current.y+dy};sound.hardDrop();lockCurrent(ref,setScreen);}
      if(e.code==='ShiftLeft'||e.code==='ShiftRight'||e.code==='KeyC'){e.preventDefault();doHold();}
      if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();ref.active=false;cancelAnimationFrame(ref.raf);setScreen('paused');}
    }
    function up(e:KeyboardEvent){const ref=g.current;if(!ref)return;if(e.code==='ArrowDown'||e.code==='KeyS')ref.softDrop=false;}
    window.addEventListener('keydown',dn);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up);};
  },[screen,doHold,lockCurrent]);

  function onTS(e:React.TouchEvent){const t=e.touches[0];touch.current={sx:t.clientX,sy:t.clientY,st:Date.now(),lastTap:touch.current.lastTap};}
  function onTE(e:React.TouchEvent){
    if(screen!=='playing')return;
    const ref=g.current;if(!ref?.active)return;
    const t=e.changedTouches[0];
    const dx=t.clientX-touch.current.sx,dy=t.clientY-touch.current.sy,elapsed=Date.now()-touch.current.st;
    if(dy>50&&Math.abs(dy)>Math.abs(dx)*1.3){const d=getGhostY(ref.board,ref.current)-ref.current.y;ref.score+=d*2;ref.current={...ref.current,y:ref.current.y+d};sound.hardDrop();lockCurrent(ref,setScreen);return;}
    if(Math.abs(dx)>26&&Math.abs(dx)>Math.abs(dy)*1.3){const dir=dx>0?1:-1,steps=Math.min(5,Math.floor(Math.abs(dx)/26));for(let i=0;i<steps;i++)if(isValidPosition(ref.board,{...ref.current,x:ref.current.x+dir})){ref.current={...ref.current,x:ref.current.x+dir};ref.lockMs=0;sound.move();}return;}
    const now=Date.now();
    if(now-touch.current.lastTap<280&&elapsed<200){const r=tryRotate(ref.board,ref.current,1);if(r){ref.current=r;ref.lockMs=0;sound.rotate();}touch.current.lastTap=0;return;}
    touch.current.lastTap=now;
  }

  const displayName = user ? getDisplayName(user) : null;

  return (
    <div className="root-wrap" onTouchStart={onTS} onTouchEnd={onTE}>
      <canvas ref={canvasRef} className="game-canvas"/>

      {/* ── MENU ── */}
      {(['menu','stats','themes','howto','about','login'] as Screen[]).includes(screen) && (
        <div className="overlay">
          <div className="menu-bg"/><div className="menu-grid"/><div className="menu-scanlines"/><div className="menu-vignette"/>

          {screen==='menu' && (
            <div className="menu-body">
              {/* Logo */}
              <div className="logo-lockup">
                <div className="logo-founder">
                  <a href="https://x.com/Akarifujimoto_" target="_blank" rel="noopener" className="founder-link">
                    <span className="founder-x">𝕏</span>
                    <span>@Akarifujimoto_</span>
                  </a>
                </div>
                <span className="logo-main">
                  <span className="logo-coin">COIN</span><span className="logo-tris">TRIS</span>
                </span>
                <div className="logo-sub">Crypto Arcade Puzzle</div>
              </div>

              {/* User chip */}
              {displayName ? (
                <div className="user-chip">
                  <span className="user-chip-icon">★</span>
                  <span className="user-chip-name">{displayName.toUpperCase()}</span>
                  <button className="user-logout-btn" onClick={doLogout}>LOGOUT</button>
                </div>
              ) : (
                <button className="btn-login" onClick={()=>setScreen('login')}>⬛ LOGIN / REGISTER</button>
              )}

              <div className="menu-divider"/>

              {/* Coin showcase */}
              <div className="coin-showcase">
                {COIN_DATA.map(c=>(
                  <div key={c.type} className="coin-item">
                    <div className="coin-ball" style={{
                      background:`radial-gradient(circle at 35% 30%,${c.hi} 0%,${c.base} 46%,${c.sh} 100%)`,
                      boxShadow:`inset 0 1px 2px rgba(255,255,255,0.25),inset 0 -1px 2px rgba(0,0,0,0.35)`,
                    }}>
                      <span className="coin-label">{c.label}</span>
                    </div>
                    <span className="coin-name">{c.name}</span>
                  </div>
                ))}
              </div>

              {/* Hi score */}
              <div className="hiscore-strip">
                <span className="hs-label">{displayName?`${displayName.toUpperCase()} BEST`:'BEST SCORE'}</span>
                <span className="hs-value">{loadHighScore().toLocaleString()}</span>
              </div>

              {/* Buttons */}
              <button className="btn-play" onClick={startGame}>▶  PLAY</button>
              <div className="btn-grid">
                <button className="btn-sec" onClick={()=>setScreen('howto')}>HOW TO PLAY</button>
                <button className="btn-sec" onClick={()=>setScreen('themes')}>THEMES</button>
              </div>
              <div className="btn-grid-3">
                <button className="btn-sec" onClick={()=>setScreen('stats')}>STATS</button>
                <button className="btn-sec" onClick={toggleMute}>{muted?'UNMUTE':'SOUND'}</button>
                <button className="btn-sec" onClick={()=>setScreen('about')}>ABOUT</button>
              </div>

              {/* Orynth badge */}
              <div className="orynth-badge-wrap">
                <a href="https://orynth.dev/projects/cointris" target="_blank" rel="noopener" className="orynth-badge-link">
                  <img
                    src="https://orynth.dev/api/badge/cointris?theme=light&style=default"
                    alt="Featured on Orynth"
                    className="orynth-badge-img"
                    width="220" height="68"
                    onError={e=>{(e.target as HTMLImageElement).style.display='none';}}
                  />
                </a>
              </div>
            </div>
          )}

          {/* LOGIN modal */}
          {screen==='login' && (
            <div className="modal-wrap"><div className="modal-card">
              <div className="modal-title">LOGIN</div>
              <div className="modal-subtitle">save your scores across sessions</div>

              <div className="login-section">
                <div className="login-label">USERNAME / NICKNAME</div>
                <input
                  className="login-input"
                  type="text"
                  maxLength={20}
                  placeholder="enter your name..."
                  value={loginInput}
                  onChange={e=>{setLoginInput(e.target.value);setLoginError('');}}
                  onKeyDown={e=>{if(e.key==='Enter')doLogin();}}
                  autoFocus
                />
                {loginError&&<div className="login-error">{loginError}</div>}
                <button className="btn-play" style={{marginTop:12}} onClick={doLogin}>▶  ENTER</button>
              </div>

              {listProfiles().length>0&&(
                <div className="login-section">
                  <div className="login-label">OR CHOOSE PROFILE</div>
                  <div className="profile-list">
                    {listProfiles().map(p=>(
                      <button key={p} className="profile-btn"
                        onClick={()=>{loginUser(getDisplayName(p));setUser(p);setScreen('menu');}}>
                        <span className="profile-star">★</span>
                        {getDisplayName(p).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="login-note">Scores are saved locally on this device. No password needed.</div>
              <button className="btn-back" onClick={()=>setScreen('menu')}>← BACK</button>
            </div></div>
          )}

          {/* HOW TO PLAY */}
          {screen==='howto'&&(
            <div className="modal-wrap"><div className="modal-card">
              <div className="modal-title">HOW TO PLAY</div>
              <div className="htp-section">
                <div className="htp-heading">Keyboard</div>
                <div className="htp-grid">
                  {[['← → / A D','Move'],['↑ X / W','Rotate CW'],['Z','Rotate CCW'],['↓ S','Soft Drop'],['Space','Hard Drop'],['C / Shift','Hold'],['P / Esc','Pause']].map(([k,d])=>(
                    <div key={k} className="htp-key"><span className="kbd">{k}</span><span className="htp-key-desc">{d}</span></div>
                  ))}
                </div>
              </div>
              <div className="htp-section">
                <div className="htp-heading">Mobile</div>
                <div className="htp-grid">
                  {[['Swipe ←→','Move'],['Double Tap','Rotate'],['Swipe Down','Hard Drop']].map(([k,d])=>(
                    <div key={k} className="htp-key"><span className="kbd">{k}</span><span className="htp-key-desc">{d}</span></div>
                  ))}
                </div>
              </div>
              <div className="htp-section">
                <div className="htp-heading">Coins</div>
                <div className="htp-coin-grid">
                  {COIN_DATA.map(c=>(
                    <div key={c.type} className="htp-coin">
                      <div className="htp-coin-dot" style={{background:`radial-gradient(circle at 35% 30%,${c.hi},${c.base} 50%,${c.sh})`,boxShadow:`inset 0 1px 1px rgba(255,255,255,0.2)`}}>{c.label}</div>
                      <span className="htp-coin-name">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="htp-section">
                <div className="htp-heading">Scoring</div>
                <table className="score-table"><tbody>
                  {[['1 Line','100 × Lv'],['2 Lines','300 × Lv'],['3 Lines','500 × Lv'],['4 Lines (COINTRIS!)','800 × Lv'],['Hard Drop','2 per cell'],['Combo','50 × combo']].map(([k,v])=>(
                    <tr key={k}><td>{k}</td><td>{v}</td></tr>
                  ))}
                </tbody></table>
              </div>
              <button className="btn-back" onClick={()=>setScreen('menu')}>← BACK</button>
            </div></div>
          )}

          {/* ABOUT */}
          {screen==='about'&&(
            <div className="modal-wrap"><div className="modal-card">
              <div className="modal-title">ABOUT</div>
              <div className="about-logo-text">
                <span style={{color:'#6dff8b'}}>COIN</span><span style={{color:'#ffd84d'}}>TRIS</span>
              </div>
              <div className="about-version">Version 1.0 · 2025</div>
              <div className="about-desc">Stack 7 unique coin tetrominoes — Gold, Silver, Ruby, Emerald, Plasma, Diamond &amp; Nova — to clear lines and build massive combos.</div>
              <div className="about-meta">
                <div className="about-row"><span className="about-lbl">Creator</span><a href="https://x.com/Akarifujimoto_" target="_blank" rel="noopener" className="about-link">@Akarifujimoto_</a></div>
                <div className="about-row"><span className="about-lbl">Source</span><a href="https://github.com/synterlab/cointris" target="_blank" rel="noopener" className="about-link">github.com/synterlab/cointris</a></div>
                <div className="about-row"><span className="about-lbl">Featured</span><a href="https://orynth.dev/projects/cointris" target="_blank" rel="noopener" className="about-link">orynth.dev</a></div>
              </div>
              <div className="about-tags">
                {['React 18','Vite 7','TypeScript','Canvas 2D','Web Audio','SRS Rotation'].map(t=><span key={t} className="about-tag">{t}</span>)}
              </div>
              <div className="orynth-badge-wrap" style={{marginTop:4}}>
                <a href="https://orynth.dev/projects/cointris" target="_blank" rel="noopener" className="orynth-badge-link">
                  <img src="https://orynth.dev/api/badge/cointris?theme=light&style=default" alt="Featured on Orynth" className="orynth-badge-img" width="200" height="62" onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                </a>
              </div>
              <button className="btn-back" onClick={()=>setScreen('menu')}>← BACK</button>
            </div></div>
          )}

          {/* STATS */}
          {screen==='stats'&&(
            <div className="modal-wrap"><div className="modal-card">
              <div className="modal-title">STATS</div>
              {displayName&&<div className="stats-user">★ {displayName.toUpperCase()}</div>}
              {(()=>{const s=g.current?.stats??loadStats();return[
                ['Total Games',s.totalGames.toString(),'#e8e6f8'],
                ['Lines Cleared',s.linesCleared.toLocaleString(),'#6dff8b'],
                ['Highest Level',s.highestLevel.toString(),'#6dff8b'],
                ['Best Score',s.bestScore.toLocaleString(),'#ffd84d'],
                ['Best Combo',`x${s.bestCombo}`,'#ff6bff'],
                ['Play Time',fmtTime(s.totalPlayTime),'#e8e6f8'],
              ].map(([label,val,col])=>(
                <div key={label as string} className="stat-row">
                  <span className="stat-label">{label}</span>
                  <span className="stat-val" style={{color:col as string}}>{val}</span>
                </div>
              ))})()}
              <button className="btn-back" onClick={()=>setScreen('menu')}>← BACK</button>
            </div></div>
          )}

          {/* THEMES */}
          {screen==='themes'&&(
            <div className="modal-wrap"><div className="modal-card">
              <div className="modal-title">THEMES</div>
              <div className="modal-subtitle">earn points to unlock</div>
              {(()=>{
                const unlocked=g.current?.unlocked??loadUnlocked();
                const cur=(g.current?.theme??loadTheme()) as ThemeKey;
                const hints:Record<string,string>={'gold-rush':'5,000 pts',midnight:'15,000 pts','neon-arcade':'30,000 pts'};
                return(Object.entries(THEMES) as [ThemeKey,typeof THEMES[ThemeKey]][]).map(([key,theme])=>{
                  const isLocked=!unlocked.includes(key),isActive=key===cur;
                  const dots=Object.values(theme.colors as Record<string,string>).slice(0,5);
                  return(
                    <div key={key} className={`theme-row${isActive?' active':''}${isLocked?' locked':''}`}
                      onClick={()=>{if(isLocked)return;if(g.current){g.current.theme=key;}saveTheme(key);setScreen('menu');}}>
                      <div className="theme-dots">{dots.map((c,i)=><div key={i} className="theme-dot" style={{background:isLocked?'#1e1c2e':c}}/>)}</div>
                      <div className="theme-info">
                        <div className="theme-name">{theme.name}</div>
                        {isLocked&&<div className="theme-hint">Unlock at {hints[key]}</div>}
                      </div>
                      {isActive&&<span className="theme-badge">ON</span>}
                    </div>
                  );
                });
              })()}
              <button className="btn-back" onClick={()=>setScreen('menu')}>← BACK</button>
            </div></div>
          )}
        </div>
      )}

      {/* ── PAUSE ── */}
      {screen==='paused'&&(
        <div className="pause-overlay">
          <div className="pause-title">PAUSED</div>
          <button className="pause-btn pause-btn-primary" onClick={resumeGame}>▶ RESUME</button>
          <button className="pause-btn pause-btn-ghost"   onClick={toggleMute}>{muted?'UNMUTE':'MUTE'}</button>
          <button className="pause-btn pause-btn-ghost" style={{marginTop:4}}
            onClick={()=>{cancelAnimationFrame(g.current?.raf||0);setScreen('menu');}}>QUIT</button>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {screen==='gameover'&&g.current&&(
        <div className="gameover-overlay">
          {Array.from({length:8},(_,i)=>(
            <div key={i} style={{position:'absolute',left:`${6+i*12}%`,bottom:'-16px',
              width:10+(i%4)*5,height:10+(i%4)*5,borderRadius:'50%',
              background:`radial-gradient(circle at 35% 30%,${COIN_DATA[i%7].hi},${COIN_DATA[i%7].base} 55%,${COIN_DATA[i%7].sh})`,
              opacity:.35,animation:`floatUp ${2.5+i*.4}s ${i*.25}s linear infinite`,pointerEvents:'none'}}/>
          ))}
          <div style={{position:'relative',zIndex:2,width:'100%',maxWidth:340}}>
            <div className="gameover-title">GAME OVER</div>
            <div className="gameover-sub">FINAL RESULTS</div>
            <div className="gameover-score-card">
              <div className="gameover-score-label">SCORE</div>
              <div className="gameover-score-val">{g.current.score.toLocaleString()}</div>
              {g.current.score>=g.current.hiScore&&g.current.score>0&&(
                <div className="gameover-new-best">NEW BEST!</div>
              )}
            </div>
            <div className="gameover-grid">
              {[{label:'LINES',val:String(g.current.lines),color:'#6dff8b'},{label:'LEVEL',val:String(g.current.level+1),color:'#6dff8b'},{label:'COMBO',val:`x${g.current.combo}`,color:'#ff6bff'},{label:'BEST',val:g.current.hiScore.toLocaleString(),color:'#ffd84d'}].map(({label,val,color})=>(
                <div key={label} className="gameover-cell">
                  <div className="gameover-cell-label">{label}</div>
                  <div className="gameover-cell-val" style={{color}}>{val}</div>
                </div>
              ))}
            </div>
            <div className="gameover-btns">
              <button className="btn-play" onClick={startGame}>▶  PLAY AGAIN</button>
              <button className="btn-sec" style={{width:'100%',padding:'13px 0'}} onClick={()=>setScreen('menu')}>MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOUCH ── */}
      {screen==='playing'&&(
        <div className="touch-panel">
          <div className="touch-row">
            <button className="tbtn" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;if(isValidPosition(ref.board,ref.current,-1,0)){ref.current={...ref.current,x:ref.current.x-1};ref.lockMs=0;sound.move();}}}>◀</button>
            <button className="tbtn tbtn-rot" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;const r=tryRotate(ref.board,ref.current,1);if(r){ref.current=r;ref.lockMs=0;sound.rotate();}}}>↻</button>
            <button className="tbtn" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;if(isValidPosition(ref.board,ref.current,1,0)){ref.current={...ref.current,x:ref.current.x+1};ref.lockMs=0;sound.move();}}}>▶</button>
          </div>
          <div className="touch-row">
            <button className="tbtn tbtn-hold" onTouchStart={e=>{e.preventDefault();doHold();}}>HOLD</button>
            <button className="tbtn tbtn-soft" onTouchStart={e=>{e.preventDefault();if(g.current)g.current.softDrop=true;}} onTouchEnd={e=>{e.preventDefault();if(g.current)g.current.softDrop=false;}}>▼</button>
            <button className="tbtn tbtn-drop" onTouchStart={e=>{e.preventDefault();const ref=g.current;if(!ref?.active)return;const dy=getGhostY(ref.board,ref.current)-ref.current.y;ref.score+=dy*2;ref.current={...ref.current,y:ref.current.y+dy};sound.hardDrop();lockCurrent(ref,setScreen);}}>DROP</button>
          </div>
        </div>
      )}

      {/* ── HUD ── */}
      <div className="hud-row">
        <button className="hud-btn" onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
        {screen==='playing'&&(
          <button className="hud-btn" onClick={()=>{const ref=g.current;if(!ref)return;ref.active=false;cancelAnimationFrame(ref.raf);setScreen('paused');}}>⏸</button>
        )}
      </div>
    </div>
  );
}
