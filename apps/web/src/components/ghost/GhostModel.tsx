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
import { heroGhostLeft, noteHeroGhost } from "./liveGhost";

// A 3D Ghost (Destiny's Generalist shell) for the new-chat screen. It renders only while
// something moves (assembly, a glance, a blink, a spin), so it costs nothing at rest.

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

    void Promise.all([import("three"), import("three/addons/geometries/ConvexGeometry.js")])
      .then(([THREE, { ConvexGeometry }]) => {
        if (disposed) return;
        const size = host.clientWidth || 128;
        let renderer: InstanceType<Three["WebGLRenderer"]>;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          setFailed(true);
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(size, size);
        host.appendChild(renderer.domElement);
        noteHeroGhost(host.getBoundingClientRect());
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
        twirlRef.current = reducedMotion ? () => {} : twirl;
        const idle = () => {
          later(2000 + Math.random() * 2800, () => {
            if (!document.hidden && Date.now() > attentionUntil) {
              const roll = Math.random();
              if (roll < 0.25) look(0, 0, 700);
              else if (roll < 0.85) look(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.6, 700);
              else blink();
              animate("bob", (Math.random() - 0.5) * 0.12, 1400, easeInOut);
              if (Math.random() < 0.06) twirl();
            }
            idle();
          });
        };

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

        cleanup = () => {
          cancelAnimationFrame(frame);
          cancelAnimationFrame(pointerFrame);
          for (const timer of timers) clearTimeout(timer);
          window.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("input", onInput, true);
          tweens.clear();
          renderer.domElement.remove();
          const snapshot = () => {
            renderer.render(scene, camera);
            const copy = document.createElement("canvas");
            copy.width = renderer.domElement.width;
            copy.height = renderer.domElement.height;
            copy.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
            return copy;
          };
          // Hand the Ghost to the "Working for" companion, which turns it toward its new spot
          // and flies it there; it releases the renderer once it has the frames it needs.
          heroGhostLeft({
            snapshot,
            turn: (yaw, pitch, count) => {
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
              dispose();
              renderer.dispose();
              renderer.forceContextLoss();
            },
          });
        };
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

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
