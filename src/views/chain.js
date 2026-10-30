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
const SIDE = 14
export const NEURONS = CHAIN + SIDE
const SPACING = 4.2
const LEAD = 3.2 // камера держится позади импульса
const SIDE_SPAN = 46 // участок пути, на котором разложена периферия
const LEAVE = 0.12 // доля такта: импульс выходит из тела
const ARRIVE = 0.88 // доля такта: импульс дошёл до дендритов следующего
const SIGNAL_TIME = 1.3 // секунды, за которые сигнал периферии доходит до цепи
// слои по порядку settings.layers
const KICK = 0
const PERC = 1
const BASS = 2
const PAD = 3
const MELODY = 4
const TEXTURE = 5
const PACKETS = 6 // пакетов мелодии на дендритах одновременно

// огибающая вспышки: вход 25 мс, затухание decay секунд
export function envelope(age, decay) {
  if (age < 0) return 0
  return Math.min(1, age / 0.025) * Math.exp(-age / decay)
}

// «C#4» → 0..1 в диапазоне C4…C6: выше нота, выше ветка
export function pitchUnit(name) {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name || '')
  if (!match) return 0.5
  const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const shift = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  const midi = (Number(match[3]) + 1) * 12 + steps[match[1]] + shift
  return Math.min(1, Math.max(0, (midi - 60) / 24))
}

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

// Отклик на звук в шейдерах обоих видов
export const SOUND_GLSL = /* glsl */ `
uniform float uThump;
uniform float uThumpAge;
uniform float uSpark;
uniform float uSparkSeed;
uniform float uBass;
uniform float uPad;
uniform float uChord;
uniform vec4 uPackets[${PACKETS}];
uniform vec3 uKickTint;
uniform vec3 uPercTint;
uniform vec3 uBassTint;
uniform vec3 uPadTint;
uniform vec3 uMelodyTint;
// искра перкуссии: случайная пятая часть кончиков, новый узор на каждый удар
float sparkPick(vec2 id) {
  return step(0.8, fract(sin(dot(id, vec2(12.9898, 78.233)) + uSparkSeed) * 43758.5453));
}
// пакет мелодии на ветке branch нейрона cell; при progress 1 голова у тела
float packetGlow(float cell, float branch, float order) {
  float value = 0.0;
  for (int i = 0; i < ${PACKETS}; i++) {
    vec4 p = uPackets[i];
    if (p.z < 0.0 || abs(p.x - cell) > 0.5 || abs(p.y - branch) > 0.5) continue;
    float d = order - (1.0 - p.z);
    value += p.w * (exp(-d * d * 90.0) + 0.35 * step(0.0, d) * exp(-d * 6.0));
  }
  return value;
}`

export function soundUniforms(tints) {
  return {
    uThump: { value: 0 },
    uThumpAge: { value: 99 },
    uSpark: { value: 0 },
    uSparkSeed: { value: 0 },
    uBass: { value: 0 },
    uPad: { value: 0 },
    uChord: { value: 0 },
    uPackets: { value: [] },
    uKickTint: { value: tints[0] },
    uPercTint: { value: tints[1] },
    uBassTint: { value: tints[2] },
    uPadTint: { value: tints[3] },
    uMelodyTint: { value: tints[4] }
  }
}

export function writeSound(sound, uniforms) {
  uniforms.uThump.value = sound.thump
  uniforms.uThumpAge.value = sound.thumpAge
  uniforms.uSpark.value = sound.spark
  uniforms.uSparkSeed.value = sound.sparkSeed
  uniforms.uBass.value = sound.bass
  uniforms.uPad.value = sound.pad
  uniforms.uChord.value = sound.chord
  uniforms.uPackets.value = sound.packets
}

