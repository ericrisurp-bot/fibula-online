import { audioManager } from './audioManager';
import { noiseSource, toneSource, variation } from './combatSounds';

type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

/** Passos discretos na grama; com carrinho, o grave ganha peso e um rangido curto. */
export function playStep(
  context: AudioContext,
  buses: SoundBuses,
  foot: 'left' | 'right',
  carrying: boolean,
) {
  const v = variation(carrying ? 'step-carry' : 'step');
  if (!v) return;

  const footPitch = foot === 'left' ? 0.94 : 1.06;
  const pitch = v.pitch * footPitch;
  const start = context.currentTime + v.delay;

  noiseSource(
    context, buses, start, 0.06 * v.duration, 'lowpass',
    200 * pitch, 900 * pitch, (carrying ? 0.029 : 0.026) * v.volume, pitch,
  );
  toneSource(
    context, buses, start, (carrying ? 0.085 : 0.07) * v.duration, 'sine',
    (carrying ? 76 : 90) * pitch, (carrying ? 54 : 70) * pitch,
    (carrying ? 0.041 : 0.035) * v.volume, 1,
  );

  if (carrying) {
    noiseSource(
      context, buses, start + 0.006, 0.065 * v.duration, 'bandpass',
      500 * pitch, 1800 * pitch, 0.008 * v.volume, pitch,
    );
  } else {
    noiseSource(
      context, buses, start, 0.05 * v.duration, 'bandpass',
      2000 * pitch, 4000 * pitch, 0.008 * v.volume, pitch,
    );
  }
}

export function registerStepSounds() {
  audioManager.register('step', (event, context, buses) => {
    playStep(context, buses, event.foot, event.carrying);
  });
}
