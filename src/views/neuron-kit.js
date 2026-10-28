// Общие детали для видов-клеток: ветвление, трубки, стеклянная мембрана,
// тело клетки и боке на фоне. Сигналы бегут по длине ветвей от спайков.
import * as THREE from 'three'
import { SNOISE } from './noise.js'
import { MAX_SPIKES } from './spikes.js'

// mulberry32: клетка одинаковая при каждом запуске
export function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const AXIS = new THREE.Vector3()

// Отклоняет направление на angle вокруг случайной оси.
// plane: если задана нормаль плоскости, ветка остаётся в этой плоскости
function turn(direction, angle, rand, plane) {
  if (plane) {
    AXIS.copy(plane)
  } else {
    AXIS.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    AXIS.cross(direction)
    if (AXIS.lengthSq() < 1e-6) AXIS.set(0, 0, 1)
  }
  return direction.clone().applyAxisAngle(AXIS.normalize(), angle).normalize()
}

// Растит дерево ветвей. Каждая ветвь: точки, радиус в начале и в конце,
// путь от тела клетки до её начала (по нему бегут сигналы)
export function grow(rand, branches, branch, rules) {
  const { start, direction, length, radius, level = 0, path = 0 } = branch
  const points = [start.clone()]
  let point = start.clone()
  let heading = direction.clone().normalize()
  for (let step = 1; step <= 4; step++) {
    heading = turn(heading, (rand() - 0.5) * rules.bend, rand, rules.plane)
    point = point.clone().addScaledVector(heading, length / 4)
    points.push(point)
  }
  const endRadius = Math.max(rules.minRadius ?? 0.003, radius * rules.taper)
  branches.push({
    points,
    r0: radius,
    r1: endRadius,
    path,
    length,
    id: branches.length,
    rank: level < 2 ? 0 : rand()
  })
  if (level >= rules.levels) return
  const children =
    typeof rules.split === 'function' ? rules.split(level, rand) : rules.split
  for (let child = 0; child < children; child++) {
    const side = child % 2 === 0 ? 1 : -1
    grow(
      rand,
      branches,
      {
        start: point,
        direction: turn(
          heading,
          side * rules.spread * (0.6 + rand() * 0.8),
          rand,
          rules.plane
        ),
        length: length * rules.shrink * (0.75 + rand() * 0.5),
        radius: endRadius,
        level: level + 1,
        path: path + length
      },
      rules
    )
  }
}

