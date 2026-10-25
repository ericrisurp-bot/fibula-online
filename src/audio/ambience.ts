import { audioManager } from './audioManager';

type DayNightPhase = 'day' | 'night';
type SoundBuses = { sfxBus: GainNode; ambienceBus: GainNode; noiseBuffer: AudioBuffer };

let audioContext: AudioContext | null = null;
let soundBuses: SoundBuses | null = null;
let masterGain: GainNode | null = null;

const birdTimers = new Set<number>();
const windTimers = new Set<number>();
const transitionTimers = new Set<number>();
const activeSources = new Set<AudioScheduledSourceNode>();
let windSource: AudioBufferSourceNode | null = null;
let windBandpass: BiquadFilterNode | null = null;
let windLowpass: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;
let active = false;
let phase: DayNightPhase = 'day';
let lastPattern = -1;
let repeatedPattern = 0;

function rememberTimer(set: Set<number>, callback: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    set.delete(timer);
    callback();
  }, delay);
  set.add(timer);
  return timer;
}

function clearTimers(set: Set<number>) {
  for (const timer of set) window.clearTimeout(timer);
  set.clear();
}

function ramp(param: AudioParam, context: AudioContext, target: number, seconds: number) {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

function attach(context: AudioContext, buses: SoundBuses) {
  if (audioContext !== context || !masterGain) {
    audioContext = context;
    soundBuses = buses;
    masterGain = context.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(buses.ambienceBus);
  } else {
    soundBuses = buses;
  }
}

function routeVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
  const buses = soundBuses;
  if (!audioContext || !buses || !masterGain || !audioManager.createVoice(source, 'ambience')) return false;

  // createVoice contabiliza a fonte; a saída é reconectada pela cadeia de filtros.
  source.disconnect(buses.ambienceBus);
  let previous: AudioNode = source;
  for (const node of nodes) {
    previous.connect(node);
    previous = node;
  }
  previous.connect(masterGain);
  activeSources.add(source);
  source.addEventListener('ended', () => {
    activeSources.delete(source);
    for (const node of nodes) {
      try { node.disconnect(); } catch { /* Nó já desconectado. */ }
    }
  }, { once: true });
  return true;
}

function stopWind() {
  const source = windSource;
  windSource = null;
  windBandpass = null;
  windLowpass = null;
  windGain = null;
  if (!source) return;
  try { source.stop(); } catch { /* A fonte já terminou ou está parando. */ }
}

function stopSourcesSoon(seconds: number) {
  const context = audioContext;
  if (!context) return;
  for (const source of activeSources) {
    try { source.stop(context.currentTime + seconds); } catch { /* A fonte já terminou ou está parando. */ }
  }
  stopWind();
}

function scheduleWindGust() {
  if (!active || phase !== 'day' || !windSource || !windGain || !windBandpass || !windLowpass || !audioContext) return;
  const context = audioContext;
  rememberTimer(windTimers, () => {
    if (!active || phase !== 'day' || !windGain || !windBandpass || !windLowpass) return;
    const now = context.currentTime;
    const duration = audioManager.rand(3, 6);
    const level = 0.035 * audioManager.rand(0.2, 1);
    const center = audioManager.rand(300, 900);
    windGain.gain.cancelScheduledValues(now);
    windGain.gain.setValueAtTime(windGain.gain.value, now);
    windGain.gain.linearRampToValueAtTime(level, now + duration);
    windBandpass.frequency.cancelScheduledValues(now);
    windBandpass.frequency.setValueAtTime(windBandpass.frequency.value, now);
    windBandpass.frequency.linearRampToValueAtTime(center, now + duration);
    windLowpass.frequency.cancelScheduledValues(now);
    windLowpass.frequency.setValueAtTime(windLowpass.frequency.value, now);
    windLowpass.frequency.linearRampToValueAtTime(center + 450, now + duration);
    scheduleWindGust();
  }, audioManager.rand(4000, 10000));
}

function startWind() {
  if (!active || phase !== 'day' || windSource || !audioContext || !soundBuses || !masterGain) return;
  const context = audioContext;
  const source = context.createBufferSource();
  source.buffer = soundBuses.noiseBuffer;
  source.loop = true;
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 600;
  bandpass.Q.value = 0.7;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1050;
  const gain = context.createGain();
  gain.gain.value = 0.012;
  windSource = source;
  windBandpass = bandpass;
  windLowpass = lowpass;
  windGain = gain;
  if (!routeVoice(source, [bandpass, lowpass, gain])) {
    windSource = null;
    windBandpass = null;
    windLowpass = null;
    windGain = null;
    return;
  }
  source.addEventListener('ended', () => {
    if (windSource === source) {
      windSource = null;
      windBandpass = null;
      windLowpass = null;
      windGain = null;
    }
  }, { once: true });
  source.start();
  scheduleWindGust();
}

function choosePattern() {
  let next = Math.floor(Math.random() * 3);
  if (next === lastPattern && repeatedPattern >= 2) next = (next + 1 + Math.floor(Math.random() * 2)) % 3;
  repeatedPattern = next === lastPattern ? repeatedPattern + 1 : 1;
  lastPattern = next;
  return next;
}

