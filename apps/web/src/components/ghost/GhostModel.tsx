import { useEffect, useRef, useState } from "react";

import { GhostMark } from "../GhostMark";
import {
  createGhostStage,
  easeInOut,
  easeOut,
  poseGhost,
  type GhostPose,
  type Three,
} from "./ghostScene";
import { heroGhostLeft, noteHeroGhost, type HeroGhostHandoff } from "./liveGhost";

// A 3D Ghost (Destiny's Generalist shell) for the new-chat screen. It renders only while
// something moves (assembly, a glance, a blink, a spin), so it costs nothing at rest.

interface HeroGhost {
  /** Puts the Ghost in `host` and starts its idle life; returns what takes it out again. */
  attach(host: HTMLDivElement): () => void;
  twirl(): void;
  handoff: HeroGhostHandoff;
}

// Picking another project on the new-chat page opens that project's draft, which remounts the page.
// The Ghost waits here briefly so the new page adopts it as it is instead of booting a second one.
const PARK_MS = 1000;
let parked: { ghost: HeroGhost; timer: ReturnType<typeof setTimeout> } | null = null;

function takeParked(): HeroGhost | null {
  const entry = parked;
  if (!entry) return null;
  clearTimeout(entry.timer);
  parked = null;
  return entry.ghost;
}

function park(ghost: HeroGhost) {
  takeParked()?.handoff.release();
  parked = { ghost, timer: setTimeout(() => takeParked()?.handoff.release(), PARK_MS) };
}

