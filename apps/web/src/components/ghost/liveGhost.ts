import { createGhostStage, easeInOut, poseGhost, type GhostPose, type Three } from "./ghostScene";

// Every small Ghost icon is the 3D model: one shared WebGL renderer draws each visible icon's pose
// and copies it into that icon's 2D canvas, so any number of icons costs one context. Frames run
// only while something moves (a spinning "Thinking" Ghost, or eyes easing toward the cursor) and
// stop when no icon is on screen or the window is hidden.

const LOOP_MS = 2000;
const FRAME_MS = 1000 / 60;
const SUPERSAMPLE = 2;
const DISPOSE_AFTER_MS = 60_000;
/** Cursor distance (CSS px) at which a Ghost looks fully aside. */
const LOOK_REACH_PX = 260;
const LOOK_EASE_MS = 140;
const TWIRL_MS = 1000;
const HOVER_BOB_MS = 2600;
const HOVER_SWAY_MS = 4100;

interface View {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly spinning: boolean;
  visible: boolean;
  drawn: boolean;
  /** Origin of the spin loop (rAF time); the hand-off sets it so the flight lands at rest. */
  spinStart: number;
  /** Hidden under the hero's flight: skip drawing until it lands. */
  flying: boolean;
  /** When a click started a twirl (rAF time), or 0. */
  twirlStart: number;
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
}

type Stage = ReturnType<typeof createGhostStage> & {
  readonly renderer: InstanceType<Three["WebGLRenderer"]>;
};

const views = new Map<Element, View>();
let stage: Promise<Stage> | null = null;
let ready: Stage | null = null;
let observer: IntersectionObserver | null = null;
let frame = 0;
let lastFrame = 0;
let pointer: { x: number; y: number } | null = null;
let pointerMoved = false;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One spin loop: a half turn (the shell is symmetric top to bottom) while the plates part and
 *  close and the eye dims, then a rest. */
function spinPose(t: number) {
  const u = Math.min(1, t / 0.7);
  const swell = Math.sin(Math.PI * u);
  return { spread: swell * 0.2, spin: Math.PI * easeInOut(u), power: 1 - swell * 0.45 };
}

function viewPose(view: View, now: number): GhostPose {
  const spin =
    view.spinning && !reducedMotion()
      ? spinPose(((((now - view.spinStart) % LOOP_MS) + LOOP_MS) % LOOP_MS) / LOOP_MS)
      : { spread: 0, spin: 0, power: 1 };
  if (view.twirlStart) {
    // A click: one extra half turn while the shell opens a little and the eye flares.
    const u = Math.min(1, Math.max(0, (now - view.twirlStart) / TWIRL_MS));
    const swell = Math.sin(Math.PI * u);
    spin.spin += Math.PI * easeInOut(u);
    spin.spread = Math.max(spin.spread, swell * 0.22);
    spin.power *= 1 + swell * 0.35;
    if (u >= 1) view.twirlStart = 0;
  }
  // A working Ghost already draws every frame, so it also hovers: a slow bob and sway on
  // unrelated periods, so the path never repeats exactly.
  const hovering = view.spinning && !reducedMotion();
  return {
    ...spin,
    yaw: view.yaw,
    pitch: view.pitch,
    eyeYaw: view.yaw,
    eyePitch: view.pitch,
    blink: 1,
    bob: hovering ? Math.sin((now / HOVER_BOB_MS) * Math.PI * 2) * 0.1 : 0,
    roll: hovering ? Math.sin((now / HOVER_SWAY_MS) * Math.PI * 2) * 0.07 : 0,
  };
}

async function createStage(): Promise<Stage> {
  const [THREE, { ConvexGeometry }] = await Promise.all([
    import("three"),
    import("three/addons/geometries/ConvexGeometry.js"),
  ]);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  return { ...createGhostStage(THREE, ConvexGeometry, renderer, 21.5, 512), renderer };
}

function aim(view: View) {
  if (!pointer) return;
  const box = view.canvas.getBoundingClientRect();
  const x = (pointer.x - (box.left + box.width / 2)) / LOOK_REACH_PX;
  const y = (pointer.y - (box.top + box.height / 2)) / LOOK_REACH_PX;
  const scale = Math.min(1, 1 / Math.max(Math.hypot(x, y), 1e-6));
  view.targetYaw = x * scale;
  view.targetPitch = y * scale;
}

