// Цепь нейронов: общее поведение видов «Тоннель» и «Волна».
// Здесь решается, где стоит каждый нейрон, когда он рождается и когда
// в него приходит импульс. Как нейрон выглядит, решает вид.
// Импульс проходит один пролёт за такт и доходит до следующего нейрона
// перед сильной долей: дендриты, потом тело вспыхивают на долю.
// Нейрон впереди собирается по мере приближения камеры.
// На периферии живут нейроны слоёв: нота зажигает нейрон своего слоя,
// и его сигнал бежит по аксону к цепи. Пока звука нет, всё стоит.
import * as THREE from 'three'

export const CHAIN = 7
export const SIDE = 14
export const NEURONS = CHAIN + SIDE
export const SPACING = 4.2
const LEAD = 3.2 // камера держится позади импульса
const SIDE_SPAN = 46 // участок пути, на котором разложена периферия
const LEAVE = 0.12 // доля такта: импульс выходит из тела
const ARRIVE = 0.88 // доля такта: импульс дошёл до дендритов следующего
const SIGNAL_TIME = 1.3 // секунды, за которые сигнал периферии доходит до цепи

const smoothstep = THREE.MathUtils.smoothstep
const slotOf = (k) => ((k % CHAIN) + CHAIN) % CHAIN

// Изгиб пути цепи
export function bend(s, out) {
  return out.set(
    0.9 * Math.sin(s * 0.11) + 0.4 * Math.sin(s * 0.047 + 1.3),
    0.55 * Math.sin(s * 0.083 + 0.7)
  )
}

// Аксон от a к b: дуга, выгнутая вбок. Та же формула в JS для камеры.
export const AXON_GLSL = /* glsl */ `
vec3 axonPoint(vec3 a, vec3 b, float t, float seed) {
  vec3 dir = b - a + vec3(0.0, 0.0, -0.0001);
  float len = length(dir);
  vec3 bow = normalize(cross(dir / len, vec3(sin(seed * 1.7), cos(seed * 2.3), 0.35)));
  return a + dir * t + bow * sin(t * 3.14159) * len * 0.12;
}`

const along = new THREE.Vector3()
const bow = new THREE.Vector3()
const direction = new THREE.Vector3()
const seedAxis = new THREE.Vector3()
export function axonPoint(a, b, t, seed, out) {
  along.subVectors(b, a)
  along.z -= 0.0001
  const length = along.length()
  direction.copy(along).divideScalar(length)
  seedAxis.set(Math.sin(seed * 1.7), Math.cos(seed * 2.3), 0.35)
  bow.crossVectors(direction, seedAxis).normalize()
  return out
    .copy(a)
    .addScaledVector(along, t)
    .addScaledVector(bow, Math.sin(t * Math.PI) * length * 0.12)
}

// Состояние нейронов уходит в шейдер одинаковыми массивами во всех видах
export const NEURON_GLSL = /* glsl */ `
uniform vec3 uCenter[${NEURONS}];
uniform vec3 uNext[${NEURONS}];
uniform vec4 uState[${NEURONS}];
uniform vec4 uLook[${NEURONS}];
uniform vec3 uTint[${NEURONS}];`

export function neuronUniforms() {
  const list = (make) => ({ value: Array.from({ length: NEURONS }, make) })
  return {
    // центр тела и куда тянется аксон
    uCenter: list(() => new THREE.Vector3(0, 0, 99)),
    uNext: list(() => new THREE.Vector3(0, 0, 99)),
    // рост 0..1, секунды после вспышки, видимость, импульс на аксоне 0..1
    uState: list(() => new THREE.Vector4(0, 99, 0, -1)),
    // масштаб, жизнь слоя, подсветка от сигнала периферии, зерно формы
    uLook: list(() => new THREE.Vector4()),
    // цвет вспышки
    uTint: list(() => new THREE.Vector3())
  }
}

export function writeNeurons(neurons, uniforms) {
  neurons.forEach((n, i) => {
    uniforms.uCenter.value[i].copy(n.center)
    uniforms.uNext.value[i].copy(n.next)
    uniforms.uState.value[i].set(n.grow, n.age, n.fade, n.impulse)
    uniforms.uLook.value[i].set(n.scale, n.alive, n.boost, n.seed)
    uniforms.uTint.value[i].copy(n.tint)
  })
}

