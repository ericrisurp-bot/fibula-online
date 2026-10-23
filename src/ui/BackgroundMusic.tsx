import { useEffect, useRef } from 'react';

type Props = { active: boolean };

const FADE_SECONDS = 5;
const SILENCE_SECONDS = 10;
const TARGET_VOLUME = 0.18;

export default function BackgroundMusic({ active }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const audio = new Audio('/audio/music/Floresta%20indom%C3%A1vel.m4a');
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 1;
    audioRef.current = audio;

    // Gentle tone shaping helps the guitar sit behind the game rather than
    // sounding like a bright, separate recording. Keep a plain-audio fallback.
    let audioContext: AudioContext | undefined;
    let musicGain: GainNode | undefined;
    try {
      const AudioContextConstructor = window.AudioContext;
      if (AudioContextConstructor) {
        audioContext = new AudioContextConstructor();
        const source = audioContext.createMediaElementSource(audio);
        const warmth = audioContext.createBiquadFilter();
        warmth.type = 'lowshelf';
        warmth.frequency.value = 180;
        warmth.gain.value = 1.2;

        const softenHighs = audioContext.createBiquadFilter();
        softenHighs.type = 'lowpass';
        softenHighs.frequency.value = 6200;
        softenHighs.Q.value = 0.65;

        const smoothPresence = audioContext.createBiquadFilter();
        smoothPresence.type = 'peaking';
        smoothPresence.frequency.value = 2600;
        smoothPresence.Q.value = 0.8;
        smoothPresence.gain.value = -2;

        musicGain = audioContext.createGain();
        musicGain.gain.value = 0;
        source.connect(warmth);
        warmth.connect(smoothPresence);
        smoothPresence.connect(softenHighs);
        softenHighs.connect(musicGain);
        musicGain.connect(audioContext.destination);
      }
    } catch {
      audioContext = undefined;
      musicGain = undefined;
    }

    let animationFrame = 0;
    let silenceTimer: number | undefined;
    let disposed = false;
    let playing = false;

    const setMusicVolume = (volume: number) => {
      if (musicGain && audioContext) {
        musicGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.08);
      } else {
        audio.volume = volume;
      }
    };

    const updateVolume = () => {
      if (disposed) return;
      if (audio.duration && Number.isFinite(audio.duration)) {
        const fadeIn = Math.min(1, audio.currentTime / FADE_SECONDS);
        const remaining = audio.duration - audio.currentTime;
        const fadeOut = Math.max(0, Math.min(1, remaining / FADE_SECONDS));
        setMusicVolume(TARGET_VOLUME * Math.min(fadeIn, fadeOut));
      } else {
        setMusicVolume(TARGET_VOLUME * Math.min(1, audio.currentTime / FADE_SECONDS));
      }
      animationFrame = window.requestAnimationFrame(updateVolume);
    };

    const startTrack = async () => {
      if (disposed || playing) return;
      playing = true;
      audio.currentTime = 0;
      setMusicVolume(0);
      try {
        if (audioContext?.state === 'suspended') await audioContext.resume();
        await audio.play();
        if (!disposed) animationFrame = window.requestAnimationFrame(updateVolume);
      } catch {
        playing = false;
      }
    };

    const onEnded = () => {
      playing = false;
      window.cancelAnimationFrame(animationFrame);
      setMusicVolume(0);
      silenceTimer = window.setTimeout(() => {
        silenceTimer = undefined;
        void startTrack();
      }, SILENCE_SECONDS * 1000);
    };

    const retryOnInteraction = () => {
      if (audioContext?.state === 'suspended') void audioContext.resume();
      if (!playing && silenceTimer === undefined) void startTrack();
    };

    audio.addEventListener('ended', onEnded);
    window.addEventListener('pointerdown', retryOnInteraction);
    window.addEventListener('keydown', retryOnInteraction);
    void startTrack();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      if (silenceTimer !== undefined) window.clearTimeout(silenceTimer);
      audio.removeEventListener('ended', onEnded);
      window.removeEventListener('pointerdown', retryOnInteraction);
      window.removeEventListener('keydown', retryOnInteraction);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioContext) void audioContext.close();
      audioRef.current = null;
    };
  }, [active]);

  return null;
}
