// Фоны за нейронами вида. У фона своя сцена и своя камера, поэтому он
// одинаковый во всех шести видах и не улетает вместе с камерой тоннеля.
// Под каждым фоном звёзды. Звук фон получает через слух (hearing.js):
// ноты слоёв событиями, ручки каждый кадр, ответ на ручки у всех общий.
import * as THREE from 'three'
import { createHearing } from './hearing.js'
import { createStars } from './common.js'
import { createMembrane } from './membrane.js'
import { createCortex } from './cortex.js'
import { createBrain } from './brain.js'
import { createSync } from './sync.js'
import { createPlasma } from './plasma.js'
import { createDust } from './dust.js'

const CREATE = {
  membrane: createMembrane,
  cortex: createCortex,
  brain: createBrain,
  sync: createSync,
  plasma: createPlasma,
  dust: createDust
}
export const BACKGROUNDS = Object.keys(CREATE)

export function createBackdrop({ renderer, colors, reducedMotion }, kind) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)
  camera.position.set(0, 0, 30)
  const hearing = createHearing()
  const stars = createStars(renderer, colors, 1600)
  scene.add(stars.points)
  const background = CREATE[kind]({
    scene,
    camera,
    renderer,
    colors,
    reducedMotion
  })

  // clock: время фона; быстрее с темпом, медленнее к концу сета и во сне
  let clock = 0
  // target: музыка из main.js, look: её сглаженный вид из visuals.js,
  // gain: поверх светлой подложки тоннеля и волны фон ярче
  function update(dt, target, look, gain) {
    const motion = (reducedMotion ? 0.15 : 1) * Math.max(0.08, look.wake)
    const tempo = target.bpm / 84
    clock += dt * tempo * (0.5 + look.energy) * motion
    const notes = hearing.listen(dt, target)
    const dim = look.dim * (0.45 + 0.55 * look.wake) * gain
    stars.update(clock, dim)
    background.update({
      dt,
      clock,
      target,
      look,
      notes,
      hearing,
      motion,
      tempo,
      dim,
      // простор всех слоёв: сколько секунд светится вспышка
      decay: 0.45 + target.space * 1.4,
      // импульсы бегут, если движение не уменьшено
      travel: !reducedMotion
    })
  }

  function resize(width, height) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    background.resize?.(width, height)
  }

  return { scene, camera, update, resize, pulse: hearing.pulse }
}
