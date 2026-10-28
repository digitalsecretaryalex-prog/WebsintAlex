// Виды-клетки: мультиполярный нейрон, пирамидный нейрон коры, клетка Пуркинье.
// Ветви растут по своим правилам, сигналы бегут по ним от спайков.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'
import { createSpikeUniforms, writeSpikeUniforms } from './spikes.js'
import {
  random,
  grow,
  createTubes,
  createMembraneMaterial,
  createSoma,
  createBokeh,
  updateMaterials
} from './neuron-kit.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)

function randomDirection(rand) {
  return V(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
}

// Мультиполярный: звезда дендритов во все стороны и длинный аксон
function buildMultipolar(rand) {
  const branches = []
  const rules = {
    bend: 0.5,
    taper: 0.55,
    levels: 3,
    split: 2,
    spread: 0.45,
    shrink: 0.72
  }
  for (let i = 0; i < 11; i++) {
    grow(
      rand,
      branches,
      {
        start: V(0, 0, 0),
        direction: randomDirection(rand),
        length: 0.42 + rand() * 0.18,
        radius: 0.06
      },
      rules
    )
  }
  grow(
    rand,
    branches,
    {
      start: V(0, 0, 0),
      direction: V(0.35, -1, 0.25),
      length: 1.1,
      radius: 0.05
    },
    { bend: 0.25, taper: 0.5, levels: 2, split: 3, spread: 0.6, shrink: 0.35 }
  )
  return { branches, soma: { radius: 0.18, scale: [1, 1, 1] } }
}

// Пирамидный: треугольное тело, вверх апикальный ствол с косыми ветками
// и пучком на вершине, внизу короткие базальные дендриты и аксон
function buildPyramidal(rand) {
  const branches = []
  const side = {
    bend: 0.35,
    taper: 0.5,
    levels: 2,
    split: 2,
    spread: 0.5,
    shrink: 0.65
  }
  let start = V(0, 0.12, 0)
  let path = 0
  let radius = 0.065
  for (let segment = 0; segment < 4; segment++) {
    const length = 0.28
    const before = branches.length
    grow(
      rand,
      branches,
      {
        start,
        direction: V((rand() - 0.5) * 0.15, 1, (rand() - 0.5) * 0.15),
        length,
        radius,
        path
      },
      { bend: 0.15, taper: 0.85, levels: 0, split: 0, spread: 0, shrink: 0 }
    )
    const trunk = branches[before]
    start = trunk.points[trunk.points.length - 1]
    path += length
    radius = trunk.r1
    // косые ветки апикального ствола
    for (let k = 0; k < 2; k++) {
      const angle = (rand() * 2 - 1) * Math.PI
      grow(
        rand,
        branches,
        {
          start,
          direction: V(Math.cos(angle), 0.25 + rand() * 0.4, Math.sin(angle)),
          length: 0.22 + rand() * 0.1,
          radius: radius * 0.6,
          level: 1,
          path
        },
        side
      )
    }
  }
  // пучок на вершине
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2 + rand()
    grow(
      rand,
      branches,
      {
        start,
        direction: V(Math.cos(angle) * 0.8, 1, Math.sin(angle) * 0.8),
        length: 0.26,
        radius: radius * 0.8,
        level: 1,
        path
      },
      side
    )
  }
  // базальные дендриты
  for (let k = 0; k < 7; k++) {
    const angle = (k / 7) * Math.PI * 2 + rand() * 0.5
    grow(
      rand,
      branches,
      {
        start: V(0, -0.05, 0),
        direction: V(Math.cos(angle), -0.35 - rand() * 0.5, Math.sin(angle)),
        length: 0.3 + rand() * 0.12,
        radius: 0.045
      },
      { bend: 0.45, taper: 0.5, levels: 2, split: 2, spread: 0.5, shrink: 0.7 }
    )
  }
  // аксон вниз с коллатералями
  grow(
    rand,
    branches,
    {
      start: V(0, -0.12, 0),
      direction: V(0.08, -1, 0.05),
      length: 0.9,
      radius: 0.03
    },
    { bend: 0.2, taper: 0.6, levels: 1, split: 3, spread: 0.7, shrink: 0.3 }
  )
  return { branches, soma: { radius: 0.16, scale: [1, 1.45, 1] } }
}

