import { useEffect, useRef } from 'react';
import { CONFIG } from '../game/config';
import { createGrassTile, drawRock, drawTree } from '../game/environment';

type WorldBackdropProps = {
  className?: string;
  opacity?: number;
};

export default function WorldBackdrop({ className, opacity = 1 }: WorldBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;

    const grassTile = createGrassTile();
    const cycleDuration = CONFIG.dayNight.cycle;
    const dayDuration = CONFIG.dayNight.dayDuration;
    const transitionDuration = CONFIG.dayNight.transitionDuration;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sceneWidth = 900;
    const sceneHeight = 540;
    let frame = 0;
    let startedAt = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const render = (now: number) => {
      if (!startedAt) startedAt = now;
      const elapsed = reducedMotion ? 0 : ((now - startedAt) / 1000) % cycleDuration;
      const nightDuration = cycleDuration - dayDuration;
      let darkness = 0;

      if (elapsed >= dayDuration) {
        const nightElapsed = elapsed - dayDuration;
        darkness = nightElapsed < transitionDuration
          ? 1
          : nightElapsed > nightDuration - transitionDuration
            ? Math.max(0, (nightDuration - nightElapsed) / transitionDuration)
            : 1;
      } else if (elapsed >= dayDuration - transitionDuration) {
        darkness = (elapsed - (dayDuration - transitionDuration)) / transitionDuration;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const pattern = ctx.createPattern(grassTile, 'repeat');
      if (pattern) pattern.setTransform(new DOMMatrix().scale(0.2));
      ctx.fillStyle = pattern ?? '#557a43';
      ctx.fillRect(0, 0, width, height);

      const scale = Math.min(width / sceneWidth, height / sceneHeight);
      ctx.save();
      ctx.translate((width - sceneWidth * scale) / 2, (height - sceneHeight * scale) / 2);
      ctx.scale(scale, scale);

      // Mesmos desenhos low-poly e escalas usados pelo renderizador do mundo.
      drawTree(ctx, 120, 160, 'large');
      drawTree(ctx, 320, 95, 'medium');
      drawTree(ctx, 745, 120, 'large');
      drawTree(ctx, 820, 365, 'small');
      drawTree(ctx, 250, 430, 'small');
      drawRock(ctx, 235, 255, 'medium');
      drawRock(ctx, 475, 390, 'large');
      drawRock(ctx, 615, 210, 'small');
      drawRock(ctx, 690, 455, 'medium');
      ctx.restore();

      if (darkness > 0.01) {
        ctx.fillStyle = `rgba(5, 8, 18, ${darkness * 0.72})`;
        ctx.fillRect(0, 0, width, height);
        const glow = ctx.createRadialGradient(width * 0.5, height * 0.52, 0, width * 0.5, height * 0.52, Math.max(width, height) * 0.72);
        glow.addColorStop(0, `rgba(5, 8, 18, ${darkness * 0.04})`);
        glow.addColorStop(1, `rgba(5, 8, 18, ${darkness * 0.22})`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      if (!reducedMotion) frame = window.requestAnimationFrame(render);
    };

    resize();
    frame = window.requestAnimationFrame(render);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, pointerEvents: 'none' }}
    />
  );
}
