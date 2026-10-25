import { audioManager } from './audioManager';
import { noiseSource, toneSource, variation } from './combatSounds';

type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

/** Passos discretos na grama; à noite ficam mais abafados e curtos. */
export function playStep(
  context: AudioContext,
  buses: SoundBuses,
  foot: 'left' | 'right',
  carrying: boolean,
  night: number,
) {
  const v = variation(carrying ? 'step-carry' : 'step');
  if (!v) return;

  const n = Math.max(0, Math.min(1, night));
  const nightVolume = Math.max(0.45, 1 - 0.5 * n);
  const cutoffScale = 1 - 0.35 * n;
  const highRustleScale = 1 - 0.7 * n;
  const durationScale = 1 - 0.15 * n;
  const volume = v.volume * nightVolume;
  const footPitch = foot === 'left' ? 0.94 : 1.06;
  const pitch = v.pitch * footPitch;
  const start = context.currentTime + v.delay;

  const stepNoise = (
    at: number,
    duration: number,
    low: number,
    high: number,
    peak: number,
    attack: number,
  ) => {
    const source = context.createBufferSource();
    source.buffer = buses.noiseBuffer;
    source.playbackRate.setValueAtTime(pitch, at);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(low * pitch * cutoffScale, at);
    filter.frequency.linearRampToValueAtTime(high * pitch * cutoffScale, at + duration);
    filter.Q.setValueAtTime(0.7, at);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak * volume, at + Math.min(attack, duration * 0.45));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (!audioManager.createVoice(source)) return;
    try {
      source.disconnect();
      source.connect(filter);
      filter.connect(gain);
      gain.connect(buses.sfxBus);
      source.addEventListener('ended', () => {
        try { filter.disconnect(); gain.disconnect(); } catch { /* Nó já foi desconectado. */ }
      }, { once: true });
      source.start(at);
      source.stop(at + duration);
    } catch {
      try { source.stop(); source.disconnect(); } catch { /* Fonte já parada. */ }
      try { filter.disconnect(); gain.disconnect(); } catch { /* Nó já desconectado. */ }
    }
  };

  if (carrying) {
    stepNoise(start, 0.04 * v.duration * durationScale, 200, 700, 0.045, 0.008);
    stepNoise(start + 0.006, 0.065 * v.duration * durationScale, 500, 1800, 0.008, 0.006);
  } else {
    stepNoise(start, 0.04 * v.duration * durationScale, 300, 1200, 0.035, 0.008);
    const firstGap = audioManager.rand(0.027, 0.035);
    const secondGap = audioManager.rand(0.027, 0.035);
    const burstDuration = () => audioManager.rand(0.01, 0.02) * v.duration * durationScale;
    stepNoise(start + 0.004, burstDuration(), 1800, 4500, 0.017 * highRustleScale, 0.002);
    stepNoise(start + 0.004 + firstGap, burstDuration(), 1800, 4500, 0.017 * highRustleScale, 0.002);
    stepNoise(start + 0.004 + firstGap + secondGap, burstDuration(), 1800, 4500, 0.017 * highRustleScale, 0.002);
  }
}

export function registerStepSounds() {
  audioManager.register('step', (event, context, buses) => {
    playStep(context, buses, event.foot, event.carrying, event.night);
  });
}
