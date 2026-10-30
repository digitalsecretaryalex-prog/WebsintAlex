// Сеть нейронов для фонов «Мембрана», «Кора», «Мозг» и «Синхрон»: тела,
// связи пунктиром и импульсы, которые бегут по связям. Импульс, дошедший
// до соседа, может зажечь его дальше: так идёт нейронная лавина.
// Свечение каждого нейрона и каждой связи лежит в текстуре: JS пишет туда
// числа раз в кадр, шейдер читает их по номеру точки (texelFetch), поэтому
// десятки тысяч точек не пересчитываются в JS.
import * as THREE from 'three'
import { glowMaterial, PALETTE_GLSL } from './common.js'
import { LAYERS, MELODY } from './hearing.js'

const IMPULSES = 420 // импульсов одновременно, не больше
const REFRACTORY = 0.9 // секунды: нейрон не загорается чаще
const WIDTH = 256 // ширина текстур свечения

// текстура RGBA: на нейрон или связь один пиксель из четырёх чисел
function glowTexture(count) {
  const height = Math.max(1, Math.ceil(count / WIDTH))
  const data = new Float32Array(WIDTH * height * 4)
  const texture = new THREE.DataTexture(
    data,
    WIDTH,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  texture.needsUpdate = true
  return { data, texture }
}

const SHARED_GLSL = /* glsl */ `
uniform vec3 uLayerColor[${LAYERS}];
uniform float uAlive[${LAYERS}];
uniform vec3 uCold;
uniform vec3 uIce;
uniform float uSaturation;
uniform float uDim;
uniform float uPixel;
uniform float uTime;
${PALETTE_GLSL}
vec4 glowAt(sampler2D map, float index) {
  int i = int(index + 0.5);
  return texelFetch(map, ivec2(i % ${WIDTH}, i / ${WIDTH}), 0);
}
vec3 layerTint(float layer) {
  return calm(uLayerColor[int(layer + 0.5)], uIce, uSaturation);
}`

// Тело: покой холодный, ключевые нейроны (hub) крупнее и ярче, вспышка
// красится в цвет слоя, который её зажёг
const NEURON_VERTEX = /* glsl */ `
${SHARED_GLSL}
uniform sampler2D uNeurons;
uniform float uSize;
attribute float aIndex;
attribute float aLayer;
attribute float aHub;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 state = glowAt(uNeurons, aIndex);
  float glow = state.r;
  float alive = uAlive[int(aLayer + 0.5)];
  vec3 rest = mix(uCold, uIce, 0.45 + aHub * 0.45);
  vec3 own = mix(rest, layerTint(aLayer), alive * (0.25 + aHub * 0.5));
  vColor = mix(own, layerTint(state.g), clamp(glow, 0.0, 1.0)) * (1.0 + glow * 0.8);
  float twinkle = 0.85 + 0.15 * sin(uTime * (0.4 + aSeed) + aSeed * 31.0);
  vAlpha = (0.55 + aHub * 0.6 + alive * 0.25 + glow * 1.5) * twinkle * uDim;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = uSize * (0.65 + aSeed * 0.5 + aHub * 1.8) * (1.0 + glow * 2.2);
  gl_PointSize = size * uPixel * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

// Связь пунктиром: за головой импульса тянется светлый хвост; если оба
// конца светятся (синхрон), светится и связь между ними
const EDGE_VERTEX = /* glsl */ `
${SHARED_GLSL}
uniform sampler2D uNeurons;
uniform sampler2D uEdges;
uniform float uDensity;
uniform float uEdgeBase;
uniform float uEndShare;
uniform float uDot;
attribute float aEdge;
attribute float aA;
attribute float aB;
attribute float aT;
attribute float aLayer;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 edge = glowAt(uEdges, aEdge);
  float along = edge.a > 0.5 ? aT : 1.0 - aT;
  float behind = edge.b - along;
  float trail = behind >= 0.0 ? exp(-behind * 3.5) : 0.0;
  float lit = edge.r * trail;
  vec4 a = glowAt(uNeurons, aA);
  vec4 b = glowAt(uNeurons, aB);
  float ends = mix(a.r, b.r, aT) * uEndShare;
  float glow = max(lit, ends);
  float tintLayer = lit >= ends ? edge.g : (a.r > b.r ? a.g : b.g);
  vColor = mix(mix(uCold, uIce, 0.4), layerTint(tintLayer), clamp(glow * 1.3, 0.0, 1.0)) * (1.0 + glow * 0.6);
  float visible = step(aSeed, uDensity);
  vAlpha = (uEdgeBase + glow * 0.95) * visible * uDim;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uDot * (1.0 + glow * 0.8) * uPixel * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

// Точка связи мелкая, поэтому край у неё твёрже, иначе она гаснет
const DOT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.25, d) * vAlpha);
}`

// Голова импульса: яркая точка цвета слоя
const IMPULSE_VERTEX = /* glsl */ `
uniform float uPixel;
uniform float uSize;
uniform float uDim;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor * 1.4;
  vAlpha = aAlpha * uDim;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.6 + aAlpha) * uPixel * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

