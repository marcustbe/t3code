import { corners, generalistShell, inset, type ShellMaterial, type Vec3 } from "./ghostShell";

// The 3D Ghost scene shared by the new-chat hero (GhostModel) and the baked "Thinking" sprite.

export type Three = typeof import("three");
export type ConvexGeometryConstructor =
  typeof import("three/addons/geometries/ConvexGeometry.js").ConvexGeometry;

const EDGE_RADIUS = 0.02;

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function eyeGlyph(THREE: Three) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  const r = 78;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.shadowColor = "rgba(64, 196, 255, 0.95)";
  g.shadowBlur = 22;
  for (const [width, color] of [
    [17, "#38c6ff"],
    [8, "#c9f3ff"],
  ] as const) {
    g.strokeStyle = color;
    g.lineWidth = width;
    // Two chevrons that make a diamond, split by the vertical bar.
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

function glowTexture(THREE: Three) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(90, 205, 255, 0.75)");
  gradient.addColorStop(0.35, "rgba(90, 205, 255, 0.22)");
  gradient.addColorStop(1, "rgba(90, 205, 255, 0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface ShellPartGeometry {
  readonly material: ShellMaterial;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  readonly direction: Vec3;
}

// The hulls take a moment to compute, so every new-chat mount reuses the first result.
let shellGeometryCache: ShellPartGeometry[] | null = null;

function shellGeometry(THREE: Three, ConvexGeometry: ConvexGeometryConstructor) {
  if (shellGeometryCache) return shellGeometryCache;
  // Rounded solids: the inset hull grown back by a small sphere at every corner.
  const raw = new THREE.IcosahedronGeometry(EDGE_RADIUS, 2).getAttribute("position");
  const offsets = new Map<string, Vec3>();
  for (let i = 0; i < raw.count; i++) {
    const offset: Vec3 = [raw.getX(i), raw.getY(i), raw.getZ(i)];
    offsets.set(offset.map((v) => v.toFixed(5)).join(), offset);
  }
  shellGeometryCache = generalistShell().map((part, index) => {
    const points: InstanceType<Three["Vector3"]>[] = [];
    for (const [x, y, z] of corners(inset(part.spaces, EDGE_RADIUS))) {
      for (const [dx, dy, dz] of offsets.values()) {
        points.push(new THREE.Vector3(x + dx, y + dy, z + dz));
      }
    }
    const hull = new ConvexGeometry(points);
    const position = hull.getAttribute("position").array as Float32Array;
    const normal = hull.getAttribute("normal").array as Float32Array;
    // Baked occlusion: surfaces darken toward the core (socket walls, inner faces), and each
    // piece gets a slightly different tone like separately painted parts.
    const tone = 1 - ((index * 5) % 7) * 0.006;
    const color = new Float32Array(position.length);
    for (let i = 0; i < position.length; i += 3) {
      const r = Math.hypot(position[i]!, position[i + 1]!, position[i + 2]!);
      const t = Math.min(1, Math.max(0, (r - 0.38) / 0.44));
      const light = (0.4 + 0.6 * t ** 0.8) * tone;
      color[i] = color[i + 1] = color[i + 2] = light;
    }
    hull.dispose();
    return { material: part.material, position, normal, color, direction: part.direction };
  });
  return shellGeometryCache;
}

/** A dark studio with softboxes, so the flat facets pick up clean gradient reflections. */
function studioEnvironment(THREE: Three) {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(14, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x17191c, side: THREE.BackSide }),
    ),
  );
  const panel = (width: number, height: number, color: number, power: number, at: Vec3) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(power),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(...at);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(4.5, 3.5, 0xfffaf5, 7.5, [-3.2, 3.6, 4.2]); // key softbox, above left
  panel(1.3, 6, 0xe6efff, 4, [5.2, 0.4, 1.2]); // cool strip, right
  panel(6.5, 1.2, 0xffffff, 3.2, [0.4, 4.4, -4]); // rim strip, above behind
  panel(9, 9, 0xd2d4d8, 0.6, [0, -5.5, 1]); // floor bounce
  return scene;
}

export type Ghost = ReturnType<typeof buildGhost>;

