export type GameSoundEvent = 'chop' | 'mine' | 'harvest' | 'woodDeposit' | 'stoneDeposit' | 'cottonDeposit' | 'metalDeposit' | 'buildComplete';
type Phase = 'day' | 'night';

export class GameAudio {
  private context: AudioContext | null = null;
  private ambientTimer: number | null = null;
  private phase: Phase = 'day';
  private active = false;
  private lastEventAt = new Map<GameSoundEvent, number>();

  async start(phase: Phase) {
    if (!window.AudioContext) return;
    if (!this.context) this.context = new window.AudioContext();
    this.active = true;
    this.phase = phase;
    try { await this.context.resume(); this.scheduleAmbient(); } catch { /* Aguarda outra interação se o navegador bloquear o áudio. */ }
  }

  setPhase(phase: Phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    if (this.active) this.scheduleAmbient();
  }

  stop() {
    this.active = false;
    if (this.ambientTimer !== null) window.clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
  }

  play(event: GameSoundEvent) {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - (this.lastEventAt.get(event) ?? -Infinity) < 0.12) return;
    this.lastEventAt.set(event, now);
    switch (event) {
      case 'chop': this.noise(0.12, 'lowpass', 900, 0.035); this.tone(125, 0.1, 0.018, 'triangle', 78); break;
      case 'mine': this.noise(0.09, 'highpass', 1500, 0.025); this.tone(430, 0.07, 0.012, 'triangle', 210); break;
      case 'harvest': this.noise(0.16, 'highpass', 2300, 0.012); break;
      case 'woodDeposit': this.noise(0.075, 'lowpass', 700, 0.025); this.tone(175, 0.09, 0.018, 'triangle', 115); break;
      case 'stoneDeposit': this.tone(520, 0.07, 0.016, 'triangle', 300); break;
      case 'cottonDeposit': this.noise(0.1, 'highpass', 1800, 0.01); break;
      case 'metalDeposit': this.tone(680, 0.09, 0.014, 'triangle', 390); break;
      case 'buildComplete':
        this.tone(440, 0.12, 0.018, 'sine', 550);
        window.setTimeout(() => this.tone(660, 0.16, 0.016, 'sine'), 90);
        break;
    }
  }

  private scheduleAmbient() {
    if (this.ambientTimer !== null) window.clearTimeout(this.ambientTimer);
    if (!this.active) return;
    const delay = this.phase === 'day' ? 7000 + Math.random() * 10000 : 8000 + Math.random() * 11000;
    this.ambientTimer = window.setTimeout(() => {
      this.ambientTimer = null;
      if (this.active && this.context?.state === 'running') {
        if (this.phase === 'day') {
          if (Math.random() < 0.62) this.birds();
          else this.noise(1.8 + Math.random() * 1.8, 'lowpass', 520, 0.009);
        } else {
          const nightSound = Math.random();
          if (nightSound < 0.55) this.crickets();
          else if (nightSound < 0.78) this.owl();
          // O restante das vezes permanece em silêncio para manter a noite tranquila.
        }
      }
      this.scheduleAmbient();
    }, delay);
  }

  private owl() {
    // Duas notas baixas e arredondadas, sintetizadas; não usa arquivo de áudio.
    const base = 360 + Math.random() * 70;
    this.tone(base, 0.38, 0.009, 'sine', base * 0.72);
    window.setTimeout(() => this.tone(base * 0.82, 0.46, 0.008, 'sine', base * 0.62), 420);
  }

  private birds() {
    const base = 1450 + Math.random() * 550;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const delay = i * (130 + Math.random() * 90);
      window.setTimeout(() => this.tone(base + Math.random() * 500, 0.11, 0.008, 'sine', base + 500 + Math.random() * 500), delay);
    }
  }

  private crickets() {
    const base = 2800 + Math.random() * 450;
    for (let i = 0; i < 4; i++) window.setTimeout(() => this.tone(base, 0.065, 0.006, 'sine', base + 90), i * 115);
  }

  private tone(startHz: number, duration: number, volume: number, type: OscillatorType, endHz = startHz) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    const start = c.currentTime, oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startHz), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(c.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.015);
  }

  private noise(duration: number, filterType: BiquadFilterType, cutoff: number, volume: number) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    filter.type = filterType; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), c.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(c.destination);
    source.start(); source.stop(c.currentTime + duration + 0.015);
  }
}
