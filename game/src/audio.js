// Synthesized sound: no audio files, everything is WebAudio oscillators + noise.
// Engine hum follows speed, wind follows speed, plus coin/ring/crash/click/music.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let musicTimer = null;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 82;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp);
      osc2.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      osc2.start();
      // Wind: looped noise through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      return true;
    } catch (e) {
      return false;
    }
  }

  function blip(freqA, freqB, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t);
    o.frequency.exponentialRampToValueAtTime(freqB, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // Tiny adventure loop: bass + plucked arp, scheduled per bar.
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 12];
  let bar = 0;
  function scheduleBar() {
    if (!ctx || muted || !musicOn) return;
    const base = 220;
    const root = base * Math.pow(2, [0, -2, -4, -2][bar % 4] / 12);
    blip(root / 2, root / 2, 0.5, 'triangle', 0.16);
    blip(root, root, 0.5, 'triangle', 0.1);
    for (let i = 0; i < 4; i++) {
      const n = SCALE[(bar * 3 + i * 2) % SCALE.length];
      blip(base * Math.pow(2, n / 12), base * Math.pow(2, n / 12), 0.16, 'sine', 0.07, i * 0.16);
    }
    bar++;
    musicTimer = setTimeout(scheduleBar, 640);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (m) this.stopMusic();
      else if (musicOn) scheduleBar();
    },
    isMuted() { return muted; },
    engine(speed01, turbo) {
      if (!ctx || muted || !engineOsc) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 70 + (turbo ? 26 : 0), t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
      windGain.gain.setTargetAtTime(0.02 + speed01 * 0.09 + (turbo ? 0.05 : 0), t, 0.15);
      windFilter.frequency.setTargetAtTime(700 + speed01 * 1400, t, 0.2);
    },
    engineOff() {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
    coin() { ensure(); blip(880, 1320, 0.12, 'sine', 0.22); blip(1320, 1760, 0.1, 'sine', 0.14, 0.06); },
    crystal() { ensure(); blip(660, 990, 0.14, 'triangle', 0.2); blip(990, 1480, 0.14, 'triangle', 0.16, 0.07); blip(1480, 1980, 0.16, 'sine', 0.14, 0.14); },
    ring() { ensure(); [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.18, 'sine', 0.16, i * 0.07)); },
    fuel() { ensure(); blip(330, 660, 0.2, 'triangle', 0.18); },
    power() { ensure(); blip(440, 880, 0.25, 'square', 0.1); blip(880, 1320, 0.2, 'square', 0.08, 0.1); },
    hit() { ensure(); noiseBurst(0.35, 0.5, 900); blip(180, 60, 0.3, 'sawtooth', 0.25); },
    crash() { ensure(); noiseBurst(0.8, 0.7, 500); blip(120, 30, 0.7, 'sawtooth', 0.35); },
    click() { ensure(); blip(700, 700, 0.06, 'sine', 0.12); },
    unlockJingle() { ensure(); [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, f, 0.22, 'triangle', 0.16, i * 0.09)); },
    startMusic() {
      ensure();
      if (musicOn || !ctx) return;
      musicOn = true;
      bar = 0;
      scheduleBar();
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    },
  };
}