// Порядок веток нейрона снизу вверх: высокие ноты бегут по верхним веткам
export function branchOrder(branches) {
  return branches
    .map((branch, id) => ({
      id,
      height:
        branch.points.reduce((sum, point) => sum + point.y, 0) /
        branch.points.length
    }))
    .sort((a, b) => a.height - b.height)
    .map(({ id }) => id)
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

// tints: цвета слоёв, rest: цвет покоя (оба Vector3 в 0..1);
// branchFor(cell, 0..1): какая ветка нейрона отвечает за высоту ноты
export function createChain({ tints, rest, reducedMotion, branchFor }) {
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
    kick: 0,
    // Отклик на звук, 0..1 в каждый кадр. У каждого слоя свой:
    // бочка вздрагивает всем, перкуссия искрит кончиками дендритов,
    // бас светит в аксоне, пэд окрашивает тела аккордом, мелодия бежит
    // пакетом по ветке к телу, фон щёлкает пылинками
    sound: {
      thump: 0,
      thumpAge: 99,
      spark: 0,
      sparkSeed: 0,
      bass: 0,
      pad: 0,
      chord: 0,
      crackle: 0,
      crackleSeed: 0,
      packets: Array.from(
        { length: PACKETS },
        () => new THREE.Vector4(-1, 0, -1, 0)
      )
    }
  }
  // удары: { layer, born, strength, accent }; пакеты мелодии; повторы эха
  const hits = []
  const packets = []
  const echoes = []
  let params = null

  const flat = new THREE.Vector2()
  const start = new THREE.Vector3()
  const seen = new WeakSet()
  let time = 0
  let hop = 0
  let arrived = -1
  let lastBar = null
  let colorTurn = 0

  // нейроны слоя стоят с той стороны, куда слой разведён панорамой
  function placeSide(n, s) {
    const pan = params ? params.pan[n.layer] : 0
    n.s = s
    n.angle =
      Math.abs(pan) > 0.05
        ? (pan > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * Math.PI * 0.9
        : Math.random() * Math.PI * 2
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

  // нейрон периферии того же слоя, ближе к середине пути и к своей стороне
  function wakeSide(layer, strength) {
    const pan = params ? params.pan[layer] : 0
    let best = null
    let bestScore = Infinity
    side.forEach((n) => {
      const d = n.s - state.travel
      if (n.layer !== layer || d < 1.5 || d > 24 || time - n.fired < 0.9) return
      const sideMatch =
        Math.abs(pan) > 0.05 && Math.cos(n.angle) * pan < 0 ? 6 : 0
      const score = Math.abs(d - 9) + sideMatch + Math.random() * 5
      if (score < bestScore) {
        best = n
        bestScore = score
      }
    })
    if (best) {
      best.fired = time
      best.strength = strength
    }
  }

  // Нота: event из audio.js (velocity, accent, note, duration).
  // echo > 0: это повтор эха, он слабее и сам эхо не порождает
  function pulse(layer, event = {}, echo = 0) {
    if (!params || layer < 0) return
    if (params.muted[layer]) return
    // тон слоя: закрытый фильтр даёт тусклую вспышку
    const tone = 0.45 + 0.75 * params.filter[layer]
    const strength = (event.velocity ?? 0.8) * tone * (echo || 1)
    if (layer === MELODY) {
      const cell = slotOf(Math.floor(hop) + 1)
      packets.push({
        cell,
        branch: branchFor(cell, pitchUnit(event.note)),
        born: time,
        strength,
        // пакет бежит к телу за полдлины ноты, но не дольше 0.7 с
        length: Math.min(0.7, Math.max(0.3, (event.duration || 0.5) * 0.5))
      })
      if (packets.length > PACKETS) packets.shift()
    } else {
      hits.push({ layer, born: time, strength, accent: !!event.accent })
    }
    if (!echo) wakeSide(layer, strength)
    // эхо слоя: повторы через пунктирную восьмую, как у FeedbackDelay
    const wet = params.echo[layer]
    if (!echo && wet > 0.03 && layer !== TEXTURE) {
      let gain = Math.min(0.9, wet * 1.8)
      for (let k = 1; k <= 3 && gain > 0.08; k++) {
        echoes.push({ at: time + k * params.delay, layer, event, gain })
        gain *= params.feedback[layer] + 0.25
      }
    }
  }

  // сумма огибающих ударов слоя; затухание растёт с простором (реверб)
  function sum(layer, decay) {
    let value = 0
    hits.forEach((hit) => {
      if (hit.layer !== layer) return
      value +=
        hit.strength * (hit.accent ? 1.5 : 1) * envelope(time - hit.born, decay)
    })
    return Math.min(1.4, value)
  }

  function updateSound(dt, target, look) {
    const sound = state.sound
    const space = params.space
    for (let i = echoes.length - 1; i >= 0; i--) {
      if (echoes[i].at > time) continue
      const { layer, event, gain } = echoes.splice(i, 1)[0]
      pulse(layer, event, gain)
    }
    while (hits.length && time - hits[0].born > 4) hits.shift()

    const kicks = hits.filter((hit) => hit.layer === KICK)
    sound.thumpAge = kicks.length ? time - kicks[kicks.length - 1].born : 99
    sound.thump = sum(KICK, 0.14 + space[KICK] * 0.6)
    sound.spark = sum(PERC, 0.05 + space[PERC] * 0.25)
    // новый узор искр на каждый удар перкуссии
    const percs = hits.filter((hit) => hit.layer === PERC)
    if (percs.length) sound.sparkSeed = percs[percs.length - 1].born * 7.31
    sound.crackle = sum(TEXTURE, 0.06)
    const crackles = hits.filter((hit) => hit.layer === TEXTURE)
    if (crackles.length)
      sound.crackleSeed = crackles[crackles.length - 1].born * 3.7
    // бас и пэд: удар ноты плюс ровный уровень, пока нота звучит
    const ease = 1 - Math.exp(-dt * 4)
    sound.bass +=
      (look.alive[BASS] * 0.6 + sum(BASS, 0.5 + space[BASS]) - sound.bass) *
      ease
    sound.pad += (look.alive[PAD] - sound.pad) * (1 - Math.exp(-dt * 1.5))
    sound.chord = sum(PAD, 1.2 + space[PAD] * 2)

    // пакеты мелодии: доля пути от кончика ветки до тела, потом подсветка тела
    for (let i = packets.length - 1; i >= 0; i--) {
      const packet = packets[i]
      const progress = (time - packet.born) / packet.length
      if (progress > 1 && !packet.arrived) {
        packet.arrived = true
        neurons[packet.cell].boost = Math.max(
          neurons[packet.cell].boost,
          packet.strength
        )
      }
      if (progress > 1.6) packets.splice(i, 1)
    }
    sound.packets.forEach((value, i) => {
      const packet = packets[i]
      if (!packet) return value.set(-1, 0, -1, 0)
      const progress = reducedMotion
        ? 0.15
        : Math.min(1, (time - packet.born) / packet.length)
      const fade = reducedMotion ? envelope(time - packet.born, 0.8) : 1
      value.set(packet.cell, packet.branch, progress, packet.strength * fade)
    })
  }

  function update(dt, { target, look, spikes }) {
    const motion = reducedMotion ? 0 : 1
    const live = look.wake * motion
    time += dt
    params = target.sound && {
      ...target.sound,
      delay: (60 / target.bpm) * 0.75
    }

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

    // фоновая активность: редкие слабые вспышки периферии, пока сеть не спит
    spikes.spikes.forEach((spike) => {
      if (seen.has(spike)) return
      seen.add(spike)
      if (spike.strength < 0.5) wakeSide(spike.layer, spike.strength)
    })
    if (params) updateSound(dt, target, look)
    state.kick = state.sound.thump
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
      n.boost = Math.max(n.boost * Math.exp(-dt * 3), 0)
      n.tint.copy(tints[n.layer])
    })

    // где импульс цепи сейчас: для камеры
    const carrier = neurons[slotOf(index)]
    start.copy(carrier.center).z -= carrier.scale * 1.85
    if (impulse < 0) state.impulse.copy(carrier.center)
    else axonPoint(start, carrier.next, impulse, carrier.seed, state.impulse)
    state.target.copy(neurons[slotOf(index + 1)].center)
  }

  return { neurons, state, update, pulse }
}
