// Нейроны-шары из мягких точек: по оболочке текут холмы шума (две октавы).
// Шары связаны линиями, по линиям бегут импульсы. Всё плывёт вправо.
// Нота слоя зажигает шар этого слоя и пускает сигналы к соседям.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { softMaterial } from './background.js'

const NEURONS = 12
const SURFACE = 3600
const SEGMENTS = 20
const MAX_SIGNALS = 160
const REFRACTORY = 0.6
// сколько шаров в кадре у каждого режима
const ACTIVE = { flight: 10, stream: 8, field: 7, cascade: 8 }
// скорость сноса вправо
const DRIFT = { flight: 0.12, stream: 0.9, field: 0.25, cascade: 0.18 }
// длина, на которой линия гаснет: в полёте связи только с ближними
const REACH = { flight: 7, stream: 16, field: 16, cascade: 16 }

// 3D simplex noise (Ashima Arts, MIT)
const SNOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

const BALL_VERTEX = /* glsl */ `
${SNOISE}
uniform vec3 uCenter[${NEURONS}];
uniform float uRadius[${NEURONS}];
uniform float uFlash[${NEURONS}];
uniform vec3 uFlashColor[${NEURONS}];
uniform float uAlive[${NEURONS}];
uniform float uFade[${NEURONS}];
uniform float uTime;
uniform float uStream;
uniform float uWave;
uniform float uSize;
uniform float uDensity;
uniform float uSaturation;
uniform float uDim;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uCursor;
uniform float uActivity;
attribute float aNeuron;
attribute float aDepth;
attribute float aRank;
attribute float aScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  int n = int(aNeuron);
  vec3 direction = position;
  // холмы: крупная октава и мелкая, текут по поверхности вправо
  vec3 flow = direction * 1.6 + vec3(-uStream, 0.0, aNeuron * 3.7);
  float hill = snoise(flow + uTime * 0.15)
    + 0.4 * snoise(flow * 2.0 + uTime * 0.3);
  float height = smoothstep(-0.9, 1.1, hill);
  vec3 world = uCenter[n] + direction * uRadius[n] * (aDepth + hill * uWave);

  // курсор раздвигает точки
  vec3 toPoint = world - uCursor;
  float fall = smoothstep(0.7, 0.0, length(toPoint));
  world += normalize(toPoint + vec3(0.0001)) * fall * 0.3 * uActivity;
  vec4 view = viewMatrix * vec4(world, 1.0);

  vec3 base = mix(uLow, uHigh, height) * (0.55 + uAlive[n] * 0.7) * uDim;
  vec3 tint = mix(vec3(0.8), uFlashColor[n], 0.4 + 0.6 * uSaturation);
  vColor = base + tint * uFlash[n] * (0.4 + height) * 0.9;
  vAlpha = (aRank < uDensity ? 0.5 : 0.0) * (0.45 + 0.55 * height) * uFade[n];

  gl_PointSize = max(1.5, uSize * aScale / -view.z);
  gl_Position = projectionMatrix * view;
}
`

// Импульсы на линиях: цвет и размер у каждой точки свои
const SPARK_VERTEX = /* glsl */ `
uniform float uPixel;
attribute vec3 aColor;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor;
  vAlpha = 1.0;
  gl_PointSize = aSize * uPixel / -view.z;
  gl_Position = projectionMatrix * view;
}
`

