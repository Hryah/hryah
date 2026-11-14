export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  lifeS: number;
  maxLifeS: number;
  color: string;
  kind: "SPARK" | "THRUST" | "RING" | "DUST";
}

export interface TrailNode {
  x: number;
  y: number;
  ageS: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private trail: TrailNode[] = [];
  private trailSpawnTimerS = 0;

  public spawnPushOff(x: number, y: number, dirX: number, dirY: number): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 10,
      lifeS: 0.35,
      maxLifeS: 0.35,
      color: "#38bdf8",
      kind: "RING",
    });

    const baseAngle = Math.atan2(-dirY, -dirX);
    for (let i = 0; i < 12; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const speed = 45 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(baseAngle + spread) * speed,
        vy: Math.sin(baseAngle + spread) * speed,
        radius: 2 + Math.random() * 2.5,
        lifeS: 0.3 + Math.random() * 0.25,
        maxLifeS: 0.55,
        color: i % 2 === 0 ? "#bae6fd" : "#38bdf8",
        kind: "THRUST",
      });
    }
  }

  public spawnThrusterPlume(x: number, y: number, dirX: number, dirY: number): void {
    const jetAngle = Math.atan2(-dirY, -dirX);
    for (let i = 0; i < 18; i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const speed = 90 + Math.random() * 190;
      this.particles.push({
        x: x + Math.cos(jetAngle) * 14,
        y: y + Math.sin(jetAngle) * 14,
        vx: Math.cos(jetAngle + spread) * speed,
        vy: Math.sin(jetAngle + spread) * speed,
        radius: 2.5 + Math.random() * 3.5,
        lifeS: 0.25 + Math.random() * 0.25,
        maxLifeS: 0.5,
        color: i % 3 === 0 ? "#ffffff" : "#7dd3fc",
        kind: "THRUST",
      });
    }
  }

  public spawnWallImpact(x: number, y: number, impactSpeed: number): void {
    const count = impactSpeed > 450 ? 22 : 10;
    const isHeavy = impactSpeed > 450;
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 12,
      lifeS: 0.32,
      maxLifeS: 0.32,
      color: isHeavy ? "#ef4444" : "#f59e0b",
      kind: "RING",
    });

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * (impactSpeed * 0.45);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        radius: 1.5 + Math.random() * 2,
        lifeS: 0.25 + Math.random() * 0.3,
        maxLifeS: 0.55,
        color: isHeavy ? "#fca5a5" : "#fde047",
        kind: "SPARK",
      });
    }
  }

  public spawnGrabLatch(x: number, y: number): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 8,
      lifeS: 0.28,
      maxLifeS: 0.28,
      color: "#10b981",
      kind: "RING",
    });
  }

  public update(
    dtS: number,
    astroPos: { x: number; y: number },
    astroVel: { vx: number; vy: number },
    isFlying: boolean,
  ): void {
    // Оновлюємо шлейф за космонавтом у польоті
    for (const node of this.trail) {
      node.ageS += dtS;
    }
    this.trail = this.trail.filter((n) => n.ageS < 0.32);

    const speed = Math.hypot(astroVel.vx, astroVel.vy);
    if (isFlying && speed > 80) {
      this.trailSpawnTimerS -= dtS;
      if (this.trailSpawnTimerS <= 0) {
        this.trail.push({ x: astroPos.x, y: astroPos.y, ageS: 0 });
        this.trailSpawnTimerS = 0.018;
      }
    }

    // Оновлюємо частинки
    for (const p of this.particles) {
      p.lifeS -= dtS;
      p.x += p.vx * dtS;
      p.y += p.vy * dtS;
      p.vx *= 1 - 2.2 * dtS;
      p.vy *= 1 - 2.2 * dtS;
      if (p.kind === "RING") {
        p.radius += 95 * dtS;
      }
    }
    this.particles = this.particles.filter((p) => p.lifeS > 0);
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1. Плавний реактивний шлейф за космонавтом
    if (this.trail.length > 1) {
      for (let i = 0; i < this.trail.length; i++) {
        const node = this.trail[i]!;
        const ratio = 1 - node.ageS / 0.32;
        ctx.fillStyle = `rgba(56, 189, 248, ${ratio * 0.24})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 10 * ratio, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Частинки (іскри, газ RCS, ударні кільця)
    for (const p of this.particles) {
      const alpha = Math.max(0, p.lifeS / p.maxLifeS);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === "RING") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
