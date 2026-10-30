// «Кора»: ткань во весь экран, как срез коры под микроскопом. Около тысячи
// нейронов в колонках и пустотах, каждый связан с ближними соседями,
// редкие длинные аксоны тянутся дальше. Ключевые нейроны крупнее и ярче.
// Нота зажигает нейрон своего слоя (сторона экрана по панораме, высота
// у мелодии по ноте), от него по связям бегут импульсы, у соседей
// загорается лавина. К концу сета лавины короче, в тишине сеть почти спит.
import * as THREE from 'three'
import { createGraph, nearest, uniqueLinks, fireNotes } from './graph.js'
import { LAYERS } from './hearing.js'

const STEP = 1.05

function tissue() {
  const neurons = []
  for (let row = -13; row <= 13; row++) {
    for (let col = -27; col <= 27; col++) {
      const x = (col + (row % 2) * 0.5) * STEP + (Math.random() - 0.5) * 0.7
      const y = row * STEP * 0.87 + (Math.random() - 0.5) * 0.7
      // узор ткани: колонки и пустоты, как на срезе коры
      const pattern =
        Math.sin(x * 0.32 + 1.3) * Math.cos(y * 0.41) +
        Math.sin((x + y) * 0.19) * 0.8
      if (pattern < -0.6 + Math.random() * 0.5) continue
      neurons.push({
        position: new THREE.Vector3(x, y, (Math.random() - 0.5) * 4),
        layer: Math.floor(Math.random() * LAYERS),
        hub: Math.random() < 0.05,
        u: x / 22,
        v: y / 11
      })
    }
  }
  const points = neurons.map(({ position }) => position)
  const pairs = []
  nearest(points, 6, 2.2).forEach((list, a) => {
    list.slice(0, neurons[a].hub ? 6 : 3).forEach((b) => pairs.push({ a, b }))
    // редкий длинный аксон
    if (Math.random() < 0.04) {
      const b = Math.floor(Math.random() * neurons.length)
      const distance = points[a].distanceTo(points[b])
      if (distance > 3 && distance < 9) pairs.push({ a, b })
    }
  })
  const links = uniqueLinks(pairs).map(({ a, b }) => {
    const along = points[b].clone().sub(points[a])
    // дендрит изогнут вбок, в плоскости ткани
    const bend = new THREE.Vector3(-along.y, along.x, 0)
      .normalize()
      .multiplyScalar(along.length() * (Math.random() - 0.5) * 0.45)
    return { a, b, bend }
  })
  return { neurons, links }
}

export function createCortex({ scene, camera, renderer, colors }) {
  const { neurons, links } = tissue()
  const graph = createGraph({ renderer, colors }, neurons, links, {
    dots: 8,
    size: 5.2,
    dot: 2.2,
    edgeBase: 0.3,
    endShare: 0.2,
    speed: 2.6,
    spread: 0.62,
    depthLimit: 6
  })
  scene.add(graph.group)

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
    fireNotes(graph, notes)
    // фоновая активность: в тишине редкая, со звуком чаще
    if (Math.random() < dt * (0.12 + look.energy * look.wake * 1.2))
      graph.wander(0.35)
    const alive = look.alive.map((value, i) => value + hearing.glow[i] * 0.3)
    graph.update(dt, {
      look,
      alive,
      speedNow: 2.6 * tempo * (0.4 + 0.6 * look.wake),
      decay,
      travel,
      avalanche: 0.55 + 0.45 * look.saturation
    })
    graph.setLook(look, dim)
    // ткань медленно плывёт, камера чуть качается
    graph.group.rotation.z = Math.sin(clock * 0.03) * 0.04
    camera.position.x = Math.sin(clock * 0.05) * 1.2
    camera.position.y = Math.cos(clock * 0.04) * 0.8
    camera.lookAt(0, 0, 0)
  }

  return { update }
}
