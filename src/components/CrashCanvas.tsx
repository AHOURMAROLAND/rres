import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Gauge, Compass, Activity, ShieldCheck } from 'lucide-react';
import { GameStatus } from '../types';
import { soundManager } from '../services/sound';

interface CrashCanvasProps {
  status: GameStatus;
  currentMultiplier: number;
  finalMultiplier: number;
  countdownSeconds: number; // 0 to 5
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export const CrashCanvas: React.FC<CrashCanvasProps> = ({
  status,
  currentMultiplier,
  finalMultiplier,
  countdownSeconds,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store active particles & background stars in refs to avoid re-renders
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const milestonesCrossedRef = useRef<Set<number>>(new Set());
  const planePosRef = useRef<{ x: number; y: number; angle: number }>({ x: 0, y: 0, angle: 0 });
  const animFrameIdRef = useRef<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Reset milestones when status changes to waiting
  useEffect(() => {
    if (status === 'waiting') {
      milestonesCrossedRef.current.clear();
      shockwavesRef.current = [];
    }
  }, [status]);

  // Check milestones and spawn shockwaves
  useEffect(() => {
    if (status !== 'flying') return;

    const milestones = [2, 5, 10, 25, 50, 100];
    for (const m of milestones) {
      if (currentMultiplier >= m && !milestonesCrossedRef.current.has(m)) {
        milestonesCrossedRef.current.add(m);
        soundManager.playMilestone();

        const { x, y } = planePosRef.current;
        if (x > 0 && y > 0) {
          shockwavesRef.current.push({
            x,
            y,
            radius: 5,
            maxRadius: m >= 10 ? 120 : 70,
            alpha: 0.9,
            color: m >= 10 ? '#FBBF24' : m >= 5 ? '#F59E0B' : '#38BDF8',
          });
        }
      }
    }
  }, [status, currentMultiplier]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Initialize background starfield
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < 45; i++) {
      stars.push({
        x: Math.random() * 1000,
        y: Math.random() * 600,
        speed: 0.5 + Math.random() * 2.0,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.6,
      });
    }
    starsRef.current = stars;
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(10, Math.floor(rect.width || canvas.clientWidth || 360));
      const cssHeight = Math.max(10, Math.floor(rect.height || canvas.clientHeight || 260));

      const targetWidth = Math.floor(cssWidth * dpr);
      const targetHeight = Math.floor(cssHeight * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      // Reset transform and apply DPR cleanly every frame (prevents cumulative scale bug)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clear background using logical CSS dimensions
      ctx.fillStyle = '#0B0F19';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // 1. Draw subtle radar/coordinate grid
      drawGrid(ctx, cssWidth, cssHeight, status === 'flying' ? currentMultiplier : 1);

      // 2. Draw moving starfield
      drawStars(ctx, cssWidth, cssHeight, status === 'flying');

      // 3. Draw game flight curve & airplane
      if (status === 'flying') {
        drawFlightCurve(ctx, cssWidth, cssHeight, currentMultiplier);
        drawParticles(ctx);
        drawShockwaves(ctx);
      } else if (status === 'crashed') {
        drawCrashedState(ctx, cssWidth, cssHeight, finalMultiplier);
        drawParticles(ctx);
        drawShockwaves(ctx);
      } else if (status === 'waiting') {
        drawWaitingRunway(ctx, cssWidth, cssHeight, countdownSeconds);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [status, currentMultiplier, finalMultiplier, countdownSeconds]);

  // Helper: Draw subtle grid lines with altitude marks
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, mult: number) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;

    // Horizontal lines
    const hSpacing = height / 6;
    for (let i = 1; i < 6; i++) {
      const y = Math.floor(i * hSpacing);
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();

      // Label altitude
      ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${(6 - i) * 500}m`, 8, y + 3);
    }

    // Vertical lines with slight horizontal drift during flight
    const vOffset = status === 'flying' ? ((currentMultiplier * 50) % 60) : 0;
    const vSpacing = 60;
    for (let x = width - 15 - vOffset; x > 35; x -= vSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x, height - 25);
      ctx.stroke();
    }

    // Bottom baseline
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(35, height - 25);
    ctx.lineTo(width - 15, height - 25);
    ctx.stroke();

    // Axis marks
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('0s', 38, height - 12);
    ctx.fillText('5s', width * 0.35, height - 12);
    ctx.fillText('10s', width * 0.65, height - 12);
    ctx.fillText('15s+', width - 40, height - 12);

    ctx.restore();
  };

  // Helper: Draw moving starfield / particle speed streaks
  const drawStars = (ctx: CanvasRenderingContext2D, width: number, height: number, isFlying: boolean) => {
    ctx.save();
    starsRef.current.forEach((star) => {
      if (isFlying) {
        star.x -= star.speed * Math.min(6, 1 + (currentMultiplier - 1) * 0.8);
        star.y += star.speed * 0.4;
        if (star.x < 0) {
          star.x = width + Math.random() * 50;
          star.y = Math.random() * height;
        }
        if (star.y > height) {
          star.y = 0;
        }
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * 0.4})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.restore();
  };

  // Helper: Flight curve calculation and drawing
  const drawFlightCurve = (ctx: CanvasRenderingContext2D, width: number, height: number, mult: number) => {
    const startX = 40;
    const startY = height - 26;

    // Normalize flight progress: from 1.00x up to 10.00x
    // The curve smoothly ascends towards top-right
    const progress = Math.min(1.0, Math.log10(mult) / 1.25);
    const targetX = startX + (width - 120) * (0.2 + progress * 0.75);
    const targetY = startY - (height - 90) * (0.15 + Math.pow(progress, 0.85) * 0.78);

    // Dynamic wave/slight aerodynamic hover
    const hoverOffset = Math.sin(Date.now() / 200) * 3;
    const currentY = Math.max(45, targetY + hoverOffset);
    const currentX = Math.min(width - 70, targetX);

    // Control point for smooth parabolic curve
    const cpX = startX + (currentX - startX) * 0.65;
    const cpY = startY;

    // Draw glowing filled gradient underneath
    const fillGradient = ctx.createLinearGradient(0, currentY, 0, startY);
    fillGradient.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
    fillGradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.1)');
    fillGradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cpX, cpY, currentX, currentY);
    ctx.lineTo(currentX, startY);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Draw trajectory curve stroke with double glow
    ctx.shadowColor = '#F97316';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#FF4500';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cpX, cpY, currentX, currentY);
    ctx.stroke();

    // Second inner bright stroke
    ctx.shadowBlur = 4;
    ctx.strokeStyle = '#FFB800';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // Calculate tangent angle of airplane
    // Derivative of Bézier curve at endpoint: dy/dx
    const dx = currentX - cpX;
    const dy = currentY - cpY;
    const angle = Math.atan2(dy, dx);

    planePosRef.current = { x: currentX, y: currentY, angle };

    // Emit thruster particles
    spawnThrusterParticles(currentX - 10, currentY + 4, angle);

    // Draw sleek airplane sprite
    drawAirplane(ctx, currentX, currentY, angle);
  };

  // Spawn reactive fire & smoke particles behind the plane
  const spawnThrusterParticles = (x: number, y: number, angle: number) => {
    const colors = ['#FF4500', '#FF8C00', '#FFD700', '#FFFFFF'];
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.4;
      const speed = 2 + Math.random() * 4;
      particlesRef.current.push({
        x,
        y,
        vx: -Math.cos(angle + spread) * speed,
        vy: -Math.sin(angle + spread) * speed,
        size: 2.5 + Math.random() * 3.5,
        alpha: 0.9,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  };

  // Draw and update shockwaves
  const drawShockwaves = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const shockwaves = shockwavesRef.current;
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.radius += 2.8;
      sw.alpha -= 0.025;

      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        shockwaves.splice(i, 1);
        continue;
      }

      ctx.strokeStyle = sw.color;
      ctx.lineWidth = Math.max(1, 3 * (sw.alpha / 0.9));
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  // Draw and update particles
  const drawParticles = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.035;
      p.size *= 0.96;

      if (p.alpha <= 0 || p.size <= 0.5) {
        particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Draw stylized modern supersonic jet
  const drawAirplane = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 1. Jet thruster afterburner flame
    const flameLength = 12 + Math.random() * 8;
    const flameGrad = ctx.createLinearGradient(0, 0, -flameLength, 0);
    flameGrad.addColorStop(0, '#FFFFFF');
    flameGrad.addColorStop(0.3, '#FFD700');
    flameGrad.addColorStop(0.7, '#FF4500');
    flameGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -3);
    ctx.lineTo(-16 - flameLength, 0);
    ctx.lineTo(-16, 3);
    ctx.closePath();
    ctx.fill();

    // 2. Main fuselage (Aerodynamic Jet body in crimson red & white)
    ctx.fillStyle = '#E11D48'; // Rich red
    ctx.shadowColor = '#E11D48';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(22, 0); // Nose tip
    ctx.quadraticCurveTo(8, -6, -15, -5); // Top curve
    ctx.lineTo(-18, 0);
    ctx.quadraticCurveTo(-15, 6, 8, 5); // Bottom curve
    ctx.closePath();
    ctx.fill();

    // 3. Top Fin / Tail
    ctx.fillStyle = '#BE123C';
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-20, -16);
    ctx.lineTo(-14, -16);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();

    // 4. Main Wings (Swept-back delta wings)
    ctx.fillStyle = '#F43F5E';
    ctx.beginPath();
    ctx.moveTo(4, -3);
    ctx.lineTo(-6, -18);
    ctx.lineTo(-12, -17);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();

    // Bottom Wing
    ctx.fillStyle = '#9F1239';
    ctx.beginPath();
    ctx.moveTo(4, 3);
    ctx.lineTo(-6, 18);
    ctx.lineTo(-12, 17);
    ctx.lineTo(-4, 2);
    ctx.closePath();
    ctx.fill();

    // 5. Cockpit glass (Cyan luminous canopy)
    ctx.fillStyle = '#38BDF8';
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(8, -2, 6, 2.5, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // White highlight streak
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(4, -1, 10, 1.2);

    // 6. Navigation Strobe Lights & Beacons
    const now = Date.now();
    const strobeBlink = (now % 600) < 150; // White strobe flash every 600ms

    // Red wingtip light (Port / Left wing tip)
    ctx.fillStyle = '#EF4444';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(-6, -18, 2, 0, Math.PI * 2);
    ctx.fill();

    // Green wingtip light (Starboard / Right wing tip)
    ctx.fillStyle = '#22C55E';
    ctx.shadowColor = '#22C55E';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(-6, 18, 2, 0, Math.PI * 2);
    ctx.fill();

    // Tail beacon strobe (White flash)
    if (strobeBlink) {
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(-20, -16, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Supersonic Vapor Cone / Shockwave cone if speed is high (> 2.00x)
    if (currentMultiplier >= 2.0) {
      const coneIntensity = Math.min(0.4, (currentMultiplier - 2.0) * 0.08);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${coneIntensity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-2, 0, 24, Math.PI * 0.65, Math.PI * 1.35);
      ctx.stroke();

      if (currentMultiplier >= 5.0) {
        ctx.strokeStyle = `rgba(251, 191, 36, ${coneIntensity * 0.8})`;
        ctx.beginPath();
        ctx.arc(-6, 0, 32, Math.PI * 0.68, Math.PI * 1.32);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  // Draw crashed / flew away state
  const drawCrashedState = (ctx: CanvasRenderingContext2D, width: number, height: number, finalMult: number) => {
    // Faded previous flight curve
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(40, height - 26);
    ctx.quadraticCurveTo(width * 0.5, height - 26, width - 80, 50);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  // Draw waiting runway with parked aircraft
  const drawWaitingRunway = (ctx: CanvasRenderingContext2D, width: number, height: number, cd: number) => {
    const startX = 65;
    const startY = height - 38;

    // Runway markings
    ctx.save();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(25, height - 25);
    ctx.lineTo(width - 25, height - 25);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw parked airplane waiting for clearance
    drawAirplane(ctx, startX, startY, -0.05);

    // Pulsing runway lights
    const lightGlow = (Math.sin(Date.now() / 250) + 1) * 0.5;
    ctx.fillStyle = `rgba(249, 115, 22, ${0.4 + lightGlow * 0.5})`;
    ctx.beginPath();
    ctx.arc(startX - 22, height - 25, 3, 0, Math.PI * 2);
    ctx.arc(startX + 60, height - 25, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Multiplier color dynamic palette
  const getMultiplierColor = (mult: number) => {
    if (mult >= 10.0) return 'text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]';
    if (mult >= 5.0) return 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]';
    if (mult >= 2.0) return 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]';
    if (mult >= 1.5) return 'text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]';
    return 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[250px] xs:h-[280px] sm:h-[340px] md:h-[400px] lg:h-[430px] rounded-2xl overflow-hidden bg-[#090D17] border border-slate-800 shadow-2xl select-none max-w-full"
    >
      {/* 60FPS Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block max-w-full" />

      {/* Center Stage UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-2">
        {status === 'flying' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-150 max-w-full">
            <div className={`font-mono-num font-black text-4xl xs:text-5xl sm:text-7xl md:text-8xl tracking-tight transition-colors ${getMultiplierColor(currentMultiplier)}`}>
              {currentMultiplier.toFixed(2)}x
            </div>
            <div className="mt-1 px-2.5 sm:px-3 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-sm text-[10px] sm:text-xs text-slate-300 flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold uppercase tracking-wider text-emerald-400">En vol</span>
              <span className="text-slate-400 hidden xs:inline">• Vitesse exponentielle</span>
            </div>
          </div>
        )}

        {status === 'crashed' && (
          <div className="flex flex-col items-center animate-in zoom-in-90 duration-200 max-w-full text-center">
            <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-xl bg-red-600/90 text-white font-display font-black text-xs sm:text-sm md:text-base uppercase tracking-widest shadow-xl shadow-red-600/40 border border-red-400/50 mb-2 animate-bounce">
              L'AVION S'EST ENVOLÉ !
            </div>
            <div className="font-mono-num font-black text-4xl xs:text-5xl sm:text-7xl md:text-8xl text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.7)] tracking-tight">
              {finalMultiplier.toFixed(2)}x
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
              Crashé à {finalMultiplier.toFixed(2)}x
            </p>
          </div>
        )}

        {status === 'waiting' && (
          <div className="flex flex-col items-center px-4 py-3 rounded-2xl bg-slate-900/85 border border-slate-700/70 backdrop-blur-md shadow-2xl max-w-xs text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-full border-3 border-orange-500/30 border-t-orange-500 animate-spin flex items-center justify-center mb-2">
              <span className="font-mono-num font-bold text-xs text-orange-400">
                {Math.ceil(countdownSeconds)}s
              </span>
            </div>
            <div className="font-display font-bold text-base sm:text-lg text-white">
              PRÉPARATION DU VOL
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Placez vos paris avant le décollage
            </p>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-100 ease-linear"
                style={{ width: `${Math.max(0, Math.min(100, ((5 - countdownSeconds) / 5) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Watermark in top-left corner */}
      <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 z-10">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800/80 backdrop-blur-sm shadow-md">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-[10px] font-mono-num tracking-widest text-slate-300 uppercase font-bold">
            AEROCRASH • RADAR ACTIF
          </span>
        </div>
      </div>

      {/* Flight Telemetry HUD in top-right corner */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {status === 'flying' && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/85 border border-slate-800/90 backdrop-blur-md text-[11px] font-mono-num text-slate-300 shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-1 text-sky-400">
              <Compass className="w-3.5 h-3.5" />
              <span>ALT: <strong>{Math.floor(currentMultiplier * 720).toLocaleString()} m</strong></span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1 text-emerald-400">
              <Gauge className="w-3.5 h-3.5" />
              <span>VIT: <strong>{Math.floor(450 + Math.pow(currentMultiplier, 1.25) * 110)} km/h</strong></span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1 text-amber-400">
              <Activity className="w-3.5 h-3.5" />
              <span>G: <strong>{(1.0 + Math.log2(Math.max(1, currentMultiplier)) * 0.7).toFixed(1)}G</strong></span>
            </div>
          </div>
        )}

        {/* Fullscreen Toggle Button */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all shadow-md cursor-pointer active:scale-95"
          title={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
          aria-label="Plein écran"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
