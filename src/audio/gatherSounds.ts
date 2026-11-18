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

/** Tink metálico da picareta; os parâmetros padrão preservam o golpe aprovado. */
function stoneTink(
  context: AudioContext,
  buses: GatherBuses,
  start: number,
  fundamental: number,
  volume: number,
  duration: number,
) {
  const ratio = audioManager.rand(1.45, 1.6);
  const pitch = fundamental / 1800;
  toneSource(context, buses, start, duration, 'sine', fundamental, fundamental * 0.985, 0.075 * 0.35 * volume, 1);
  toneSource(context, buses, start, duration, 'sine', fundamental * ratio, fundamental * ratio * 0.97, 0.055 * 0.35 * volume, 1);
  noiseSource(context, buses, start, duration, 'highpass', 100, 3600 * pitch, 0.045 * 0.35 * volume, pitch);
}

/** Estalo seco de lasca com filtro fixo, ataque de até 2 ms e cauda curta. */
function stoneChip(context: AudioContext, buses: GatherBuses, start: number, frequency: number, peak: number, duration: number, pitch: number) {
  const source = context.createBufferSource();
  source.buffer = buses.noiseBuffer;
  source.playbackRate.setValueAtTime(pitch, start);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(3, start);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.002, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
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
    source.stop(start + duration);
  } catch {
    try { source.stop(); } catch { /* Source may not have started. */ }
    try { source.disconnect(); } catch { /* Already disconnected. */ }
    try { filter.disconnect(); } catch { /* Already disconnected. */ }
    try { gain.disconnect(); } catch { /* Already disconnected. */ }
  }
}

/** Picareta: parciais metálicos inarmônicos, clique e impacto grave. */
export function playStoneGather(context: AudioContext, buses: GatherBuses) {
  const v = variation('stone');
  if (!v) return;
  const start = context.currentTime + v.delay;
  stoneTink(context, buses, start, 1800 * v.pitch, v.volume, 0.09 * v.duration);
}

/** Pedra a quebrar: tink aprovado, lascas secas e baque grave sem varredura de ruído. */
export function playStoneDone(context: AudioContext, buses: GatherBuses) {
  const v = variation('stone-done');
  if (!v) return;
  const start = context.currentTime + v.delay;
  const fundamental = 1800 * v.pitch;

  // Primeiro impacto no mesmo tom da picareta, com ganho de 1,2x.
  stoneTink(context, buses, start, fundamental, 1.2 * v.volume, 0.09 * v.duration);

  // Segundo tink mais grave e discreto, 20 ms depois.
  stoneTink(context, buses, start + 0.02, fundamental * 0.75, 0.15 * v.volume, 0.05 * v.duration);

  // Cinco lascas curtas com bandpass estático e frequências entre 0,6x e 1,3x.
  const chipPeaks = [0.0025, 0.002, 0.0016, 0.0012, 0.0009];
  const chipOffsets = [0.036, 0.068, 0.101, 0.132, 0.157];
  for (let i = 0; i < chipPeaks.length; i++) {
    const chipStart = start + chipOffsets[i] + audioManager.rand(-0.006, 0.006);
    const frequency = fundamental * audioManager.rand(0.6, 1.3);
    const duration = audioManager.rand(0.01, 0.025) * v.duration;
    stoneChip(context, buses, chipStart, frequency, chipPeaks[i] * v.volume, duration, v.pitch);
  }

  // Baque grave curto e baixo para dar peso sem dominar o tink.
  toneSource(context, buses, start, 0.12 * v.duration, 'sine', 130 * v.pitch, 60 * v.pitch, 0.002 * v.volume, 1);
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
