// «Мембрана»: большая сфера из ровной сетки точек, по ней текут холмы шума,
// края светятся (как на референсе со сферой). На оболочке живёт сеть:
// ключевые нейроны и дуги связей, по дугам бегут импульсы.
// Звук: бочка пускает по оболочке кольцевую волну с той стороны, куда
// повёрнута панорама; бас раздувает сферу; пэд поднимает холмы и красит
// оболочку; мелодия зажигает нейрон на высоте ноты; перкуссия искрит
// нейронами; фон (треск) вспыхивает отдельными точками сетки.
// Тон всех слоёв меняет мелкость холмов, простор: как долго идёт волна.
import * as THREE from 'three'
import { SNOISE } from '../views/atmosphere.js'
import { glowMaterial, PALETTE_GLSL } from './common.js'
import { createGraph, nearest, uniqueLinks, fireNotes } from './graph.js'
import { KICK, BASS, PAD, TEXTURE, LAYERS } from './hearing.js'

const RADIUS = 8
const RIPPLES = 8

const LATTICE_VERTEX = /* glsl */ `
${SNOISE}
${PALETTE_GLSL}
uniform float uTime;
uniform float uNow;
uniform float uRadius;
uniform float uWave;
uniform float uDetail;
uniform float uSwell;
uniform float uPixel;
uniform float uDim;
uniform float uSaturation;
uniform float uDensity;
uniform float uCrackle;
uniform float uCrackleSeed;
uniform float uRippleSpeed;
uniform float uRippleDecay;
uniform vec4 uRipples[${RIPPLES}];
uniform vec3 uRippleColor[${RIPPLES}];
uniform float uRippleStrength[${RIPPLES}];
uniform vec3 uDeep;
uniform vec3 uRim;
uniform vec3 uIce;
uniform vec3 uTint;
uniform float uTintAmount;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 n = normalize(position);
  float wave = snoise(n * uDetail + vec3(0.0, uTime * 0.12, uTime * 0.08));
  // кольцевые волны: фронт уходит от точки удара по дуге оболочки
  float ring = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    float age = uNow - uRipples[i].w;
    if (age < 0.0 || age > 8.0) continue;
    float angle = acos(clamp(dot(n, uRipples[i].xyz), -1.0, 1.0));
    float front = (angle - age * uRippleSpeed) / 0.2;
    float amount = exp(-front * front) * exp(-age / uRippleDecay) * uRippleStrength[i];
    ring += amount;
    tint += uRippleColor[i] * amount;
  }
  float radius = uRadius * (1.0 + wave * 0.045 * uWave + ring * 0.07 + uSwell);
  vec4 mv = modelViewMatrix * vec4(n * radius, 1.0);
  vec3 normal = normalize(normalMatrix * n);
  float rim = 1.0 - abs(dot(normal, normalize(-mv.xyz)));
  float pop = uCrackle * step(0.97, fract(aSeed * 91.7 + uCrackleSeed));
  vec3 base = mix(uDeep, uRim, pow(rim, 2.2) + max(wave, 0.0) * 0.25 * uWave);
  base = mix(base, calm(uTint, uIce, uSaturation), uTintAmount * 0.6);
  vColor = base + tint * 0.9 + uRim * pop;
  float visible = step(aSeed, uDensity);
  vAlpha = (0.08 + uTintAmount * 0.12 + pow(rim, 3.0) * 0.75 + ring * 0.7 + pop) * visible * uDim;
  gl_PointSize = (1.3 + rim * 1.4 + ring * 2.0 + pop * 3.0) * uPixel * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

// сетка широт: в каждом ряду точек столько, чтобы шаг был ровным
function latticeGeometry() {
  const position = []
  const seed = []
  const rows = 120
  for (let row = 1; row < rows; row++) {
    const polar = (row / rows) * Math.PI
    const columns = Math.max(6, Math.round(240 * Math.sin(polar)))
    for (let col = 0; col < columns; col++) {
      const azimuth = (col / columns) * Math.PI * 2 + row * 0.13
      position.push(
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth)
      )
      seed.push(Math.random())
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(position, 3)
  )
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  return geometry
}

// нейроны на оболочке и дуги между соседями, выгнутые по сфере
function membraneNetwork() {
  const neurons = []
  const direction = new THREE.Vector3()
  for (let i = 0; i < 640; i++) {
    direction
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
    neurons.push({
      position: direction.clone().multiplyScalar(RADIUS * 1.025),
      layer: i % LAYERS,
      hub: Math.random() < 0.1,
      u: direction.x,
      v: direction.y
    })
  }
  const points = neurons.map(({ position }) => position)
  const pairs = []
  nearest(points, 4, 3).forEach((list, a) =>
    list.slice(0, neurons[a].hub ? 4 : 2).forEach((b) => pairs.push({ a, b }))
  )
  const links = uniqueLinks(pairs).map(({ a, b }) => {
    const middle = points[a].clone().add(points[b]).multiplyScalar(0.5)
    // середина дуги на оболочке, чуть над ней
    const bend = middle
      .clone()
      .setLength(RADIUS * 1.06)
      .sub(middle)
    return { a, b, bend }
  })
  return { neurons, links }
}

export function createMembrane({ scene, renderer, colors }) {
  const group = new THREE.Group()
  group.position.y = 1.2
  group.rotation.x = 0.28
  scene.add(group)

  const uniforms = {
    uTime: { value: 0 },
    uNow: { value: 0 },
    uRadius: { value: RADIUS },
    uWave: { value: 1 },
    uDetail: { value: 1.8 },
    uSwell: { value: 0 },
    uPixel: { value: renderer.getPixelRatio() },
    uDim: { value: 1 },
    uSaturation: { value: 1 },
    uDensity: { value: 1 },
    uCrackle: { value: 0 },
    uCrackleSeed: { value: 0 },
    uRippleSpeed: { value: 1.1 },
    uRippleDecay: { value: 1.5 },
    uRipples: {
      value: Array.from(
        { length: RIPPLES },
        () => new THREE.Vector4(0, 0, 1, -99)
      )
    },
    uRippleColor: {
      value: Array.from({ length: RIPPLES }, () => new THREE.Color())
    },
    uRippleStrength: { value: new Array(RIPPLES).fill(0) },
    uDeep: { value: colors.signal.clone().multiplyScalar(0.45) },
    uRim: { value: colors.ice.clone().lerp(colors.layers[PAD], 0.35) },
    uIce: { value: colors.ice.clone() },
    uTint: { value: colors.layers[PAD].clone() },
    uTintAmount: { value: 0 }
  }
  const lattice = new THREE.Points(
    latticeGeometry(),
    glowMaterial(uniforms, LATTICE_VERTEX)
  )
  lattice.frustumCulled = false
  group.add(lattice)

  const { neurons, links } = membraneNetwork()
  const graph = createGraph({ renderer, colors }, neurons, links, {
    dots: 14,
    size: 5,
    dot: 2.2,
    edgeBase: 0.16,
    speed: 3.2,
    spread: 0.6,
    turning: true,
    span: RADIUS
  })
  group.add(graph.group)

  let now = 0
  let next = 0
  const toCamera = new THREE.Vector3()
  const inverse = new THREE.Quaternion()
  // волна по оболочке: начинается со стороны, куда повёрнута панорама
  function ripple(note) {
    toCamera
      .set(note.pan * 0.9, 0.2 + (Math.random() - 0.5) * 0.5, 1)
      .normalize()
    inverse.copy(group.quaternion).invert()
    toCamera.applyQuaternion(inverse)
    uniforms.uRipples.value[next].set(toCamera.x, toCamera.y, toCamera.z, now)
    uniforms.uRippleColor.value[next].copy(colors.layers[note.layer])
    uniforms.uRippleStrength.value[next] = Math.min(1.2, note.strength)
    next = (next + 1) % RIPPLES
  }

  let swell = 0
  function update({
    dt,
    clock,
    look,
    notes,
    hearing,
    dim,
    decay,
    travel,
    tempo
  }) {
    now += dt
    notes.forEach((note) => {
      if (note.layer === KICK) ripple(note)
      if (note.layer === TEXTURE) uniforms.uCrackleSeed.value = Math.random()
    })
    fireNotes(graph, notes)
    if (Math.random() < dt * (0.15 + look.energy * look.wake)) graph.wander(0.3)

    const glow = hearing.glow
    const sound = hearing.knob
    let tone = 0
    let space = 0
    for (let i = 0; i < LAYERS; i++) {
      tone += sound('filter', i) / LAYERS
      space += sound('space', i, 0.3) / LAYERS
    }
    swell += (glow[BASS] * 0.03 - swell) * (1 - Math.exp(-dt * 3))
    uniforms.uTime.value = clock
    uniforms.uNow.value = now
    uniforms.uWave.value = (0.5 + glow[PAD] * 2) * (0.5 + look.energy)
    uniforms.uDetail.value = 1.1 + tone * 1.6
    uniforms.uSwell.value = swell
    uniforms.uTint.value.copy(colors.layers[PAD])
    uniforms.uTintAmount.value = Math.min(1, glow[PAD] * 1.4)
    uniforms.uCrackle.value = Math.min(1, glow[TEXTURE] * 1.5)
    uniforms.uRippleSpeed.value = travel ? 1.1 * tempo : 0
    uniforms.uRippleDecay.value = 0.9 + space * 3
    uniforms.uDim.value = dim
    uniforms.uSaturation.value = look.saturation
    uniforms.uDensity.value = 0.45 + 0.55 * look.density

    const alive = look.alive.map((value, i) => value + glow[i] * 0.3)
    graph.update(dt, {
      look,
      alive,
      speedNow: 3.2 * tempo * (0.4 + 0.6 * look.wake),
      decay,
      travel,
      avalanche: 0.55 + 0.45 * look.saturation
    })
    graph.setLook(look, dim)
    group.rotation.y = clock * 0.05
  }

  return { update }
}