// Пуркинье: из тела вверх растёт плоский густой веер, как коралл
function buildPurkinje(rand) {
  const branches = []
  const plane = V(0, 0, 1)
  const rules = {
    bend: 0.35,
    taper: 0.72,
    levels: 6,
    split: 2,
    spread: 0.5,
    shrink: 0.8,
    plane,
    minRadius: 0.006
  }
  grow(
    rand,
    branches,
    {
      start: V(0, -0.55, 0),
      direction: V(-0.35, 1, 0),
      length: 0.42,
      radius: 0.06
    },
    rules
  )
  grow(
    rand,
    branches,
    {
      start: V(0, -0.55, 0),
      direction: V(0.35, 1, 0),
      length: 0.42,
      radius: 0.06
    },
    rules
  )
  // лёгкая глубина, чтобы веер не был идеально плоским
  branches.forEach((branch) =>
    branch.points.forEach((point) => (point.z += (rand() - 0.5) * 0.06))
  )
  grow(
    rand,
    branches,
    {
      start: V(0, -0.7, 0),
      direction: V(0.05, -1, 0.1),
      length: 0.6,
      radius: 0.025
    },
    { bend: 0.2, taper: 0.6, levels: 0, split: 0, spread: 0, shrink: 0 }
  )
  return {
    branches,
    soma: { radius: 0.16, scale: [1, 1.1, 1], position: V(0, -0.62, 0) },
    share: 0.25
  }
}

function createCellView({ renderer, colors, reducedMotion }, build, seed) {
  const rand = random(seed)
  const cell = build(rand)
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40)
  camera.position.set(0.25, 0.15, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.35

  // кадр по габаритам клетки: центр рамки в начало координат
  const box = new THREE.Box3()
  cell.branches.forEach((branch) =>
    branch.points.forEach((point) => box.expandByPoint(point))
  )
  const size = box.getSize(new THREE.Vector3())
  const halfX = Math.max(size.x, size.z) / 2
  const halfY = size.y / 2
  const group = new THREE.Group()
  group.position.copy(box.getCenter(new THREE.Vector3())).negate()
  scene.add(group)

  const spikeUniforms = createSpikeUniforms()
  const maxPath = Math.max(...cell.branches.map((b) => b.path + b.length))
  const membrane = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: maxPath },
    uShare: { value: cell.share ?? 0.4 }
  })
  group.add(new THREE.Mesh(createTubes(cell.branches), membrane))
  const soma = createSoma(spikeUniforms, colors, cell.soma)
  if (cell.soma.position) soma.position.copy(cell.soma.position)
  group.add(soma)
  const bokeh = createBokeh(rand, colors, {
    pixelRatio: renderer.getPixelRatio() * 2
  })
  scene.add(bokeh)
  const materials = [membrane, soma.material, bokeh.material]

  const origin = new THREE.Vector3()
  function update(frame) {
    updateMaterials(materials, frame, reducedMotion)
    writeSpikeUniforms(spikeUniforms, frame.spikes, () => origin, colors.layers)
    controls.autoRotateSpeed = reducedMotion ? 0 : 0.35 * frame.speed
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(camera, width, height, isFull, halfX, halfY)
    controls.minDistance = distance * 0.35
    controls.maxDistance = distance * 1.8
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}

export const createMultipolar = (context) =>
  createCellView(context, buildMultipolar, 5)
export const createPyramidal = (context) =>
  createCellView(context, buildPyramidal, 8)
export const createPurkinje = (context) =>
  createCellView(context, buildPurkinje, 13)
