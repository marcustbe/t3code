import type { GhostPetChat } from "@t3tools/contracts";
import { msg } from "gt-react";
import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

import {
  createGhostStage,
  easeInOut,
  easeOut,
  type GhostPose,
} from "../components/ghost/ghostScene";
import { poseGhost } from "../components/ghost/ghostScene";
import { m } from "../i18n/messages";
import "./pet.css";

// The desktop's floating Ghost pet (GhostPetWindow.ts): the new-chat Ghost with its idle life, one
// spin when a chat finishes, and a bubble when a chat finishes or needs you.

interface PetBridge {
  onUpdate: (listener: (update: unknown) => void) => () => void;
  send: (message: unknown) => void;
}
type Update =
  | {
      type: "state";
      chats: GhostPetChat[];
      side: "left" | "right";
      ghost: number;
      edge: number;
    }
  | { type: "cursor"; dx: number; dy: number };
type Mood = "idle" | "working" | "needs" | "done" | "failed";

const bridge = (window as unknown as { ghostPet?: PetBridge }).ghostPet;
const CANVAS = 76;
const LOOK_REACH = 700;
/** Share of the new-chat Ghost's full turn: on a whole screen the cursor is nearly always far. */
const MAX_LOOK = 0.35;
const EVENT_MS = 8000;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(CANVAS, CANVAS);
const { scene, camera, ghost } = createGhostStage(THREE, ConvexGeometry, renderer, 21.5, 512);

const EYES = {
  needs: ["#ff9d2e", "#ffe2bd", "255, 150, 40"],
  done: ["#3ddc6a", "#d2ffdf", "60, 220, 110"],
  failed: ["#ff4a4a", "#ffd0d0", "255, 70, 70"],
} as const;

