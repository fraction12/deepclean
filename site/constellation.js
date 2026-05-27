const canvas = document.querySelector("[data-constellation]");
const hero = document.querySelector(".hero");
const stageItems = Array.from(document.querySelectorAll("[data-stage]"));
const labels = Array.from(document.querySelectorAll(".constellation-label"));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const colors = {
  ink: "243, 247, 248",
  aqua: "24, 216, 245",
  amber: "255, 176, 32",
  green: "87, 214, 141",
  violet: "138, 125, 255",
};

const clusters = [
  { x: 0.7, y: 0.28, r: 170, color: colors.aqua, stage: "scan" },
  { x: 0.55, y: 0.62, r: 145, color: colors.green, stage: "map" },
  { x: 0.82, y: 0.56, r: 132, color: colors.amber, stage: "rank" },
  { x: 0.38, y: 0.37, r: 118, color: colors.violet, stage: "handoff" },
];

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let ctx;
let width = 0;
let height = 0;
let dpr = 1;
let particles = [];
let raf = 0;
let start = performance.now();

const seeded = (index) => {
  const value = Math.sin(index * 9283.143 + 17.61) * 43758.5453;
  return value - Math.floor(value);
};

const chooseCluster = (index) => clusters[index % clusters.length];

const buildParticles = () => {
  const count = Math.max(96, Math.min(260, Math.round((width * height) / 7600)));
  particles = Array.from({ length: count }, (_, index) => {
    const cluster = chooseCluster(index);
    const angle = seeded(index + 1) * Math.PI * 2;
    const distance = Math.sqrt(seeded(index + 2)) * cluster.r;
    const clusterX = cluster.x * width;
    const clusterY = cluster.y * height;

    return {
      cluster,
      homeX: clusterX + Math.cos(angle) * distance,
      homeY: clusterY + Math.sin(angle) * distance,
      radius: 0.9 + seeded(index + 3) * 2.4,
      drift: 0.45 + seeded(index + 4) * 1.25,
      phase: seeded(index + 5) * Math.PI * 2,
      opacity: 0.18 + seeded(index + 6) * 0.44,
    };
  });
};

const resize = () => {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx = canvas.getContext("2d", { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildParticles();
};

const setPointer = (clientX, clientY) => {
  const rect = hero.getBoundingClientRect();
  pointer.tx = ((clientX - rect.left) / rect.width - 0.5) * 2;
  pointer.ty = ((clientY - rect.top) / rect.height - 0.5) * 2;
};

const drawParticle = (particle, t, activeIndex) => {
  const active = clusters[activeIndex] === particle.cluster ? 1 : 0;
  const driftX = Math.sin(t * particle.drift + particle.phase) * (6 + active * 3);
  const driftY = Math.cos(t * particle.drift * 0.9 + particle.phase) * (5 + active * 3);
  const parallaxX = pointer.x * (10 + active * 14);
  const parallaxY = pointer.y * (7 + active * 9);
  const x = particle.homeX + driftX + parallaxX;
  const y = particle.homeY + driftY + parallaxY;
  const glow = particle.radius + active * 1.7;

  ctx.beginPath();
  ctx.arc(x, y, glow, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${particle.cluster.color}, ${particle.opacity + active * 0.36})`;
  ctx.fill();

  if (active) {
    ctx.beginPath();
    ctx.arc(x, y, glow * 3.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${particle.cluster.color}, 0.035)`;
    ctx.fill();
  }

  return { x, y, active, particle };
};

const drawConnections = (points, activeIndex) => {
  const activePoints = points.filter((point) => point.particle.cluster === clusters[activeIndex]);
  const step = Math.max(3, Math.floor(activePoints.length / 22));

  for (let i = 0; i < activePoints.length; i += step) {
    const a = activePoints[i];
    const b = activePoints[(i + step * 2) % activePoints.length];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance > 190) continue;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(${clusters[activeIndex].color}, ${0.1 + (1 - distance / 190) * 0.22})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};

const drawScanPath = (t, activeIndex) => {
  const active = clusters[activeIndex];
  const sweep = (Math.sin(t * 0.52) + 1) / 2;
  const startX = active.x * width - active.r * 1.2;
  const x = startX + active.r * 2.4 * sweep + pointer.x * 18;
  const y = active.y * height + pointer.y * 12;
  const gradient = ctx.createLinearGradient(x - 120, y, x + 120, y);

  gradient.addColorStop(0, `rgba(${active.color}, 0)`);
  gradient.addColorStop(0.5, `rgba(${active.color}, 0.48)`);
  gradient.addColorStop(1, `rgba(${active.color}, 0)`);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.24);
  ctx.fillStyle = gradient;
  ctx.fillRect(-140, -3, 280, 6);
  ctx.restore();
};

const drawClusterHalos = (t, activeIndex) => {
  clusters.forEach((cluster, index) => {
    const active = index === activeIndex ? 1 : 0;
    const x = cluster.x * width + pointer.x * (18 + active * 16);
    const y = cluster.y * height + pointer.y * (10 + active * 12);
    const radius = cluster.r * (0.6 + active * 0.46 + Math.sin(t + index) * 0.025);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, `rgba(${cluster.color}, ${0.09 + active * 0.1})`);
    gradient.addColorStop(0.58, `rgba(${cluster.color}, ${0.026 + active * 0.04})`);
    gradient.addColorStop(1, `rgba(${cluster.color}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
};

const updateStage = (activeIndex) => {
  const activeStage = clusters[activeIndex].stage;
  stageItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.stage === activeStage);
  });

  labels.forEach((label, index) => {
    const x = `${pointer.x * (index + 1) * 7}px`;
    const y = `${pointer.y * (index + 1) * 5}px`;
    label.style.setProperty("--parallax-x", x);
    label.style.setProperty("--parallax-y", y);
    label.style.borderColor =
      index === activeIndex % labels.length
        ? "rgba(24, 216, 245, 0.52)"
        : "rgba(202, 219, 225, 0.2)";
  });
};

const render = (now) => {
  const elapsed = (now - start) / 1000;
  const activeIndex = Math.floor((elapsed / 3.6) % clusters.length);

  pointer.x += (pointer.tx - pointer.x) * 0.06;
  pointer.y += (pointer.ty - pointer.y) * 0.06;

  ctx.clearRect(0, 0, width, height);
  drawClusterHalos(elapsed, activeIndex);
  const points = particles.map((particle) => drawParticle(particle, elapsed, activeIndex));
  drawConnections(points, activeIndex);
  drawScanPath(elapsed, activeIndex);
  updateStage(activeIndex);

  raf = requestAnimationFrame(render);
};

const startConstellation = () => {
  if (!canvas || !hero || reducedMotion.matches) return;

  resize();
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (event) => setPointer(event.clientX, event.clientY), {
    passive: true,
  });
  window.addEventListener(
    "scroll",
    () => {
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, rect.top / Math.max(1, rect.height)));
      pointer.ty = progress * -0.55;
    },
    { passive: true },
  );
  raf = requestAnimationFrame(render);
};

reducedMotion.addEventListener("change", () => {
  cancelAnimationFrame(raf);
  if (!reducedMotion.matches) {
    start = performance.now();
    startConstellation();
  }
});

startConstellation();
