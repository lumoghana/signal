const noop = () => {};
const DURATION_MS = 2300;
const MAX_PARTICLES = 128;
const COLORS = ['#111218', '#34431a', '#f05c39', '#fffdf2'];

/** A single arrival celebration. Animation never changes the account or setup. */
export function bindActivationConfetti(root) {
  if (!root?.classList?.contains('activation-enter')) return noop;
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const document = root.ownerDocument || globalThis.document;
  if (motion?.matches || document?.hidden || typeof globalThis.requestAnimationFrame !== 'function') return noop;

  const canvas = root.querySelector('[data-activation-confetti]');
  if (!canvas || typeof canvas.getContext !== 'function') return noop;
  let context;
  try { context = canvas.getContext('2d'); } catch { return noop; }
  if (!context) return noop;
  const { width, height } = root.getBoundingClientRect();
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return noop;
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1), 2048 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const particles = Array.from({ length: MAX_PARTICLES }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height * .22 - 90,
    vx: (Math.random() - .5) * 145,
    vy: 70 + Math.random() * 180,
    gravity: 85 + Math.random() * 55,
    width: 3 + Math.random() * 7,
    height: 2 + Math.random() * 4,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - .5) * 7,
    phase: Math.random() * 7,
    color: COLORS[index % COLORS.length],
  }));
  let frame = 0, started = null, previous = null, finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (frame) globalThis.cancelAnimationFrame?.(frame);
    frame = 0;
    context.clearRect(0, 0, width, height);
    document?.removeEventListener?.('visibilitychange', visibilityChanged);
    motion?.removeEventListener?.('change', motionChanged);
  };
  const visibilityChanged = () => { if (document?.hidden) cleanup(); };
  const motionChanged = event => { if (event.matches) cleanup(); };

  function draw(time) {
    frame = 0;
    if (finished) return;
    if (root.isConnected === false || document?.hidden || motion?.matches) return cleanup();
    if (started === null) started = time;
    const elapsed = time - started;
    if (elapsed >= DURATION_MS) return cleanup();
    const seconds = elapsed / 1000;
    const delta = previous === null ? 0 : Math.max(0, Math.min((time - previous) / 1000, .035));
    previous = time;
    const alpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 1200)) * .92;
    context.clearRect(0, 0, width, height);
    particles.forEach(particle => {
      particle.vy += particle.gravity * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.angle += particle.spin * delta;
      context.save();
      context.translate(particle.x + Math.sin(seconds * 3 + particle.phase) * 11, particle.y);
      context.rotate(particle.angle);
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      const paperHeight = Math.max(1, particle.height * Math.abs(Math.cos(seconds * 4 + particle.phase)));
      context.fillRect(-particle.width / 2, -paperHeight / 2, particle.width, paperHeight);
      context.restore();
    });
    frame = globalThis.requestAnimationFrame(draw);
  }

  document?.addEventListener?.('visibilitychange', visibilityChanged);
  motion?.addEventListener?.('change', motionChanged);
  frame = globalThis.requestAnimationFrame(draw);
  return cleanup;
}
