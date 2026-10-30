// «Мозг»: коннектом. Два полушария из нейронов коры с бороздами, внутри
// глубокие узлы (таламус), снизу ствол. Связи трёх видов: соседи по коре,
// дуги мозолистого тела между полушариями и пучки от таламуса к коре.
// Мозг медленно поворачивается туда и обратно; бочка чуть его раздувает, бас зажигает
// глубокие узлы, мелодия бежит по коре на высоте ноты.
import * as THREE from 'three'
import { createGraph, nearest, uniqueLinks, fireNotes } from './graph.js'
import { KICK, LAYERS } from './hearing.js'

// полушарие: эллипсоид с бороздами, точки по спирали Фибоначчи
function hemisphere(side, count, neurons) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - y * y)
    const angle = i * golden
    const x = Math.cos(angle) * ring
    const z = Math.sin(angle) * ring
    // внутренняя стенка полушария плоская, там его сосед
    if (x * side < -0.55) continue
    const folds =
      1 + 0.05 * Math.sin(angle * 9 + y * 11) * Math.cos(y * 7 + angle * 3)
    neurons.push({
      position: new THREE.Vector3(
        side * 2.6 + x * 4.1 * folds,
        y * 4.4 * folds,
        z * 6.6 * folds
      ),
      layer: Math.floor(Math.random() * LAYERS),
      hub: Math.random() < 0.04,
      u: (side * 2.6 + x * 4.1) / 7,
      v: y
    })
  }
}

function connectome() {
  const neurons = []
  hemisphere(-1, 1100, neurons)
  hemisphere(1, 1100, neurons)
  const cortex = neurons.length
  // таламус: глубокие ключевые нейроны в середине
  for (let i = 0; i < 28; i++) {
    neurons.push({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        -0.8 + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 3
      ),
      layer: i % LAYERS,
      hub: true,
      u: 0,
      v: -0.2
    })
  }
  // ствол уходит вниз и назад
  for (let i = 0; i < 9; i++) {
    neurons.push({
      position: new THREE.Vector3(0, -2.4 - i * 0.6, -1.2 - i * 0.35),
      layer: i % LAYERS,
      hub: i === 0,
      u: 0,
      v: -0.6 - i * 0.05
    })
  }
  const points = neurons.map(({ position }) => position)
  const pairs = []
  // соседи по коре
  nearest(points.slice(0, cortex), 4, 1.8).forEach((list, a) =>
    list.slice(0, neurons[a].hub ? 4 : 2).forEach((b) => pairs.push({ a, b }))
  )
  // мозолистое тело: внутренняя кора левого к правому
  const inner = (side) =>
    neurons
      .map((neuron, i) => [neuron, i])
      .filter(
        ([neuron, i]) =>
          i < cortex &&
          neuron.position.x * side > 0 &&
          Math.abs(neuron.position.x) < 3 &&
          neuron.position.y > -0.5
      )
      .map(([, i]) => i)
  const left = inner(-1)
  const right = inner(1)
  for (let k = 0; k < 70 && left.length && right.length; k++) {
    pairs.push({
      a: left[Math.floor(Math.random() * left.length)],
      b: right[Math.floor(Math.random() * right.length)],
      arch: true
    })
  }
  // таламус к коре и ствол цепочкой
  for (let t = cortex; t < cortex + 28; t++) {
    for (let k = 0; k < 7; k++)
      pairs.push({ a: t, b: Math.floor(Math.random() * cortex) })
  }
  for (let s = cortex + 28; s < neurons.length - 1; s++)
    pairs.push({ a: s, b: s + 1 })
  pairs.push({ a: cortex + 28, b: cortex })

  const links = uniqueLinks(pairs).map(({ a, b, arch }) => {
    const along = points[b].clone().sub(points[a])
    const bend = arch
      ? new THREE.Vector3(0, 1.6 + Math.random(), 0)
      : new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).multiplyScalar(along.length() * 0.35)
    return { a, b, bend }
  })
  return { neurons, links }
}

export function createBrain({ scene, renderer, colors }) {
  const { neurons, links } = connectome()
  const graph = createGraph({ renderer, colors }, neurons, links, {
    dots: 9,
    size: 4.2,
    dot: 2,
    edgeBase: 0.2,
    endShare: 0.2,
    speed: 3,
    spread: 0.58,
    depthLimit: 6,
    turning: true,
    span: 7
  })
  graph.group.position.y = 1.4
  graph.group.rotation.x = 0.35
  scene.add(graph.group)

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
    fireNotes(graph, notes)
    if (Math.random() < dt * (0.12 + look.energy * look.wake * 1.2))
      graph.wander(0.35)
    const alive = look.alive.map((value, i) => value + hearing.glow[i] * 0.3)
    graph.update(dt, {
      look,
      alive,
      speedNow: 3 * tempo * (0.4 + 0.6 * look.wake),
      decay,
      travel,
      avalanche: 0.55 + 0.45 * look.saturation
    })
    graph.setLook(look, dim)
    // бочка чуть раздувает мозг, мягко, без вспышки
    swell += (hearing.glow[KICK] * 0.018 - swell) * (1 - Math.exp(-dt * 6))
    graph.group.scale.setScalar(1 + (travel ? swell : 0))
    // поворачивается туда и обратно: левое полушарие остаётся слева
    graph.group.rotation.y = Math.sin(clock * 0.05) * 0.7
  }

  return { update }
}
