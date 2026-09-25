// Audio 100% sintetizado con WebAudio: no hace falta descargar nada.
// Si ponés public/audio/music.mp3 (y opcionalmente menu.mp3), se usan en vez de la música generativa.
import type { SimEvent } from '../core/events';

type Mode = 'off' | 'menu' | 'match';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private mode: Mode = 'off';
  private nextStep = 0;
  private step = 0;
  private bar = 0;
  private timer: number | null = null;
  private fileMusic: { menu?: HTMLAudioElement; match?: HTMLAudioElement } = {};
  private fileChecked = false;
  intensity = 0;
  tension = 0; // 0..1: sube en el final de la partida (más tempo y capas)
  announcer = true;
  private samples = new Map<string, AudioBuffer>();
  private voices = new Map<string, AudioBuffer>();
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastSay = 0;
  private coinChain = 0;
  private coinT = 0;
  volumes = { master: 0.8, sfx: 0.9, music: 0.45 };

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      void this.checkFiles();
      void this.loadSamples();
      void this.loadVoices();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** ¿Hay un sample real cargado para este sonido? (para la galería de assets) */
  hasSample(name: string) { return this.samples.has(name); }
  /** ¿La música de este modo viene de un archivo? */
  hasMusicFile(k: 'menu' | 'match') { return !!this.fileMusic[k]; }

  setVolumes(v: Partial<typeof this.volumes>) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music * 0.5;
    for (const a of Object.values(this.fileMusic)) if (a) a.volume = Math.min(1, this.volumes.music * this.volumes.master);
  }

  private async checkFiles() {
    if (this.fileChecked) return;
    this.fileChecked = true;
    for (const k of ['menu', 'match'] as const) {
      const url = k === 'match' ? 'audio/music.mp3' : 'audio/menu.mp3';
      try {
        const r = await fetch(url, { method: 'HEAD' });
        const type = r.headers.get('content-type') ?? '';
        if (r.ok && type.includes('audio')) {
          const a = new Audio(url);
          a.loop = true;
          this.fileMusic[k] = a;
        }
      } catch { /* sin archivo: música generativa */ }
    }
    if (!this.fileMusic.menu && this.fileMusic.match) this.fileMusic.menu = this.fileMusic.match;
    this.applyVolumes();
    const m = this.mode;
    this.mode = 'off';
    this.setMusic(m);
  }

  // ───────────── música ─────────────

  setMusic(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const a of Object.values(this.fileMusic)) a?.pause();
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (!this.ctx || mode === 'off') return;
    const file = this.fileMusic[mode];
    if (file) {
      file.currentTime = 0;
      void file.play().catch(() => {});
      return;
    }
    this.nextStep = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule() {
    const ctx = this.ctx!;
    const bpm = this.mode === 'match' ? 118 + this.tension * 18 : 92;
    const stepDur = 60 / bpm / 4;
    // progresión i - VI - III - VII en La menor
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    while (this.nextStep < ctx.currentTime + 0.2) {
      const t = this.nextStep;
      const s = this.step % 16;
      const ch = chords[this.bar % 4];
      const match = this.mode === 'match';
      if (s === 0) this.pad(t, ch, stepDur * 16, match ? 0.05 : 0.07);
      if (match) {
        if (s === 0 || s === 8 || (s === 11 && this.bar % 2)) this.kick(t);
        if (s === 4 || s === 12) this.snare(t, 0.22);
        if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.07 : 0.04);
        if ([0, 3, 6, 8, 11, 14].includes(s)) this.bass(t, NOTE(ch[0] - 24), stepDur * 1.6);
        if (this.intensity > 0.5 && s % 2 === 0) this.arp(t, NOTE(ch[(s / 2) % 3] + 12), stepDur, 0.035);
      } else {
        if (s % 4 === 0) this.arp(t, NOTE(ch[(s / 4) % 3] + 12), stepDur * 3, 0.04);
        if (s === 0 || s === 10) this.bass(t, NOTE(ch[0] - 12), stepDur * 6, 0.08);
      }
      if (match && s % 4 === 2) this.arp(t, NOTE(ch[(this.bar + s) % 3] + 24), stepDur * 0.8, 0.02);
      if (match && this.tension > 0.5) {
        this.hat(t, 0.03);
        if (s % 4 === 0) this.arp(t, NOTE(ch[s % 3] + 36), stepDur * 0.5, 0.018);
      }
      this.nextStep += stepDur;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    this.env(g, t, 0.003, 0.5, 0.25);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.3);
  }

  private snare(t: number, v: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    this.env(g, t, 0.002, v, 0.14);
    n.connect(f).connect(g).connect(this.music);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.2);
  }

  private hat(t: number, v: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(g, t, 0.001, v, 0.04);
    n.connect(f).connect(g).connect(this.music);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.06);
  }

  private bass(t: number, freq: number, dur: number, v = 0.14) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, 0.01, v, dur);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private arp(t: number, freq: number, dur: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    this.env(g, t, 0.005, v, dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, notes: number[], dur: number, v: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.music);
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(n);
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // ───────────── efectos ─────────────

  private out(vol: number, pan: number): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, v: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.004, v, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(dest: AudioNode, type: BiquadFilterType, freq: number, dur: number, v: number, sweepTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    this.env(g, t, 0.003, v, dur);
    n.connect(f).connect(g).connect(dest);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.05);
  }

  play(name: string, vol = 1, pan = 0, pitch = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || vol < 0.02) return;
    const now = this.ctx.currentTime;
    const l = this.last.get(name) ?? -1;
    if (now - l < 0.035) return;
    this.last.set(name, now);
    const o = this.out(vol, pan);
    // Si hay un sample real (public/audio/sfx/<nombre>.mp3 listado en manifest.json), se usa ese.
    const smp = this.samples.get(name);
    if (smp) {
      const src = this.ctx.createBufferSource();
      src.buffer = smp;
      src.playbackRate.value = pitch * (0.96 + Math.random() * 0.08);
      src.connect(o);
      src.start();
      return;
    }
    const pr = (0.92 + Math.random() * 0.16) * pitch;
    switch (name) {
      case 'hit': this.noiseHit(o, 'bandpass', 1400 * pr, 0.08, 0.5); this.tone(o, 'sine', 170 * pr, 60, 0.12, 0.6); break;
      case 'hitbig': this.noiseHit(o, 'lowpass', 2500, 0.2, 0.7); this.tone(o, 'sine', 120 * pr, 35, 0.3, 0.9); this.noiseHit(o, 'highpass', 3000, 0.06, 0.3); break;
      case 'swing': this.noiseHit(o, 'bandpass', 700 * pr, 0.12, 0.25, 2600); break;
      case 'push': this.noiseHit(o, 'bandpass', 400, 0.2, 0.4, 1800); this.tone(o, 'sine', 140, 70, 0.15, 0.4); break;
      case 'charge': this.tone(o, 'sawtooth', 110, 220, 0.25, 0.05); break;
      case 'shard': this.tone(o, 'triangle', 1700 * pr, 900, 0.09, 0.22); break;
      case 'lance': this.tone(o, 'sawtooth', 1200, 250, 0.3, 0.18); this.noiseHit(o, 'highpass', 2000, 0.2, 0.2); break;
      case 'glob': this.tone(o, 'sine', 260 * pr, 620, 0.12, 0.35); break;
      case 'wave': this.noiseHit(o, 'lowpass', 400, 1.1, 0.5, 1500); break;
      case 'hook': this.tone(o, 'square', 900, 1300, 0.08, 0.12); this.noiseHit(o, 'highpass', 4000, 0.15, 0.15); break;
      case 'bolt': this.tone(o, 'square', 700 * pr, 350, 0.06, 0.1); break;
      case 'boom': this.noiseHit(o, 'lowpass', 900, 0.5, 0.8, 120); this.tone(o, 'sine', 90, 30, 0.5, 0.9); break;
      case 'quake': this.noiseHit(o, 'lowpass', 600, 0.9, 1, 60); this.tone(o, 'sine', 70, 25, 0.9, 1); this.noiseHit(o, 'bandpass', 300, 0.6, 0.4, 100, 0.05); break;
      case 'crack': this.noiseHit(o, 'highpass', 2500 * pr, 0.05, 0.6); this.noiseHit(o, 'bandpass', 900, 0.12, 0.35, 300, 0.02); break;
      case 'crystal':
        for (let i = 0; i < 4; i++) this.tone(o, 'sine', NOTE([88, 91, 93, 96, 100][Math.floor(Math.random() * 5)]), 3000, 0.25, 0.12, i * 0.035);
        break;
      case 'metal': for (const [f, v] of [[520, 0.2], [813, 0.14], [1277, 0.1], [1960, 0.06]]) this.tone(o, 'sine', f * pr, f * pr * 0.98, 0.5, v); break;
      case 'goo': this.tone(o, 'sine', 240 * pr, 70, 0.22, 0.45); this.tone(o, 'sine', 500 * pr, 180, 0.1, 0.2, 0.05); break;
      case 'stone': this.noiseHit(o, 'lowpass', 1200, 0.25, 0.6, 200); this.tone(o, 'sine', 110, 50, 0.2, 0.4); break;
      case 'jump': this.tone(o, 'square', 280, 560, 0.12, 0.07); break;
      case 'airjump': this.tone(o, 'square', 420, 900, 0.12, 0.07); this.noiseHit(o, 'bandpass', 1500, 0.1, 0.15, 3000); break;
      case 'land': this.tone(o, 'sine', 120, 50, 0.1, 0.35); this.noiseHit(o, 'lowpass', 600, 0.08, 0.2); break;
      case 'slam': this.tone(o, 'sine', 100, 35, 0.25, 0.8); this.noiseHit(o, 'bandpass', 1100, 0.15, 0.6, 300); break;
      case 'ringout':
        this.tone(o, 'sine', 1800, 180, 0.7, 0.3);
        this.noiseHit(o, 'lowpass', 1200, 0.8, 0.9, 80, 0.45);
        this.tone(o, 'sine', 80, 25, 0.8, 1, 0.45);
        break;
      case 'pickup': this.tone(o, 'triangle', 880 * pr, 880, 0.07, 0.12); this.tone(o, 'triangle', 1320 * pr, 1320, 0.08, 0.1, 0.05); break;
      case 'levelup': [72, 76, 79, 84].forEach((n, i) => this.tone(o, 'square', NOTE(n), NOTE(n), 0.18, 0.1, i * 0.07)); break;
      case 'craft': [84, 88, 91].forEach((n, i) => this.tone(o, 'triangle', NOTE(n), NOTE(n), 0.2, 0.15, i * 0.05)); this.tone(o, 'sine', 300, 900, 0.3, 0.1); break;
      case 'repair': this.tone(o, 'sine', 400, 1200, 0.4, 0.15); this.tone(o, 'triangle', 600, 1800, 0.4, 0.08, 0.1); break;
      case 'shield': this.tone(o, 'sine', 600, 900, 0.35, 0.15); this.tone(o, 'sine', 900, 1350, 0.35, 0.1); break;
      case 'count': this.tone(o, 'square', 620, 620, 0.12, 0.12); break;
      case 'go': this.tone(o, 'square', 930, 930, 0.35, 0.14); this.tone(o, 'square', 1240, 1240, 0.35, 0.08); break;
      case 'deny': this.tone(o, 'sawtooth', 160, 120, 0.15, 0.12); break;
      case 'ui': this.tone(o, 'triangle', 700, 900, 0.05, 0.12); break;
      case 'tile': this.noiseHit(o, 'lowpass', 500, 0.6, 0.6, 80); this.noiseHit(o, 'highpass', 2000, 0.2, 0.2); break;
      case 'blink': this.tone(o, 'sine', 500, 2400, 0.18, 0.18); this.noiseHit(o, 'highpass', 3000, 0.15, 0.2); break;
      case 'spawn': this.tone(o, 'triangle', 300, 900, 0.3, 0.12); break;
      case 'stage': this.noiseHit(o, 'highpass', 1800, 0.08, 0.7); this.tone(o, 'sine', 200, 90, 0.2, 0.4); break;
      case 'bounce': this.tone(o, 'sine', 180, 420, 0.12, 0.35); break;
      case 'win': [72, 76, 79, 84, 88].forEach((n, i) => this.tone(o, 'square', NOTE(n), NOTE(n), 0.3, 0.12, i * 0.1)); break;
      case 'lose': [69, 65, 62, 57].forEach((n, i) => this.tone(o, 'triangle', NOTE(n), NOTE(n), 0.35, 0.14, i * 0.14)); break;
      case 'combo': {
        // Escala pentatónica que sube con el combo: suena a tragamonedas.
        const steps = [0, 2, 4, 7, 9];
        const n = Math.round(Math.log2(pitch) * 12) || 0;
        const semi = Math.floor(n / 5) * 12 + steps[((n % 5) + 5) % 5];
        const f = NOTE(76 + semi);
        this.tone(o, 'square', f, f, 0.09, 0.07);
        this.tone(o, 'triangle', f * 2, f * 2, 0.12, 0.05, 0.03);
        break;
      }
      case 'coin': {
        const f = 988 * pr;
        this.tone(o, 'square', f, f, 0.05, 0.06);
        this.tone(o, 'square', f * 1.335, f * 1.335, 0.14, 0.06, 0.05);
        break;
      }
      case 'crowd': {
        // Rugido de público: ruido filtrado con "respiración".
        const ctx = this.ctx;
        const t = ctx.currentTime;
        for (const [fq, v] of [[700, 0.35], [1400, 0.22], [2600, 0.12]]) {
          const n = ctx.createBufferSource();
          n.buffer = this.noise;
          n.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = fq;
          f.Q.value = 0.8;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(v, t + 0.25);
          g.gain.setValueAtTime(v, t + 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = 5 + Math.random() * 3;
          lg.gain.value = v * 0.3;
          lfo.connect(lg).connect(g.gain);
          n.connect(f).connect(g).connect(o);
          n.start(t, Math.random() * 0.5);
          n.stop(t + 2);
          lfo.start(t);
          lfo.stop(t + 2);
        }
        break;
      }
      case 'lethal':
        this.noiseHit(o, 'highpass', 1500, 0.35, 0.5, 6000);
        this.tone(o, 'sine', 95, 28, 1.1, 1);
        this.tone(o, 'sawtooth', 220, 55, 0.6, 0.12);
        this.tone(o, 'sine', 1760, 1760, 0.6, 0.08, 0.05);
        break;
      case 'ultready': [72, 79, 84, 91, 96].forEach((n, i) => this.tone(o, 'triangle', NOTE(n), NOTE(n), 0.25, 0.1, i * 0.05)); break;
      case 'ready': this.tone(o, 'sine', 1320, 1320, 0.06, 0.08); break;
      case 'heart': this.tone(o, 'sine', 70, 45, 0.12, 0.8); this.tone(o, 'sine', 65, 42, 0.12, 0.6, 0.16); break;
      case 'jackpot':
        for (let i = 0; i < 10; i++) this.tone(o, 'square', NOTE(72 + [0, 4, 7, 12, 16, 19, 24, 19, 24, 28][i]), NOTE(72 + [0, 4, 7, 12, 16, 19, 24, 19, 24, 28][i]), 0.08, 0.07, i * 0.055);
        this.noiseHit(o, 'highpass', 6000, 0.6, 0.12, undefined, 0.3);
        break;
      case 'announce': {
        const t0 = [60, 64, 67, 72];
        t0.forEach((n) => this.tone(o, 'sawtooth', NOTE(n) * pr, NOTE(n) * pr, 0.45, 0.06));
        this.tone(o, 'sine', 65, 40, 0.4, 0.5);
        break;
      }
      case 'tick': this.tone(o, 'square', 1800, 1800, 0.03, 0.08); this.tone(o, 'sine', 900, 900, 0.08, 0.1); break;
      case 'hover': this.tone(o, 'sine', 1200, 1500, 0.04, 0.04); break;
      case 'whoosh': this.noiseHit(o, 'bandpass', 400, 0.35, 0.35, 3000); break;
    }
  }

  /** Líneas de locutor opcionales: public/audio/voice/manifest.json con ["primer_ring_out", ...]. */
  private async loadVoices() {
    try {
      const r = await fetch('audio/voice/manifest.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return;
      const names: string[] = await r.json();
      for (const n of names) {
        try {
          const a = await fetch(`audio/voice/${n}.mp3`);
          if (!a.ok || !(a.headers.get('content-type') ?? '').includes('audio')) continue;
          this.voices.set(n, await this.ctx!.decodeAudioData(await a.arrayBuffer()));
        } catch { /* siguiente */ }
      }
    } catch { /* sin locutor grabado */ }
  }

  /** Carga samples opcionales listados en public/audio/sfx/manifest.json (["hit","boom",...]). */
  private async loadSamples() {
    try {
      const r = await fetch('audio/sfx/manifest.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return;
      const names: string[] = await r.json();
      for (const n of names) {
        for (const ext of ['mp3', 'ogg', 'wav']) {
          try {
            const a = await fetch(`audio/sfx/${n}.${ext}`);
            if (!a.ok || !(a.headers.get('content-type') ?? '').includes('audio')) continue;
            const buf = await this.ctx!.decodeAudioData(await a.arrayBuffer());
            this.samples.set(n, buf);
            break;
          } catch { /* probar la siguiente extensión */ }
        }
      }
    } catch { /* sin samples: todo sintetizado */ }
  }

  /** Viento continuo mientras volás (0..1). */
  setWind(amount: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.wind) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfx);
      src.start();
      this.wind = { src, gain, filter };
    }
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(Math.min(0.5, amount * 0.5), t, 0.08);
    this.wind.filter.frequency.setTargetAtTime(500 + amount * 2500, t, 0.1);
  }

  /** Locutor: usa una línea grabada si existe (public/audio/voice/<slug>.mp3), si no la voz del navegador. */
  say(text: string, priority = false) {
    if (!this.announcer) return;
    const now = performance.now();
    if (!priority && now - this.lastSay < 1200) return;
    this.lastSay = now;
    const rec = this.voices.get(voiceSlug(text));
    if (rec && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = rec;
      const g = this.ctx.createGain();
      g.gain.value = 1.1;
      src.connect(g).connect(this.master);
      src.start();
      return;
    }
    if (typeof speechSynthesis === 'undefined') return;
    try {
      if (priority) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang.startsWith('es-AR')) ?? voices.find((x) => x.lang.startsWith('es-419') || x.lang.startsWith('es-MX')) ?? voices.find((x) => x.lang.startsWith('es'));
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'es-ES';
      u.rate = 1.12;
      u.pitch = 0.85;
      u.volume = Math.min(1, this.volumes.master * 1.1);
      speechSynthesis.speak(u);
    } catch { /* sin voz */ }
  }

  /** Traduce eventos de simulación a sonidos con volumen y paneo según distancia a la cámara. */
  /** Límite de sonidos de esbirros peleando entre ellos (si no, veinte golpes por segundo tapan todo). */
  private unitT = 0;
  private unitOk() {
    const now = performance.now();
    if (now - this.unitT < 90) return false;
    this.unitT = now;
    return true;
  }

  onEvent(e: SimEvent, pos: { x: number; z: number } | null, listener: { x: number; z: number }, localId: number, family: (id: number) => string | null) {
    let vol = 1, pan = 0;
    if (pos) {
      const dx = pos.x - listener.x, dz = pos.z - listener.z;
      const d = Math.hypot(dx, dz);
      vol = Math.max(0.12, 1 - d / 38);
      pan = dx / 22;
    }
    switch (e.k) {
      case 'hit':
        // Golpes entre unidades (esbirros, torres) sin que estés vos: bajito y con límite.
        if (family(e.id) === null && e.a !== localId) { if (this.unitOk()) this.play('hit', vol * 0.3, pan, 1.3); break; }
        this.play(e.p >= 12 ? 'hitbig' : 'hit', vol * (e.id === localId ? 1 : 0.85), pan, e.p >= 12 ? 1 : 1 + Math.min(0.25, e.h * 0.01));
        if (e.l) { this.play('lethal', 1); this.play('crowd', 0.5); }
        if (e.f === 'glob' || e.f === 'goo') this.play('goo', vol * 0.6, pan);
        if (e.f === 'shard' || e.f === 'lance' || e.f === 'crystal') this.play('crystal', vol * 0.5, pan);
        break;
      case 'boom':
        if (e.r >= 3) this.play(e.c === 'quake' ? 'quake' : 'boom', vol, pan);
        else if (e.r >= 1.5) this.play(e.c === 'build' ? 'metal' : e.c === 'buildstone' ? 'stone' : e.c === 'wave' ? 'push' : 'boom', vol * 0.8, pan);
        else if (e.c === 'shard' || e.c === 'lance') this.play('crystal', vol * 0.4, pan);
        else if (e.c === 'glob') this.play('goo', vol * 0.4, pan);
        else if (e.c === 'metal') this.play('metal', vol * 0.6, pan);
        break;
      case 'swing': this.play(e.c.startsWith('push') ? 'push' : 'swing', vol * 0.8, pan); break;
      case 'shoot': {
        if (e.c === 'spark' || e.c === 'cannon') { if (this.unitOk()) this.play(e.c === 'spark' ? 'shard' : 'boom', vol * 0.25, pan, 1.4); break; }
        const s = { shard: 'shard', lance: 'lance', glob: 'glob', goolob: 'glob', wave: 'wave', hook: 'hook', bolt: 'bolt', nova: 'blink' }[e.c];
        if (s) this.play(s, vol * 0.7, pan);
        break;
      }
      case 'dstage': {
        const f = family(-1 - e.i) ?? 'stone';
        this.play(e.s >= 3 ? (f === 'metal' ? 'metal' : f === 'crystal' ? 'crystal' : f === 'goo' ? 'goo' : 'stone') : 'crack', vol * 0.8, pan);
        break;
      }
      case 'tile': if (e.s >= 3) this.play('tile', vol * 0.8, pan); break;
      case 'stage': this.play('stage', vol * (e.id === localId ? 1 : 0.7), pan); break;
      case 'ring': this.play('ringout', Math.max(0.6, vol), pan); this.play('crowd', e.last ? 0.9 : 0.6); break;
      case 'jump': this.play(e.air ? 'airjump' : 'jump', vol * (e.id === localId ? 1 : 0.5), pan); break;
      case 'dash': this.play('whoosh', vol * (e.id === localId ? 0.8 : 0.45), pan, 1.4); break;
      case 'land': this.play('land', vol * Math.min(1, e.p / 20), pan); break;
      case 'slam': this.play('slam', vol, pan); break;
      case 'body': this.play('hitbig', vol, pan); this.play('crowd', 0.35); break;
      case 'lvl': if (e.id === localId) this.play('levelup', 0.9); break;
      case 'pick':
        if (e.id === localId) {
          // Cadena de monedas: cada trozo seguido suena más agudo.
          const now = performance.now();
          this.coinChain = now - this.coinT < 900 ? Math.min(this.coinChain + 1, 12) : 0;
          this.coinT = now;
          this.play('coin', 0.55, 0, Math.pow(2, this.coinChain / 12));
        }
        break;
      case 'craft': if (e.id === localId) this.play('craft', 0.9); break;
      case 'repair': this.play('repair', vol * (e.id === localId ? 1 : 0.6), pan); break;
      case 'shield': this.play('shield', vol, pan); break;
      case 'burst': this.play('crystal', vol, pan); this.play('boom', vol * 0.7, pan); break;
      case 'spawn': if (e.id === localId) this.play('spawn', 0.8); break;
      case 'blink': this.play('blink', vol, pan); break;
      case 'bounce': this.play('bounce', vol * 0.7, pan); break;
      case 'count': this.play(e.n > 0 ? 'count' : 'go', 1); break;
      case 'deny': if (e.id === localId) this.play('deny', 0.7); break;
      case 'save': this.play('whoosh', vol, pan); this.play('crowd', 0.5); if (e.id === localId) this.play('jackpot', 0.8); break;
      case 'final': this.play('tick', 1); break;
      // ── Asedio (MOBA) ──
      case 'udie': if (!e.fall && (e.by === localId || this.unitOk())) this.play('crack', vol * (e.by === localId ? 0.7 : 0.35), pan); break;
      case 'tshot': this.play('bolt', vol * 0.8, pan, 0.7); break;
      case 'shit': if (e.by === localId) this.play(e.h > 0 ? 'metal' : 'shield', 0.45, pan); break;
      case 'sdown': this.play('quake', 1); this.play('boom', 1); this.play('crowd', 0.8); break;
      case 'recall':
        if (e.s === 1) this.play('charge', vol * 0.7, pan);
        else if (e.s === 2) this.play('blink', vol, pan);
        else if (e.id === localId) this.play('deny', 0.4);
        break;
      case 'gold':
        if (e.id === localId) {
          const now = performance.now();
          this.coinChain = now - this.coinT < 900 ? Math.min(this.coinChain + 1, 12) : 0;
          this.coinT = now;
          this.play('coin', 0.6, 0, Math.pow(2, this.coinChain / 12));
        }
        break;
    }
  }
}

export const audio = new AudioEngine();

/** "¡Primer ring-out!" → "primer_ring_out" (nombre de archivo para líneas grabadas). */
export function voiceSlug(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