/** Eases the gaze toward its target; returns whether it is still moving. */
function ease(view: View, dt: number) {
  const k = 1 - Math.exp(-dt / LOOK_EASE_MS);
  view.yaw += (view.targetYaw - view.yaw) * k;
  view.pitch += (view.targetPitch - view.pitch) * k;
  const settled =
    Math.abs(view.targetYaw - view.yaw) < 0.002 && Math.abs(view.targetPitch - view.pitch) < 0.002;
  if (settled) {
    view.yaw = view.targetYaw;
    view.pitch = view.targetPitch;
  }
  return !settled;
}

function draw(view: View, now: number) {
  if (!ready) return;
  const px = Math.round(view.canvas.clientWidth * (window.devicePixelRatio || 1));
  if (px === 0) return;
  if (view.canvas.width !== px) view.canvas.width = view.canvas.height = px;
  const target = px * SUPERSAMPLE;
  if (ready.renderer.domElement.width !== target) ready.renderer.setSize(target, target, false);
  poseGhost(ready.ghost, viewPose(view, now));
  ready.renderer.render(ready.scene, ready.camera);
  view.context.clearRect(0, 0, px, px);
  view.context.drawImage(ready.renderer.domElement, 0, 0, px, px);
  view.drawn = true;
}

function tick(now: number) {
  frame = 0;
  if (!ready || document.hidden) return;
  const dt = lastFrame ? Math.min(100, now - lastFrame) : FRAME_MS;
  if (dt < FRAME_MS - 1) {
    frame = requestAnimationFrame(tick);
    return;
  }
  lastFrame = now;
  const follow = !reducedMotion();
  let moving = false;
  for (const view of views.values()) {
    if (!view.visible || view.flying) continue;
    if (pointerMoved && follow) aim(view);
    const looking = follow && ease(view, dt);
    const spinning = (view.spinning || view.twirlStart > 0) && follow;
    if (looking || spinning || !view.drawn) draw(view, now);
    moving ||= looking || spinning;
  }
  pointerMoved = false;
  if (moving) frame = requestAnimationFrame(tick);
  else lastFrame = 0;
}

function kick() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function onPointerMove(event: PointerEvent) {
  pointer = { x: event.clientX, y: event.clientY };
  pointerMoved = true;
  kick();
}

function dispose() {
  const current = ready;
  ready = null;
  stage = null;
  if (!current) return;
  current.dispose();
  current.renderer.dispose();
  current.renderer.forceContextLoss();
}

// The new-chat hero hands its renderer to the first "Working for" row, which renders it turning
// toward its landing spot, then flies those frames as compositor animations (a busy main thread
// can't make them stutter). It turns back to the companion's own gaze before landing.
const FLIGHT_WINDOW_MS = 4000;
const FLIGHT_MS = 620;
/** Frames per turn; it faces the landing spot by TURN_OUT_END of the flight, and turns back
 *  to the companion's gaze between TURN_BACK_START and TURN_BACK_END. */
const TURN_FRAMES = 6;
const TURN_OUT_END = 0.22;
const TURN_BACK_START = 0.5;
const TURN_BACK_END = 0.88;
/** The flyer and the live companion cross-fade over this long on landing. */
const LANDING_FADE_MS = 140;
/** Largest bank (degrees) into a sideways flight. */
const BANK_DEG = 10;

export interface HeroGhostHandoff {
  /** The hero's current frame. */
  snapshot(): HTMLCanvasElement;
  /** Frames of the hero turning its gaze to `yaw`/`pitch`, the last one fully turned;
   *  `size` (CSS px) renders them smaller. */
  turn(yaw: number, pitch: number, count: number, size?: number): HTMLCanvasElement[];
  release(): void;
}

let heroRect: DOMRect | null = null;
let heroFlightArmedAt = 0;
let heroFlight: {
  readonly rect: DOMRect;
  readonly handoff: HeroGhostHandoff;
  readonly first: HTMLCanvasElement;
  readonly leftAt: number;
  readonly timer: ReturnType<typeof setTimeout>;
} | null = null;

function takeHeroFlight() {
  const flight = heroFlight;
  if (flight) clearTimeout(flight.timer);
  heroFlight = null;
  return flight;
}

/** Sending the new chat's first message is the only thing that sends the hero on its way. */
export function armHeroGhostFlight() {
  heroFlightArmedAt = performance.now();
}