/** Same drawing as eyeGlyph() in ghostScene.ts, in another colour. */
function glyphTexture([outer, inner, rgb]: readonly [string, string, string]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const c = 128;
  const r = 78;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.shadowColor = `rgba(${rgb}, 0.95)`;
  g.shadowBlur = 22;
  for (const [width, color] of [
    [17, outer],
    [8, inner],
  ] as const) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(c - 9, c - r + 12);
    g.lineTo(c - r + 4, c);
    g.lineTo(c - 9, c + r - 12);
    g.moveTo(c + 9, c - r + 12);
    g.lineTo(c + r - 4, c);
    g.lineTo(c + 9, c + r - 12);
    g.moveTo(c, c - r + 2);
    g.lineTo(c, c - 26);
    g.moveTo(c, c + 26);
    g.lineTo(c, c + r - 2);
    g.stroke();
    g.beginPath();
    g.arc(c, c, 17, 0, Math.PI * 2);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(rgb: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `rgba(${rgb}, 0.75)`);
  gradient.addColorStop(0.35, `rgba(${rgb}, 0.22)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const eyeParts: {
  glyph: InstanceType<typeof THREE.MeshBasicMaterial> | null;
  glow: InstanceType<typeof THREE.SpriteMaterial> | null;
  spill: InstanceType<typeof THREE.PointLight> | null;
} = { glyph: null, glow: null, spill: null };
ghost.eye.traverse((object) => {
  if (object instanceof THREE.Sprite) eyeParts.glow = object.material;
  else if (object instanceof THREE.PointLight) eyeParts.spill = object;
  else if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial)
    eyeParts.glyph = object.material;
});
const cyan = {
  glyph: eyeParts.glyph?.map ?? null,
  glow: eyeParts.glow?.map ?? null,
  spill: eyeParts.spill?.color.clone() ?? null,
};
const eyeTextures = new Map<keyof typeof EYES, { glyph: THREE.Texture; glow: THREE.Texture }>();
let eyeColour: keyof typeof EYES | null = null;

function setEye(colour: keyof typeof EYES | null) {
  const { glyph: glyphMaterial, glow: glowMaterial, spill } = eyeParts;
  if (colour === eyeColour || !glyphMaterial || !glowMaterial) return;
  eyeColour = colour;
  if (colour === null) {
    glyphMaterial.map = cyan.glyph;
    glowMaterial.map = cyan.glow;
    if (cyan.spill) spill?.color.copy(cyan.spill);
  } else {
    let textures = eyeTextures.get(colour);
    if (!textures) {
      textures = { glyph: glyphTexture(EYES[colour]), glow: glowTexture(EYES[colour][2]) };
      eyeTextures.set(colour, textures);
    }
    glyphMaterial.map = textures.glyph;
    glowMaterial.map = textures.glow;
    spill?.color.set(EYES[colour][0]);
  }
  glyphMaterial.needsUpdate = glowMaterial.needsUpdate = true;
  kick();
}

// Pose and tweens as in GhostModel.tsx.
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
type Key = keyof GhostPose;
const tweens = new Map<
  Key,
  { from: number; to: number; start: number; duration: number; ease: (t: number) => number }
>();
let frame = 0;
let mood: Mood = "idle";
let attentionUntil = 0;

function tick(now: number) {
  frame = 0;
  for (const [name, tween] of tweens) {
    const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
    state[name] = tween.from + (tween.to - tween.from) * tween.ease(t);
    if (t >= 1) tweens.delete(name);
  }
  poseGhost(ghost, state);
  renderer.render(scene, camera);
  if (tweens.size > 0) frame = requestAnimationFrame(tick);
}
function kick() {
  if (!frame) frame = requestAnimationFrame(tick);
}
function animate(name: Key, to: number, duration: number, ease = easeOut, delay = 0) {
  tweens.set(name, { from: state[name], to, start: performance.now() + delay, duration, ease });
  kick();
}
function look(x: number, y: number, duration: number) {
  const length = Math.hypot(x, y);
  const s = length > 1 ? 1 / length : 1;
  animate("yaw", x * s, duration * 1.3);
  animate("pitch", y * s, duration * 1.3);
  animate("eyeYaw", x * s, duration);
  animate("eyePitch", y * s, duration);
  animate("roll", -x * s * 0.14, duration * 1.8, easeInOut);
}
const later = (ms: number, run: () => void) => setTimeout(run, ms);
function blink() {
  animate("blink", 0.06, 80);
  later(100, () => animate("blink", 1, 160));
}
function twirl() {
  animate("spin", state.spin + Math.PI, 1000, easeInOut);
  animate("spread", 0.22, 380);
  later(420, () => animate("spread", 0, 600, easeInOut));
  animate("power", 1.35, 300);
  later(700, () => animate("power", 1, 500));
}
function tilt() {
  const side = Math.random() < 0.5 ? -1 : 1;
  look(side * (0.3 + Math.random() * 0.4) * MAX_LOOK, -0.1, 600);
  animate("roll", side * -(0.2 + Math.random() * 0.12), 650, easeInOut);
  later(1400 + Math.random() * 800, () => animate("roll", -state.yaw * 0.14, 900, easeInOut));
}
function breathe() {
  animate("spread", 0.07, 900, easeInOut);
  animate("power", 1.12, 900, easeInOut);
  later(950, () => {
    animate("spread", 0, 1100, easeInOut);
    animate("power", 1, 1100, easeInOut);
  });
}
function resettle() {
  const turn = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.12);
  animate("spin", state.spin + turn, 700, easeInOut);
  animate("spread", 0.05, 350);
  later(420, () => animate("spread", 0, 700, easeInOut));
  later(900 + Math.random() * 600, () => animate("spin", state.spin - turn, 900, easeInOut));
}
/** Calling for attention: looks straight out while its eye flares and plates pop open. */
function call() {
  look(0, 0, 400);
  animate("power", 1.5, 220);
  animate("spread", 0.16, 220);
  later(260, () => {
    animate("power", 1, 600, easeInOut);
    animate("spread", 0, 600, easeInOut);
  });
}
function idle() {
  later(1800 + Math.random() * 2400, () => {
    if (!dragging && Date.now() > attentionUntil) {
      if (mood === "needs") call();
      else {
        const roll = Math.random();
        if (roll < 0.25) look(0, 0, 700);
        else if (roll < 0.62)
          look((Math.random() * 2 - 1) * MAX_LOOK, (Math.random() * 2 - 1) * 0.6 * MAX_LOOK, 700);
        else if (roll < 0.76) tilt();
        else if (roll < 0.86) breathe();
        else if (roll < 0.93) resettle();
        else blink();
      }
    }
    idle();
  });
}

function setMood(next: Mood) {
  if (next === mood) return;
  mood = next;
  setEye(next === "needs" || next === "done" || next === "failed" ? next : null);
  if (next === "needs") call();
  kick();
}

const root = document.getElementById("pet")!;
const ghostBox = document.createElement("div");
ghostBox.className = "pet-ghost";
renderer.domElement.className = "pet-canvas";
ghostBox.append(renderer.domElement);
const bubble = document.createElement("div");
bubble.className = "pet-bubble";
bubble.hidden = true;
root.append(ghostBox, bubble);

let chats: GhostPetChat[] = [];
let previous: Map<string, GhostPetChat["state"]> | null = null;
let event: { chats: GhostPetChat[]; until: number } | null = null;
let eventTimer: ReturnType<typeof setTimeout> | undefined;
let hovering = false;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let side: "left" | "right" = "right";

const keyOf = (chat: GhostPetChat) => `${chat.environmentId}\u0000${chat.threadId}`;
const label = (state: GhostPetChat["state"]) =>
  state === "working"
    ? m(msg("Working"))
    : state === "needs"
      ? m(msg("Needs you"))
      : state === "done"
        ? m(msg("Done"))
        : m(msg("Failed"));
const eventLabel = (state: GhostPetChat["state"]) =>
  state === "needs"
    ? m(msg("Needs your answer"))
    : state === "done"
      ? m(msg("Finished"))
      : m(msg("Failed"));
const RANK: Record<GhostPetChat["state"], number> = { needs: 3, failed: 2, done: 1, working: 0 };

function layout(ghostSize: number, edge: number) {
  ghostBox.style.width = ghostBox.style.height = `${ghostSize}px`;
  ghostBox.style.left = side === "right" ? "" : `${edge}px`;
  ghostBox.style.right = side === "right" ? `${edge}px` : "";
  bubble.style.left = side === "right" ? "" : `${edge + ghostSize + 4}px`;
  bubble.style.right = side === "right" ? `${edge + ghostSize + 4}px` : "";
  bubble.style.maxWidth = `${window.innerWidth - ghostSize - edge * 2 - 8}px`;
}

function open(chat: GhostPetChat | null) {
  if (chat)
    bridge?.send({ type: "open", environmentId: chat.environmentId, threadId: chat.threadId });
  else bridge?.send({ type: "reveal" });
  event = null;
  render();
}

function row(chat: GhostPetChat) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pet-row";
  button.dataset.state = chat.state;
  const dot = document.createElement("span");
  dot.className = "pet-dot";
  const title = document.createElement("span");
  title.className = "pet-title";
  title.textContent = chat.title;
  const status = document.createElement("span");
  status.className = "pet-status";
  status.textContent = label(chat.state);
  button.append(dot, title, status);
  button.addEventListener("click", () => open(chat));
  return button;
}

function render() {
  bubble.replaceChildren();
  if (hovering) {
    bubble.dataset.mode = "list";
    if (chats.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pet-empty";
      empty.textContent = m(msg("All quiet"));
      bubble.append(empty);
    } else {
      for (const chat of chats.slice(0, 7)) bubble.append(row(chat));
      if (chats.length > 7) {
        const more = document.createElement("div");
        more.className = "pet-empty";
        more.textContent = m(msg("+{count} more"), { count: String(chats.length - 7) });
        bubble.append(more);
      }
    }
    bubble.hidden = false;
    return;
  }
  if (event) {
    bubble.dataset.mode = "event";
    const first = event.chats[0]!;
    const top = event.chats.reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a));
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pet-event";
    card.dataset.state = top.state;
    const dot = document.createElement("span");
    dot.className = "pet-dot";
    const text = document.createElement("span");
    text.className = "pet-event-text";
    const headline = document.createElement("span");
    headline.className = "pet-headline";
    const detail = document.createElement("span");
    detail.className = "pet-detail";
    if (event.chats.length === 1) {
      headline.textContent = first.title;
      detail.textContent = eventLabel(first.state);
    } else {
      const count = String(event.chats.length);
      headline.textContent =
        top.state === "needs"
          ? m(msg("{count} chats need you"), { count })
          : m(msg("{count} chats updated"), { count });
      detail.textContent = event.chats.map((chat) => chat.title).join(", ");
    }
    text.append(headline, detail);
    card.append(dot, text);
    card.addEventListener("click", () => open(top));
    bubble.append(card);
    bubble.hidden = false;
    return;
  }
  bubble.hidden = true;
}

function announce(next: GhostPetChat[]) {
  const before = previous;
  previous = new Map(next.map((chat) => [keyOf(chat), chat.state]));
  if (!before) return;
  const hits = next.filter((chat) => {
    const was = before.get(keyOf(chat));
    if (chat.state === "needs") return was !== "needs";
    if (chat.state === "done" || chat.state === "failed")
      return was === "working" || was === "needs";
    return false;
  });
  if (hits.length === 0) return;
  // No spinning while chats work; one turn when one finishes.
  if (hits.some((chat) => chat.state === "done")) twirl();
  event = { chats: hits, until: Date.now() + EVENT_MS };
  clearTimeout(eventTimer);
  eventTimer = setTimeout(() => {
    event = null;
    render();
  }, EVENT_MS);
}

function applyState(next: GhostPetChat[]) {
  chats = next.toSorted((a, b) => RANK[b.state] - RANK[a.state]);
  announce(next);
  const states = new Set(next.map((chat) => chat.state));
  setMood(
    states.has("needs")
      ? "needs"
      : states.has("working")
        ? "working"
        : states.has("failed")
          ? "failed"
          : states.has("done")
            ? "done"
            : "idle",
  );
  render();
}

let interactive = false;
let dragging = false;
let press: { x: number; y: number } | null = null;

function setInteractive(value: boolean) {
  if (value === interactive) return;
  interactive = value;
  bridge?.send({ type: "interactive", value });
}

function overGhost(x: number, y: number) {
  const box = ghostBox.getBoundingClientRect();
  const radius = box.width * 0.4;
  return Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2)) <= radius;
}
function overBubble(x: number, y: number) {
  if (bubble.hidden) return false;
  const box = bubble.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function setHovering(value: boolean) {
  clearTimeout(hoverTimer);
  if (value) {
    if (!hovering) {
      hovering = true;
      render();
    }
    return;
  }
  // A short grace period lets the pointer cross from the Ghost into the list.
  hoverTimer = setTimeout(() => {
    hovering = false;
    render();
  }, 250);
}

document.addEventListener("mousemove", (event) => {
  if (dragging) return;
  const onGhost = overGhost(event.clientX, event.clientY);
  const onBubble = overBubble(event.clientX, event.clientY);
  setInteractive(onGhost || onBubble);
  setHovering(onGhost || (hovering && onBubble));
});
document.addEventListener("mouseleave", () => {
  if (dragging) return;
  setInteractive(false);
  setHovering(false);
});

ghostBox.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  ghostBox.setPointerCapture(event.pointerId);
  press = { x: event.screenX, y: event.screenY };
});
ghostBox.addEventListener("pointermove", (event) => {
  if (!press || dragging) return;
  if (Math.hypot(event.screenX - press.x, event.screenY - press.y) < 4) return;
  dragging = true;
  hovering = false;
  render();
  bridge?.send({ type: "drag-start" });
});
ghostBox.addEventListener("pointerup", () => {
  if (!press) return;
  press = null;
  if (dragging) {
    dragging = false;
    bridge?.send({ type: "drag-end" });
    return;
  }
  twirl();
  const urgent = chats.find((chat) => chat.state !== "working") ?? null;
  open(urgent);
});
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (overGhost(event.clientX, event.clientY)) bridge?.send({ type: "menu" });
});

bridge?.onUpdate((raw) => {
  const update = raw as Update;
  if (update.type === "cursor") {
    if (dragging || hovering) return;
    let x = update.dx / LOOK_REACH;
    let y = update.dy / LOOK_REACH;
    const length = Math.hypot(x, y);
    if (length > MAX_LOOK) {
      x *= MAX_LOOK / length;
      y *= MAX_LOOK / length;
    }
    look(x, y, 320);
    attentionUntil = Date.now() + 2500;
    return;
  }
  side = update.side;
  layout(update.ghost, update.edge);
  applyState(update.chats);
});

// Boot: the shell closes around the core while turning, then the eye lights up.
poseGhost(ghost, state);
animate("spread", 0, 1100, easeInOut);
animate("spin", 0, 1100, easeInOut);
animate("power", 1, 500, easeOut, 750);
idle();
later(2600, blink);

// Headless checks (desktop test harness): render one frame now and hand it back.
Object.assign(window, {
  ghostPetSnapshot: () => {
    tick(performance.now());
    return renderer.domElement.toDataURL("image/png");
  },
  ghostPetDebug: { applyState, setHovering, twirl },
});