// точка на дуге связи: квадратичная кривая Безье от a через изгиб к b
function curvePoint(edge, t, out) {
  const u = 1 - t
  return out
    .copy(edge.a)
    .multiplyScalar(u * u)
    .addScaledVector(edge.control, 2 * u * t)
    .addScaledVector(edge.b, t * t)
}

// neurons: [{ position, layer, hub, u, v }] (u, v: место на экране -1..1)
// links: [{ a, b, bend }] (bend: сдвиг середины дуги)
// options: dots (точек на связь), size и dot (пиксели тела и точки связи
// на расстоянии 30 от камеры), edgeBase, endShare, speed, spread;
// turning: сеть вращается, сторону экрана считать по повёрнутому месту
// нейрона (span: полуширина сети), а нейроны с задней стороны не брать
export function createGraph({ renderer, colors }, neurons, links, options) {
  const {
    dots = 10,
    size = 5,
    dot = 2.2,
    edgeBase = 0.06,
    endShare = 0.25,
    speed = 2.5,
    spread = 0.55,
    depthLimit = 5,
    turning = false,
    span = 8
  } = options
  const group = new THREE.Group()
  const count = neurons.length
  const neuronGlow = glowTexture(count)
  const edgeGlow = glowTexture(links.length)

  const uniforms = {
    uLayerColor: { value: colors.layers.map((color) => color.clone()) },
    uAlive: { value: new Array(LAYERS).fill(0) },
    uCold: { value: colors.signal.clone().multiplyScalar(0.8) },
    uIce: { value: colors.ice.clone() },
    uSaturation: { value: 1 },
    uDim: { value: 1 },
    uPixel: { value: renderer.getPixelRatio() },
    uTime: { value: 0 },
    uNeurons: { value: neuronGlow.texture },
    uEdges: { value: edgeGlow.texture },
    uSize: { value: size },
    uDensity: { value: 1 },
    uEdgeBase: { value: edgeBase },
    uEndShare: { value: endShare },
    uDot: { value: dot }
  }

  // тела
  {
    const position = new Float32Array(count * 3)
    const index = new Float32Array(count)
    const layer = new Float32Array(count)
    const hub = new Float32Array(count)
    const seed = new Float32Array(count)
    neurons.forEach((neuron, i) => {
      neuron.position.toArray(position, i * 3)
      index[i] = i
      layer[i] = neuron.layer
      hub[i] = neuron.hub ? 1 : 0
      seed[i] = Math.random()
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1))
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1))
    geometry.setAttribute('aHub', new THREE.BufferAttribute(hub, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const points = new THREE.Points(
      geometry,
      glowMaterial(uniforms, NEURON_VERTEX)
    )
    points.frustumCulled = false
    group.add(points)
  }

  // связи: точки вдоль дуги
  const edges = links.map((link) => {
    const a = neurons[link.a].position
    const b = neurons[link.b].position
    const control = a.clone().add(b).multiplyScalar(0.5).add(link.bend)
    return {
      from: link.a,
      to: link.b,
      a,
      b,
      control,
      length: a.distanceTo(control) + control.distanceTo(b)
    }
  })
  {
    const total = edges.length * dots
    const position = new Float32Array(total * 3)
    const edgeIndex = new Float32Array(total)
    const ends = [new Float32Array(total), new Float32Array(total)]
    const along = new Float32Array(total)
    const layer = new Float32Array(total)
    const seed = new Float32Array(total)
    const point = new THREE.Vector3()
    edges.forEach((edge, e) => {
      const visible = Math.random()
      for (let k = 0; k < dots; k++) {
        const i = e * dots + k
        const t = (k + 0.5) / dots
        curvePoint(edge, t, point).toArray(position, i * 3)
        edgeIndex[i] = e
        ends[0][i] = edge.from
        ends[1][i] = edge.to
        along[i] = t
        layer[i] = neurons[edge.from].layer
        seed[i] = visible
      }
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aEdge', new THREE.BufferAttribute(edgeIndex, 1))
    geometry.setAttribute('aA', new THREE.BufferAttribute(ends[0], 1))
    geometry.setAttribute('aB', new THREE.BufferAttribute(ends[1], 1))
    geometry.setAttribute('aT', new THREE.BufferAttribute(along, 1))
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const points = new THREE.Points(
      geometry,
      glowMaterial(uniforms, EDGE_VERTEX, DOT_FRAGMENT)
    )
    points.frustumCulled = false
    group.add(points)
  }

  // головы импульсов: место пишет JS каждый кадр
  const heads = {
    position: new Float32Array(IMPULSES * 3),
    color: new Float32Array(IMPULSES * 3),
    alpha: new Float32Array(IMPULSES)
  }
  const headGeometry = new THREE.BufferGeometry()
  headGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(heads.position, 3)
  )
  headGeometry.setAttribute('aColor', new THREE.BufferAttribute(heads.color, 3))
  headGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(heads.alpha, 1))
  const headUniforms = {
    uPixel: uniforms.uPixel,
    uDim: uniforms.uDim,
    uSize: { value: size * 1.6 }
  }
  const headPoints = new THREE.Points(
    headGeometry,
    glowMaterial(headUniforms, IMPULSE_VERTEX)
  )
  headPoints.frustumCulled = false
  group.add(headPoints)

  // связи каждого нейрона и списки по слоям
  const linksOf = neurons.map(() => [])
  edges.forEach((edge, e) => {
    linksOf[edge.from].push(e)
    linksOf[edge.to].push(e)
  })
  const byLayer = Array.from({ length: LAYERS }, () => ({ all: [], hubs: [] }))
  neurons.forEach((neuron, i) => {
    byLayer[neuron.layer].all.push(i)
    if (neuron.hub) byLayer[neuron.layer].hubs.push(i)
  })

  const lastFire = new Float32Array(count).fill(-99)
  let impulses = []
  let time = 0
  let canTravel = true
  let spreadNow = spread

  // нейрон загорается и шлёт импульсы по своим связям; дальше лавина
  // идёт с вероятностью spread, слабея на каждом шаге
  function fire(n, layer, strength, depth = 0) {
    if (time - lastFire[n] < REFRACTORY) return
    lastFire[n] = time
    const glow = neuronGlow.data
    glow[n * 4] = Math.min(1.6, glow[n * 4] + strength)
    glow[n * 4 + 1] = layer
    if (!canTravel || depth >= depthLimit) return
    linksOf[n].forEach((e) => {
      if (impulses.length >= IMPULSES) return
      if (depth > 0 && Math.random() > spreadNow * Math.min(1, strength + 0.3))
        return
      impulses.push({
        edge: e,
        forward: edges[e].from === n,
        t: 0,
        layer,
        strength: strength * 0.85,
        depth
      })
    })
  }

  const turn = new THREE.Quaternion()
  const placed = new THREE.Vector3()
  // место нейрона на экране: u лево-право, v низ-верх, back: за сферой
  function place(n) {
    const neuron = neurons[n]
    if (!turning) return { u: neuron.u, v: neuron.v, back: 0 }
    placed.copy(neuron.position).applyQuaternion(group.getWorldQuaternion(turn))
    return {
      u: placed.x / span,
      v: placed.y / span,
      back: placed.z < 0 ? 1 : 0
    }
  }

  // нота слоя: зажечь его нейрон. side: панорама -1..1 (лево, право),
  // height: высота ноты 0..1 (выше нота, выше нейрон), если важна
  function trigger(
    layer,
    strength,
    { side = 0, height = null, hub = 0.6 } = {}
  ) {
    const pool = byLayer[layer]
    // ключевых мало: выбирать из всех, иначе панораме не из чего выбрать
    const list =
      pool.hubs.length >= 8 && Math.random() < hub ? pool.hubs : pool.all
    if (!list.length) return
    let best = list[0]
    let bestScore = Infinity
    for (let k = 0; k < 10; k++) {
      const candidate = list[Math.floor(Math.random() * list.length)]
      const { u, v, back } = place(candidate)
      let score = Math.abs(u - side * 0.75) + Math.random() * 0.35 + back * 2
      if (height !== null) score += Math.abs(v - (height * 1.6 - 0.8))
      if (score < bestScore && time - lastFire[candidate] > REFRACTORY) {
        bestScore = score
        best = candidate
      }
    }
    fire(best, layer, strength)
  }

  // случайный нейрон: фоновая активность сети
  function wander(strength) {
    const n = Math.floor(Math.random() * count)
    fire(n, neurons[n].layer, strength, depthLimit - 2)
  }

  const point = new THREE.Vector3()
  // look: свет и насыщенность сета; speedNow: скорость импульсов с темпом;
  // decay: секунды свечения (простор); travel: импульсы бегут (не reduced motion)
  function update(dt, { look, alive, speedNow, decay, travel, avalanche = 1 }) {
    time += dt
    canTravel = travel
    spreadNow = spread * avalanche
    uniforms.uTime.value = time
    uniforms.uSaturation.value = look.saturation
    uniforms.uDensity.value = 0.35 + 0.65 * look.density
    for (let i = 0; i < LAYERS; i++) uniforms.uAlive.value[i] = alive[i]

    const edgeData = edgeGlow.data
    const kept = []
    let shown = 0
    impulses.forEach((impulse) => {
      const edge = edges[impulse.edge]
      impulse.t += (dt * speedNow) / edge.length
      const base = impulse.edge * 4
      edgeData[base] = Math.max(edgeData[base] * 0.9, impulse.strength)
      edgeData[base + 1] = impulse.layer
      edgeData[base + 2] = Math.min(1.2, impulse.t)
      edgeData[base + 3] = impulse.forward ? 1 : 0
      if (impulse.t >= 1) {
        fire(
          impulse.forward ? edge.to : edge.from,
          impulse.layer,
          impulse.strength,
          impulse.depth + 1
        )
        return
      }
      kept.push(impulse)
      curvePoint(edge, impulse.forward ? impulse.t : 1 - impulse.t, point)
      point.toArray(heads.position, shown * 3)
      const color = colors.layers[impulse.layer]
      heads.color[shown * 3] = color.r
      heads.color[shown * 3 + 1] = color.g
      heads.color[shown * 3 + 2] = color.b
      heads.alpha[shown] = Math.min(1, impulse.strength)
      shown++
    })
    impulses = kept
    headGeometry.setDrawRange(0, shown)
    headGeometry.attributes.position.needsUpdate = true
    headGeometry.attributes.aColor.needsUpdate = true
    headGeometry.attributes.aAlpha.needsUpdate = true

    // свечение тает: простор растягивает
    const neuronFade = Math.exp(-dt / decay)
    const edgeFade = Math.exp(-dt / (decay * 1.4))
    const glow = neuronGlow.data
    for (let i = 0; i < count; i++) glow[i * 4] *= neuronFade
    for (let e = 0; e < edges.length; e++) {
      edgeData[e * 4] *= edgeFade
      if (edgeData[e * 4 + 2] >= 1) edgeData[e * 4 + 2] += dt
    }
    neuronGlow.texture.needsUpdate = true
    edgeGlow.texture.needsUpdate = true
  }

  // синхрон пишет свечение сам, без импульсов
  function paint(n, value, layer) {
    neuronGlow.data[n * 4] = value
    neuronGlow.data[n * 4 + 1] = layer
  }

  function setLook(look, dim) {
    uniforms.uDim.value = dim
    uniforms.uSaturation.value = look.saturation
    uniforms.uDensity.value = 0.35 + 0.65 * look.density
  }

  return {
    group,
    uniforms,
    trigger,
    wander,
    fire,
    paint,
    update,
    setLook,
    flush: () => (neuronGlow.texture.needsUpdate = true),
    count
  }
}

