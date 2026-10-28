// Визуализация нейронов. Один WebGL-рендерер на все режимы, звук не создаёт.
// Режим живёт в своём файле в views/ и при смене освобождает ресурсы.
import * as THREE from 'three'
import { createSpikes } from './views/spikes.js'
import { createNetwork } from './views/network.js'
import {
  createFlight,
  createStream,
  createField,
  createCascade
} from './views/swarm.js'

const CREATE = {
  network: createNetwork,
  flight: createFlight,
  stream: createStream,
  field: createField,
  cascade: createCascade
}
export const VIEW_NAMES = Object.keys(CREATE)

// По частям сета: насыщенность, доля видимых точек и связей, энергия
const PART_LOOK = [
  { saturation: 1, density: 1, energy: 1 },
  { saturation: 0.7, density: 0.85, energy: 0.85 },
  { saturation: 0.4, density: 0.7, energy: 0.65 },
  { saturation: 0.15, density: 0.55, energy: 0.5 }
]

function lerp(from, to, amount) {
  return from + (to - from) * amount
}

// Камера отходит так, чтобы объект halfX × halfY занял кадр.
// isFull: сеть на весь экран, кадр сдвинут от контролов
export function frameCamera(camera, width, height, isFull, halfX, halfY) {
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const halfWidth = halfHeight * camera.aspect
  const distance = isFull
    ? Math.max(halfX / (0.5 * halfWidth), halfY / (0.4 * halfHeight))
    : Math.max(halfX / (0.7 * halfWidth), halfY / (0.88 * halfHeight))
  camera.position.setLength(distance)
  if (isFull) {
    camera.setViewOffset(width, height, 0, height * 0.13, width, height)
  } else {
    camera.clearViewOffset()
  }
  return distance
}

function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose()
    const materials = [].concat(object.material || [])
    materials.forEach((material) => {
      Object.values(material.uniforms || {}).forEach(
        ({ value }) => value?.isTexture && value.dispose()
      )
      material.map?.dispose()
      material.dispose()
    })
  })
}

export function initVisuals(container, palette, reducedMotion, mode) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const colors = {
    screen: new THREE.Color(palette.screen),
    signal: new THREE.Color(palette.signal),
    quiet: new THREE.Color(palette.quiet),
    ice: new THREE.Color(palette.ice),
    layers: palette.layers.map((hex) => new THREE.Color(hex))
  }
  const spikes = createSpikes(colors.layers.length)

  // Курсор в координатах экрана -1..1, activity гаснет через 3 с без движения
  const pointer = {
    ndc: new THREE.Vector2(),
    active: false,
    lastMove: 0,
    activity: 0
  }
  renderer.domElement.addEventListener('pointermove', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    pointer.active = true
    pointer.lastMove = performance.now()
  })
  renderer.domElement.addEventListener('pointerleave', () => {
    pointer.active = false
  })

  // target: состояние музыки из main.js, look: сглаженное на экране
  const target = {
    on: [false, false, false, false, false, false],
    level: [0, 0, 0, 0, 0, 0],
    bpm: 84,
    djFilter: 0,
    space: 0.3,
    master: 0,
    part: 0,
    playing: false
  }
  const look = {
    alive: [0, 0, 0, 0, 0, 0],
    saturation: 1,
    density: 1,
    energy: 0.5,
    dim: 1
  }

  let view = null
  let name = null

  function setMode(next) {
    if (!CREATE[next] || next === name) return
    if (view) {
      view.dispose?.()
      disposeScene(view.scene)
    }
    name = next
    view = CREATE[next]({ renderer, colors, reducedMotion, pointer })
    resize()
  }

  function resize() {
    const { clientWidth, clientHeight } = container
    if (!clientWidth || !clientHeight || !view) return
    renderer.setSize(clientWidth, clientHeight, false)
    view.resize(clientWidth, clientHeight, container.dataset.framing === 'full')
  }
  new ResizeObserver(resize).observe(container)

  function setState(next) {
    Object.assign(target, next)
  }

  // Нота слоя: спайк в его популяции (если не в рефрактерном периоде)
  function pulse(layer) {
    if (reducedMotion) return
    const fired = spikes.fire(layer)
    view?.pulse?.(layer, fired)
  }

  let lastTime = performance.now()
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    if (document.hidden || !view) return

    const ease = 1 - Math.exp(-dt * 2.5)
    const part = PART_LOOK[target.part]
    const closed = Math.max(0, -target.djFilter)
    look.saturation = lerp(look.saturation, part.saturation, ease * 0.4)
    look.density = lerp(
      look.density,
      part.density * (1 - closed * 0.5),
      ease * 0.4
    )
    look.dim = lerp(look.dim, 1 - closed * 0.3, ease)
    look.energy = lerp(
      look.energy,
      part.energy * (target.playing ? 0.45 + target.master * 0.55 : 0.35),
      ease * 0.5
    )
    for (let i = 0; i < look.alive.length; i++) {
      const goal = target.on[i] ? 0.35 + target.level[i] * 0.65 : 0
      look.alive[i] = lerp(look.alive[i], goal, ease)
    }

    const idle = (now - pointer.lastMove) / 1000
    const want = pointer.active && idle < 3 ? 1 : 0
    pointer.activity += (want - pointer.activity) * 0.06

    const speed = 0.9 * (target.bpm / 84)
    const decay = 0.5 + target.space * 1.6
    spikes.update(dt, reducedMotion ? 0 : 0.8 * look.energy, decay)

    view.update({ dt, time: now / 1000, target, look, speed, decay, spikes })
    renderer.render(view.scene, view.camera)
  }

  setMode(CREATE[mode] ? mode : 'network')
  requestAnimationFrame(frame)

  return { setState, pulse, setMode, getMode: () => name }
}
