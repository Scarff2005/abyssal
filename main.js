"use strict";

/* ============================================================
   ABYSSAL — interactions
   - fixed hero canvas: particles, jellyfish, siphonophore, lure
   - scroll-driven depth telemetry
   - sonar canvas with contacts
   - specimen dialog, reveals, form
   ============================================================ */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mixColor = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const rgba = (color, alpha = 1) =>
  `rgba(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},${alpha})`;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

/* Start at the surface on a fresh load, not at a restored scroll position. */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!window.location.hash) {
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previousBehavior;
}

/* ============================================================
   HERO SCENE
   ============================================================ */

class AbyssScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.particles = [];
    this.progress = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.running = false;
    this.raf = 0;
    this.time = 0;
    this.reduced = reducedMotion;

    this.resize();
    this.start();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.initParticles();

    if (this.reduced) {
      this.draw(0);
    }
  }

  initParticles() {
    const count =
      this.width < 700 ? 80 : this.width < 1200 ? 130 : 190;

    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      z: Math.random(),
      r: 0.35 + Math.random() * 1.5,
      speed: 0.12 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.9,
    }));
  }

  setProgress(value) {
    this.progress = clamp(value, 0, 1);
    if (this.reduced) this.draw(0);
  }

  setMouse(x, y) {
    this.mouseX = clamp(x, -1, 1);
    this.mouseY = clamp(y, -1, 1);
  }

  start() {
    if (this.reduced) {
      this.draw(0);
      return;
    }
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame((now) => this.loop(now));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  loop(now) {
    if (!this.running) return;
    this.draw(now);
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  draw(now) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    this.time = now * 0.001;
    const t = this.time;
    const progress = this.progress;
    const depth = smoothstep(0, 0.46, progress);

    /* background */
    const top = mixColor([7, 26, 36], [1, 3, 5], depth);
    const bottom = mixColor([2, 8, 12], [0, 0, 0], depth);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, rgba(top));
    bg.addColorStop(0.55, rgba(mixColor(top, bottom, 0.55)));
    bg.addColorStop(1, rgba(bottom));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* ambient light around the jellyfish */
    const jellyX = w * (w < 760 ? 0.8 : 0.76);
    const jellyY = h * (w < 760 ? 0.7 : 0.44);
    const ambient = ctx.createRadialGradient(
      jellyX,
      jellyY,
      0,
      jellyX,
      jellyY,
      Math.min(w, h) * 0.62
    );
    ambient.addColorStop(0, `rgba(126,249,255,${0.075 * (1 - depth)})`);
    ambient.addColorStop(0.55, `rgba(46,199,214,${0.025 * (1 - depth)})`);
    ambient.addColorStop(1, "rgba(3,7,10,0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, w, h);

    this.drawShafts(t, progress);
    this.drawParticles(t, progress);

    /* creatures */
    const jellyScale = w < 760 ? Math.min(0.3, w / 1100) : Math.min(1.15, w / 1300);
    this.drawJellyfish(
      jellyX + this.mouseX * 12,
      jellyY + this.mouseY * 9,
      jellyScale,
      t,
      1 - smoothstep(0.14, 0.44, progress)
    );

    const siphonX = w * (w < 760 ? 0.5 : 0.3);
    const siphonY = h * (w < 760 ? 0.52 : 0.5);
    const siphonAlpha =
      smoothstep(0.18, 0.33, progress) *
      (1 - smoothstep(0.5, 0.68, progress));
    this.drawSiphonophore(
      siphonX,
      siphonY,
      w < 760 ? 0.46 : 0.82,
      t,
      siphonAlpha
    );

    const anglerAlpha =
      smoothstep(0.64, 0.82, progress) *
      (1 - smoothstep(0.95, 1, progress));
    this.drawAnglerfish(
      w * (w < 760 ? 0.54 : 0.68),
      h * (w < 760 ? 0.58 : 0.58),
      w < 760 ? 0.5 : 0.92,
      t,
      anglerAlpha
    );

    /* vignette */
    const vignette = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      Math.min(w, h) * 0.18,
      w * 0.5,
      h * 0.48,
      Math.max(w, h) * 0.78
    );
    vignette.addColorStop(0, "rgba(3,7,10,0)");
    vignette.addColorStop(0.72, "rgba(3,7,10,0.22)");
    vignette.addColorStop(1, "rgba(3,7,10,0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  drawShafts(t, progress) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const alpha = 0.55 * (1 - smoothstep(0.1, 0.5, progress));

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;

    for (let i = 0; i < 4; i += 1) {
      const x = w * (0.08 + i * 0.24) + Math.sin(t * 0.09 + i * 1.7) * 36;
      const beam = ctx.createLinearGradient(x, 0, x + 160, h);
      beam.addColorStop(0, "rgba(126,249,255,0.055)");
      beam.addColorStop(0.55, "rgba(126,249,255,0.018)");
      beam.addColorStop(1, "rgba(126,249,255,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 38, 0);
      ctx.lineTo(x + 38, 0);
      ctx.lineTo(x + 210, h);
      ctx.lineTo(x + 70, h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  drawParticles(t, progress) {
    const ctx = this.ctx;
    const h = this.height;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this.particles) {
      const y =
        ((p.y - t * p.speed * 5 - progress * h * 0.38 * p.z) % h + h) % h;
      const x = p.x + Math.sin(t * 0.18 + p.phase) * 11 * p.z;
      const alpha = (0.07 + p.z * 0.34) * (1 - progress * 0.45);

      if (alpha <= 0.01) continue;

      const color = p.warm ? [255, 184, 107] : [126, 249, 255];
      ctx.fillStyle = rgba(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, p.r * (0.7 + p.z * 0.7), 0, Math.PI * 2);
      ctx.fill();

      if (p.z > 0.72) {
        ctx.fillStyle = rgba(color, alpha * 0.14);
        ctx.beginPath();
        ctx.arc(x, y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawJellyfish(cx, cy, scale, t, alpha) {
    if (alpha <= 0.01) return;

    const ctx = this.ctx;
    const pulse = 1 + Math.sin(t * 0.9) * 0.035;
    const bellWidth = 280 * scale;
    const bellHeight = 150 * scale * pulse;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha;

    /* tentacles */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (let i = 0; i < 16; i += 1) {
      const p = i / 15;
      const x0 = -bellWidth * 0.46 + p * bellWidth * 0.92;
      const len = bellHeight * 1.8 + Math.sin(i * 1.7) * bellHeight * 0.5 + 80 * scale;
      const sway = Math.sin(t * 0.8 + i * 0.7) * 14 * scale;

      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(
        x0 + sway * 0.5,
        len * 0.35,
        x0 - sway,
        len * 0.7,
        x0 + sway * 0.7,
        len
      );
      ctx.strokeStyle = `rgba(126,249,255,${0.09 + (i % 3) * 0.028})`;
      ctx.lineWidth = (1.1 + (i % 3) * 0.35) * scale;
      ctx.stroke();
    }

    /* oral arms */
    for (let i = 0; i < 4; i += 1) {
      const x0 = -bellWidth * 0.18 + i * bellWidth * 0.12;
      const len = bellHeight * 1.2 + 40 * scale;
      const sway = Math.sin(t * 0.7 + i) * 18 * scale;

      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(
        x0 + sway,
        len * 0.35,
        x0 - sway,
        len * 0.7,
        x0 + sway * 0.5,
        len
      );
      ctx.strokeStyle = "rgba(126,249,255,0.15)";
      ctx.lineWidth = 7 * scale;
      ctx.stroke();
      ctx.strokeStyle = "rgba(232,226,212,0.09)";
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
    }

    ctx.restore();

    /* bell */
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    ctx.beginPath();
    ctx.moveTo(-bellWidth / 2, 0);
    ctx.bezierCurveTo(
      -bellWidth / 2,
      -bellHeight * 0.95,
      bellWidth / 2,
      -bellHeight * 0.95,
      bellWidth / 2,
      0
    );

    const rimSteps = 10;
    for (let i = rimSteps; i >= 0; i -= 1) {
      const x = -bellWidth / 2 + (i / rimSteps) * bellWidth;
      const y = Math.sin(i * 1.8 + t * 1.2) * 4 * scale;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const bellGradient = ctx.createRadialGradient(
      0,
      -bellHeight * 0.35,
      0,
      0,
      -bellHeight * 0.1,
      bellWidth * 0.55
    );
    bellGradient.addColorStop(0, "rgba(126,249,255,0.2)");
    bellGradient.addColorStop(0.55, "rgba(46,199,214,0.06)");
    bellGradient.addColorStop(1, "rgba(3,7,10,0.02)");
    ctx.fillStyle = bellGradient;
    ctx.fill();

    ctx.strokeStyle = "rgba(126,249,255,0.55)";
    ctx.lineWidth = 1.2 * scale;
    ctx.stroke();

    /* inner bell */
    ctx.beginPath();
    ctx.moveTo(-bellWidth * 0.36, 0);
    ctx.bezierCurveTo(
      -bellWidth * 0.36,
      -bellHeight * 0.6,
      bellWidth * 0.36,
      -bellHeight * 0.6,
      bellWidth * 0.36,
      0
    );
    ctx.strokeStyle = "rgba(232,226,212,0.16)";
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();

    /* rim lights */
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 12; i += 1) {
      const p = i / 11;
      const x = -bellWidth * 0.45 + p * bellWidth * 0.9;
      const y = Math.sin(p * Math.PI) * 8 * scale;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(126,249,255,${0.28 + Math.sin(t * 1.5 + i) * 0.14})`;
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  drawSiphonophore(cx, cy, scale, t, alpha) {
    if (alpha <= 0.01) return;

    const ctx = this.ctx;
    const len = 560 * scale;
    const segments = 40;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.12 + Math.sin(t * 0.2) * 0.03);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const p = i / segments;
      points.push({
        x: -len / 2 + p * len,
        y: Math.sin(p * Math.PI * 3 + t * 0.5) * 16 * scale,
      });
    }

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = "rgba(126,249,255,0.16)";
    ctx.lineWidth = 1 * scale;
    ctx.stroke();

    points.forEach((point, index) => {
      const p = index / segments;
      const radius = (2.2 + Math.sin(p * Math.PI) * 2.5) * scale;

      const glow = ctx.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        radius * 6
      );
      glow.addColorStop(0, "rgba(126,249,255,0.48)");
      glow.addColorStop(1, "rgba(126,249,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(232,226,212,0.82)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 0.48, 0, Math.PI * 2);
      ctx.fill();

      if (index % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.quadraticCurveTo(
          point.x + 6 * scale,
          point.y + 18 * scale,
          point.x + Math.sin(t + index) * 4 * scale,
          point.y + 34 * scale
        );
        ctx.strokeStyle = "rgba(126,249,255,0.13)";
        ctx.lineWidth = 0.7 * scale;
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  drawAnglerfish(cx, cy, scale, t, alpha) {
    if (alpha <= 0.01) return;

    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "source-over";

    /* tail */
    ctx.beginPath();
    ctx.moveTo(-118, 8);
    ctx.lineTo(-182, -34);
    ctx.lineTo(-168, 8);
    ctx.lineTo(-182, 52);
    ctx.closePath();
    ctx.fillStyle = "rgba(2,5,8,0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(126,249,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* body */
    ctx.beginPath();
    ctx.moveTo(-128, 10);
    ctx.bezierCurveTo(-100, -70, 40, -96, 122, -30);
    ctx.bezierCurveTo(152, -4, 150, 34, 110, 55);
    ctx.bezierCurveTo(40, 86, -70, 66, -128, 10);
    ctx.closePath();
    ctx.fillStyle = "rgba(2,5,8,0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(126,249,255,0.12)";
    ctx.stroke();

    /* jaw */
    ctx.beginPath();
    ctx.moveTo(4, 34);
    ctx.lineTo(72, 46);
    ctx.lineTo(28, 57);
    ctx.closePath();
    ctx.fillStyle = "rgba(232,226,212,0.11)";
    ctx.fill();

    /* eye */
    ctx.beginPath();
    ctx.arc(46, -20, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(126,249,255,0.55)";
    ctx.fill();

    /* antenna */
    ctx.beginPath();
    ctx.moveTo(18, -56);
    ctx.bezierCurveTo(38, -122, 92, -152, 122, -122);
    ctx.strokeStyle = "rgba(126,249,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* lure */
    ctx.globalCompositeOperation = "lighter";
    const lureX = 122;
    const lureY = -122;
    const lure = ctx.createRadialGradient(lureX, lureY, 0, lureX, lureY, 58);
    lure.addColorStop(0, "rgba(255,184,107,0.92)");
    lure.addColorStop(0.16, "rgba(255,184,107,0.36)");
    lure.addColorStop(1, "rgba(255,184,107,0)");
    ctx.fillStyle = lure;
    ctx.beginPath();
    ctx.arc(lureX, lureY, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lureX, lureY, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,240,210,0.95)";
    ctx.fill();

    ctx.restore();
  }
}

/* ============================================================
   SONAR
   ============================================================ */

const contacts = [
  {
    id: "luminara",
    name: "Luminara vex",
    bearing: 42,
    range: 1.2,
    depth: "1,240 m",
    copy:
      "A bell of glass and a hundred false horizons. The sonar returns a soft, repeating bloom.",
    tone: "cyan",
  },
  {
    id: "noctiluca",
    name: "Noctiluca chorus",
    bearing: 118,
    range: 2.8,
    depth: "2,870 m",
    copy:
      "A colony that answers light with light. The return is not a single body but a chorus of tiny echoes.",
    tone: "amber",
  },
  {
    id: "charybdis",
    name: "Charybdis echo",
    bearing: 207,
    range: 4.1,
    depth: "4,120 m",
    copy:
      "Forty meters of connected selves. The contact drifts sideways, listening its way forward.",
    tone: "cyan",
  },
  {
    id: "unknown",
    name: "Unknown contact",
    bearing: 310,
    range: 6.4,
    depth: "6,400 m",
    copy:
      "No match in the archive. The return is too regular to be geology and too slow to be a fish.",
    tone: "amber",
  },
];

class Sonar {
  constructor(canvas, onSelect) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect;
    this.selectedId = "luminara";
    this.hoveredId = null;
    this.pointer = null;
    this.pings = [];
    this.sweep = 0;
    this.active = false;
    this.running = false;
    this.raf = 0;
    this.reduced = reducedMotion;
    this.width = 0;
    this.height = 0;
    this.cx = 0;
    this.cy = 0;
    this.radius = 0;
    this.dpr = 1;

    this.resize();
    this.bind();
    this.select("luminara");
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radius = Math.min(this.width, this.height) * 0.41;

    if (this.reduced) this.draw();
  }

  pointFor(contact) {
    const angle = ((contact.bearing - 90) * Math.PI) / 180;
    const distance = (contact.range / 8) * this.radius;
    return {
      x: this.cx + Math.cos(angle) * distance,
      y: this.cy + Math.sin(angle) * distance,
    };
  }

  start() {
    if (this.reduced) {
      this.draw();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(() => this.loop());
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setActive(value) {
    this.active = value;
    if (value) this.start();
    else this.stop();
  }

  loop() {
    if (!this.running) return;
    this.draw();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  bind() {
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - this.cx;
      const dy = y - this.cy;
      const distance = Math.hypot(dx, dy);

      if (distance > this.radius + 24) {
        this.pointer = null;
        this.hoveredId = null;
      } else {
        this.pointer = { x, y };
        this.hoveredId = this.findNearest(x, y);
        this.updateReadout(dx, dy, distance);
      }

      this.canvas.style.cursor = this.hoveredId ? "pointer" : "crosshair";

      if (this.reduced) this.draw();
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.pointer = null;
      this.hoveredId = null;
      this.canvas.style.cursor = "crosshair";
      if (this.reduced) this.draw();
    });

    this.canvas.addEventListener("click", () => {
      if (this.hoveredId) this.select(this.hoveredId);
    });
  }

  findNearest(x, y) {
    let nearest = null;
    let best = 22;

    for (const contact of contacts) {
      const point = this.pointFor(contact);
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance < best) {
        best = distance;
        nearest = contact.id;
      }
    }

    return nearest;
  }

  updateReadout(dx, dy, distance) {
    const readout = document.getElementById("sonar-readout");
    if (!readout) return;

    const bearing = Math.round(
      ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    );
    const range = ((distance / this.radius) * 8).toFixed(1);
    readout.textContent = `Bearing ${String(bearing).padStart(
      3,
      "0"
    )}° / Range ${range} km`;
  }

  select(id) {
    const contact = contacts.find((item) => item.id === id);
    if (!contact) return;

    this.selectedId = id;
    this.onSelect(contact);

    if (!this.reduced) {
      const point = this.pointFor(contact);
      this.pings.push({
        x: point.x,
        y: point.y,
        born: performance.now(),
        tone: contact.tone,
      });
    }

    if (this.reduced) this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const { cx, cy, radius } = this;
    if (!this.width || !this.height) return;

    ctx.clearRect(0, 0, this.width, this.height);

    /* rings */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.setLineDash([2, 7]);

    for (let i = 1; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, (radius * i) / 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(126,249,255,${0.06 + i * 0.018})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.setLineDash([]);

    /* radial lines */
    for (let i = 0; i < 12; i += 1) {
      const angle = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.08, Math.sin(angle) * radius * 0.08);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.strokeStyle = "rgba(126,249,255,0.055)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* compass labels */
    ctx.font = "8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(232,226,212,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labels = [
      ["000", 0],
      ["090", 90],
      ["180", 180],
      ["270", 270],
    ];
    for (const [label, degrees] of labels) {
      if (degrees === 0 && this.width < 520) continue;
      const angle = ((degrees - 90) * Math.PI) / 180;
      ctx.fillText(
        label,
        Math.cos(angle) * (radius + 14),
        Math.sin(angle) * (radius + 14)
      );
    }

    ctx.restore();

    /* selection pings */
    if (!this.reduced && this.pings.length) {
      const now = performance.now();
      this.pings = this.pings.filter((ping) => now - ping.born < 1800);

      for (const ping of this.pings) {
        const age = clamp((now - ping.born) / 1800, 0, 1);
        const color = ping.tone === "amber" ? [255, 184, 107] : [126, 249, 255];

        for (let ring = 0; ring < 2; ring += 1) {
          const ringAge = clamp(age - ring * 0.14, 0, 1);
          if (ringAge <= 0) continue;

          ctx.beginPath();
          ctx.arc(ping.x, ping.y, 6 + ringAge * 76, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(color, (1 - ringAge) * 0.42);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    /* sweep */
    if (!this.reduced) {
      this.sweep += 0.0065;
    }

    ctx.save();
    ctx.translate(cx, cy);

    if (ctx.createConicGradient) {
      const sweepGradient = ctx.createConicGradient(
        this.sweep,
        0,
        0
      );
      sweepGradient.addColorStop(0, "rgba(126,249,255,0.2)");
      sweepGradient.addColorStop(0.09, "rgba(126,249,255,0)");
      sweepGradient.addColorStop(1, "rgba(126,249,255,0)");
      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(this.sweep) * radius, Math.sin(this.sweep) * radius);
    ctx.strokeStyle = "rgba(126,249,255,0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* pointer crosshair */
    if (this.pointer) {
      const px = this.pointer.x - cx;
      const py = this.pointer.y - cy;
      ctx.beginPath();
      ctx.setLineDash([3, 5]);
      ctx.moveTo(0, 0);
      ctx.lineTo(px, py);
      ctx.strokeStyle = "rgba(232,226,212,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(232,226,212,0.4)";
      ctx.stroke();
    }

    /* contacts */
    for (const contact of contacts) {
      const point = this.pointFor(contact);
      const isSelected = contact.id === this.selectedId;
      const isHovered = contact.id === this.hoveredId;
      const color = contact.tone === "amber" ? [255, 184, 107] : [126, 249, 255];
      const pulse = 0.65 + Math.sin(this.sweep * 3 + contact.bearing) * 0.2;

      const glow = ctx.createRadialGradient(
        point.x - cx,
        point.y - cy,
        0,
        point.x - cx,
        point.y - cy,
        isSelected ? 28 : 18
      );
      glow.addColorStop(0, rgba(color, isSelected ? 0.4 : 0.22));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x - cx, point.y - cy, isSelected ? 28 : 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        point.x - cx,
        point.y - cy,
        isSelected ? 4.5 : 3,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = rgba(color, pulse);
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(
          point.x - cx,
          point.y - cy,
          isSelected ? 14 : 10,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = rgba(color, isSelected ? 0.7 : 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (isSelected) {
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(232,226,212,0.78)";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(contact.name.toUpperCase(), point.x - cx + 16, point.y - cy - 8);
      }
    }

    ctx.restore();
  }
}

/* ============================================================
   UI
   ============================================================ */

const header = document.getElementById("site-header");
const progressFill = document.getElementById("progress-fill");
const depthRailFill = document.getElementById("depth-rail-fill");
const hudDepth = document.getElementById("hud-depth");
const hudPressure = document.getElementById("hud-pressure");
const hudTemp = document.getElementById("hud-temp");
const hudZone = document.getElementById("hud-zone");
const scene = new AbyssScene(document.getElementById("scene"));

let sonar = null;

function zoneForDepth(depth) {
  if (depth < 200) return "Epipelagic";
  if (depth < 1000) return "Mesopelagic";
  if (depth < 4000) return "Bathypelagic";
  if (depth < 6000) return "Abyssopelagic";
  return "Hadal";
}

function formatDepth(depth) {
  const rounded = Math.round(depth);
  if (rounded < 1000) return `${String(rounded).padStart(4, "0")} m`;
  return `${rounded.toLocaleString("en-US")} m`;
}

let scrollTicking = false;

function updateScroll() {
  const doc = document.documentElement;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const pageProgress = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
  const heroProgress = clamp(window.scrollY / window.innerHeight, 0, 1);
  const depth = pageProgress * 10994;
  const pressure = 1 + depth / 10;
  const temperature = lerp(18.4, 1.2, smoothstep(0, 1, pageProgress));

  scene.setProgress(heroProgress);

  if (window.scrollY > window.innerHeight * 1.15) {
    scene.stop();
  } else {
    scene.start();
  }

  if (progressFill) progressFill.style.width = `${pageProgress * 100}%`;
  if (depthRailFill) depthRailFill.style.width = `${pageProgress * 100}%`;
  if (hudDepth) hudDepth.textContent = formatDepth(depth);
  if (hudPressure) hudPressure.textContent = `${pressure.toFixed(2)} atm`;
  if (hudTemp) hudTemp.textContent = `${temperature.toFixed(1)} °C`;
  if (hudZone) hudZone.textContent = zoneForDepth(depth);

  if (header) header.classList.toggle("is-scrolled", window.scrollY > 40);
  scrollTicking = false;
}

function onScroll() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(updateScroll);
}

/* sonar */
const sonarCanvas = document.getElementById("sonar-canvas");

function updateSonarDetail(contact) {
  const name = document.getElementById("sonar-detail-name");
  const copy = document.getElementById("sonar-detail-copy");
  const bearing = document.getElementById("sonar-detail-bearing");
  const range = document.getElementById("sonar-detail-range");
  const depth = document.getElementById("sonar-detail-depth");

  if (name) name.textContent = contact.name;
  if (copy) copy.textContent = contact.copy;
  if (bearing) bearing.textContent = `${String(contact.bearing).padStart(3, "0")}°`;
  if (range) range.textContent = `${contact.range.toFixed(1)} km`;
  if (depth) depth.textContent = contact.depth;

  document.querySelectorAll("[data-contact]").forEach((button) => {
    const active = button.dataset.contact === contact.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

if (sonarCanvas) {
  sonar = new Sonar(sonarCanvas, updateSonarDetail);

  document.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () => sonar.select(button.dataset.contact));
  });

  const sonarObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        sonar.setActive(entry.isIntersecting);
      });
    },
    { threshold: 0.15 }
  );

  const sonarFrame = sonarCanvas.closest(".sonar-frame");
  if (sonarFrame) sonarObserver.observe(sonarFrame);
}

/* mobile menu */
const menuDialog = document.getElementById("mobile-menu");
const menuToggle = document.querySelector(".menu-toggle");

if (menuDialog && menuToggle) {
  const closeMenu = () => {
    if (menuDialog.open) menuDialog.close();
  };

  menuToggle.addEventListener("click", () => {
    menuDialog.showModal();
    menuToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
    const firstLink = menuDialog.querySelector(".mobile-menu-nav a");
    if (firstLink) firstLink.focus();
  });

  const menuClose = menuDialog.querySelector(".mobile-menu-close");
  if (menuClose) menuClose.addEventListener("click", closeMenu);

  menuDialog.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  menuDialog.addEventListener("click", (event) => {
    if (event.target === menuDialog) closeMenu();
  });

  menuDialog.addEventListener("close", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    menuToggle.focus();
  });
}

/* reveals */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
);

document.querySelectorAll("[data-reveal]").forEach((element) => {
  revealObserver.observe(element);
});

/* pointer glow */
const cursorGlow = document.querySelector(".cursor-glow");

if (finePointer && !reducedMotion) {
  window.addEventListener(
    "pointermove",
    (event) => {
      document.body.classList.add("has-pointer");
      const x = event.clientX;
      const y = event.clientY;
      scene.setMouse(x / window.innerWidth - 0.5, y / window.innerHeight - 0.5);
      if (cursorGlow) {
        cursorGlow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    },
    { passive: true }
  );
}

/* specimen dialog */
const specimens = {
  luminara: {
    kicker: "Specimen 01 / 03",
    name: "Luminara vex",
    latin: "The lantern jelly",
    desc:
      "A bell of glass and a hundred false horizons. It pulses once every nine seconds; the light travels further than the body. The sonar returns a soft, repeating bloom.",
    depth: "1,240 m",
    zone: "Bathypelagic",
    light: "Bioluminescent",
  },
  noctiluca: {
    kicker: "Specimen 02 / 03",
    name: "Noctiluca chorus",
    latin: "The midnight bloom",
    desc:
      "A colony that answers light with light. Touch one cell and the whole field remembers. The sonar return is not a single body but a chorus of tiny echoes.",
    depth: "2,870 m",
    zone: "Bathypelagic",
    light: "Bioluminescent",
  },
  charybdis: {
    kicker: "Specimen 03 / 03",
    name: "Charybdis echo",
    latin: "The listening siphonophore",
    desc:
      "Forty meters of connected selves. It does not swim so much as listen its way forward. The contact drifts sideways, patient as a sentence.",
    depth: "4,120 m",
    zone: "Abyssopelagic",
    light: "Bioluminescent",
  },
};

const dialog = document.getElementById("specimen-dialog");
const dialogVisual = document.getElementById("dialog-visual");
let lastFocused = null;

function openSpecimen(id) {
  const data = specimens[id];
  if (!data || !dialog) return;

  const sourceCard = document.querySelector(`[data-specimen="${id}"]`);
  const sourceSvg = sourceCard ? sourceCard.querySelector(".specimen-svg") : null;

  lastFocused = document.activeElement;

  const kicker = document.getElementById("dialog-kicker");
  const name = document.getElementById("dialog-name");
  const latin = document.getElementById("dialog-latin");
  const desc = document.getElementById("dialog-desc");
  const depth = document.getElementById("dialog-depth");
  const zone = document.getElementById("dialog-zone");
  const light = document.getElementById("dialog-light");

  if (kicker) kicker.textContent = data.kicker;
  if (name) name.textContent = data.name;
  if (latin) latin.textContent = data.latin;
  if (desc) desc.textContent = data.desc;
  if (depth) depth.textContent = data.depth;
  if (zone) zone.textContent = data.zone;
  if (light) light.textContent = data.light;

  if (dialogVisual && sourceSvg) {
    dialogVisual.innerHTML = "";
    dialogVisual.appendChild(sourceSvg.cloneNode(true));
  }

  dialog.showModal();
  const closeButton = dialog.querySelector(".dialog-close");
  if (closeButton) closeButton.focus();
}

document.querySelectorAll("[data-open-specimen]").forEach((button) => {
  button.addEventListener("click", () => openSpecimen(button.dataset.openSpecimen));
});

if (dialog) {
  const closeButton = dialog.querySelector(".dialog-close");

  if (closeButton) {
    closeButton.addEventListener("click", () => dialog.close());
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  });
}

/* transmission form */
const form = document.getElementById("transmission-form");
const formStatus = document.getElementById("form-status");

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = form.querySelector('input[type="email"]');
    if (!email || !email.value.trim()) return;

    if (formStatus) {
      formStatus.textContent =
        "Transmission received. Welcome to the archive.";
    }

    const button = form.querySelector("button");
    if (button) {
      button.textContent = "Received ✓";
      button.disabled = true;
    }

    email.value = "";
  });
}

/* resize + visibility */
let resizeTimer = 0;

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    scene.resize();
    if (sonar) sonar.resize();
    updateScroll();
  }, 140);
});

window.addEventListener("scroll", onScroll, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    scene.stop();
    if (sonar) sonar.stop();
  } else {
    scene.start();
    if (sonar && sonar.active) sonar.start();
  }
});

/* initial paint */
updateScroll();
requestAnimationFrame(updateScroll);
window.addEventListener("load", updateScroll);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(updateScroll);
}
