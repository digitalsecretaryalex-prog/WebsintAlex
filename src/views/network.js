// Режим «Сеть»: 520 нейронов в двух полушариях, импульсы бегут по связям.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'

const NEURONS = 520
const NEIGHBOURS = 3
const IMPULSES = 120

// По частям: насыщенность, доля видимых связей, импульсов на ноту
const PART_LOOK = [
  { saturation: 1, edges: 1, impulses: 3 },
  { saturation: 0.7, edges: 0.8, impulses: 2 },
  { saturation: 0.4, edges: 0.6, impulses: 1 },
  { saturation: 0.15, edges: 0.45, impulses: 1 }
]

// Области слоёв: бочка внизу, перкуссия по бокам, бас сзади, пэд сверху,
// мелодия спереди, фон по всей сети
const REGION_CENTERS = [
  [[0, -0.6, 0.05]],
  [
    [-1, 0.05, 0],
    [1, 0.05, 0]
  ],
  [[0, -0.2, -1]],
  [[0, 0.8, -0.1]],
  [[0, 0.25, 1]],
  []
]
const TEXTURE_SHARE = 0.15

// mulberry32: сеть одинаковая при каждом запуске и совпадает с макетом
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createNeurons(rand) {
  const neurons = []
  while (neurons.length < NEURONS) {
    const side = rand() < 0.5 ? -1 : 1
    const x = rand() * 2 - 1
    const y = rand() * 2 - 1
    const z = rand() * 2 - 1
    if (x * x + y * y + z * z > 1) continue
    // эллипсоид полушария с бороздой
    const position = new THREE.Vector3(
      side * (0.64 + x * 0.6),
      y * 0.55,
      z * 0.85
    )
    if (Math.abs(position.x) < 0.08) continue
    neurons.push({ position, region: findRegion(position, rand) })
  }
  return neurons
}

function findRegion(position, rand) {
  if (rand() < TEXTURE_SHARE) return 5
  let best = 0
  let bestDistance = Infinity
  REGION_CENTERS.forEach((centers, region) => {
    centers.forEach(([x, y, z]) => {
      const distance = position.distanceToSquared(new THREE.Vector3(x, y, z))
      if (distance < bestDistance) {
        bestDistance = distance
        best = region
      }
    })
  })
  return best
}

// каждый нейрон связан с тремя ближайшими
function createEdges(neurons, rand) {
  const edges = []
  const seen = new Set()
  neurons.forEach((neuron, a) => {
    const nearest = neurons
      .map((other, b) => [b, neuron.position.distanceToSquared(other.position)])
      .sort((first, second) => first[1] - second[1])
      .slice(1, NEIGHBOURS + 1)
    nearest.forEach(([b]) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seen.has(key)) return
      seen.add(key)
      // rank: в какой части связь гаснет
      edges.push({ a, b, rank: rand() })
    })
  })
  return edges
}

function createDotTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

function lerp(from, to, amount) {
  return from + (to - from) * amount
}

