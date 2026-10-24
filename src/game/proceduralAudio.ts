export type SoundCue = 'tree' | 'rock' | 'cotton' | 'build' | 'deliver' | 'wind' | 'birds' | 'owl';

let context: AudioContext | null = null;
const getContext = () => {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
  }
  return context;
};

export function unlockProceduralAudio() {
  const audio = getContext();
  if (audio?.state === 'suspended') void audio.resume().catch(() => undefined);
}

function tone(audio: AudioContext, frequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
  const now = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(now); oscillator.stop(now + duration + 0.02);
}

function noise(audio: AudioContext, duration: number, volume: number, cutoff: number, delay = 0) {
  const now = audio.currentTime + delay;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(audio.destination);
  source.start(now); source.stop(now + duration + 0.02);
}

export function playProceduralSound(cue: SoundCue) {
  const audio = context;
  if (!audio || audio.state !== 'running') return;
  switch (cue) {
    case 'tree': noise(audio, 0.12, 0.055, 900); tone(audio, 125, 70, 0.11, 0.06, 'triangle'); break;
    case 'rock': noise(audio, 0.09, 0.04, 1800); tone(audio, 620, 360, 0.12, 0.035, 'triangle'); break;
    case 'cotton': noise(audio, 0.22, 0.025, 1400); break;
    case 'deliver': tone(audio, 180, 110, 0.12, 0.05, 'triangle'); tone(audio, 145, 95, 0.13, 0.035, 'triangle', 0.075); break;
    case 'build': tone(audio, 115, 78, 0.18, 0.07, 'triangle'); noise(audio, 0.16, 0.035, 650, 0.045); break;
    case 'wind': noise(audio, 1.7, 0.025, 520); break;
    case 'birds': tone(audio, 1500, 2100, 0.13, 0.018); tone(audio, 1950, 1350, 0.16, 0.016, 'sine', 0.16); tone(audio, 1700, 2300, 0.12, 0.014, 'sine', 0.34); break;
    case 'owl': tone(audio, 430, 310, 0.42, 0.028); tone(audio, 350, 260, 0.48, 0.024, 'sine', 0.5); break;
  }
}
