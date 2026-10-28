// Вид «Синапс»: сигнал спускается по аксону в бутон, медиатор пересекает
// щель и зажигает шипик дендрита, дальше сигнал расходится по дендриту.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from '../visuals.js'
import { DOT_FRAGMENT } from './noise.js'
import { createSpikeUniforms, writeSpikeUniforms } from './spikes.js'
import {
  random,
  createTubes,
  createMembraneMaterial,
  createSoma,
  createBokeh,
  membraneColor,
  updateMaterials
} from './neuron-kit.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const AXON_LENGTH = 0.85
const PARTICLES = 600
const PER_SPIKE = 36
const RELEASE_Y = 0.06
const RECEPTOR_Y = -0.03

const PARTICLE_VERTEX = /* glsl */ `
uniform float uPixel;
attribute vec3 color;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vColor = color;
  vAlpha = aAlpha;
  gl_PointSize = 9.0 * uPixel / -view.z;
  gl_Position = projectionMatrix * view;
}
`

export function createSynapse({ renderer, colors, reducedMotion }) {
  const rand = random(21)
  const scene = new THREE.Scene()
  scene.background = colors.screen
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40)
  camera.position.set(0.7, 0.15, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.25

  const group = new THREE.Group()
  group.position.y = 0.1
  scene.add(group)
  const spikeUniforms = createSpikeUniforms()

  // пресинапс: аксон сверху и бутон
  const axon = [
    {
      points: [
        V(0, 1.15, 0),
        V(0.04, 0.85, 0.02),
        V(-0.02, 0.6, 0),
        V(0, 0.42, 0)
      ],
      r0: 0.06,
      r1: 0.085,
      path: 0,
      length: AXON_LENGTH,
      id: 0,
      rank: 0
    }
  ]
  const pre = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: AXON_LENGTH },
    uShare: { value: 1 }
  })
  group.add(new THREE.Mesh(createTubes(axon, { radial: 12 }), pre))
  const bouton = createSoma(spikeUniforms, colors, {
    radius: 0.3,
    scale: [1, 0.75, 1],
    bumps: 0.06
  })
  bouton.position.set(0, 0.28, 0)
  group.add(bouton)

  // постсинапс: шипик, шейка и ствол дендрита в обе стороны
  const neck = {
    points: [V(0, -0.2, 0), V(0.01, -0.35, 0), V(0, -0.52, 0)],
    r0: 0.05,
    r1: 0.06,
    path: 0,
    length: 0.32,
    id: 0,
    rank: 0
  }
  const left = {
    points: [
      V(0, -0.58, 0),
      V(-0.5, -0.62, 0.08),
      V(-1, -0.6, 0.02),
      V(-1.5, -0.66, -0.1)
    ],
    r0: 0.095,
    r1: 0.07,
    path: 0.32,
    length: 1.5,
    id: 1,
    rank: 0
  }
  const right = {
    points: [
      V(0, -0.58, 0),
      V(0.5, -0.56, -0.06),
      V(1, -0.6, 0.05),
      V(1.5, -0.55, 0.1)
    ],
    r0: 0.095,
    r1: 0.07,
    path: 0.32,
    length: 1.5,
    id: 2,
    rank: 0
  }
  const post = createMembraneMaterial(spikeUniforms, colors, {
    uMaxPath: { value: 1.82 },
    uShare: { value: 1 }
  })
  group.add(
    new THREE.Mesh(createTubes([neck, left, right], { radial: 12 }), post)
  )
  const head = createSoma(spikeUniforms, colors, {
    radius: 0.22,
    scale: [1.25, 0.6, 1.25],
    bumps: 0.05
  })
  head.position.set(0, -0.15, 0)
  group.add(head)

  // везикулы в бутоне
  const vesicles = []
  while (vesicles.length < 40 * 3) {
    const p = V(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    if (p.lengthSq() > 1) continue
    vesicles.push(p.x * 0.2, 0.28 + p.y * 0.14, p.z * 0.2)
  }
  const vesicleMaterial = new THREE.PointsMaterial({
    color: membraneColor(colors).multiplyScalar(0.7),
    size: 0.035,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const vesiclePoints = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vesicles, 3)
    ),
    vesicleMaterial
  )
  group.add(vesiclePoints)

  // медиатор: частицы из бутона через щель к рецепторам
  const positions = new Float32Array(PARTICLES * 3).fill(99)
  const tints = new Float32Array(PARTICLES * 3)
  const alphas = new Float32Array(PARTICLES)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(tints, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: renderer.getPixelRatio() * 2 } },
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: DOT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const particlePoints = new THREE.Points(geometry, particleMaterial)
  particlePoints.frustumCulled = false
  group.add(particlePoints)
  const particles = []
  const released = new Set()

  const bokeh = createBokeh(rand, colors, {
    pixelRatio: renderer.getPixelRatio() * 2
  })
  scene.add(bokeh)
  const materials = [pre, post, bouton.material, head.material, bokeh.material]

  const origin = new THREE.Vector3()
  function update(frame) {
    const { dt, speed, spikes, look } = frame
    updateMaterials(materials, frame, reducedMotion)
    writeSpikeUniforms(spikeUniforms, spikes, () => origin, colors.layers)
    // настоящий сигнал идёт только от аксона к дендриту
    spikeUniforms.uSpikeSide.value.fill(0)
    const travel = AXON_LENGTH / (speed * 0.8)
    post.uniforms.uDelay.value = travel + 0.35

    // сигнал дошёл до бутона: выпускаем порцию медиатора
    const now = spikes.now()
    spikes.spikes.forEach((spike) => {
      if (released.has(spike.born) || now - spike.born < travel) return
      released.add(spike.born)
      const color = colors.layers[spike.layer]
      for (
        let i = 0;
        i < PER_SPIKE * spike.strength && particles.length < PARTICLES;
        i++
      ) {
        const angle = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * 0.13
        particles.push({
          x: Math.cos(angle) * r,
          y: RELEASE_Y,
          z: Math.sin(angle) * r,
          vy: -(0.12 + rand() * 0.12),
          drift: (rand() - 0.5) * 0.08,
          color,
          life: 0
        })
      }
    })
    // забываем спайки, которые уже ушли из модели
    released.forEach((born) => {
      if (!spikes.spikes.some((spike) => spike.born === born))
        released.delete(born)
    })

    const rate = reducedMotion ? 0.3 : 1
    particles.forEach((p) => {
      p.life += dt
      if (p.y > RECEPTOR_Y) {
        p.y += p.vy * dt * speed * rate
        p.x += p.drift * dt
      }
    })
    // на рецепторах частица светится ещё 0.6 с и гаснет
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].y <= RECEPTOR_Y && particles[i].life > 2.2)
        particles.splice(i, 1)
    }
    positions.fill(99)
    particles.forEach((p, i) => {
      positions.set([p.x, p.y, p.z], i * 3)
      const tint = p.color
        .clone()
        .lerp(new THREE.Color(1, 1, 1), 1 - look.saturation * 0.7)
      tints.set([tint.r, tint.g, tint.b], i * 3)
      alphas[i] =
        p.y <= RECEPTOR_Y ? Math.max(0, 1 - (p.life - 1.6) / 0.6) : 0.9
    })
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
    vesicleMaterial.opacity = 0.35 + look.energy * 0.4

    controls.autoRotateSpeed = reducedMotion ? 0 : 0.25 * speed
    controls.update()
  }

  function resize(width, height, isFull) {
    const distance = frameCamera(camera, width, height, isFull, 1.1, 0.9)
    controls.minDistance = distance * 0.3
    controls.maxDistance = distance * 1.8
  }

  return { scene, camera, update, resize, dispose: () => controls.dispose() }
}