// Одна сетка на все ветви: кольца вершин вдоль кривой, радиус сужается.
// radiusAt(t, branch) можно передать для своих профилей (миелин)
export function createTubes(
  branches,
  { radial = 7, perUnit = 70, radiusAt } = {}
) {
  const positions = []
  const normals = []
  const paths = []
  const ids = []
  const ranks = []
  const indices = []
  branches.forEach((branch) => {
    const curve = new THREE.CatmullRomCurve3(
      branch.points,
      false,
      'centripetal'
    )
    const segments = Math.max(4, Math.ceil(branch.length * perUnit))
    const frames = curve.computeFrenetFrames(segments, false)
    const base = positions.length / 3
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const center = curve.getPointAt(t)
      const r = radiusAt
        ? radiusAt(t, branch)
        : branch.r0 + (branch.r1 - branch.r0) * t
      for (let j = 0; j <= radial; j++) {
        const angle = (j / radial) * Math.PI * 2
        const normal = frames.normals[i]
          .clone()
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(frames.binormals[i], Math.sin(angle))
        positions.push(
          center.x + normal.x * r,
          center.y + normal.y * r,
          center.z + normal.z * r
        )
        normals.push(normal.x, normal.y, normal.z)
        paths.push(branch.path + branch.length * t)
        ids.push(branch.id)
        ranks.push(branch.rank)
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j
        const b = a + radial + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('aPath', new THREE.Float32BufferAttribute(paths, 1))
  geometry.setAttribute('aBranch', new THREE.Float32BufferAttribute(ids, 1))
  geometry.setAttribute('aRank', new THREE.Float32BufferAttribute(ranks, 1))
  geometry.setIndex(indices)
  return geometry
}

const SPIKE_UNIFORMS_GLSL = /* glsl */ `
uniform float uSpikeAge[${MAX_SPIKES}];
uniform vec3 uSpikeColor[${MAX_SPIKES}];
uniform float uSpikeStrength[${MAX_SPIKES}];
uniform float uSpikeSide[${MAX_SPIKES}];
uniform float uSpikeSeed[${MAX_SPIKES}];
uniform float uSpeed;
uniform float uDecay;
uniform float uSaturation;
float hash(float n) { return fract(sin(n) * 43758.5453); }
`

// Сигналы считаются в вершинах: шаг вершин вдоль ветки мельче ширины
// сигнала, а пикселей на экране намного больше, чем вершин
const MEMBRANE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSway;
uniform float uDensity;
uniform float uMaxPath;
uniform float uShare;
uniform float uStep;
uniform float uDelay;
${SPIKE_UNIFORMS_GLSL}
attribute float aPath;
attribute float aBranch;
attribute float aRank;
varying float vPath;
varying float vBranch;
varying float vVisible;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vSignal;
varying float vHead;
void main() {
  vec3 p = position;
  // кончики колышутся сильнее, чем стволы у тела клетки
  float sway = uSway * aPath * 0.03;
  p += vec3(
    sin(uTime * 0.7 + aBranch * 1.3),
    sin(uTime * 0.5 + aBranch * 2.1),
    cos(uTime * 0.6 + aBranch * 0.7)
  ) * sway;

  vec3 signal = vec3(0.0);
  float headMax = 0.0;
  for (int i = 0; i < ${MAX_SPIKES}; i++) {
    if (uSpikeAge[i] < 0.0) continue;
    // uDelay: сигнал приходит позже (дендрит после синапса)
    float age = uSpikeAge[i] - uDelay;
    if (age < 0.0) continue;
    // каждый спайк зажигает только часть ветвей
    if (hash(aBranch * 1.37 + uSpikeSeed[i] * 91.7) > uShare) continue;
    float path = uSpikeSide[i] < 0.5 ? aPath : uMaxPath - aPath;
    float front = age * uSpeed;
    // uStep > 0: сигнал прыгает от перехвата к перехвату (миелин)
    if (uStep > 0.0) front = floor(front / uStep) * uStep;
    float d = path - front;
    float head = exp(-d * d / 0.0016);
    float tail = d < 0.0 ? exp(d * 10.0) * 0.35 : 0.0;
    vec3 tint = mix(vec3(1.0), uSpikeColor[i], 0.35 + 0.65 * uSaturation);
    signal += tint * (head + tail) * uSpikeStrength[i] * exp(-age / uDecay) * 1.8;
    headMax = max(headMax, head);
  }
  vSignal = signal;
  vHead = headMax;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vPath = aPath;
  vBranch = aBranch;
  vVisible = aRank <= 0.3 + 0.7 * uDensity ? 1.0 : 0.0;
  vNormal = normalize(normalMatrix * normal);
  vView = view.xyz;
  gl_Position = projectionMatrix * view;
}
`

const MEMBRANE_FRAGMENT = /* glsl */ `
uniform vec3 uMembrane;
uniform float uGlow;
varying float vPath;
varying float vBranch;
varying float vVisible;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vSignal;
varying float vHead;
void main() {
  if (vVisible < 0.5) discard;
  float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vView))), 1.8);
  float band = 0.8 + 0.2 * sin(vPath * 90.0 + vBranch * 3.1);
  vec3 color = uMembrane * (0.22 + 0.78 * edge) * band * uGlow + vSignal;
  gl_FragColor = vec4(color, max(0.3 + 0.7 * edge, vHead));
}
`

export function createMembraneMaterial(spikeUniforms, colors, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...spikeUniforms,
      uTime: { value: 0 },
      uSway: { value: 1 },
      uDensity: { value: 1 },
      uGlow: { value: 1 },
      uMaxPath: { value: 1 },
      uShare: { value: 0.4 },
      uStep: { value: 0 },
      uDelay: { value: 0 },
      uSaturation: { value: 1 },
      uMembrane: { value: membraneColor(colors) },
      ...extra
    },
    vertexShader: MEMBRANE_VERTEX,
    fragmentShader: MEMBRANE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  })
}

// Мембрана: холодный белый со светом экрана, как стекло
export function membraneColor(colors) {
  return new THREE.Vector3(colors.ice.r, colors.ice.g, colors.ice.b).lerp(
    new THREE.Vector3(1, 1, 1),
    0.4
  )
}

const SOMA_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uBumps;
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
${SNOISE}
void main() {
  float n = snoise(normal * 2.2 + uTime * 0.15);
  vNoise = n;
  vec3 p = position + normal * n * uBumps;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = view.xyz;
  gl_Position = projectionMatrix * view;
}
`

