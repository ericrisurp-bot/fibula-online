import type { SoundEvent, SoundEventOf, SoundType } from './types';

type BusName = 'sfx' | 'ambience';
type SoundHandler<T extends SoundType> = (
  event: SoundEventOf<T>,
  context: AudioContext,
  buses: { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer },
) => void;

const MAX_VOICES = 16;
const VOLUME_KEY = 'fibula-audio-volume';
const MUTED_KEY = 'fibula-audio-muted';

class AudioManager {
  private context: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private handlers = new Map<SoundType, SoundHandler<SoundType>>();
  private voices = 0;
  private muted = this.readMuted();
  private volume = this.readVolume();
  private visibilityListenerInstalled = false;

  private readMuted() {
    try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; }
  }

  private readVolume() {
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      if (stored === null) return 1;
      const value = Number(stored);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    } catch { return 1; }
  }

  private persist(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
  }

  private ensureContext() {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;

    try {
      const context = new AudioContextConstructor();
      const sfxBus = context.createGain();
      const ambienceBus = context.createGain();
      const masterGain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      sfxBus.connect(masterGain);
      ambienceBus.connect(masterGain);
      masterGain.connect(compressor);
      compressor.connect(context.destination);
      this.context = context;
      this.sfxBus = sfxBus;
      this.ambienceBus = ambienceBus;
      this.masterGain = masterGain;
      this.noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 2), context.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
      this.applySettings();
      this.installVisibilityListener();
      return context;
    } catch { return null; }
  }

  private applySettings() {
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
  }

  private installVisibilityListener() {
    if (this.visibilityListenerInstalled) return;
    this.visibilityListenerInstalled = true;
    document.addEventListener('visibilitychange', () => {
      const context = this.context;
      if (!context) return;
      if (document.hidden) void context.suspend().catch(() => undefined);
      else if (context.state === 'suspended') void context.resume().catch(() => undefined);
    });
  }

  async unlock() {
    const context = this.ensureContext();
    if (context && context.state !== 'running') {
      try { await context.resume(); } catch { /* Browser may require another gesture. */ }
    }
  }

  register<T extends SoundType>(type: T, fn: SoundHandler<T>) {
    this.handlers.set(type, fn as unknown as SoundHandler<SoundType>);
  }

  play(event: SoundEvent) {
    const handler = this.handlers.get(event.type);
    if (!handler) return;
    const context = this.ensureContext();
    if (!context || context.state !== 'running' || this.voices >= MAX_VOICES) return;
    handler(event as never, context, {
      sfxBus: this.sfxBus!,
      ambienceBus: this.ambienceBus!,
      noiseBuffer: this.noiseBuffer!,
    });
  }

  createVoice(source: AudioScheduledSourceNode, bus: BusName = 'sfx') {
    if (this.voices >= MAX_VOICES) {
      try { source.disconnect(); } catch { /* Already disconnected. */ }
      return false;
    }
    const destination = bus === 'sfx' ? this.sfxBus : this.ambienceBus;
    if (!destination || !this.context) return false;
    this.voices++;
    source.connect(destination);
    source.addEventListener('ended', () => {
      this.voices = Math.max(0, this.voices - 1);
      try { source.disconnect(); } catch { /* Already disconnected. */ }
    }, { once: true });
    return true;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applySettings();
    this.persist(MUTED_KEY, muted ? '1' : '0');
  }

  isMuted() { return this.muted; }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    this.applySettings();
    this.persist(VOLUME_KEY, String(this.volume));
  }

  getVolume() { return this.volume; }
  getActiveVoices(): number { return this.voices; }

  rand(min: number, max: number) { return min + Math.random() * (max - min); }

  pick<T>(array: readonly T[]) {
    if (array.length === 0) throw new RangeError('pick() requires a non-empty array');
    return array[Math.floor(Math.random() * array.length)];
  }
}

export const audioManager = new AudioManager();
export type { AudioManager };