function playBirdPhrase(forcedPan?: number) {
  const context = audioContext;
  if (!active || phase !== 'day' || !context || !soundBuses || !masterGain) return null;
  if (audioManager.getActiveVoices() > 8) return null;

  const pattern = choosePattern();
  const pitchScale = audioManager.rand(0.9, 1.1);
  const rhythmScale = audioManager.rand(0.85, 1.15);
  const pan = forcedPan ?? audioManager.rand(-0.8, 0.8);
  const distance = Math.random();
  const cutoff = 5500 - distance * 3000;
  let frequencies: number[];
  let spacing: number;
  if (pattern === 0) {
    const count = 2 + Math.floor(Math.random() * 5);
    const start = audioManager.rand(2700, 3800);
    frequencies = Array.from({ length: count }, (_, i) => start + i * audioManager.rand(180, 420));
    spacing = 0.085;
  } else if (pattern === 1) {
    const count = 6 + Math.floor(Math.random() * 5);
    const base = audioManager.rand(3300, 4700);
    frequencies = Array.from({ length: count }, (_, i) => base + (i % 2 === 0 ? 0 : audioManager.rand(-550, 550)));
    spacing = 0.052;
  } else {
    const high = audioManager.rand(4000, 5400);
    frequencies = [high, high * audioManager.rand(0.68, 0.84)];
    spacing = 0.16;
  }

  for (let i = 0; i < frequencies.length; i++) {
    const start = context.currentTime + i * spacing * rhythmScale;
    const duration = Math.max(0.04, Math.min(0.12, audioManager.rand(0.04, 0.12) * rhythmScale));
    const initial = Math.max(2500, Math.min(5500, frequencies[i]! * pitchScale));
    const final = Math.max(2500, Math.min(5500, initial * audioManager.rand(0.94, 1.06)));
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(initial, start);
    oscillator.frequency.exponentialRampToValueAtTime(final, start + duration * 0.28);
    const noteGain = context.createGain();
    const noteFilter = context.createBiquadFilter();
    noteFilter.type = 'lowpass';
    noteFilter.frequency.value = cutoff;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    const peak = 0.03 * (1 - distance * 0.85) * audioManager.rand(0.5, 1);
    noteGain.gain.setValueAtTime(0, start);
    noteGain.gain.linearRampToValueAtTime(peak, start + duration * 0.18);
    noteGain.gain.setValueAtTime(peak * 0.8, start + duration * 0.4);
    noteGain.gain.linearRampToValueAtTime(0, start + duration);
    // Pequenas inflexões de frequência simulam vibrato discreto sem outra fonte de áudio.
    for (let step = 1; step <= 4; step++) {
      const at = start + duration * (0.3 + step * 0.13);
      if (at < start + duration * 0.92) {
        const vibrato = 1 + Math.sin(step * Math.PI * 0.8) * 0.003;
        oscillator.frequency.setValueAtTime(final * vibrato, at);
      }
    }
    if (!routeVoice(oscillator, [noteGain, noteFilter, panner])) {
      try { noteGain.disconnect(); noteFilter.disconnect(); panner.disconnect(); } catch { /* Nó já desconectado. */ }
      break;
    }
    oscillator.start(start);
    oscillator.stop(start + duration + 0.005);
  }
  return pan;
}

function scheduleBirds() {
  if (!active || phase !== 'day') return;
  const longPause = Math.random() < 0.2;
  const delay = longPause ? audioManager.rand(15000, 30000) : audioManager.rand(3000, 14000);
  rememberTimer(birdTimers, () => {
    if (!active || phase !== 'day') return;
    const pan = playBirdPhrase();
    if (pan !== null && Math.random() < 0.25) {
      const responsePan = pan >= 0 ? -audioManager.rand(0.35, 0.8) : audioManager.rand(0.35, 0.8);
      rememberTimer(birdTimers, () => {
        if (active && phase === 'day') playBirdPhrase(responsePan);
      }, audioManager.rand(500, 2000));
    }
    scheduleBirds();
  }, delay);
}

function fadeMaster(target: number, seconds: number) {
  if (audioContext && masterGain) ramp(masterGain.gain, audioContext, target, seconds);
}

export const ambience = {
  setActive(on: boolean) {
    if (active === on) return;
    active = on;
    if (!on) {
      clearTimers(birdTimers);
      clearTimers(windTimers);
      clearTimers(transitionTimers);
      fadeMaster(0, 0.15);
      stopSourcesSoon(0.16);
      return;
    }
    if (!audioContext || !masterGain) {
      void audioManager.unlock().then(() => {
        if (active) audioManager.play({ type: 'dayNight', phase });
      });
      return;
    }
    if (phase === 'day') {
      startWind();
      scheduleBirds();
      fadeMaster(1, 5);
    } else {
      fadeMaster(0, 4);
    }
  },

  setPhase(nextPhase: DayNightPhase) {
    phase = nextPhase;
    if (!active || !audioContext || !masterGain) return;
    if (nextPhase === 'day') {
      clearTimers(windTimers);
      clearTimers(transitionTimers);
      if (windSource) scheduleWindGust();
      else startWind();
      scheduleBirds();
      fadeMaster(1, 5);
    } else {
      clearTimers(birdTimers);
      clearTimers(windTimers);
      fadeMaster(0, 4);
      if (windSource) rememberTimer(transitionTimers, stopWind, 4100);
    }
  },
};

audioManager.register('dayNight', (event, context, buses) => {
  attach(context, buses);
  ambience.setPhase(event.phase);
});
