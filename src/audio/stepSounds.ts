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

  noiseSource(
    context, buses, start, 0.06 * v.duration * durationScale, 'lowpass',
    200 * pitch * cutoffScale, 900 * pitch * cutoffScale, (carrying ? 0.029 : 0.026) * volume, pitch,
  );
  toneSource(
    context, buses, start, (carrying ? 0.085 : 0.07) * v.duration * durationScale, 'sine',
    (carrying ? 76 : 90) * pitch, (carrying ? 54 : 70) * pitch,
    (carrying ? 0.041 : 0.035) * volume, 1,
  );

  if (carrying) {
    noiseSource(
      context, buses, start + 0.006, 0.065 * v.duration * durationScale, 'bandpass',
      500 * pitch, 1800 * pitch, 0.008 * volume, pitch,
    );
  } else {
    noiseSource(
      context, buses, start, 0.05 * v.duration * durationScale, 'bandpass',
      2000 * pitch, 4000 * pitch, 0.008 * volume * highRustleScale, pitch,
    );
  }
}

export function registerStepSounds() {
  audioManager.register('step', (event, context, buses) => {
    playStep(context, buses, event.foot, event.carrying, event.night);
  });
}