function buildGhost(THREE: Three, ConvexGeometry: ConvexGeometryConstructor) {
  const materials: Record<ShellMaterial, InstanceType<Three["MeshStandardMaterial"]>> = {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xeeeeec,
      roughness: 0.5,
      metalness: 0.04,
      clearcoat: 0.45,
      clearcoatRoughness: 0.32,
      vertexColors: true,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: 0xf6841b,
      roughness: 0.44,
      metalness: 0.05,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      vertexColors: true,
    }),
    rail: new THREE.MeshStandardMaterial({
      color: 0x2a2e34,
      roughness: 0.3,
      metalness: 0.85,
      vertexColors: true,
    }),
  };

  const body = new THREE.Group();
  const shell = new THREE.Group();
  const parts = shellGeometry(THREE, ConvexGeometry).map((part) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(part.normal, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(part.color, 3));
    const mesh = new THREE.Mesh(geometry, materials[part.material]);
    mesh.castShadow = mesh.receiveShadow = true;
    shell.add(mesh);
    return { mesh, direction: new THREE.Vector3(...part.direction) };
  });
  body.add(shell);

  // Core: a dark sphere with the eye barrel on its front.
  const core = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 48, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x1e2125,
      roughness: 0.34,
      metalness: 0.7,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    }),
  );
  sphere.castShadow = sphere.receiveShadow = true;
  core.add(sphere);
  // The socket narrows toward the back, so the collar is a cone that widens toward the front.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.245, 0.26, 48, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.38, metalness: 0.65 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.47;
  barrel.receiveShadow = true;
  core.add(barrel);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.258, 0.02, 16, 64),
    new THREE.MeshStandardMaterial({ color: 0xb6bcc4, roughness: 0.18, metalness: 1 }),
  );
  bezel.position.z = 0.602;
  bezel.receiveShadow = true;
  core.add(bezel);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.242, 64),
    // Unlit: a glossy lens caught the key and spill lights as small white dots.
    new THREE.MeshBasicMaterial({ color: 0x040507 }),
  );
  lens.position.z = 0.603;
  core.add(lens);

  const eye = new THREE.Group();
  eye.position.z = 0.61;
  const glyphMaterial = new THREE.MeshBasicMaterial({
    map: eyeGlyph(THREE),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), glyphMaterial);
  eye.add(glyph);
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture(THREE),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.setScalar(0.46);
  glow.position.z = 0.02;
  eye.add(glow);
  // A faint cyan spill on the bezel and collar; short range so it never reaches the shell.
  const spill = new THREE.PointLight(0x58cfff, 0.35, 0.42, 2);
  spill.position.z = 0.06;
  eye.add(spill);
  core.add(eye);

  // Glass dome over the lens, holding only the eye's faint cyan light (no reflections).
  const domeHeight = 0.1;
  const domeBase = 0.25;
  const domeRadius = (domeBase ** 2 + domeHeight ** 2) / (2 * domeHeight);
  const domeGeometry = new THREE.SphereGeometry(
    domeRadius,
    64,
    24,
    0,
    Math.PI * 2,
    0,
    Math.asin(domeBase / domeRadius),
  );
  domeGeometry.rotateX(Math.PI / 2);
  domeGeometry.translate(0, 0, lens.position.z + domeHeight - domeRadius);
  const innerLightMaterial = new THREE.MeshBasicMaterial({
    color: 0x3fb8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const innerLight = new THREE.Mesh(domeGeometry, innerLightMaterial);
  innerLight.scale.setScalar(0.985);
  innerLight.renderOrder = 2;
  core.add(innerLight);
  body.add(core);

  return {
    body,
    shell,
    parts,
    core,
    eye,
    setPower(power: number) {
      glyphMaterial.opacity = power;
      glowMaterial.opacity = power * 0.9;
      spill.intensity = power * 0.35;
      innerLightMaterial.opacity = power * 0.11;
    },
  };
}

export interface GhostPose {
  yaw: number;
  pitch: number;
  eyeYaw: number;
  eyePitch: number;
  spread: number;
  spin: number;
  power: number;
  blink: number;
  bob: number;
}

export function poseGhost(ghost: Ghost, state: GhostPose) {
  ghost.body.rotation.set(state.pitch * 0.34, state.yaw * 0.55, 0);
  ghost.body.position.y = state.bob;
  // The core turns inside the shell, so the eye looks further than the body turns.
  ghost.core.rotation.set(state.eyePitch * 0.12, state.eyeYaw * 0.12, 0, "YXZ");
  ghost.shell.rotation.z = state.spin;
  for (const part of ghost.parts) {
    part.mesh.position.copy(part.direction).multiplyScalar(state.spread * 0.42);
  }
  ghost.eye.scale.y = state.blink;
  ghost.setPower(state.power);
}

/** Renderer settings, studio light and camera around the Ghost; `fov` frames it. Small icons
 *  pass a smaller shadow map. */
export function createGhostStage(
  THREE: Three,
  ConvexGeometry: ConvexGeometryConstructor,
  renderer: InstanceType<Three["WebGLRenderer"]>,
  fov = 22,
  shadowMapSize = 1024,
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = studioEnvironment(THREE);
  const environment = pmrem.fromScene(studio, 0.035).texture;
  studio.traverse((object) => {
    const mesh = object as Partial<InstanceType<Three["Mesh"]>>;
    mesh.geometry?.dispose();
    (mesh.material as { dispose?: () => void } | undefined)?.dispose?.();
  });
  scene.environment = environment;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
  camera.position.set(0, 0, 7);

  // Key light matches the key softbox and casts the shadows; rim separates the silhouette.
  const key = new THREE.DirectionalLight(0xfffaf4, 2.3);
  key.position.set(-2.6, 3.6, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7 });
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe4ecff, 0.5);
  fill.position.set(3, -1.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.5);
  rim.position.set(1.2, 3, -4);
  scene.add(rim);

  const ghost = buildGhost(THREE, ConvexGeometry);
  scene.add(ghost.body);

  return {
    scene,
    camera,
    ghost,
    dispose() {
      scene.traverse((object) => {
        const mesh = object as Partial<InstanceType<Three["Mesh"]>>;
        mesh.geometry?.dispose();
        const material = mesh.material as
          | { dispose?: () => void; map?: { dispose: () => void } | null }
          | undefined;
        material?.map?.dispose();
        material?.dispose?.();
      });
      environment.dispose();
      pmrem.dispose();
    },
  };
}
