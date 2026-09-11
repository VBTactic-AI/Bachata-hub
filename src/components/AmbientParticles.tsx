"use client";

import { useEffect, useRef } from "react";

// Минималистичный динамический фон для тёмной темы (2026-09-11, по прямому
// запросу пользователя, главная страница): медленно плывущие полупрозрачные
// светящиеся точки, слегка отталкивающиеся от курсора. Canvas + один
// requestAnimationFrame — дешевле, чем десятки DOM-узлов на каждую частицу.
// На сенсорных устройствах курсора нет — точки просто плывут без
// отталкивания, это ожидаемо (CLAUDE.md §40 mobile-first, деградация без
// эффекта, не без фона).
const PARTICLE_COUNT = 42;
const REPEL_RADIUS = 130;

type Particle = { x: number; y: number; vx: number; vy: number; r: number; hue: number };

export function AmbientParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    let particles: Particle[] = [];
    let raf = 0;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1 + Math.random() * 2,
        // Маджента/фиолетовый — в тон night-primary/gradient-night-hero.
        hue: Math.random() < 0.5 ? 330 : 268,
      }));
    }

    function step() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < REPEL_RADIUS * REPEL_RADIUS) {
          const dist = Math.sqrt(dist2) || 1;
          const force = (1 - dist / REPEL_RADIUS) * 0.9;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        const glowRadius = p.r * 4;
        const gradient = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        gradient.addColorStop(0, `hsla(${p.hue}, 90%, 70%, 0.5)`);
        gradient.addColorStop(1, `hsla(${p.hue}, 90%, 70%, 0)`);
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(step);
    }

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }
    function onMouseLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    seed();
    raf = requestAnimationFrame(step);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
