import { audioManager } from './audioManager';

type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

let lastStepContext: AudioContext | null = null;
let lastStepAt = -Infinity;

/** Pisada em uma única camada, sincronizada ao intervalo real entre contatos. */
export function playStep(
  context: AudioContext,
  buses: SoundBuses,
  foot: 'left' | 'right',
  carrying: boolean,
  night: number,
  interval: number,
) {
  const n = Math.max(0, Math.min(1, night));
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 52 / 150;
  const realSpeed = 52 / safeInterval;
  const duration = Math.max(0.05, Math.min(0.12, 0.5 * safeInterval));
  const attack = Math.min(0.01, duration * 0.3);
  const nightVolume = Math.max(0.45, 1 - 0.5 * n);
  const cutoffScale = 1 - 0.35 * n;
  const footPitch = foot === 'left' ? 0.985 : 1.015;
  const pitch = footPitch * audioManager.rand(0.98, 1.02);
  const baseGain = carrying ? 0.026 : 0.031;
  const speedGain = Math.max(0.7, Math.min(1.15, realSpeed / 150));
  const volume = baseGain * speedGain * audioManager.rand(0.95, 1.05) * nightVolume;
  const start = context.currentTime;
  if (lastStepContext !== context) {
    lastStepContext = context;
    lastStepAt = -Infinity;
  }
  if (start - lastStepAt < 0.04) return;
  lastStepAt = start;

  const source = context.createBufferSource();
  source.buffer = buses.noiseBuffer;
  source.playbackRate.setValueAtTime(pitch, start);

  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime((carrying ? 330 : 420) * cutoffScale, start);
  lowpass.Q.setValueAtTime(0.7, start);

  const grassPeak = context.createBiquadFilter();
  grassPeak.type = 'peaking';
  grassPeak.frequency.setValueAtTime(1200, start);
  grassPeak.Q.setValueAtTime(0.7, start);
  grassPeak.gain.setValueAtTime(3 * (1 - 0.5 * n), start);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  if (!audioManager.createVoice(source)) {
    try { lowpass.disconnect(); grassPeak.disconnect(); gain.disconnect(); } catch { /* Nós já desconectados. */ }
    return;
  }

  try {
    source.disconnect();
    source.connect(lowpass);
    lowpass.connect(grassPeak);
    grassPeak.connect(gain);
    gain.connect(buses.sfxBus);
    source.addEventListener('ended', () => {
      try { lowpass.disconnect(); grassPeak.disconnect(); gain.disconnect(); } catch { /* Nós já desconectados. */ }
    }, { once: true });
    const availableOffset = Math.max(0, buses.noiseBuffer.duration - duration * pitch - 0.01);
    source.start(start, audioManager.rand(0, availableOffset));
    source.stop(start + duration);
  } catch {
    try { source.stop(); source.disconnect(); } catch { /* Fonte já parada. */ }
    try { lowpass.disconnect(); grassPeak.disconnect(); gain.disconnect(); } catch { /* Nós já desconectados. */ }
  }
}

export function registerStepSounds() {
  audioManager.register('step', (event, context, buses) => {
    playStep(context, buses, event.foot, event.carrying, event.night, event.interval);
  });
}