// tints: цвета слоёв, rest: цвет покоя (оба Vector3 в 0..1)
export function createChain({ tints, rest, reducedMotion }) {
  const neurons = Array.from({ length: NEURONS }, (_, i) => ({
    center: new THREE.Vector3(0, 0, 99),
    next: new THREE.Vector3(0, 0, 99),
    grow: 0,
    age: 99,
    fade: 0,
    impulse: -1,
    boost: 0,
    alive: 1,
    tint: rest.clone(),
    scale: i < CHAIN ? 0.22 : 0.11 + Math.random() * 0.06,
    seed: Math.random() * 10,
    fired: -99,
    // цепь: номер нейрона на пути и сдвиг от оси
    index: -1,
    offset: new THREE.Vector2(),
    // периферия: место на пути, угол и расстояние от оси, слой
    s: 0,
    angle: 0,
    radius: 0,
    layer: i % 6
  }))
  const chain = neurons.slice(0, CHAIN)
  const side = neurons.slice(CHAIN)

  const state = {
    travel: -LEAD,
    // где сейчас импульс цепи и нейрон, к которому он идёт
    impulse: new THREE.Vector3(),
    target: new THREE.Vector3(),
    // последняя вспышка цепи: для света вокруг
    flash: { point: new THREE.Vector3(0, 0, 99), tint: rest.clone(), age: 99 },
    kick: 0
  }

  const flat = new THREE.Vector2()
  const start = new THREE.Vector3()
  const seen = new WeakSet()
  let time = 0
  let hop = 0
  let arrived = -1
  let lastBar = null
  let colorTurn = 0

  function placeSide(n, s) {
    n.s = s
    n.angle = Math.random() * Math.PI * 2
    n.radius = 2.3 + Math.random() * 3.4
    n.fired = -99
  }
  side.forEach((n, j) =>
    placeSide(n, -LEAD - 3 + ((j + Math.random()) * SIDE_SPAN) / SIDE)
  )

  function chainPosition(k, out) {
    const s = k * SPACING
    bend(s, flat)
    const slot = neurons[slotOf(k)]
    return out.set(
      flat.x + slot.offset.x,
      flat.y + slot.offset.y,
      -(s - state.travel)
    )
  }

  function assign(k) {
    const n = neurons[slotOf(k)]
    if (n.index === k) return
    n.index = k
    const angle = k * 2.4
    n.offset
      .set(Math.cos(angle), Math.sin(angle))
      .multiplyScalar(0.25 + ((k * 0.37) % 1) * 0.2)
    n.fired = -99
    n.tint.copy(rest)
  }

  // цвет импульса: по кругу из включённых слоёв
  function nextTint(on) {
    const playing = on.map((isOn, i) => (isOn ? i : -1)).filter((i) => i !== -1)
    if (!playing.length) return rest
    colorTurn++
    return tints[playing[colorTurn % playing.length]]
  }

  function fire(n, tint) {
    n.fired = time
    n.tint.copy(tint)
    state.flash.point.copy(n.center)
    state.flash.tint.copy(tint)
    state.flash.age = 0
  }

  function update(dt, { target, look, spikes }) {
    const motion = reducedMotion ? 0 : 1
    const live = look.wake * motion
    time += dt

    // один пролёт на такт; пока звучит, фаза подтягивается к такту звука
    hop += dt * (target.bpm / 240) * live
    if (target.beat !== null && live > 0.5) {
      let error = (target.beat % 1) - (hop % 1)
      error -= Math.round(error)
      hop += error * Math.min(1, dt * 2)
    }
    const index = Math.floor(hop)
    const phase = hop - index
    for (let k = index - 1; k < index - 1 + CHAIN; k++) assign(k)
    const impulse = reducedMotion ? -1 : smoothstep(phase, LEAVE, ARRIVE)

    // камера отстаёт от импульса и мягко его догоняет
    const linear = hop * SPACING
    const eased = (index + Math.max(impulse, 0)) * SPACING
    const goal = linear + (eased - linear) * 0.45 - LEAD
    if (!reducedMotion)
      state.travel += (goal - state.travel) * (1 - Math.exp(-dt * 3))
    for (let k = index - 1; k < index - 1 + CHAIN; k++)
      chainPosition(k, neurons[slotOf(k)].center)

    // пробуждение: первым вспыхивает нейрон, на котором стоит импульс
    if (live > 0.3 && arrived < index) {
      arrived = index
      fire(neurons[slotOf(index)], nextTint(target.on))
    }
    // импульс дошёл до следующего нейрона
    if (live > 0.3 && phase >= ARRIVE && arrived < index + 1) {
      arrived = index + 1
      fire(neurons[slotOf(index + 1)], nextTint(target.on))
    }
    // без анимации: камера стоит, на каждый такт светится один из ближних
    const bar = target.beat === null ? null : Math.floor(target.beat)
    if (reducedMotion && bar !== null && bar !== lastBar) {
      fire(neurons[slotOf(bar % 3)], nextTint(target.on))
    }
    lastBar = bar

    // ноты: нейрон своего слоя на периферии; бочка ещё и толкает сцену
    spikes.spikes.forEach((spike) => {
      if (seen.has(spike)) return
      seen.add(spike)
      if (spike.layer === 0) state.kick = Math.max(state.kick, spike.strength)
      let best = null
      let bestScore = Infinity
      side.forEach((n) => {
        const d = n.s - state.travel
        if (
          n.layer !== spike.layer ||
          d < 1.5 ||
          d > 24 ||
          time - n.fired < 0.9
        )
          return
        const score = Math.abs(d - 9) + Math.random() * 5
        if (score < bestScore) {
          best = n
          bestScore = score
        }
      })
      if (best) best.fired = time
    })
    state.kick *= Math.exp(-dt * 6)
    state.flash.age += dt

    chain.forEach((n) => {
      const k = n.index
      const d = k * SPACING - state.travel
      // аксон кончается у дендритов следующего нейрона, ближе к камере
      chainPosition(k + 1, n.next)
      n.next.z += neurons[slotOf(k + 1)].scale * 1.3
      n.grow = 1 - smoothstep(d, 10, 19)
      n.age = reducedMotion ? Math.max(time - n.fired, 0.6) : time - n.fired
      n.fade = smoothstep(d, -0.4, 1.6) * (1 - smoothstep(d, 26, 30))
      n.impulse = k === index ? impulse : -1
      n.alive = 0.75 + 0.25 * look.wake
      n.boost *= Math.exp(-dt * 3)
    })

    side.forEach((n) => {
      let d = n.s - state.travel
      if (d < -3) {
        placeSide(n, n.s + SIDE_SPAN)
        d += SIDE_SPAN
      }
      bend(n.s, flat)
      n.center.set(
        flat.x + Math.cos(n.angle) * n.radius,
        flat.y + Math.sin(n.angle) * n.radius * 0.75,
        -d
      )
      // аксон периферии идёт к ближайшему нейрону цепи
      const k = Math.max(
        index - 1,
        Math.min(index + CHAIN - 2, Math.round(n.s / SPACING))
      )
      n.next.copy(neurons[slotOf(k)].center)
      n.grow = 1 - smoothstep(d, 16, 26)
      n.age = reducedMotion ? Math.max(time - n.fired, 0.6) : time - n.fired
      n.fade = smoothstep(d, -1, 2) * (1 - smoothstep(d, 34, 40))
      n.impulse =
        !reducedMotion && n.age < SIGNAL_TIME
          ? smoothstep(n.age, 0.3, SIGNAL_TIME)
          : -1
      if (n.age >= SIGNAL_TIME && n.age - dt < SIGNAL_TIME)
        neurons[slotOf(k)].boost = 1
      n.alive = 0.3 + 0.7 * look.alive[n.layer]
      n.tint.copy(tints[n.layer])
    })

    // где импульс цепи сейчас: для камеры
    const carrier = neurons[slotOf(index)]
    start.copy(carrier.center).z -= carrier.scale * 1.85
    if (impulse < 0) state.impulse.copy(carrier.center)
    else axonPoint(start, carrier.next, impulse, carrier.seed, state.impulse)
    state.target.copy(neurons[slotOf(index + 1)].center)
  }

  return { neurons, state, update }
}