function createHeroGhost(
  THREE: Three,
  ConvexGeometry: Parameters<typeof createGhostStage>[1],
  size: number,
): HeroGhost | null {
  let renderer: InstanceType<Three["WebGLRenderer"]>;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size, size);
  const { scene, camera, ghost, dispose } = createGhostStage(THREE, ConvexGeometry, renderer);

  const state: GhostPose = {
    yaw: 0,
    pitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
    spread: 1,
    spin: -Math.PI / 2,
    power: 0,
    blink: 1,
    bob: 0,
    roll: 0,
  };
  const pose = () => poseGhost(ghost, state);

  type Key = keyof GhostPose;
  const tweens = new Map<
    Key,
    { from: number; to: number; start: number; duration: number; ease: (t: number) => number }
  >();
  let frame = 0;
  const tick = (now: number) => {
    frame = 0;
    for (const [name, tween] of tweens) {
      const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
      state[name] = tween.from + (tween.to - tween.from) * tween.ease(t);
      if (t >= 1) tweens.delete(name);
    }
    pose();
    renderer.render(scene, camera);
    if (tweens.size > 0) frame = requestAnimationFrame(tick);
  };
  const animate = (name: Key, to: number, duration: number, ease = easeOut, delay = 0) => {
    tweens.set(name, {
      from: state[name],
      to,
      start: performance.now() + delay,
      duration,
      ease,
    });
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const look = (x: number, y: number, duration: number) => {
    const length = Math.hypot(x, y);
    const s = length > 1 ? 1 / length : 1;
    animate("yaw", x * s, duration * 1.3);
    animate("pitch", y * s, duration * 1.3);
    animate("eyeYaw", x * s, duration);
    animate("eyePitch", y * s, duration);
    // It leans its head into a sideways look, a beat after the eye gets there.
    animate("roll", -x * s * 0.14, duration * 1.8, easeInOut);
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    Object.assign(state, { spread: 0, spin: 0, power: 1 });
    pose();
    renderer.render(scene, camera);
  } else {
    pose();
    // Boot: the shell closes around the core while turning, then the eye lights up.
    animate("spread", 0, 1100, easeInOut);
    animate("spin", 0, 1100, easeInOut);
    animate("power", 1, 500, easeOut, 750);
  }

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };
  let attentionUntil = 0;
  const blink = () => {
    animate("blink", 0.06, 80);
    later(100, () => animate("blink", 1, 160));
  };
  const twirl = () => {
    animate("spin", state.spin + Math.PI, 1000, easeInOut);
    animate("spread", 0.22, 380);
    later(420, () => animate("spread", 0, 600, easeInOut));
    animate("power", 1.35, 300);
    later(700, () => animate("power", 1, 500));
  };
  // Idle life after the Ghost in Destiny: it glances around, cocks its head at things, lets its
  // shell plates breathe open and shut, and now and then turns its shell to resettle it.
  const tilt = () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    look(side * (0.3 + Math.random() * 0.4), -0.15 - Math.random() * 0.2, 600);
    animate("roll", side * -(0.2 + Math.random() * 0.12), 650, easeInOut);
    later(1400 + Math.random() * 800, () => animate("roll", -state.yaw * 0.14, 900, easeInOut));
  };
  const breathe = () => {
    animate("spread", 0.07, 900, easeInOut);
    animate("power", 1.12, 900, easeInOut);
    later(950, () => {
      animate("spread", 0, 1100, easeInOut);
      animate("power", 1, 1100, easeInOut);
    });
  };
  const resettle = () => {
    const turn = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.12);
    animate("spin", state.spin + turn, 700, easeInOut);
    animate("spread", 0.05, 350);
    later(420, () => animate("spread", 0, 700, easeInOut));
    later(900 + Math.random() * 600, () => animate("spin", state.spin - turn, 900, easeInOut));
  };
  const idle = () => {
    later(1800 + Math.random() * 2400, () => {
      if (!document.hidden && Date.now() > attentionUntil) {
        const roll = Math.random();
        if (roll < 0.2) look(0, 0, 700);
        else if (roll < 0.62) look(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.6, 700);
        else if (roll < 0.76) tilt();
        else if (roll < 0.86) breathe();
        else if (roll < 0.93) resettle();
        else blink();
        if (Math.random() < 0.04) twirl();
      }
      idle();
    });
  };

  const snapshot = () => {
    renderer.render(scene, camera);
    const copy = document.createElement("canvas");
    copy.width = renderer.domElement.width;
    copy.height = renderer.domElement.height;
    copy.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
    return copy;
  };

  let attachedOnce = false;
  const attach = (host: HTMLDivElement) => {
    host.appendChild(renderer.domElement);
    // The float itself is a compositor animation on the canvas (index.css), so it costs no frames.
    renderer.domElement.setAttribute("data-ghost-hover", "");
    noteHeroGhost(host.getBoundingClientRect());
    // An adopted Ghost picks up where it was: finish the tweens it was in the middle of.
    if (attachedOnce && tweens.size > 0 && !frame) frame = requestAnimationFrame(tick);
    attachedOnce = true;

    let pointerFrame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const box = host.getBoundingClientRect();
        noteHeroGhost(box);
        const reach = Math.max(box.width * 3.5, 1);
        look(
          (event.clientX - (box.left + box.width / 2)) / reach,
          (event.clientY - (box.top + box.height / 2)) / reach,
          320,
        );
        attentionUntil = Date.now() + 2500;
      });
    };
    // Typing in the composer below: glance down at it.
    const onInput = () => {
      noteHeroGhost(host.getBoundingClientRect());
      look(0, 0.9, 360);
      attentionUntil = Date.now() + 1800;
    };

    if (!reducedMotion) {
      idle();
      later(2600, blink);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("input", onInput, true);
    }

    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
      cancelAnimationFrame(pointerFrame);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("input", onInput, true);
      renderer.domElement.remove();
    };
  };

  return {
    attach,
    twirl: reducedMotion ? () => {} : twirl,
    handoff: {
      snapshot,
      turn: (yaw, pitch, count, size) => {
        tweens.clear();
        if (size) renderer.setSize(size, size, false);
        const from = { ...state };
        const frames: HTMLCanvasElement[] = [];
        for (let i = 1; i <= count; i += 1) {
          const t = easeInOut(i / count);
          state.yaw = from.yaw + (yaw - from.yaw) * t;
          state.pitch = from.pitch + (pitch - from.pitch) * t;
          state.eyeYaw = from.eyeYaw + (yaw - from.eyeYaw) * t;
          state.eyePitch = from.eyePitch + (pitch - from.eyePitch) * t;
          pose();
          frames.push(snapshot());
        }
        return frames;
      },
      release: () => {
        tweens.clear();
        dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      },
    },
  };
}

// React Compiler cannot lower `import()` inside a component, so the lazy load lives out here.
const loadThree = () =>
  Promise.all([import("three"), import("three/addons/geometries/ConvexGeometry.js")]);

export function GhostModel({ className }: { className?: string | undefined }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const twirlRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns a WebGL renderer and pointer/typing listeners; frames render only while an animation is in flight
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    const start = (ghost: HeroGhost) => {
      const detach = ghost.attach(host);
      twirlRef.current = ghost.twirl;
      cleanup = () => {
        detach();
        // Hand the Ghost to the "Working for" companion, which turns it toward its new spot and
        // flies it there; with no message sent, park it for the next new-chat page to adopt.
        if (!heroGhostLeft(ghost.handoff)) park(ghost);
      };
    };

    const adopted = takeParked();
    if (adopted) {
      start(adopted);
    } else {
      void loadThree()
        .then(([THREE, { ConvexGeometry }]) => {
          if (disposed) return;
          const ghost = createHeroGhost(THREE, ConvexGeometry, host.clientWidth || 128);
          if (!ghost) {
            setFailed(true);
            return;
          }
          start(ghost);
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    }

    return () => {
      disposed = true;
      twirlRef.current = () => {};
      cleanup();
    };
  }, []);

  if (failed) return <GhostMark className={className} />;
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      onClick={() => twirlRef.current()}
    />
  );
}
