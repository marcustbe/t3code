import { useState, type CSSProperties } from "react";

import { attachLiveGhost, flyGhostFromHero, twirlGhost } from "./liveGhost";

// The Ghost mark as a small icon (the "Thinking" indicator). Shapes after justrealmilk's
// public-domain Destiny icon. It animates only inside a live row, through the
// --visible-animation-state that observeVisibleAnimation sets ([data-ghost-glyph] in index.css).
// Each plate carries its outward direction so the shell can part along its own axes.
const PLATES = [
  { d: "M506 734v265l-51 25-176-265 139-140 88 115z", x: -0.22, y: 0.98 },
  { d: "M291 519H25L0 569l266 178 138-139-113-89z", x: -0.98, y: 0.22 },
  { d: "M506 291V25L455 0 279 267l139 139 88-115z", x: -0.22, y: -0.98 },
  { d: "M292 505H26L1 456l264-178 139 139-113 88z", x: -0.98, y: -0.22 },
  { d: "M519 734v265l50 25 177-265-139-140-88 115z", x: 0.22, y: 0.98 },
  { d: "M733 518h266l25 51-266 177-138-140 113-88z", x: 0.98, y: 0.22 },
  { d: "M519 291V25l50-25 177 267-139 139-88-115z", x: 0.22, y: -0.98 },
  { d: "M732 506h266l25-51-265-177-139 140 113 88z", x: 0.98, y: -0.22 },
];

/** The one 3D Ghost companion (liveGhost.ts); `spinning` is the working motion. Falls back to the
 *  flat mark without WebGL. */
export function CompanionGhost({
  className,
  spinning = false,
}: {
  className?: string | undefined;
  spinning?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const attach = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const detach = attachLiveGhost(canvas, spinning, () => setFailed(true));
    if (spinning) flyGhostFromHero(canvas);
    return detach;
  };
  if (failed) return <GhostGlyph className={className} still={!spinning} />;
  return (
    <canvas
      ref={attach}
      aria-hidden="true"
      className={className}
      onClick={(event) => twirlGhost(event.currentTarget)}
    />
  );
}

// `still` drops the animation hook: the mark as a plain icon (Ghost's own timeline rows, which
// would otherwise spin like "Thinking" while live).
export function GhostGlyph({
  className,
  still = false,
}: {
  className?: string | undefined;
  still?: boolean;
}) {
  return (
    <svg
      viewBox="-24 -24 1072 1072"
      overflow="visible"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      className={className}
      {...(still ? {} : { "data-ghost-glyph": "" })}
    >
      <g data-ghost-glyph-part="shell">
        {PLATES.map(({ d, x, y }) => (
          <path
            key={d}
            d={d}
            data-ghost-glyph-part="plate"
            style={{ "--part-x": `${x * 70}px`, "--part-y": `${y * 70}px` } as CSSProperties}
          />
        ))}
      </g>
      <g data-ghost-glyph-part="eye">
        <path
          fillRule="evenodd"
          d="M512 407a112 112 0 1 1 0 224 112 112 0 0 1 0-224Zm0 34a78 78 0 1 0 0 156 78 78 0 0 0 0-156Z"
        />
        <circle cx="512" cy="519" r="34" />
      </g>
    </svg>
  );
}
