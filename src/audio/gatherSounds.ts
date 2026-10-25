import { audioManager } from './audioManager';
import { noiseSource, toneSource, variation } from './combatSounds';

type GatherBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

function woodBody(context: AudioContext, buses: GatherBuses, start: number, duration: number, peak: number, pitch: number, echo: boolean) {
  const source = context.createBufferSource();
  source.buffer = buses.noiseBuffer;
  source.playbackRate.setValueAtTime(pitch, start);
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(150 * pitch, start);
  filter.frequency.linearRampToValueAtTime(900 * pitch, start + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  if (echo) {
    const echoStart = start + duration * 0.62;
    gain.gain.setValueAtTime(0.0001, echoStart);
    gain.gain.linearRampToValueAtTime(peak * 0.42, echoStart + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, echoStart + duration * 0.42);
  }
  if (!audioManager.createVoice(source)) return;
  try {
    source.disconnect();
    source.connect(filter);
    filter.connect(gain);
    gain.connect(buses.sfxBus);
    source.addEventListener('ended', () => {
      try { filter.disconnect(); } catch { /* Already disconnected. */ }
      try { gain.disconnect(); } catch { /* Already disconnected. */ }
    }, { once: true });
    source.start(start);
    source.stop(start + duration * (echo ? 1.1 : 1));
  } catch {
    try { source.stop(); } catch { /* Source may not have started. */ }
    try { source.disconnect(); } catch { /* Already disconnected. */ }
    try { filter.disconnect(); } catch { /* Already disconnected. */ }
    try { gain.disconnect(); } catch { /* Already disconnected. */ }
  }
}

/** Golpe de machado curto, com chance de uma segunda batida abafada. */
export function playWoodGather(context: AudioContext, buses: GatherBuses) {
  const v = variation('wood');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.06 * v.duration;
  woodBody(context, buses, start, duration, 0.075 * v.volume, v.pitch, audioManager.rand(0, 1) < 0.18);
  toneSource(context, buses, start, 0.08 * v.duration, 'triangle', 180 * v.pitch, 110 * v.pitch, 0.075 * v.volume, 1);
  noiseSource(context, buses, start, 0.012 * v.duration, 'highpass', 3200 * v.pitch, 5200 * v.pitch, 0.025 * v.volume, v.pitch);
}

/** Árvore a cair: rachaduras irregulares e baque grave. */
export function playWoodDone(context: AudioContext, buses: GatherBuses) {
  const v = variation('wood-done');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.25 * v.duration;
  noiseSource(context, buses, start, duration, 'bandpass', 400 * v.pitch, 1200 * v.pitch, 0.065 * v.volume, v.pitch);
  noiseSource(context, buses, start + 0.035 * v.duration, 0.19 * v.duration, 'bandpass', 520 * v.pitch, 1450 * v.pitch, 0.045 * v.volume, v.pitch);
  noiseSource(context, buses, start + 0.105 * v.duration, 0.12 * v.duration, 'bandpass', 300 * v.pitch, 950 * v.pitch, 0.035 * v.volume, v.pitch);
  toneSource(context, buses, start + 0.07, 0.28 * v.duration, 'sine', 105 * v.pitch, 48 * v.pitch, 0.09 * v.volume, 1);
}

/** Picareta: parciais metálicos inarmónicos, clique e impacto grave. */
export function playStoneGather(context: AudioContext, buses: GatherBuses) {
  const v = variation('stone');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.09 * v.duration;
  const fundamental = 1800 * v.pitch;
  const ratio = audioManager.rand(1.45, 1.6);
  toneSource(context, buses, start, duration, 'sine', fundamental, fundamental * 0.985, 0.075 * v.volume, 1);
  toneSource(context, buses, start, duration, 'sine', fundamental * ratio, fundamental * ratio * 0.97, 0.055 * v.volume, 1);
  noiseSource(context, buses, start, duration, 'highpass', 100, 3600 * v.pitch, 0.045 * v.volume, v.pitch);
}

/** Pedra a quebrar: cinco pequenos grãos em sequência irregular. */
export function playStoneDone(context: AudioContext, buses: GatherBuses) {
  const v = variation('stone-done');
  if (!v) return;
  const start = context.currentTime + v.delay;
  for (let i = 0; i < 5; i++) {
    const offset = i === 0 ? 0 : audioManager.rand(0.025, 0.075);
    const grainStart = start + (i === 0 ? 0 : 0.025 * i + offset);
    const duration = audioManager.rand(0.035, 0.055) * v.duration;
    const low = audioManager.rand(500, 1100) * v.pitch;
    noiseSource(context, buses, grainStart, duration, 'bandpass', low, low * audioManager.rand(1.5, 2.1), (0.035 + audioManager.rand(0, 0.018)) * v.volume, v.pitch);
  }
}

/** Algodão: farfalhar suave, com ataque e cauda curtos. */
export function playCottonGather(context: AudioContext, buses: GatherBuses) {
  const v = variation('cotton');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.18 * v.duration;
  noiseSource(context, buses, start, duration, 'bandpass', 3000 * v.pitch, 6000 * v.pitch, 0.055 * v.volume, v.pitch);
}

/** Colheita final de algodão: farfalhar prolongado e pequeno pop suave. */
export function playCottonDone(context: AudioContext, buses: GatherBuses) {
  const v = variation('cotton');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const duration = 0.22 * v.duration;
  noiseSource(context, buses, start, duration, 'bandpass', 3000 * v.pitch, 6000 * v.pitch, 0.055 * v.volume, v.pitch);
  toneSource(context, buses, start + duration * 0.55, 0.045 * v.duration, 'sine', 260 * v.pitch, 190 * v.pitch, 0.022 * v.volume, 1);
}

export function registerGatherSounds() {
  audioManager.register('gather', (event, context, buses) => {
    if (event.kind === 'wood') {
      if (event.done) playWoodDone(context, buses);
      else playWoodGather(context, buses);
    } else if (event.kind === 'stone') {
      if (event.done) playStoneDone(context, buses);
      else playStoneGather(context, buses);
    } else if (event.done) {
      playCottonDone(context, buses);
    } else {
      playCottonGather(context, buses);
    }
  });
}