export function noteHeroGhost(rect: DOMRect) {
  heroRect = rect;
  stage ??= createStage();
  stage.then(
    (created) => (ready = created),
    () => (stage = null),
  );
}

/**
 * Call as the hero unmounts. When a sent message armed a flight it takes ownership of the
 * renderer (`release` frees it) and returns true; otherwise the hero keeps it.
 */
export function heroGhostLeft(handoff: HeroGhostHandoff): boolean {
  const armed = performance.now() - heroFlightArmedAt < 2000;
  heroFlightArmedAt = 0;
  takeHeroFlight()?.handoff.release();
  const rect = heroRect;
  const first = armed && rect ? handoff.snapshot() : null;
  if (!rect || !first || first.width === 0) return false;
  heroFlight = {
    rect,
    handoff,
    first,
    leftAt: performance.now(),
    timer: setTimeout(() => takeHeroFlight()?.handoff.release(), FLIGHT_WINDOW_MS),
  };
  return true;
}

function layer(canvas: HTMLCanvasElement, parent: HTMLElement, opacity: number) {
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    opacity: String(opacity),
  });
  parent.append(canvas);
}

export function flyGhostFromHero(target: HTMLCanvasElement) {
  const hero = takeHeroFlight();
  if (!hero) return;
  const from = hero.rect;
  if (performance.now() - hero.leftAt > FLIGHT_WINDOW_MS || reducedMotion() || from.width === 0) {
    return hero.handoff.release();
  }
  // The carrier holds the landing correction (the row slides while the new thread settles);
  // the flyer inside carries the flight itself, its frames swapping in as it turns.
  const carrier = document.createElement("div");
  carrier.setAttribute("aria-hidden", "true");
  Object.assign(carrier.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    pointerEvents: "none",
    zIndex: "50",
  });
  const flyer = document.createElement("div");
  Object.assign(flyer.style, {
    position: "relative",
    width: `${from.width}px`,
    height: `${from.height}px`,
    willChange: "transform",
  });
  layer(hero.first, flyer, 1);
  carrier.append(flyer);
  document.body.append(carrier);
  target.style.visibility = "hidden";
  const companion = views.get(target);
  if (companion) companion.flying = true;
  const stats = { renderMs: 0, retargets: 0, maxGapMs: 0 };
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    hero.handoff.release();
  };
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    release();
    target.style.visibility = "";
    if (companion) {
      companion.flying = false;
      companion.drawn = false;
      kick();
    }
    try {
      localStorage.setItem("ghost:last-flight", JSON.stringify({ at: Date.now(), ...stats }));
    } catch {
      // Diagnostics only.
    }
    if (!target.isConnected) return carrier.remove();
    // Cross-fade into the live companion so small render differences don't read as a swap.
    target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LANDING_FADE_MS });
    flyer
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: LANDING_FADE_MS, fill: "forwards" })
      .finished.finally(() => carrier.remove());
  };
  // Measure the landing spot once the new rows have had a frame to lay out.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!target.isConnected) return land();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      // Where the companion will be looking when it takes over (the cursor, else ahead).
      const view = views.get(target);
      const settle = { x: view?.targetYaw ?? 0, y: view?.targetPitch ?? 0 };
      const frames = [hero.first];
      const shownAt = [0];
      const renderStart = performance.now();
      try {
        const out = hero.handoff.turn(dx / distance, dy / distance, TURN_FRAMES);
        // Shown small, so rendered near the companion's own size and sharpness.
        const back = hero.handoff.turn(settle.x, settle.y, TURN_FRAMES, to.width * 2);
        out.forEach((frame, i) => {
          frames.push(frame);
          shownAt.push(((i + 1) / out.length) * TURN_OUT_END);
        });
        back.forEach((frame, i) => {
          frames.push(frame);
          shownAt.push(
            TURN_BACK_START + ((i + 1) / back.length) * (TURN_BACK_END - TURN_BACK_START),
          );
        });
      } catch {
        // No turn: it flies with the face it had.
      }
      release();
      stats.renderMs = Math.round(performance.now() - renderStart);
      if (view) {
        view.yaw = settle.x;
        view.pitch = settle.y;
        // Land in the loop's rest, the pose the flyer arrives in, with a pause before it spins.
        view.spinStart = performance.now() + FLIGHT_MS - LOOP_MS * 0.7;
      }
      frames.forEach((frame, index) => {
        if (index > 0) layer(frame, flyer, 0);
        const on = shownAt[index] ?? 0;
        const off = shownAt[index + 1] ?? 1;
        frame.animate(
          [
            { offset: 0, opacity: index === 0 ? 1 : 0 },
            { offset: on, opacity: index === 0 ? 1 : 0 },
            { offset: on, opacity: 1 },
            { offset: off, opacity: 1 },
            { offset: off, opacity: index === frames.length - 1 ? 1 : 0 },
            { offset: 1, opacity: index === frames.length - 1 ? 1 : 0 },
          ],
          { duration: FLIGHT_MS, fill: "forwards" },
        );
      });
      const scale = to.width / from.width;
      const bank = Math.max(-1, Math.min(1, dx / 400)) * BANK_DEG;
      const flight = flyer.animate(
        [
          { transform: "translate(0px, 0px) rotate(0deg) scale(1)" },
          {
            offset: 0.5,
            transform: `translate(${dx / 2}px, ${dy / 2}px) rotate(${bank}deg) scale(${(1 + scale) / 2})`,
          },
          { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${scale})` },
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
      );
      flight.onfinish = land;
      flight.oncancel = land;
      // The row can still slide while the new thread settles. Retarget only when it moves, with
      // a compositor animation, so a busy main thread never steps the Ghost along.
      let offset = { x: 0, y: 0 };
      let lastTick = 0;
      const follow = (time: number) => {
        if (landed) return;
        if (!target.isConnected) return land();
        if (lastTick) stats.maxGapMs = Math.max(stats.maxGapMs, Math.round(time - lastTick));
        lastTick = time;
        const now = target.getBoundingClientRect();
        const next = { x: now.left - to.left, y: now.top - to.top };
        if (Math.abs(next.x - offset.x) > 0.5 || Math.abs(next.y - offset.y) > 0.5) {
          const current = getComputedStyle(carrier).transform;
          const remaining = Math.max(80, FLIGHT_MS - Number(flight.currentTime ?? 0));
          for (const running of carrier.getAnimations()) running.cancel();
          carrier.animate(
            [
              { transform: current === "none" ? "translate(0px, 0px)" : current },
              { transform: `translate(${next.x}px, ${next.y}px)` },
            ],
            { duration: remaining, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
          );
          offset = next;
          stats.retargets += 1;
        }
        requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    }),
  );
}

export function twirlGhost(canvas: HTMLCanvasElement) {
  const view = views.get(canvas);
  if (!view || reducedMotion()) return;
  view.twirlStart = performance.now();
  kick();
}

/** Draws the 3D Ghost into `canvas` until the returned cleanup runs; `onFail` means no WebGL. */
export function attachLiveGhost(canvas: HTMLCanvasElement, spinning: boolean, onFail: () => void) {
  const context = canvas.getContext("2d");
  if (!context) {
    onFail();
    return () => {};
  }
  clearTimeout(disposeTimer);
  const view: View = {
    canvas,
    context,
    spinning,
    visible: false,
    drawn: false,
    spinStart: 0,
    flying: false,
    twirlStart: 0,
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
  };
  if (pointer) {
    aim(view);
    view.yaw = view.targetYaw;
    view.pitch = view.targetPitch;
  }
  views.set(canvas, view);
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const observed = views.get(entry.target);
        if (!observed) continue;
        observed.visible = entry.isIntersecting;
        if (observed.visible && !reducedMotion()) {
          // It may have scrolled in under a cursor that has since moved: face it straight away.
          aim(observed);
          observed.yaw = observed.targetYaw;
          observed.pitch = observed.targetPitch;
          observed.drawn = false;
        }
      }
      kick();
    });
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  }
  observer.observe(canvas);

  stage ??= createStage();
  let attached = true;
  stage.then(
    (created) => {
      ready = created;
      if (attached) kick();
    },
    () => {
      stage = null;
      if (attached) onFail();
    },
  );

  return () => {
    attached = false;
    views.delete(canvas);
    observer?.unobserve(canvas);
    if (views.size > 0) return;
    observer?.disconnect();
    observer = null;
    document.removeEventListener("visibilitychange", kick);
    window.removeEventListener("pointermove", onPointerMove);
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    disposeTimer = setTimeout(dispose, DISPOSE_AFTER_MS);
  };
}
