// Destiny's Generalist Ghost shell: eight near-regular tetrahedra in a front and a back layer of
// four. Front view: a square diamond split into four diamonds; side view: an X around a diamond.
// Top/bottom pieces have orange tips; left/right pieces are split by the equator slot.

export type Vec3 = readonly [number, number, number];
/** A half-space n·p <= d with a unit normal. */
export interface HalfSpace {
  readonly n: Vec3;
  readonly d: number;
}

export type ShellMaterial = "shell" | "accent" | "rail";
export interface ShellPart {
  readonly material: ShellMaterial;
  readonly spaces: readonly HalfSpace[];
  /** Unit direction the part flies out along when the shell spreads. */
  readonly direction: Vec3;
}

const DEPTH = 0.72;
const SLOT = 0.026;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Keep the side n·p <= d; normalises n. */
function halfSpace(n: Vec3, d: number): HalfSpace {
  const l = length(n);
  return { n: scale(n, 1 / l), d: d / l };
}

function tetrahedron(points: readonly Vec3[]): HalfSpace[] {
  const centroid = scale(
    points.reduce<Vec3>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0]),
    1 / points.length,
  );
  return [
    [0, 1, 2],
    [0, 1, 3],
    [0, 2, 3],
    [1, 2, 3],
  ].map(([i, j, k]) => {
    const a = points[i!]!;
    let n = cross(sub(points[j!]!, a), sub(points[k!]!, a));
    let d = dot(n, a);
    if (dot(n, centroid) > d) {
      n = scale(n, -1);
      d = -d;
    }
    return halfSpace(n, d);
  });
}

/** Corners of a bounded intersection of half-spaces. */
export function corners(spaces: readonly HalfSpace[]): Vec3[] {
  const found: Vec3[] = [];
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      for (let k = j + 1; k < spaces.length; k++) {
        const a = spaces[i]!;
        const b = spaces[j]!;
        const c = spaces[k]!;
        const bc = cross(b.n, c.n);
        const det = dot(a.n, bc);
        if (Math.abs(det) < 1e-9) continue;
        const ca = cross(c.n, a.n);
        const ab = cross(a.n, b.n);
        const p: Vec3 = [
          (bc[0] * a.d + ca[0] * b.d + ab[0] * c.d) / det,
          (bc[1] * a.d + ca[1] * b.d + ab[1] * c.d) / det,
          (bc[2] * a.d + ca[2] * b.d + ab[2] * c.d) / det,
        ];
        if (!spaces.every((s) => dot(s.n, p) <= s.d + 1e-7)) continue;
        if (found.some((q) => length(sub(p, q)) < 1e-6)) continue;
        found.push(p);
      }
    }
  }
  return found;
}

export function inset(spaces: readonly HalfSpace[], amount: number): HalfSpace[] {
  return spaces.map((s) => ({ n: s.n, d: s.d - amount }));
}

function mirror(spaces: readonly HalfSpace[], axis: 0 | 1 | 2): HalfSpace[] {
  return spaces.map((s) => {
    const n = [...s.n] as [number, number, number];
    n[axis] = -n[axis];
    return { n, d: s.d };
  });
}

function mirrorVec(v: Vec3, axis: 0 | 1 | 2): Vec3 {
  const out = [...v] as [number, number, number];
  out[axis] = -out[axis];
  return out;
}

function directionOf(spaces: readonly HalfSpace[]): Vec3 {
  const points = corners(spaces);
  const c = scale(
    points.reduce<Vec3>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0]),
    1 / Math.max(points.length, 1),
  );
  return scale(c, 1 / (length(c) || 1));
}

function topFrontParts(): ShellPart[] {
  const tip: Vec3 = [0, 1, DEPTH];
  const body = tetrahedron([tip, [0, 0, DEPTH], [-0.5, 0.5, 0], [0.5, 0.5, 0]]);
  // Eye socket: the cut climbs toward the front ridge, so the opening comes to a point there.
  const socket = halfSpace([0, -1, 0.5], 0.5 * DEPTH - 0.47);
  // The tip is cut square to the arm, which leans forward like the X in the side view.
  const tipNormal: Vec3 = [0, 0.62, 0.78];
  const tipReach = dot(scale(tipNormal, 1 / length(tipNormal)), tip);
  const flatTip = halfSpace(tipNormal, (tipReach - 0.05) * length(tipNormal));
  const capLine = tipReach - 0.2;
  const white = [...body, socket, halfSpace(tipNormal, (capLine - 0.012) * length(tipNormal))];
  const cap = [
    ...body,
    flatTip,
    halfSpace(scale(tipNormal, -1), -(capLine + 0.012) * length(tipNormal)),
  ];
  const direction = directionOf(white);
  return [
    { material: "shell", spaces: white, direction },
    { material: "accent", spaces: cap, direction },
  ];
}

function leftFrontParts(): ShellPart[] {
  const body = tetrahedron([
    [-1, 0, DEPTH],
    [0, 0, DEPTH],
    [-0.5, 0.5, 0],
    [-0.5, -0.5, 0],
  ]);
  const socket = halfSpace([1, 0, 0.3], 0.3 * DEPTH - 0.37);
  const flatTip = halfSpace([-1, 0, 0], 0.975);
  const shared = [...body, socket, flatTip];
  const direction = directionOf(shared);
  return [
    { material: "shell", spaces: [...shared, halfSpace([0, -1, 0], -SLOT)], direction },
    { material: "shell", spaces: [...shared, halfSpace([0, 1, 0], -SLOT)], direction },
    {
      // The rail inside the slot, recessed from the faces.
      material: "rail",
      spaces: [
        ...inset(body, 0.045),
        socket,
        halfSpace([-1, 0, 0], 0.93),
        halfSpace([0, -1, 0], SLOT * 0.8),
        halfSpace([0, 1, 0], SLOT * 0.8),
      ],
      direction,
    },
  ];
}

export function generalistShell(): ShellPart[] {
  const front = [...topFrontParts(), ...leftFrontParts()];
  const quarter = [
    ...front,
    // bottom = top mirrored in y, right = left mirrored in x
    ...topFrontParts().map((part) => ({
      ...part,
      spaces: mirror(part.spaces, 1),
      direction: mirrorVec(part.direction, 1),
    })),
    ...leftFrontParts().map((part) => ({
      ...part,
      spaces: mirror(part.spaces, 0),
      direction: mirrorVec(part.direction, 0),
    })),
  ];
  return [
    ...quarter,
    ...quarter.map((part) => ({
      ...part,
      spaces: mirror(part.spaces, 2),
      direction: mirrorVec(part.direction, 2),
    })),
  ];
}