export function createNetwork({ renderer, colors, reducedMotion }) {
  const rand = random(7)
  const neurons = createNeurons(rand)
  const edges = createEdges(neurons, rand)
  const regionEdges = [0, 1, 2, 3, 4, 5].map((region) =>
    edges.filter((edge) => neurons[edge.a].region === region)
  )

  const screenColor = colors.screen
  const signalColor = colors.signal
  const quietColor = colors.quiet
  const baseColor = new THREE.Color()
  const iceColor = colors.ice
  const layerColors = colors.layers

  const scene = new THREE.Scene()
  scene.background = screenColor
  scene.fog = new THREE.FogExp2(screenColor, 0.12)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50)
  camera.position.set(0, 0.38, 1)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 1.5
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.35

  const dot = createDotTexture()

  const pointPositions = new Float32Array(NEURONS * 3)
  const pointColors = new Float32Array(NEURONS * 3)
  neurons.forEach((neuron, index) =>
    neuron.position.toArray(pointPositions, index * 3)
  )
  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(pointPositions, 3)
  )
  pointGeometry.setAttribute('color', new THREE.BufferAttribute(pointColors, 3))
  const points = new THREE.Points(
    pointGeometry,
    new THREE.PointsMaterial({
      size: 0.17,
      map: dot,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  scene.add(points)

  const linePositions = new Float32Array(edges.length * 6)
  const lineColors = new Float32Array(edges.length * 6)
  edges.forEach((edge, index) => {
    neurons[edge.a].position.toArray(linePositions, index * 6)
    neurons[edge.b].position.toArray(linePositions, index * 6 + 3)
  })
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
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  scene.add(lines)

  const impulsePositions = new Float32Array(IMPULSES * 3).fill(1000)
  const impulseGeometry = new THREE.BufferGeometry()
  impulseGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(impulsePositions, 3)
  )
  const impulseMaterial = new THREE.PointsMaterial({
    size: 0.16,
    map: dot,
    color: iceColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  scene.add(new THREE.Points(impulseGeometry, impulseMaterial))
  const impulses = []

  let target = null
  const look = {
    region: [0, 0, 0, 0, 0, 0],
    saturation: 1,
    edges: 1,
    dim: 1,
    fog: 0.12
  }
  let wave = null

  function pulse(layerIndex) {
    if (reducedMotion || !target) return
    if (layerIndex === 0) wave = { radius: 0 }
    const pool = regionEdges[layerIndex]
    const count = PART_LOOK[target.part].impulses
    for (let i = 0; i < count && impulses.length < IMPULSES; i++) {
      const edge = pool[Math.floor(Math.random() * pool.length)]
      if (edge && edge.rank <= look.edges) impulses.push({ edge, t: 0 })
    }
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(camera, width, height, isFull, 1.3, 0.8)
    controls.maxDistance = distance * 2
  }

  const color = new THREE.Color()
  function update(frame) {
    const { dt } = frame
    const now = frame.time * 1000
    target = frame.target
    const ease = 1 - Math.exp(-dt * 2.5)
    const partLook = PART_LOOK[target.part]

    look.saturation = lerp(look.saturation, partLook.saturation, ease * 0.4)
    look.edges = lerp(look.edges, partLook.edges, ease * 0.4)
    const closed = Math.max(0, -target.djFilter)
    look.dim = lerp(look.dim, 1 - closed * 0.3, ease)
    look.fog = lerp(look.fog, 0.08 + closed * 0.22 + target.space * 0.12, ease)
    scene.fog.density = look.fog
    for (let region = 0; region < 6; region++) {
      const goal = target.on[region] ? 0.45 + target.level[region] * 0.55 : 0
      look.region[region] = lerp(look.region[region], goal, ease)
    }

    // reduced motion: без импульсов, медленное дыхание
    const breath = reducedMotion
      ? 0.85 + 0.15 * Math.sin((now / 10000) * Math.PI * 2)
      : 1
    if (wave) {
      wave.radius += dt * 1.6
      if (wave.radius > 2.2) wave = null
    }

    baseColor.copy(signalColor).lerp(quietColor, 1 - look.saturation)
    neurons.forEach((neuron, index) => {
      const region = look.region[neuron.region]
      color
        .copy(baseColor)
        .lerp(
          layerColors[neuron.region],
          Math.min(1, region * 1.6) * look.saturation
        )
      let brightness = (0.58 + region * 0.8) * look.dim * breath
      if (wave) {
        const distance = Math.abs(neuron.position.length() - wave.radius)
        if (distance < 0.25) brightness += (0.25 - distance) * 0.8
      }
      color.multiplyScalar(brightness).toArray(pointColors, index * 3)
    })
    pointGeometry.attributes.color.needsUpdate = true

    edges.forEach((edge, index) => {
      const visible = edge.rank <= look.edges ? 0.9 : 0.06
      for (let end = 0; end < 2; end++) {
        const from = (end === 0 ? edge.a : edge.b) * 3
        lineColors[index * 6 + end * 3] = pointColors[from] * visible
        lineColors[index * 6 + end * 3 + 1] = pointColors[from + 1] * visible
        lineColors[index * 6 + end * 3 + 2] = pointColors[from + 2] * visible
      }
    })
    lineGeometry.attributes.color.needsUpdate = true

    const speed = (target.bpm / 84) * 0.9
    for (let i = impulses.length - 1; i >= 0; i--) {
      impulses[i].t += dt * speed
      if (impulses[i].t >= 1) impulses.splice(i, 1)
    }
    impulsePositions.fill(1000)
    impulses.forEach((impulse, index) => {
      const from = neurons[impulse.edge.a].position
      const to = neurons[impulse.edge.b].position
      const x = lerp(from.x, to.x, impulse.t)
      const y = lerp(from.y, to.y, impulse.t)
      const z = lerp(from.z, to.z, impulse.t)
      impulsePositions.set([x, y, z], index * 3)
    })
    impulseGeometry.attributes.position.needsUpdate = true
    impulseMaterial.opacity = look.dim

    controls.autoRotateSpeed = 0.35 * (target.bpm / 84)
    controls.update()
  }

  return {
    scene,
    camera,
    update,
    resize,
    pulse,
    dispose: () => controls.dispose()
  }
}
