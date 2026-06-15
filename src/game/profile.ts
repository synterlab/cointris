import type { GameStats } from './engine';

const KEY_CURRENT  = 'cointris_current_user';
const KEY_PROFILES = 'cointris_profile_list';

export interface UserProfile {
  username: string;      // sanitised, used as key
  displayName: string;   // raw display label
  createdAt: number;
}

// ── User session ────────────────────────────────────────────────────────────
export function getCurrentUser(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

/** Returns the sanitised username (lowercase alphanum + underscore, max 16) */
export function loginUser(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'guest';
  const display = raw.trim().slice(0, 20) || key;

  if (!listProfiles().includes(key)) {
    const profile: UserProfile = { username: key, displayName: display, createdAt: Date.now() };
    localStorage.setItem(`cointris_profile_${key}`, JSON.stringify(profile));
    const list = listProfiles(); list.push(key);
    localStorage.setItem(KEY_PROFILES, JSON.stringify(list));
  }
  localStorage.setItem(KEY_CURRENT, key);
  return key;
}

export function logoutUser(): void {
  localStorage.removeItem(KEY_CURRENT);
}

export function listProfiles(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY_PROFILES) || '[]'); } catch { return []; }
}

export function getDisplayName(username: string): string {
  try {
    const p = JSON.parse(localStorage.getItem(`cointris_profile_${username}`) || '{}') as Partial<UserProfile>;
    return p.displayName || username;
  } catch { return username; }
}

// ── User-namespaced game data ───────────────────────────────────────────────
function uk(base: string): string {
  const u = getCurrentUser();
  return u ? `cointris_u_${u}_${base}` : `cointris_${base}`;
}

export function loadHighScore(): number {
  return parseInt(localStorage.getItem(uk('hi')) || '0', 10) || 0;
}
export function saveHighScore(n: number): void {
  localStorage.setItem(uk('hi'), String(n));
}

export function loadStats(): GameStats {
  try {
    return JSON.parse(localStorage.getItem(uk('stats')) || '{}') as GameStats;
  } catch { return _emptyStats(); }
}
export function saveStats(s: GameStats): void {
  localStorage.setItem(uk('stats'), JSON.stringify(s));
}

export function loadTheme(): string {
  return localStorage.getItem(uk('theme')) || 'classic-green';
}
export function saveTheme(t: string): void {
  localStorage.setItem(uk('theme'), t);
}

export function loadUnlocked(): string[] {
  try {
    return JSON.parse(localStorage.getItem(uk('unlocked')) || '["classic-green"]') as string[];
  } catch { return ['classic-green']; }
}
export function saveUnlocked(a: string[]): void {
  localStorage.setItem(uk('unlocked'), JSON.stringify(a));
}

// Save full game snapshot (in-progress game)
export function saveGameSnapshot(state: Record<string, unknown>): void {
  localStorage.setItem(uk('snapshot'), JSON.stringify({ ...state, savedAt: Date.now() }));
}
export function loadGameSnapshot(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(uk('snapshot'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearGameSnapshot(): void {
  localStorage.removeItem(uk('snapshot'));
}

function _emptyStats(): GameStats {
  return { totalGames: 0, linesCleared: 0, highestLevel: 0, totalPlayTime: 0, bestScore: 0, bestCombo: 0 };
}
