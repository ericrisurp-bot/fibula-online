import assert from 'node:assert/strict';
import { createServer } from 'vite';

class FakeParam {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor(type = 'node') {
    this.type = type;
    this.gain = new FakeParam();
    this.frequency = new FakeParam();
    this.Q = new FakeParam();
    this.playbackRate = new FakeParam();
    this.detune = new FakeParam();
    this.pan = new FakeParam();
    this.listeners = new Map();
  }
  connect() { return this; }
  disconnect() {}
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  start() {}
  stop(when) { this.stopAt = when; }
}

class FakeGainNode extends FakeNode {
  constructor() { super('gain'); }
}

class FakeAudioContext {
  static last;
  static rejectResume = false;
  constructor() {
    FakeAudioContext.last = this;
    this.state = 'suspended';
    this.sampleRate = 8000;
    this.currentTime = 1;
    this.destination = new FakeNode('destination');
    this.createdSources = 0;
    this.lastBufferSource = null;
    this.createdOscillators = 0;
    this.filters = [];
  }
  async resume() {
    if (FakeAudioContext.rejectResume) throw new Error('gesture required');
    this.state = 'running';
  }
  async suspend() { this.state = 'suspended'; }
  createGain() { return new FakeGainNode(); }
  createDynamicsCompressor() { return new FakeNode('compressor'); }
  createBuffer(_channels, length) {
    return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    this.createdSources++;
    this.lastBufferSource = new FakeNode('buffer-source');
    return this.lastBufferSource;
  }
  createBiquadFilter() {
    const node = new FakeNode('filter');
    this.filters.push(node);
    return node;
  }
  createOscillator() {
    this.createdOscillators++;
    return new FakeNode('oscillator');
  }
  createStereoPanner() { return new FakeNode('panner'); }
  createDelay() { return new FakeNode('delay'); }
  createPeriodicWave() { return {}; }
}

globalThis.window = { AudioContext: FakeAudioContext };
globalThis.GainNode = FakeGainNode;
globalThis.document = {
  hidden: false,
  addEventListener() {},
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
};

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { audioManager } = await server.ssrLoadModule('/src/audio/audioManager.ts');
  const { ambience } = await server.ssrLoadModule('/src/audio/ambience.ts');
  const { playStep } = await server.ssrLoadModule('/src/audio/stepSounds.ts');

  assert.equal(await audioManager.unlock(), true, 'O áudio deve confirmar quando o contexto foi liberado.');
  const context = FakeAudioContext.last;
  context.state = 'suspended';
  FakeAudioContext.rejectResume = true;
  assert.equal(await audioManager.unlock(), false, 'Falha de resume não pode ser tratada como áudio liberado.');
  FakeAudioContext.rejectResume = false;
  assert.equal(await audioManager.unlock(), true, 'Uma nova interação deve conseguir liberar o contexto.');

  audioManager.play({ type: 'dayNight', phase: 'night' });
  const sourcesBeforeNightActivation = context.createdSources;
  const oscillatorsBeforeNightActivation = context.createdOscillators;
  ambience.setActive(true);
  assert.equal(context.createdSources, sourcesBeforeNightActivation, 'A noite não deve iniciar fontes de coruja/ruído.');
  assert.equal(context.createdOscillators, oscillatorsBeforeNightActivation, 'A noite deve permanecer sem a antiga coruja sintetizada.');

  ambience.setActive(false);
  audioManager.play({ type: 'dayNight', phase: 'day' });
  ambience.setActive(true);
  const daytimeAmbienceSource = context.lastBufferSource;
  assert.ok(daytimeAmbienceSource, 'A ambiência diurna deve iniciar uma fonte de áudio.');
  audioManager.play({ type: 'dayNight', phase: 'night' });
  assert.ok(daytimeAmbienceSource.stopAt <= context.currentTime + 0.22,
    'A transição para a noite deve encerrar rapidamente as fontes diurnas ainda ativas.');

  playStep(context, {
    sfxBus: new FakeGainNode(),
    ambienceBus: new FakeGainNode(),
    noiseBuffer: context.createBuffer(1, 16000, context.sampleRate),
  }, 'left', false, 0, 0.35);

  const lowpass = context.filters.find((filter) => filter.type === 'lowpass');
  const peaking = context.filters.find((filter) => filter.type === 'peaking');
  assert.ok(lowpass, 'A pisada deve manter o filtro passa-baixa.');
  assert.ok(peaking, 'A pisada deve manter o reforço de presença.');
  assert.ok(lowpass.frequency.value > peaking.frequency.value,
    'O passa-baixa não pode cortar a frequência reforçada pela equalização.');

  ambience.setActive(false);
  console.log('Áudio: desbloqueio, noite silenciosa e filtros das pisadas aprovados.');
} finally {
  await server.close();
}
