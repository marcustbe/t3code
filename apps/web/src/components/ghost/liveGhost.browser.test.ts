import { describe, expect, it, vi } from "vite-plus/test";

import {
  armHeroGhostFlight,
  attachLiveGhost,
  flyGhostFromHero,
  heroGhostLeft,
  noteHeroGhost,
  type HeroGhostHandoff,
} from "./liveGhost";

const frame = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  return canvas;
};

function fakeHandoff() {
  return {
    snapshot: frame,
    turn: (_yaw: number, _pitch: number, count: number) => Array.from({ length: count }, frame),
    release: vi.fn(),
  } satisfies HeroGhostHandoff;
}

function companion(top: number) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    left: "40px",
    top: `${top}px`,
    width: "20px",
    height: "20px",
  });
  document.body.append(canvas);
  const detach = attachLiveGhost(canvas, true, () => {});
  return { canvas, detach };
}

const flyer = () =>
  [...document.body.children].find(
    (node): node is HTMLElement => node instanceof HTMLElement && node.style.zIndex === "50",
  );

const lastFlight = () => JSON.parse(localStorage.getItem("ghost:last-flight") ?? "null");

function heroLeaves() {
  noteHeroGhost(new DOMRect(300, 200, 128, 128));
  const handoff = fakeHandoff();
  expect(heroGhostLeft(handoff)).toBe(true);
  return handoff;
}

function reset() {
  localStorage.removeItem("ghost:last-flight");
  document.body.replaceChildren();
}

describe("hero Ghost flight", () => {
  it("flies when the companion mounts before the hero's unmount hands off", async () => {
    reset();
    armHeroGhostFlight();
    const { canvas } = companion(500);
    flyGhostFromHero(canvas); // ref runs first, same commit
    const handoff = heroLeaves();
    expect(flyer()).toBeDefined();
    expect(canvas.style.visibility).toBe("hidden");
    await vi.waitFor(() => expect(lastFlight()).not.toBeNull(), { timeout: 3000 });
    expect(lastFlight().orphaned).toBe(false);
    expect(canvas.style.visibility).toBe("");
    expect(handoff.release).toHaveBeenCalled();
  });

  it("follows a companion that remounts mid-flight instead of snapping", async () => {
    reset();
    armHeroGhostFlight();
    const handoff = heroLeaves();
    const first = companion(500);
    flyGhostFromHero(first.canvas);
    // Launched: the flyer's frames are animating.
    await vi.waitFor(() => expect(flyer()?.querySelectorAll("canvas").length).toBeGreaterThan(1));
    first.detach();
    first.canvas.remove();
    expect(lastFlight()).toBeNull();
    const second = companion(560);
    flyGhostFromHero(second.canvas);
    expect(second.canvas.style.visibility).toBe("hidden");
    await vi.waitFor(() => expect(lastFlight()).not.toBeNull(), { timeout: 3000 });
    expect(lastFlight()).toMatchObject({ adopted: 1, orphaned: false });
    expect(lastFlight().retargets).toBeGreaterThan(0);
    expect(second.canvas.style.visibility).toBe("");
    expect(handoff.release).toHaveBeenCalled();
  });
});
