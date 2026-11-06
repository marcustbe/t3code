import { useEffect, useRef, type CSSProperties } from "react";

// A Ghost from Destiny, front view: eight shell plates around a spherical core with one eye.
// Same plate geometry as the app icon (assets/prod/app-icon.icon/Assets/ghost.svg).
const PLATES = [
  "M548 304V34l26-34 174 225.1-136 136Z",
  "M548 720v270l26 34 174-225.1-136-136Z",
  "M476 304V34L450 0 276 225.1l136 136Z",
  "M476 720v270l-26 34-174-225.1 136-136Z",
  "M720 476h270l34-26-225.1-174-136 136Z",
  "M720 548h270l34 26-225.1 174-136-136Z",
  "M304 476H34L0 450l225.1-174 136 136Z",
  "M304 548H34L0 574l225.1 174 136-136Z",
].map((d) => {
  const xs = [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)][0]!;
  const [x, y] = [Number(xs[1]) - 512, Number(xs[2]) - 512];
  const length = Math.hypot(x, y);
  return { d, dx: x / length, dy: y / length };
});

// Split-diamond pupil: four shards around the centre.
const PUPIL = [
  "M520 504V462l42 42Z",
  "M504 504V462l-42 42Z",
  "M520 520v42l42-42Z",
  "M504 520v42l-42-42Z",
];

const EYE_TRAVEL = 46;
const SHELL_TILT_DEG = 7;
const SPREAD = 26;

export function GhostMark({ className }: { className?: string | undefined }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shellRef = useRef<SVGGElement>(null);
  const eyeRef = useRef<SVGGElement>(null);
  const lidRef = useRef<SVGGElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives the eye from timers, the pointer and typing; transitions run only on each glance, never a continuous animation
  useEffect(() => {
    const svg = svgRef.current;
    const shell = shellRef.current;
    const eye = eyeRef.current;
    const lid = lidRef.current;
    if (!svg || !shell || !eye || !lid) return;

    const look = (x: number, y: number) => {
      const length = Math.hypot(x, y);
      const scale = length > 1 ? 1 / length : 1;
      eye.style.transform = `translate(${x * scale * EYE_TRAVEL}px, ${y * scale * EYE_TRAVEL}px)`;
      shell.style.transform = `rotate(${x * scale * SHELL_TILT_DEG}deg)`;
    };
    const spread = (open: boolean) => {
      svg.dataset.spread = open ? "true" : "false";
    };

    // Assemble on arrival: the plates start apart and close in.
    spread(true);
    const assemble = requestAnimationFrame(() => requestAnimationFrame(() => spread(false)));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => cancelAnimationFrame(assemble);
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
    const idle = () => {
      later(1800 + Math.random() * 2600, () => {
        if (!document.hidden && Date.now() > attentionUntil) {
          const roll = Math.random();
          if (roll < 0.25) look(0, 0);
          else if (roll < 0.85) look(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.7);
          else blink();
          if (Math.random() < 0.08) chirp();
        }
        idle();
      });
    };
    const blink = () => {
      lid.style.transform = "scaleY(0.08)";
      later(130, () => {
        lid.style.transform = "";
      });
    };
    const chirp = () => {
      spread(true);
      later(260, () => spread(false));
    };

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = svg.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const reach = Math.max(box.width * 4, 1);
        look(dx / reach, dy / reach);
        attentionUntil = Date.now() + 2500;
      });
    };
    // Typing in the composer below: glance down at it.
    const onInput = () => {
      look(0, 0.9);
      attentionUntil = Date.now() + 1800;
    };

    idle();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("input", onInput, true);
    return () => {
      cancelAnimationFrame(assemble);
      cancelAnimationFrame(frame);
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("input", onInput, true);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="-40 -40 1104 1104"
      fill="none"
      stroke="currentColor"
      strokeWidth={24}
      strokeLinejoin="round"
      aria-hidden="true"
      data-ghost-mark=""
      className={className}
    >
      <g ref={shellRef} data-ghost-part="shell">
        {PLATES.map(({ d, dx, dy }) => (
          <path
            key={d}
            d={d}
            data-ghost-part="plate"
            style={
              {
                "--spread-x": `${dx * SPREAD}px`,
                "--spread-y": `${dy * SPREAD}px`,
              } as CSSProperties
            }
          />
        ))}
      </g>
      <circle cx="512" cy="512" r="148" className="fill-foreground/6" />
      <g ref={eyeRef} data-ghost-part="eye" className="text-ghost-eye">
        <g ref={lidRef} data-ghost-part="lid">
          <circle cx="512" cy="512" r="100" fill="currentColor" fillOpacity={0.12} stroke="none" />
          <circle cx="512" cy="512" r="80" stroke="currentColor" strokeWidth={14} />
          {PUPIL.map((d) => (
            <path key={d} d={d} fill="currentColor" stroke="none" />
          ))}
        </g>
      </g>
    </svg>
  );
}
