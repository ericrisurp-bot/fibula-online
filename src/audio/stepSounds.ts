import { audioManager } from './audioManager';
import { variation } from './combatSounds';

type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

/** Pisadas orgânicas em duas camadas; à noite ficam mais abafadas. */
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
  const durationScale = 1 - 0.15 * n;
  const footPitch = foot === 'left' ? 0.94 : 1.06;
  const pitch = audioManager.rand(0.94, 1.06) * footPitch;
  const volume = audioManager.rand(0.88, 1.12) * nightVolume;
  const impactRatio = audioManager.rand(0.85, 1.15);
  const rustleRatio = audioManager.rand(0.85, 1.15);
  const start = context.currentTime + v.delay;

  const playLayer = (
    at: number,
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    peak: number,
    attack: number,
    q = 0.7,
  ) => {
    const source = context.createBufferSource();
    source.buffer = buses.noiseBuffer;
    source.playbackRate.setValueAtTime(pitch, at);
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency * cutoffScale, at);
    filter.Q.setValueAtTime(q, at);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * volume), at + Math.min(attack, duration * 0.45));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    if (!audioManager.createVoice(source)) {
      try { filter.disconnect(); gain.disconnect(); } catch { /* Nó já foi desconectado. */ }
      return;
    }
    try {
      source.disconnect();
      source.connect(filter);
      filter.connect(gain);
      gain.connect(buses.sfxBus);
      source.addEventListener('ended', () => {
        try { filter.disconnect(); gain.disconnect(); } catch { /* Nó já foi desconectado. */ }
      }, { once: true });
      const availableOffset = Math.max(0, buses.noiseBuffer.duration - duration * pitch - 0.01);
      source.start(at, audioManager.rand(0, availableOffset));
      source.stop(at + duration);
    } catch {
      try { source.stop(); source.disconnect(); } catch { /* Fonte já parada. */ }
      try { filter.disconnect(); gain.disconnect(); } catch { /* Nó já desconectado. */ }
    }
  };

  // Um único baque grave e um roçar suave, simultâneos e sem rajadas.
  const impactDuration = (carrying ? 0.105 : 0.09) * v.duration * durationScale;
  const rustleDuration = (carrying ? 0.13 : 0.12) * v.duration * durationScale;
  const impactFrequency = (carrying ? 285 : 365) * pitch;
  const rustleFrequency = (carrying ? 1450 : 2050) * pitch;
  playLayer(start, impactDuration, 'lowpass', impactFrequency, (carrying ? 0.026 : 0.031) * impactRatio, 0.01, 0.65);
  playLayer(start, rustleDuration, 'bandpass', rustleFrequency, (carrying ? 0.0045 : 0.007) * rustleRatio * (1 - 0.55 * n), 0.02, 0.65);
}

export function registerStepSounds() {
  audioManager.register('step', (event, context, buses) => {
    playStep(context, buses, event.foot, event.carrying, event.night);
  });
}
