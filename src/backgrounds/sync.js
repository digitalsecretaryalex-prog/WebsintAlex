// «Синхрон»: поле нейронов-осцилляторов, как медленные волны сна.
// Каждый нейрон вспыхивает раз в такт по своей фазе, соседи тянут фазы
// друг к другу (модель Курамото), и по полю сами собой бегут волны.
// Чем дальше сет, тем сильнее связь: к части 4 поле дышит одной волной.
// Звук: бочка сбрасывает фазы пятна (со стороны панорамы), от пятна
// расходится кольцо; перкуссия толкает маленькие пятна; бас замедляет
// ритм; пэд усиливает связь (поле сливается); мелодия запускает бегущую
// волну по строке на высоте ноты; фон добавляет дрожь. Волна красится
// в цвет слоя, который её запустил.
import * as THREE from 'three'
import { createGraph } from './graph.js'
import { KICK, PERC, BASS, PAD, MELODY, TEXTURE, LAYERS } from './hearing.js'

const COLUMNS = 70
const ROWS = 34
const STEP = 0.8

function field() {
  const neurons = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = (col - COLUMNS / 2 + (row % 2) * 0.5) * STEP
      const y = (row - ROWS / 2) * STEP * 0.87
      neurons.push({
        position: new THREE.Vector3(
          x + (Math.random() - 0.5) * 0.25,
          y + (Math.random() - 0.5) * 0.25,
          // поле чуть выгнуто, края уходят назад
          -0.012 * x * x + (Math.random() - 0.5) * 0.4
        ),
        layer: Math.floor(Math.random() * LAYERS),
        hub: Math.random() < 0.03,
        u: x / 22,
        v: y / 11
      })
    }
  }
  // соседи по шестиугольной сетке: вправо и два вверх
  const links = []
  const at = (col, row) => row * COLUMNS + col
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const a = at(col, row)
      const shift = row % 2
      const near = [
        [col + 1, row],
        [col + shift, row + 1],
        [col + shift - 1, row + 1]
      ]
      near.forEach(([c, r]) => {
        if (c < 0 || c >= COLUMNS || r >= ROWS) return
        links.push({ a, b: at(c, r), bend: new THREE.Vector3() })
      })
    }
  }
  return { neurons, links }
}

export function createSync({ scene, renderer, colors, reducedMotion }) {
  const { neurons, links } = field()
  const count = neurons.length
  const graph = createGraph({ renderer, colors }, neurons, links, {
    dots: 2,
    size: 5.4,
    dot: 2,
    edgeBase: 0.1,
    endShare: 0.6
  })
  scene.add(graph.group)

  const neighbours = neurons.map(() => [])
  links.forEach(({ a, b }) => {
    neighbours[a].push(b)
    neighbours[b].push(a)
  })
  const phase = Float32Array.from({ length: count }, () => Math.random() * 6.28)
  const drift = Float32Array.from(
    { length: count },
    () => 1 + (Math.random() - 0.5) * 0.12
  )
  const shown = new Float32Array(count)
  const tint = Uint8Array.from(neurons, (neuron) => neuron.layer)

  // пятно на поле: центр в координатах поля, радиус, что сделать с фазой
  function touch(cx, cy, radius, layer, change) {
    neurons.forEach((neuron, i) => {
      const distance = Math.hypot(
        neuron.position.x - cx,
        neuron.position.y - cy
      )
      if (distance > radius) return
      phase[i] = change(phase[i], distance)
      tint[i] = layer
    })
  }

  const halfWidth = (COLUMNS / 2) * STEP
  const halfHeight = (ROWS / 2) * STEP * 0.87
  function hear(note) {
    const x = note.pan * halfWidth * 0.7 + (Math.random() - 0.5) * 8
    const y = (Math.random() - 0.5) * halfHeight * 1.4
    const size = 0.5 + note.strength
    if (note.layer === KICK) {
      // фаза отстаёт с расстоянием: от пятна расходится кольцо
      touch(x, y, 3 + size * 3, KICK, (_, distance) => -distance * 0.35)
    } else if (note.layer === PERC) {
      touch(x, y, 1 + size, PERC, (value) => value + 1.2)
    } else if (note.layer === MELODY) {
      // строка на высоте ноты: волна бежит вдоль неё в обе стороны
      const row = (note.pitch * 1.6 - 0.8) * halfHeight
      // открытый фильтр: волна длиннее
      const reach = 3 + size * 5
      neurons.forEach((neuron, i) => {
        const dx = neuron.position.x - x
        if (Math.abs(neuron.position.y - row) > 0.8 || Math.abs(dx) > reach)
          return
        phase[i] = -Math.abs(dx) * 0.3
        tint[i] = MELODY
      })
    } else if (note.layer === TEXTURE) {
      touch(x, y, 0.8, TEXTURE, () => 0)
    } else {
      // бас и пэд: мягко подтягивают большое пятно к общей фазе
      touch(x, y, 6, note.layer, (value) => value * 0.7)
    }
  }

  function update({ dt, look, notes, hearing, dim, decay, tempo, motion }) {
    notes.forEach(hear)
    const glow = hearing.glow
    // один цикл за такт: при 84 уд/мин это 2.9 с, вспышка не чаще
    const cycle = ((tempo * 84) / 60 / 4) * Math.PI * 2
    const rate = cycle * (reducedMotion ? 0.25 : 1) * (1 - glow[BASS] * 0.25)
    // связь: к концу сета и с пэдом сильнее, поле сливается в одну волну
    const pull = 0.5 + (1 - look.saturation) * 1.6 + glow[PAD] * 1.4
    const shake = glow[TEXTURE] * 3
    const step = Math.min(dt, 0.05) * Math.max(0.2, motion)
    for (let i = 0; i < count; i++) {
      let sum = 0
      const list = neighbours[i]
      for (let k = 0; k < list.length; k++)
        sum += Math.sin(phase[list[k]] - phase[i])
      phase[i] +=
        (rate * drift[i] +
          (pull * sum) / list.length +
          shake * (Math.random() - 0.5)) *
        step
    }
    // яркость: узкая вспышка раз за цикл, хвост тянет простор
    const fade = Math.exp(-dt / (decay * 0.6))
    for (let i = 0; i < count; i++) {
      const flash = Math.pow(0.5 + 0.5 * Math.cos(phase[i]), 6)
      const alive = 0.35 + 0.65 * (look.alive[tint[i]] + glow[tint[i]] * 0.3)
      shown[i] = Math.max(flash * alive, shown[i] * fade)
    }
    graph.update(dt, {
      look,
      alive: look.alive,
      speedNow: 0,
      decay,
      travel: false
    })
    for (let i = 0; i < count; i++) graph.paint(i, shown[i], tint[i])
    graph.flush()
    graph.setLook(look, dim)
  }

  return { update }
}
