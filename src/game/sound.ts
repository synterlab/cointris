let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', gain = 0.15, decay = true): void {
  if (muted) return;
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(gain, ac.currentTime);
    if (decay) g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch {}
}

function playSequence(notes: [number, number][], type: OscillatorType = 'square', gain = 0.12): void {
  if (muted) return;
  let time = 0;
  for (const [freq, dur] of notes) {
    setTimeout(() => playTone(freq, dur, type, gain), time * 1000);
    time += dur * 0.9;
  }
}

function playNoise(duration: number, gain = 0.08): void {
  if (muted) return;
  try {
    const ac = getCtx();
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(g);
    g.connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + duration);
  } catch {}
}

export const sound = {
  setMuted(m: boolean) { muted = m; },
  isMuted() { return muted; },

  move() {
    playTone(180, 0.05, 'square', 0.08);
  },

  rotate() {
    playTone(260, 0.06, 'square', 0.1);
    setTimeout(() => playTone(320, 0.04, 'square', 0.08), 30);
  },

  drop() {
    playTone(120, 0.12, 'square', 0.15);
    setTimeout(() => playTone(80, 0.08, 'square', 0.1), 60);
  },

  hardDrop() {
    playTone(90, 0.06, 'square', 0.18);
    setTimeout(() => playTone(60, 0.1, 'square', 0.15), 40);
    setTimeout(() => playTone(40, 0.08, 'square', 0.1), 80);
  },

  lineClear(count: number) {
    if (count === 4) {
      playSequence([[523,0.06],[659,0.06],[784,0.06],[1047,0.18]], 'square', 0.18);
    } else if (count === 3) {
      playSequence([[440,0.06],[554,0.06],[659,0.14]], 'square', 0.15);
    } else if (count === 2) {
      playSequence([[349,0.07],[440,0.12]], 'square', 0.13);
    } else {
      playTone(349, 0.1, 'square', 0.12);
    }
  },

  combo(n: number) {
    const freq = 200 + n * 60;
    playTone(freq, 0.08, 'square', 0.14);
    setTimeout(() => playTone(freq * 1.25, 0.06, 'square', 0.12), 50);
  },

  levelUp() {
    playSequence([
      [262,0.06],[330,0.06],[392,0.06],[523,0.06],
      [659,0.06],[784,0.06],[1047,0.18],
    ], 'square', 0.2);
  },

  gameOver() {
    playSequence([
      [392,0.1],[330,0.1],[262,0.1],[220,0.1],[196,0.3],
    ], 'square', 0.18);
  },

  hold() {
    playTone(440, 0.05, 'square', 0.1);
  },

  perfectClear() {
    playSequence([
      [523,0.05],[659,0.05],[784,0.05],[1047,0.05],[1319,0.05],[1568,0.2],
    ], 'square', 0.22);
  },
};