// Как нота зажигает сеть: сила и доля ключевых нейронов по слоям.
// Бочка бьёт в три ключевых нейрона и даёт большие лавины, перкуссия
// искрит мелкими, пэд зажигает аккордом три нейрона, мелодия один на
// высоте своей ноты
const NOTE_FIRE = [
  { gain: 1, hub: 1, count: 3 },
  { gain: 0.55, hub: 0.15, count: 2 },
  { gain: 0.85, hub: 0.8, count: 2 },
  { gain: 0.7, hub: 0.5, count: 3 },
  { gain: 0.85, hub: 0.4, count: 1 },
  { gain: 0.45, hub: 0, count: 2 }
]

export function fireNotes(graph, notes) {
  notes.forEach((note) => {
    const { gain, hub, count } = NOTE_FIRE[note.layer]
    for (let k = 0; k < count; k++)
      graph.trigger(note.layer, note.strength * gain, {
        side: note.pan,
        height: note.layer === MELODY ? note.pitch : null,
        hub
      })
  })
}

// k ближайших соседей для каждой точки, поиск по сетке корзин
export function nearest(points, k, cell) {
  const buckets = new Map()
  const key = (x, y, z) => `${x},${y},${z}`
  points.forEach((p, i) => {
    const id = key(
      Math.floor(p.x / cell),
      Math.floor(p.y / cell),
      Math.floor(p.z / cell)
    )
    if (!buckets.has(id)) buckets.set(id, [])
    buckets.get(id).push(i)
  })
  return points.map((p, i) => {
    const cx = Math.floor(p.x / cell)
    const cy = Math.floor(p.y / cell)
    const cz = Math.floor(p.z / cell)
    const found = []
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let z = cz - 1; z <= cz + 1; z++)
          (buckets.get(key(x, y, z)) || []).forEach((j) => {
            if (j !== i) found.push([p.distanceToSquared(points[j]), j])
          })
    return found
      .sort((a, b) => a[0] - b[0])
      .slice(0, k)
      .map(([, j]) => j)
  })
}

// связи без повторов: a-b и b-a одна связь
export function uniqueLinks(pairs) {
  const seen = new Set()
  return pairs.filter(({ a, b }) => {
    const id = a < b ? `${a}-${b}` : `${b}-${a}`
    if (a === b || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
