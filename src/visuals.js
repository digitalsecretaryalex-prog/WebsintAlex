// Визуализация нейронов. Один WebGL-рендерер на все режимы, звук не создаёт.
// Режим живёт в своём файле в views/ и при смене освобождает ресурсы.
import * as THREE from 'three'
import { createSpikes } from './views/spikes.js'
import { createBackdrop, BACKGROUNDS } from './views/background.js'
import {
  createFlight,
  createStream,
  createField,
  createCascade
} from './views/swarm.js'
import { createTunnel } from './views/tunnel.js'
import { createWave } from './views/wave.js'

const CREATE = {
  flight: createFlight,
  stream: createStream,
  field: createField,
  cascade: createCascade,
  tunnel: createTunnel,
  wave: createWave
}
export const VIEW_NAMES = Object.keys(CREATE)
export { BACKGROUNDS }

// По частям сета: насыщенность, доля видимых точек, энергия
// links: доля связей между шарами при «угасании связей»
const PART_LOOK = [
  { saturation: 1, density: 1, energy: 1, links: 1 },
  { saturation: 0.7, density: 0.85, energy: 0.85, links: 0.65 },
  { saturation: 0.4, density: 0.7, energy: 0.65, links: 0.4 },
  { saturation: 0.15, density: 0.55, energy: 0.5, links: 0.2 }
]

function lerp(from, to, amount) {
  return from + (to - from) * amount
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

export function initVisuals(container, palette, reducedMotion, mode, ground) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // сначала фон, потом вид поверх без очистки
  renderer.autoClear = false
  renderer.domElement.setAttribute('role', 'img')
  renderer.domElement.setAttribute(
    'aria-label',
    '3D-нейроны: светятся вместе с музыкой, мышью меняется ракурс'
  )
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
    playing: false,
    // параметры слоёв: тон 0..1, эхо, простор, панорама, обратная связь эха, Mute
    sound: null,
    // sounding: звук реально идёт (транспорт запущен, контекст работает)
    sounding: false,
    // beat: позиция в тактах, пока звучит, иначе null
    beat: null,
    panelHidden: false,
    prune: false,
    breath: null
  }
  const look = {
    alive: [0, 0, 0, 0, 0, 0],
    saturation: 1,
    density: 1,
    energy: 0.5,
    dim: 1,
    links: 1,
    // 0 сеть спит, 1 проснулась; просыпается быстрее, чем засыпает
    wake: 0
  }

  let view = null
  let name = null
  let backdrop = null
  let groundName = null

  function setBackground(next) {
    if (!BACKGROUNDS.includes(next) || next === groundName) return
    if (backdrop) disposeScene(backdrop.scene)
    groundName = next
    backdrop = createBackdrop({ renderer, colors }, next)
  }

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
    view.resize(clientWidth, clientHeight)
  }
  new ResizeObserver(resize).observe(container)

  function setState(next) {
    Object.assign(target, next)
  }

  // Нота слоя: спайк в его популяции (если не в рефрактерном периоде).
  // Виды цепи получают саму ноту: слой, силу, высоту, длину, акцент
  function pulse(layer, event = {}) {
    if (!reducedMotion) spikes.fire(layer)
    view?.pulse?.(layer, event)
  }

  let lastTime = performance.now()
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    if (document.hidden || !view) return

    const ease = 1 - Math.exp(-dt * 2.5)
    const wakeGoal = target.sounding ? 1 : 0
    look.wake +=
      (wakeGoal - look.wake) *
      (1 - Math.exp(-dt * (wakeGoal > look.wake ? 2.2 : 0.8)))
    const part = PART_LOOK[target.part]
    const closed = Math.max(0, -target.djFilter)
    look.saturation = lerp(look.saturation, part.saturation, ease * 0.4)
    look.density = lerp(
      look.density,
      part.density * (1 - closed * 0.5),
      ease * 0.4
    )
    look.dim = lerp(look.dim, 1 - closed * 0.3, ease)
    look.links = lerp(look.links, part.links, ease * 0.4)
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
    spikes.update(dt, reducedMotion ? 0 : 0.8 * look.energy * look.wake, decay)

    view.update({ dt, time: now / 1000, target, look, speed, decay, spikes })
    // свой фон у видов из эталонных сцен; остальные рисуются поверх общего
    renderer.clear()
    if (!view.ownBackdrop) {
      backdrop.update(
        dt,
        look,
        (reducedMotion ? 0.15 : 1) * Math.max(0.08, look.wake)
      )
      renderer.render(backdrop.scene, view.camera)
    }
    renderer.render(view.scene, view.camera)
  }

  setBackground(BACKGROUNDS.includes(ground) ? ground : 'dust')
  setMode(CREATE[mode] ? mode : 'field')
  requestAnimationFrame(frame)

  return { setState, pulse, setMode, setBackground, getMode: () => name }
}
