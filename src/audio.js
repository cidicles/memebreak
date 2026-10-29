// Every sound is synthesised with WebAudio - no audio files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.voiceOn = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  out(vol, pan, t0, dur, attack = 0.003) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  noise({ dur = 0.2, vol = 0.5, f0 = 2000, f1 = 300, q = 0.7, type = 'lowpass', pan = 0, delay = 0 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    src.connect(f).connect(this.out(vol, pan, t0, dur));
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.2, pan = 0, delay = 0, vib = 0, attack = 0.003 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = vib;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    o.connect(this.out(vol, pan, t0, dur, attack));
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Text-to-speech for the announcer. The robotic browser voice is very much part of the joke.
  say(text, { pitch = 1, rate = 1, priority = false } = {}) {
    const s = window.speechSynthesis;
    if (!s || !this.voiceOn || !this.ctx) return;
    const now = performance.now();
    if (priority) s.cancel();
    else if (s.speaking || s.pending || now - (this.lastSay ?? 0) < 2500) return;
    this.lastSay = now;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = pitch;
    u.rate = rate;
    u.volume = 0.9;
    s.speak(u);
  }

  play(name, vol = 1, pan = 0) {
    if (!this.ctx || vol < 0.02) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return;
    this.last[name] = now;
    const v = vol;
    switch (name) {
      case 'pistol':
        this.noise({ dur: 0.18, vol: 0.6 * v, f0: 3200, f1: 400 });
        this.tone({ type: 'square', f0: 190, f1: 55, dur: 0.08, vol: 0.25 * v });
        break;
      case 'shotgun':
        this.noise({ dur: 0.5, vol: 0.95 * v, f0: 2200, f1: 140 });
        this.tone({ type: 'sine', f0: 110, f1: 38, dur: 0.3, vol: 0.7 * v });
        this.tone({ type: 'square', f0: 700, f1: 500, dur: 0.04, vol: 0.12 * v, delay: 0.38 });
        break;
      case 'rifle':
        this.noise({ dur: 0.12, vol: 0.5 * v, f0: 3800, f1: 600 });
        this.tone({ type: 'square', f0: 240, f1: 80, dur: 0.05, vol: 0.2 * v });
        break;
      case 'empty':
        this.tone({ type: 'square', f0: 1400, f1: 1200, dur: 0.03, vol: 0.12 * v });
        break;
      case 'reload':
        this.tone({ type: 'square', f0: 520, f1: 420, dur: 0.04, vol: 0.12 * v, delay: 0.1 });
        this.tone({ type: 'square', f0: 820, f1: 700, dur: 0.04, vol: 0.12 * v, delay: 0.55 });
        break;
      case 'hit':
        this.tone({ type: 'triangle', f0: 1100, f1: 800, dur: 0.05, vol: 0.18 * v });
        break;
      case 'headshot':
        this.tone({ type: 'triangle', f0: 1800, f1: 1400, dur: 0.07, vol: 0.22 * v });
        break;
      case 'kill':
        this.tone({ type: 'triangle', f0: 900, f1: 900, dur: 0.06, vol: 0.2 * v });
        this.tone({ type: 'triangle', f0: 1350, f1: 1350, dur: 0.08, vol: 0.2 * v, delay: 0.06 });
        break;
      case 'enemyHurt':
        this.tone({ type: 'sawtooth', f0: 320, f1: 170, dur: 0.14, vol: 0.2 * v, pan });
        break;
      case 'enemyDie':
        this.tone({ type: 'sawtooth', f0: 260, f1: 40, dur: 0.5, vol: 0.3 * v, pan });
        this.noise({ dur: 0.35, vol: 0.3 * v, f0: 900, f1: 100, pan });
        break;
      case 'enemyShoot':
        this.tone({ type: 'square', f0: 1100, f1: 180, dur: 0.2, vol: 0.2 * v, pan });
        break;
      case 'melee':
        this.noise({ dur: 0.12, vol: 0.5 * v, f0: 900, f1: 300, type: 'bandpass', q: 2, pan });
        break;
      case 'alert':
        this.tone({ type: 'sawtooth', f0: 90, f1: 200, dur: 0.35, vol: 0.22 * v, pan });
        this.tone({ type: 'sawtooth', f0: 93, f1: 190, dur: 0.35, vol: 0.18 * v, pan });
        break;
      case 'hurt':
        this.tone({ type: 'sine', f0: 150, f1: 55, dur: 0.22, vol: 0.6 * v });
        this.noise({ dur: 0.15, vol: 0.35 * v, f0: 600, f1: 150 });
        break;
      case 'step':
        this.noise({ dur: 0.07, vol: 0.5 * v, f0: 500, f1: 120 });
        break;
      case 'pickup':
        this.tone({ type: 'triangle', f0: 660, dur: 0.07, vol: 0.2 * v });
        this.tone({ type: 'triangle', f0: 990, dur: 0.1, vol: 0.2 * v, delay: 0.07 });
        break;
      case 'weapon':
        [440, 660, 880].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.1, vol: 0.22 * v, delay: i * 0.08 }));
        this.tone({ type: 'square', f0: 300, f1: 200, dur: 0.05, vol: 0.12 * v, delay: 0.3 });
        break;
      case 'win':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.25, delay: i * 0.1 }));
        break;
      case 'die': // sad trombone: wah wah wah waaaah
        [311, 294, 277].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, dur: 0.32, vol: 0.22 * v, delay: i * 0.36, attack: 0.03 }));
        this.tone({ type: 'sawtooth', f0: 262, f1: 250, dur: 1.2, vol: 0.24 * v, delay: 1.08, vib: 9, attack: 0.03 });
        break;
      case 'airhorn': // BWAP BWAP BWAAAAP
        for (const [delay, dur] of [[0, 0.13], [0.17, 0.13], [0.34, 0.6]]) {
          for (const f of [466, 587, 698]) this.tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur, vol: 0.13 * v, delay, attack: 0.01 });
        }
        break;
      case 'explode':
        this.noise({ dur: 0.9, vol: 1.0 * v, f0: 1400, f1: 50, pan });
        this.tone({ type: 'sine', f0: 90, f1: 28, dur: 0.7, vol: 0.8 * v, pan });
        break;
      case 'fuse':
        this.tone({ type: 'sine', f0: 900, f1: 1800, dur: 0.55, vol: 0.18 * v, pan, vib: 60 });
        break;
      case 'woof':
        for (const delay of [0, 0.16]) {
          this.noise({ dur: 0.09, vol: 0.45 * v, f0: 700, f1: 350, type: 'bandpass', q: 3, pan, delay });
          this.tone({ type: 'square', f0: 330, f1: 190, dur: 0.09, vol: 0.14 * v, pan, delay });
        }
        break;
      case 'kaching':
        this.noise({ dur: 0.06, vol: 0.3 * v, f0: 5000, f1: 3000, type: 'highpass', pan });
        this.tone({ type: 'triangle', f0: 1318, dur: 0.08, vol: 0.2 * v, pan, delay: 0.05 });
        this.tone({ type: 'triangle', f0: 1760, dur: 0.35, vol: 0.2 * v, pan, delay: 0.12 });
        break;
      case 'rage': // "FFFFFUUUUUU"
        this.noise({ dur: 0.5, vol: 0.4 * v, f0: 5000, f1: 3500, type: 'highpass', pan });
        this.tone({ type: 'sawtooth', f0: 170, f1: 240, dur: 0.7, vol: 0.28 * v, pan, delay: 0.4, vib: 25 });
        break;
      case 'whimper':
        this.tone({ type: 'sine', f0: 950, f1: 600, dur: 0.3, vol: 0.2 * v, pan, vib: 30 });
        this.tone({ type: 'sine', f0: 850, f1: 500, dur: 0.4, vol: 0.2 * v, pan, delay: 0.32, vib: 30 });
        break;
      case 'bonk': // woodblock BONK
        this.tone({ type: 'triangle', f0: 1100, f1: 650, dur: 0.07, vol: 0.4 * v, pan });
        this.noise({ dur: 0.05, vol: 0.4 * v, f0: 1800, f1: 1600, type: 'bandpass', q: 8, pan });
        this.tone({ type: 'sine', f0: 200, f1: 120, dur: 0.12, vol: 0.4 * v, pan });
        break;
      case 'blink': // teleport shimmer
        this.tone({ type: 'sine', f0: 300, f1: 2200, dur: 0.25, vol: 0.18 * v, pan });
        this.tone({ type: 'triangle', f0: 2600, f1: 3200, dur: 0.15, vol: 0.1 * v, pan, delay: 0.12 });
        break;
      case 'rave': // untz untz: a quick dance-synth riff
        [440, 554, 659, 880, 659, 880].forEach((f, i) =>
          this.tone({ type: 'sawtooth', f0: f, f1: f, dur: 0.07, vol: 0.12 * v, pan, delay: i * 0.085, attack: 0.005 }),
        );
        this.tone({ type: 'sine', f0: 110, f1: 45, dur: 0.12, vol: 0.4 * v, pan });
        break;
      case 'sever': // wet tear
        this.noise({ dur: 0.22, vol: 0.55 * v, f0: 2600, f1: 260, type: 'bandpass', q: 1.2, pan });
        this.tone({ type: 'sawtooth', f0: 320, f1: 90, dur: 0.18, vol: 0.22 * v, pan });
        break;
      case 'decap': // the big one
        this.noise({ dur: 0.4, vol: 0.8 * v, f0: 3000, f1: 160, type: 'bandpass', q: 0.9, pan });
        this.tone({ type: 'sawtooth', f0: 240, f1: 50, dur: 0.35, vol: 0.35 * v, pan });
        this.noise({ dur: 0.5, vol: 0.4 * v, f0: 700, f1: 90, pan, delay: 0.1 });
        break;
      case 'splat':
        this.noise({ dur: 0.12, vol: 0.35 * v, f0: 1200, f1: 200, type: 'bandpass', q: 1.5, pan });
        break;
      case 'respects':
        this.tone({ type: 'sine', f0: 523, dur: 0.5, vol: 0.2 * v });
        this.tone({ type: 'sine', f0: 392, dur: 0.8, vol: 0.2 * v, delay: 0.45 });
        break;
    }
  }

  startAmbient() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    f.connect(g).connect(this.master);
    for (const hz of [46, 46.7, 69.2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.connect(f);
      o.start();
    }
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 70;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
  }
}
