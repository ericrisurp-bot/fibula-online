import { useEffect, useRef } from 'react';

type Props = { active: boolean };

const FADE_SECONDS = 5;
const SILENCE_SECONDS = 10;
const TARGET_VOLUME = 0.22;

export default function BackgroundMusic({ active }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const audio = new Audio('/audio/music/Floresta%20indom%C3%A1vel.m4a');
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 0;
    audioRef.current = audio;

    let animationFrame = 0;
    let silenceTimer: number | undefined;
    let disposed = false;
    let playing = false;

    const updateVolume = () => {
      if (disposed) return;
      if (audio.duration && Number.isFinite(audio.duration)) {
        const fadeIn = Math.min(1, audio.currentTime / FADE_SECONDS);
        const remaining = audio.duration - audio.currentTime;
        const fadeOut = Math.max(0, Math.min(1, remaining / FADE_SECONDS));
        audio.volume = TARGET_VOLUME * Math.min(fadeIn, fadeOut);
      } else {
        audio.volume = TARGET_VOLUME * Math.min(1, audio.currentTime / FADE_SECONDS);
      }
      animationFrame = window.requestAnimationFrame(updateVolume);
    };

    const startTrack = async () => {
      if (disposed || playing) return;
      playing = true;
      audio.currentTime = 0;
      audio.volume = 0;
      try {
        await audio.play();
        if (!disposed) animationFrame = window.requestAnimationFrame(updateVolume);
      } catch {
        playing = false;
      }
    };

    const onEnded = () => {
      playing = false;
      window.cancelAnimationFrame(animationFrame);
      audio.volume = 0;
      silenceTimer = window.setTimeout(() => {
        silenceTimer = undefined;
        void startTrack();
      }, SILENCE_SECONDS * 1000);
    };

    const retryOnInteraction = () => {
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
      audioRef.current = null;
    };
  }, [active]);

  return null;
}
