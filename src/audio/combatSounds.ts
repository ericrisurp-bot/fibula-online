import { audioManager } from './audioManager';

type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };
type Variation = { pitch: number; volume: number; duration: number; delay: number };
type SoundKey = 'warrior' | 'mage' | 'mage-explosive' | 'archer' | 'druid' | 'mage-explosion' | 'wood' | 'wood-done' | 'stone' | 'stone-done' | 'cotton' | 'step' | 'step-carry';

const lastVariation = new Map<SoundKey, string>();
const lastStartedAt = new Map<SoundKey, number>();

export function variation(key: SoundKey): Variation | null {
  const now = performance.now() / 1000;
  const previousStart = lastStartedAt.get(key);
  if (previousStart !== undefined && now - previousStart < 0.04) return null;

  let next: Variation;
  let signature: string;
  do {
    next = {
      pitch: audioManager.rand(0.92, 1.08),
      volume: audioManager.rand(0.85, 1.15),
      duration: audioManager.rand(0.9, 1.1),
      delay: audioManager.rand(0, 0.012),
    };
    signature = [next.pitch, next.volume, next.duration, next.delay].map(v => v.toFixed(5)).join(':');
  } while (signature === lastVariation.get(key));
  lastVariation.set(key, signature);
  lastStartedAt.set(key, now);
  return next;
}