// Точки оболочки: сфера Фибоначчи, 90 % у поверхности, 10 % внутри
function buildBalls() {
  const count = NEURONS * SURFACE
  const positions = new Float32Array(count * 3)
  const attributes = {
    aNeuron: new Float32Array(count),
    aDepth: new Float32Array(count),
    aRank: new Float32Array(count),
    aScale: new Float32Array(count)
  }
  const golden = Math.PI * (3 - Math.sqrt(5))
  let i = 0
  for (let neuron = 0; neuron < NEURONS; neuron++) {
    for (let k = 0; k < SURFACE; k++) {
      const y = 1 - (2 * (k + 0.5)) / SURFACE
      const ring = Math.sqrt(1 - y * y)
      const angle = k * golden + neuron
      positions.set([Math.cos(angle) * ring, y, Math.sin(angle) * ring], i * 3)
      attributes.aNeuron[i] = neuron
      attributes.aDepth[i] =
        Math.random() < 0.9
          ? 0.82 + 0.18 * Math.sqrt(Math.random())
          : 0.2 + Math.random() * 0.6
      attributes.aRank[i] = Math.random()
      attributes.aScale[i] = 0.6 + Math.random() * 0.7
      i++
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  Object.entries(attributes).forEach(([key, array]) =>
    geometry.setAttribute(key, new THREE.BufferAttribute(array, 1))
  )
  return geometry
}

// Точки с цветом и размером, позиции пишет JS каждый кадр
function createSparks(count, pixel) {
  const positions = new Float32Array(count * 3).fill(999)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const points = new THREE.Points(
    geometry,
    softMaterial({ uPixel: { value: pixel } }, SPARK_VERTEX)
  )
  points.frustumCulled = false
  return { points, positions, colors, sizes, geometry }
}

export function createSwarm(
  { renderer, colors, reducedMotion, pointer },
  mode
) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80)
  const focus = new THREE.Vector3(0, 0.3, mode === 'flight' ? -6 : -4)
  camera.position.set(0, 0.3, 3)

  // мышь: крутить ракурс, правой кнопкой или с Shift двигать, колесом ближе
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(focus)
  controls.enableDamping = true
  controls.enablePan = true
  controls.screenSpacePanning = true
  controls.minDistance = 1.5
  controls.maxDistance = 12
  controls.update()

  const neurons = Array.from({ length: NEURONS }, (_, index) => ({
    position: new THREE.Vector3(0, 0, 99),
    home: new THREE.Vector3(),
    radius: 0.5,
    bound: 6,
    layer: index % 6,
    fired: -Infinity,
    color: colors.layers[index % 6],
    seed: Math.random() * 100,
    active: false
  }))

  const pixel = renderer.getPixelRatio()
  const uniforms = {
    uCenter: { value: neurons.map((neuron) => neuron.position) },
    uRadius: { value: new Array(NEURONS).fill(0.5) },
    uFlash: { value: new Array(NEURONS).fill(0) },
    uFlashColor: { value: neurons.map(() => new THREE.Vector3(1, 1, 1)) },
    uAlive: { value: new Array(NEURONS).fill(0) },
    uFade: { value: new Array(NEURONS).fill(0) },
    uTime: { value: 0 },
    uStream: { value: 0 },
    uWave: { value: 0.12 },
    uSize: { value: 20 * pixel },
    uDensity: { value: 1 },
    uSaturation: { value: 1 },
    uDim: { value: 1 },
    uLow: { value: new THREE.Color() },
    uHigh: { value: new THREE.Color() },
    uCursor: { value: new THREE.Vector3(0, 0, 99) },
    uActivity: { value: 0 }
  }
  const balls = new THREE.Points(
    buildBalls(),
    softMaterial(uniforms, BALL_VERTEX)
  )
  balls.frustumCulled = false
  scene.add(balls)

  // все пары шаров: линия, постоянный импульс и сигналы от спайков
  let pairs = []
  const maxPairs = (NEURONS * (NEURONS - 1)) / 2
  const linePositions = new Float32Array(maxPairs * SEGMENTS * 6)
  const lineColors = new Float32Array(maxPairs * SEGMENTS * 6)
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(linePositions, 3)
  )
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  lines.frustumCulled = false
  scene.add(lines)

  const sparks = createSparks(maxPairs + MAX_SIGNALS, pixel)
  scene.add(sparks.points)
  const signals = []

  // половина видимой ширины и высоты на расстоянии depth от камеры
  function viewHalf(depth) {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth
    return [h * camera.aspect, h]
  }

  let spread = 0

  // полёт: шар рождается вдали в коридоре над панелью, чуть левее,
  // потому что по пути его сносит вправо
  function spawnFlight(neuron, z) {
    neuron.position.set(
      (Math.random() * 2 - 1.3) * 2,
      0.3 + (1 - spread) + (Math.random() * 2 - 1) * 0.9,
      z
    )
  }

  function place(neuron, index) {
    const count = ACTIVE[mode]
    neuron.active = index < count
    if (!neuron.active) return
    if (mode === 'flight') {
      spawnFlight(neuron, -16 + (index / count) * 15)
      neuron.radius = 0.45 + Math.random() * 0.25
      return
    }
    // остальные режимы: ряды по ширине кадра, снос вправо по кругу
    const depth =
      mode === 'stream'
        ? 5.5 + ((index * 0.53) % 1) * 4
        : 6.8 + ((index * 0.37) % 1) * 1.2
    const [w, h] = viewHalf(depth)
    const step = (2 * w + 2) / count
    neuron.bound = w + 1
    neuron.home.set(
      -w - 1 + (index + 0.5) * step,
      0.3 + h * (index % 2 ? 0.05 : 0.4) + ((index * 0.71) % 1) * h * 0.1,
      3 - depth
    )
    // при скрытой панели нижний ряд уходит вниз, на освободившееся место
    neuron.drop = h * (index % 2 ? 0.6 : 0.15)
    neuron.position.copy(neuron.home)
    neuron.radius =
      Math.min(0.8, step * 0.3) * (0.85 + ((index * 0.29) % 1) * 0.3)
  }

  function layout() {
    neurons.forEach(place)
    const active = neurons.filter((neuron) => neuron.active)
    pairs = []
    active.forEach((a, i) =>
      active.slice(i + 1).forEach((b) =>
        pairs.push({
          a,
          b,
          axis: new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
          ).normalize(),
          phase: Math.random(),
          rank: Math.random(),
          rate: 0.12 + Math.random() * 0.12,
          forward: Math.random() < 0.5,
          strength: 0,
          from: new THREE.Vector3(),
          to: new THREE.Vector3(),
          bend: new THREE.Vector3()
        })
      )
    )
    linePositions.fill(0)
    lineColors.fill(0)
  }

  // точка на изогнутой линии пары, t от 0 (шар a) до 1 (шар b)
  function curve(pair, t, out) {
    return out
      .copy(pair.from)
      .lerp(pair.to, t)
      .addScaledVector(pair.bend, Math.sin(t * Math.PI))
  }

  // спайк зажигает шар и пускает сигналы ко всем соседям
  function fire(neuron, color, now, strength = 1, generation = 0) {
    if (now - neuron.fired < REFRACTORY) return
    neuron.fired = now
    neuron.color = color
    neuron.strength = strength
    pairs.forEach((pair) => {
      if (pair.a !== neuron && pair.b !== neuron) return
      if (pair.strength < 0.02) return
      if (signals.length >= MAX_SIGNALS) return
      signals.push({
        pair,
        forward: pair.a === neuron,
        born: now,
        t: 0,
        color,
        strength,
        generation
      })
    })
  }

  const seen = new WeakSet()
  const point = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const lineColor = new THREE.Color()
  const low = new THREE.Color()
  const high = new THREE.Color()
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane()
  const normal = new THREE.Vector3()
  const hit = new THREE.Vector3()
  let time = 0
  // clock: время движения, стоит, пока сеть спит
  let clock = 0
  let stream = 0

  function update({ dt, target, look, speed, spikes }) {
    const motion = reducedMotion ? 0.15 : 1
    // до звука шары стоят, со звуком плывут
    const live = motion * look.wake
    time += dt
    clock += dt * live
    const drift = dt * speed * (0.45 + look.energy * 0.7) * live
    stream += drift * 0.6
    spread += ((target.panelHidden ? 1 : 0) - spread) * (1 - Math.exp(-dt * 2))

    // ноты слоёв: спайк зажигает шар своего слоя
    spikes.spikes.forEach((spike) => {
      if (seen.has(spike)) return
      seen.add(spike)
      const candidates = neurons.filter(
        (neuron) => neuron.active && neuron.layer === spike.layer
      )
      if (!candidates.length) return
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      fire(target, colors.layers[spike.layer], time, spike.strength)
    })

    neurons.forEach((neuron, index) => {
      if (!neuron.active) {
        uniforms.uFade.value[index] = 0
        return
      }
      let fade = 1
      if (mode === 'flight') {
        neuron.position.z += drift * 1.4
        neuron.position.x += drift * DRIFT.flight
        if (neuron.position.z > 1.5) spawnFlight(neuron, -15)
        const distance = camera.position.distanceTo(neuron.position)
        fade =
          THREE.MathUtils.smoothstep(distance, 2.4, 4.4) *
          (1 - THREE.MathUtils.smoothstep(distance, 13, 18))
      } else {
        // снос вправо, у правого края шар тает и выходит слева
        const parallax = mode === 'stream' ? 7 / (3 - neuron.home.z) : 1
        neuron.home.x += drift * DRIFT[mode] * parallax
        if (neuron.home.x > neuron.bound) neuron.home.x -= 2 * neuron.bound
        neuron.position.set(
          neuron.home.x + Math.sin(clock * 0.2 + neuron.seed) * 0.12 * motion,
          neuron.home.y -
            neuron.drop * spread +
            Math.cos(clock * 0.17 + neuron.seed) * 0.1 * motion,
          neuron.home.z
        )
        fade =
          1 -
          THREE.MathUtils.smoothstep(
            Math.abs(neuron.home.x),
            neuron.bound - 1.4,
            neuron.bound
          )
      }
      neuron.fade = fade
      const age = time - neuron.fired
      uniforms.uFade.value[index] = fade
      uniforms.uFlash.value[index] = Math.exp(-age * 3) * (neuron.strength ?? 1)
      // свой ритм дыхания у каждого шара или общий вдох с кругом «Дыхание»
      const breath =
        target.breath === null
          ? Math.sin(clock * speed + neuron.seed) * 0.04
          : (target.breath - 0.5) * 0.14
      uniforms.uRadius.value[index] = neuron.radius * (1 + breath)
      uniforms.uAlive.value[index] = look.alive[neuron.layer]
      uniforms.uFlashColor.value[index].set(
        neuron.color.r,
        neuron.color.g,
        neuron.color.b
      )
    })

    // линии между всеми шарами: от поверхности до поверхности, с изгибом
    low.copy(colors.signal).lerp(colors.quiet, 1 - look.saturation)
    pairs.forEach((pair, index) => {
      direction.subVectors(pair.b.position, pair.a.position)
      const length = direction.length()
      direction.divideScalar(length || 1)
      pair.from.copy(pair.a.position).addScaledVector(direction, pair.a.radius)
      pair.to.copy(pair.b.position).addScaledVector(direction, -pair.b.radius)
      pair.bend
        .crossVectors(direction, pair.axis)
        .normalize()
        .multiplyScalar(length * 0.12)
      // угасание связей: к концу сета остаются связи с малым rank
      const kept = target.prune
        ? 1 -
          THREE.MathUtils.smoothstep(
            pair.rank,
            look.links - 0.08,
            look.links + 0.08
          )
        : 1
      pair.strength =
        Math.min(pair.a.fade, pair.b.fade) *
        (1 - THREE.MathUtils.smoothstep(length, 1.5, REACH[mode])) *
        kept *
        look.dim
      lineColor
        .copy(pair.a.color)
        .lerp(pair.b.color, 0.5)
        .lerp(colors.ice, 0.5 + 0.5 * (1 - look.saturation))
        .multiplyScalar(0.22 * pair.strength * (0.5 + 0.5 * look.wake))
      for (let s = 0; s < SEGMENTS; s++) {
        const offset = (index * SEGMENTS + s) * 6
        curve(pair, s / SEGMENTS, point).toArray(linePositions, offset)
        curve(pair, (s + 1) / SEGMENTS, point).toArray(
          linePositions,
          offset + 3
        )
        lineColor.toArray(lineColors, offset)
        lineColor.toArray(lineColors, offset + 3)
      }
    })
    lineGeometry.setDrawRange(0, pairs.length * SEGMENTS * 2)
    lineGeometry.attributes.position.needsUpdate = true
    lineGeometry.attributes.color.needsUpdate = true

    // постоянные импульсы: по одному на линию, бегут в свою сторону
    sparks.positions.fill(999)
    pairs.forEach((pair, index) => {
      let t = (pair.phase + clock * pair.rate * speed) % 1
      if (!pair.forward) t = 1 - t
      curve(pair, t, point).toArray(sparks.positions, index * 3)
      lineColor
        .copy(colors.ice)
        .multiplyScalar(0.7 * pair.strength * Math.sin(t * Math.PI) * look.wake)
        .toArray(sparks.colors, index * 3)
      sparks.sizes[index] = 36
    })

    // сигналы спайков цветом слоя; в каскаде приход зажигает соседа
    for (let i = signals.length - 1; i >= 0; i--) {
      const signal = signals[i]
      const length = signal.pair.from.distanceTo(signal.pair.to)
      signal.t = ((time - signal.born) * speed) / (0.5 + length * 0.18)
      if (signal.t < 1) continue
      signals.splice(i, 1)
      const next = signal.forward ? signal.pair.b : signal.pair.a
      const chance = Math.pow(0.7, signal.generation + 1)
      if (mode === 'cascade' && signal.generation < 4 && Math.random() < chance)
        fire(
          next,
          signal.color,
          time,
          signal.strength * 0.85,
          signal.generation + 1
        )
    }
    signals.forEach((signal, index) => {
      const t = signal.forward ? signal.t : 1 - signal.t
      const slot = pairs.length + index
      curve(signal.pair, t, point).toArray(sparks.positions, slot * 3)
      lineColor
        .copy(signal.color)
        .multiplyScalar(signal.strength * signal.pair.strength * 1.4)
        .toArray(sparks.colors, slot * 3)
      sparks.sizes[slot] = 64
    })
    sparks.geometry.attributes.position.needsUpdate = true
    sparks.geometry.attributes.aColor.needsUpdate = true
    sparks.geometry.attributes.aSize.needsUpdate = true

    high.copy(colors.ice).lerp(colors.quiet, (1 - look.saturation) * 0.5)
    uniforms.uLow.value.copy(low).multiplyScalar(0.6)
    uniforms.uHigh.value.copy(high)
    uniforms.uTime.value = clock
    uniforms.uStream.value = stream
    uniforms.uWave.value = 0.08 + look.energy * 0.1
    uniforms.uDensity.value = look.density
    uniforms.uSaturation.value = look.saturation
    // во сне свет слабый и медленно дышит
    const breath = 1 + (1 - look.wake) * 0.14 * Math.sin(time * 0.9)
    uniforms.uDim.value = look.dim * (0.45 + 0.55 * look.wake) * breath

    // курсор раздвигает точки там, куда указывает
    controls.update()
    camera.getWorldDirection(normal)
    plane.setFromNormalAndCoplanarPoint(normal, controls.target)
    raycaster.setFromCamera(pointer.ndc, camera)
    if (raycaster.ray.intersectPlane(plane, hit))
      uniforms.uCursor.value.lerp(hit, 0.12)
    uniforms.uActivity.value = pointer.activity
  }

  function resize(width, height) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    layout()
  }

  return {
    scene,
    camera,
    update,
    resize,
    dispose: () => controls.dispose()
  }
}

export const createFlight = (context) => createSwarm(context, 'flight')
export const createStream = (context) => createSwarm(context, 'stream')
export const createField = (context) => createSwarm(context, 'field')
export const createCascade = (context) => createSwarm(context, 'cascade')
