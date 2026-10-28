// Вид «Аксон»: тело клетки слева, аксон в муфтах миелина, терминали справа.
// Сигнал перескакивает от перехвата к перехвату (сальтаторное проведение).
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
const SHEATHS = 8
const START = 0.1
const END = 0.9

export function createAxon({ renderer, colors, reducedMotion }) {
  const rand = random(34)
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40)
  camera.position.set(0.2, 0.35, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.15

  const spikeUniforms = createSpikeUniforms()
  const points = [
    V(-1.55, -0.3, -0.2),
    V(-0.8, -0.05, 0.15),
    V(0, 0.02, -0.1),
    V(0.8, 0.18, 0.12),
    V(1.5, 0.32, -0.15)
  ]
  const length = new THREE.CatmullRomCurve3(points).getLength()
  // путь отсчитывается от первого перехвата: перехваты ровно на шаге uStep
  const offset = -START * length
  const step = ((END - START) * length) / SHEATHS

  const core = {
    points,
    r0: 0.024,
    r1: 0.02,
    path: offset,
    length,
    id: 0,
    rank: 0
  }
  const coreMaterial = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: length + offset },
    uShare: { value: 1 },
    uStep: { value: step }
  })
  scene.add(
    new THREE.Mesh(
      createTubes([core], { radial: 10, perUnit: 90 }),
      coreMaterial
    )
  )

  // муфты миелина: толстые участки с округлыми краями, между ними перехваты
  const sheath = { ...core, id: 1 }
  const sheathMaterial = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: length + offset },
    uShare: { value: 1 },
    uStep: { value: step }
  })
  const radiusAt = (t) => {
    if (t < START || t > END) return 0
    const local = (((t - START) / (END - START)) * SHEATHS) % 1
    return (
      0.024 +
      0.055 *
        THREE.MathUtils.smoothstep(local, 0.04, 0.18) *
        THREE.MathUtils.smoothstep(1 - local, 0.04, 0.18)
    )
  }
  scene.add(
    new THREE.Mesh(
      createTubes([sheath], { radial: 18, perUnit: 160, radiusAt }),
      sheathMaterial
    )
  )

  // тело клетки с дендритами и терминали аксона
  const soma = createSoma(spikeUniforms, colors, { radius: 0.17, bumps: 0.12 })
  soma.position.copy(points[0])
  scene.add(soma)
  const branches = []
  for (let i = 0; i < 7; i++) {
    const direction = V(
      -0.6 - rand(),
      rand() * 2 - 1,
      rand() * 2 - 1
    ).normalize()
    grow(
      rand,
      branches,
      { start: points[0], direction, length: 0.32, radius: 0.03 },
      { bend: 0.5, taper: 0.55, levels: 2, split: 2, spread: 0.45, shrink: 0.7 }
    )
  }
  const end = points[points.length - 1]
  const tangent = end
    .clone()
    .sub(points[points.length - 2])
    .normalize()
  grow(
    rand,
    branches,
    {
      start: end,
      direction: tangent,
      length: 0.2,
      radius: 0.02,
      path: length + offset
    },
    { bend: 0.4, taper: 0.6, levels: 2, split: 3, spread: 0.6, shrink: 0.8 }
  )
  const treeMaterial = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: length + offset + 0.6 },
    uShare: { value: 0.6 }
  })
  scene.add(new THREE.Mesh(createTubes(branches), treeMaterial))

  const bokeh = createBokeh(rand, colors, {
    pixelRatio: renderer.getPixelRatio() * 2,
    spread: 2.8
  })
  scene.add(bokeh)
  const materials = [
    coreMaterial,
    sheathMaterial,
    treeMaterial,
    soma.material,
    bokeh.material
  ]

  const origin = new THREE.Vector3()
  function update(frame) {
    updateMaterials(materials, frame, reducedMotion)
    writeSpikeUniforms(spikeUniforms, frame.spikes, () => origin, colors.layers)
    // по аксону сигнал идёт только от тела клетки к терминалям
    spikeUniforms.uSpikeSide.value.fill(0)
    controls.autoRotateSpeed = reducedMotion ? 0 : 0.15 * frame.speed
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(camera, width, height, isFull, 1.75, 0.55)
    controls.minDistance = distance * 0.3
    controls.maxDistance = distance * 1.8
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}