function envelope(gain: GainNode, start: number, peak: number, duration: number, attack = 0.006) {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

function startVoice(
  source: AudioScheduledSourceNode,
  chain: AudioNode[],
  buses: SoundBuses,
  start: number,
  duration: number,
) {
  if (!audioManager.createVoice(source)) return false;
  try {
    source.disconnect();
    source.connect(chain[0]);
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    chain[chain.length - 1].connect(buses.sfxBus);
    source.addEventListener('ended', () => {
      for (const node of chain) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    }, { once: true });
    source.start(start);
    source.stop(start + duration);
    return true;
  } catch {
    try { source.stop(); } catch { /* Source may not have started. */ }
    try { source.disconnect(); } catch { /* Already disconnected. */ }
    for (const node of chain) {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    return false;
  }
}

export function noiseSource(context: AudioContext, buses: SoundBuses, start: number, duration: number, filterType: BiquadFilterType, low: number, high: number, peak: number, pitch: number, sweepDown = false) {
  const source = context.createBufferSource();
  source.buffer = buses.noiseBuffer;
  source.playbackRate.setValueAtTime(pitch, start);
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(sweepDown ? high : low, start);
  filter.frequency.linearRampToValueAtTime(sweepDown ? low : high, start + duration);
  filter.Q.setValueAtTime(0.7, start);
  const gain = context.createGain();
  envelope(gain, start, peak, duration, Math.min(0.008, duration * 0.08));
  return startVoice(source, [filter, gain], buses, start, duration);
}

export function toneSource(context: AudioContext, buses: SoundBuses, start: number, duration: number, waveform: OscillatorType, fromHz: number, toHz: number, peak: number, pitch: number, delaySwell = 0) {
  const source = context.createOscillator();
  source.type = waveform;
  source.frequency.setValueAtTime(fromHz * pitch, start);
  if (delaySwell > 0) {
    source.frequency.setValueAtTime(fromHz * pitch * 0.72, start);
    source.frequency.linearRampToValueAtTime(fromHz * pitch, start + delaySwell);
    source.frequency.exponentialRampToValueAtTime(toHz * pitch, start + duration);
  } else {
    source.frequency.exponentialRampToValueAtTime(Math.max(1, toHz * pitch), start + duration);
  }
  const gain = context.createGain();
  envelope(gain, start, peak, duration, Math.min(0.012, duration * 0.08));
  return startVoice(source, [gain], buses, start, duration);
}

/** Guerreiro: ruído de espada ascendente e golpe grave curto. */
export function playWarriorAttack(context: AudioContext, buses: SoundBuses) {
  const v = variation('warrior');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.16 * v.duration;
  noiseSource(context, buses, start, duration, 'bandpass', 600 * v.pitch, 1800 * v.pitch, 0.075 * v.volume, v.pitch);
  toneSource(context, buses, start, 0.12 * v.duration, 'sine', 135 * v.pitch, 90 * v.pitch, 0.065 * v.volume, v.pitch);
}

/** Mago: feitiço pentatónico curto, com duas vozes e brilho leve. */
export function playMageAttack(context: AudioContext, buses: SoundBuses) {
  const v = variation('mage');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.15 * v.duration;
  const note = audioManager.pick([392, 440, 494, 587, 659]) * v.pitch;
  toneSource(context, buses, start, duration, 'sine', note, note * 2.05, 0.055 * v.volume, 1);
  toneSource(context, buses, start, duration, 'sine', note * 1.012, note * 2.02, 0.045 * v.volume, 1);
  toneSource(context, buses, start, 0.11 * v.duration, 'triangle', note * 3, note * 3.5, 0.018 * v.volume, 1);
}

/** Mago explosivo: disparo mais grave, com swell antes da subida tonal. */
export function playMageExplosiveAttack(context: AudioContext, buses: SoundBuses) {
  const v = variation('mage-explosive');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.22 * v.duration;
  const note = audioManager.pick([196, 220, 247, 294, 330]) * v.pitch;
  toneSource(context, buses, start, duration, 'sine', note, note * 2.2, 0.065 * v.volume, 1, 0.065 * v.duration);
  toneSource(context, buses, start, duration, 'triangle', note * 1.006, note * 2.05, 0.045 * v.volume, 1, 0.065 * v.duration);
  noiseSource(context, buses, start + 0.035 * v.duration, 0.12 * v.duration, 'bandpass', 700 * v.pitch, 2400 * v.pitch, 0.025 * v.volume, v.pitch);
}

/** Explosão do mago: queda grave, estouro filtrado e cauda brilhante. */
export function playMageExplosion(context: AudioContext, buses: SoundBuses) {
  const v = variation('mage-explosion');
  if (!v) return;
  const start = context.currentTime + v.delay;
  toneSource(context, buses, start, 0.4 * v.duration, 'sine', 140 * v.pitch, 40 * v.pitch, 0.095 * v.volume, 1);
  noiseSource(context, buses, start, 0.5 * v.duration, 'lowpass', 200 * v.pitch, 2000 * v.pitch, 0.075 * v.volume, v.pitch, true);
  toneSource(context, buses, start + 0.035, 0.19 * v.duration, 'triangle', 1800 * v.pitch, 600 * v.pitch, 0.018 * v.volume, 1);
}

/** Arqueiro: clique da corda, nota pinçada e sopro curto da flecha. */
export function playArcherAttack(context: AudioContext, buses: SoundBuses) {
  const v = variation('archer');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.12 * v.duration;
  noiseSource(context, buses, start, 0.035 * v.duration, 'bandpass', 1800 * v.pitch, 2400 * v.pitch, 0.045 * v.volume, v.pitch);
  toneSource(context, buses, start, duration, 'triangle', 240 * v.pitch, 180 * v.pitch, 0.065 * v.volume, 1);
  noiseSource(context, buses, start + 0.006, 0.06 * v.duration, 'highpass', 1500 * v.pitch, 5000 * v.pitch, 0.035 * v.volume, v.pitch);
}

/** Druida: folhas suaves e bolha tonal ascendente. */
export function playDruidAttack(context: AudioContext, buses: SoundBuses) {
  const v = variation('druid');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.2 * v.duration;
  noiseSource(context, buses, start, duration, 'bandpass', 1500 * v.pitch, 3000 * v.pitch, 0.055 * v.volume, v.pitch);
  toneSource(context, buses, start, 0.2 * v.duration, 'sine', 300 * v.pitch, 520 * v.pitch, 0.065 * v.volume, 1);
}

export function registerCombatSounds() {
  audioManager.register('attack', (event, context, buses) => {
    if (event.classId === 'guerreiro') playWarriorAttack(context, buses);
    else if (event.classId === 'mago') {
      if (event.explosive) playMageExplosiveAttack(context, buses);
      else playMageAttack(context, buses);
    } else if (event.classId === 'arqueiro') playArcherAttack(context, buses);
    else playDruidAttack(context, buses);
  });
  audioManager.register('explosion', (_event, context, buses) => playMageExplosion(context, buses));
}
