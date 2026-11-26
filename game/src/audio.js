// Tiny WebAudio synth: no sound files, everything is an oscillator. The
// engine hum follows the throttle, rings chime, landings thud. Silent until
// the pilot's first key or click, as browsers require.
export function createAudio() {
  const audio = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    enabled: false,
    ensure() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        return;
      }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audio.ctx = new Ctx();
        audio.engineOsc = audio.ctx.createOscillator();
        audio.engineOsc.type = 'sawtooth';
        audio.engineOsc.frequency.value = 55;
        const filter = audio.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        audio.engineGain = audio.ctx.createGain();
        audio.engineGain.gain.value = 0;
        audio.engineOsc.connect(filter).connect(audio.engineGain).connect(audio.ctx.destination);
        audio.engineOsc.start();
        audio.enabled = true;
      } catch {
        audio.enabled = false;
      }
    },
    engine(throttle, flying) {
      if (!audio.enabled || !audio.ctx) return;
      const target = flying ? 0.018 + (throttle / 100) * 0.05 : 0.008;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
      audio.engineOsc.frequency.setTargetAtTime(48 + throttle * 0.9, audio.ctx.currentTime, 0.1);
    },
    blip(freq, dur, type, vol) {
      if (!audio.enabled || !audio.ctx) return;
      try {
        const osc = audio.ctx.createOscillator();
        const gain = audio.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol || 0.12, audio.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
        osc.connect(gain).connect(audio.ctx.destination);
        osc.start();
        osc.stop(audio.ctx.currentTime + dur);
      } catch {
        // Sound is garnish; a failed blip never breaks the game.
      }
    },
    ring() {
      audio.blip(880, 0.35, 'sine', 0.16);
      setTimeout(() => audio.blip(1318, 0.4, 'sine', 0.12), 70);
    },
    land() {
      audio.blip(120, 0.25, 'triangle', 0.2);
    },
    crash() {
      audio.blip(70, 0.6, 'sawtooth', 0.2);
      setTimeout(() => audio.blip(45, 0.8, 'sawtooth', 0.16), 90);
    },
    click() {
      audio.blip(660, 0.08, 'square', 0.06);
    },
  };
  return audio;
}