const SOMA_FRAGMENT = /* glsl */ `
uniform vec3 uMembrane;
uniform float uGlow;
${SPIKE_UNIFORMS_GLSL}
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
void main() {
  float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vView))), 1.6);
  float fibres = 0.75 + 0.25 * sin(vNoise * 24.0);
  vec3 color = uMembrane * (0.1 + 0.9 * edge) * fibres * uGlow;
  // спайк: тело клетки вспыхивает цветом слоя
  for (int i = 0; i < ${MAX_SPIKES}; i++) {
    float age = uSpikeAge[i];
    if (age < 0.0) continue;
    vec3 tint = mix(vec3(1.0), uSpikeColor[i], 0.35 + 0.65 * uSaturation);
    color += tint * exp(-age * 6.0) * uSpikeStrength[i] * 0.35;
  }
  gl_FragColor = vec4(color, 0.3 + 0.7 * edge);
}
`

export function createSoma(
  spikeUniforms,
  colors,
  { radius, scale = [1, 1, 1], bumps = 0.12 }
) {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 5),
    new THREE.ShaderMaterial({
      uniforms: {
        ...spikeUniforms,
        uTime: { value: 0 },
        uBumps: { value: radius * bumps },
        uGlow: { value: 1 },
        uSaturation: { value: 1 },
        uMembrane: { value: membraneColor(colors) }
      },
      vertexShader: SOMA_VERTEX,
      fragmentShader: SOMA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  mesh.scale.set(...scale)
  return mesh
}

const BOKEH_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
attribute float aSize;
attribute float aSeed;
varying float vSeed;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.08 + aSeed * 6.28), cos(uTime * 0.06 + aSeed * 4.1), 0.0) * 0.08;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vSeed = aSeed;
  gl_PointSize = aSize * uPixel / -view.z;
  gl_Position = projectionMatrix * view;
}
`

const BOKEH_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // боке: мягкий диск с чуть более ярким краем
  float disc = smoothstep(0.5, 0.42, d) * (0.55 + 0.45 * smoothstep(0.15, 0.46, d));
  gl_FragColor = vec4(uColor * disc, disc * (0.12 + 0.18 * vSeed) * uAmount);
}
`

export function createBokeh(
  rand,
  colors,
  { count = 160, spread = 2.4, pixelRatio = 1 } = {}
) {
  const positions = []
  const sizes = []
  const seeds = []
  for (let i = 0; i < count; i++) {
    positions.push(
      (rand() * 2 - 1) * spread,
      (rand() * 2 - 1) * spread * 0.6,
      (rand() * 2 - 1) * spread
    )
    // большинство точек мелкие, редкие крупные: как пыль в расфокусе
    sizes.push(rand() < 0.8 ? 6 + rand() * 10 : 40 + rand() * 60)
    seeds.push(rand())
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: pixelRatio },
        uAmount: { value: 1 },
        uColor: { value: membraneColor(colors) }
      },
      vertexShader: BOKEH_VERTEX,
      fragmentShader: BOKEH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  points.frustumCulled = false
  return points
}

// Общие значения кадра для всех материалов вида
export function updateMaterials(
  materials,
  { time, look, speed, decay },
  reducedMotion
) {
  const alive =
    look.alive.reduce((sum, value) => sum + value, 0) / look.alive.length
  materials.forEach((material) => {
    const u = material.uniforms
    if (u.uTime) u.uTime.value = reducedMotion ? 0 : time
    if (u.uSway) u.uSway.value = reducedMotion ? 0 : 0.4 + look.energy
    if (u.uDensity) u.uDensity.value = look.density
    if (u.uGlow) u.uGlow.value = (0.8 + alive * 0.6) * look.dim
    if (u.uSaturation) u.uSaturation.value = look.saturation
    if (u.uAmount) u.uAmount.value = 0.4 + look.density * 0.6
    if (u.uSpeed) u.uSpeed.value = speed * 0.8
    if (u.uDecay) u.uDecay.value = decay
  })
}
