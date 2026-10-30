// Аудиодвижок. DOM не трогает, события отдаёт через setListener.
import {
  kick,
  perc,
  bass,
  pad,
  melody,
  texture,
  layers,
  parts,
  tempoRamp,
  master
} from './settings.js'

const STEPS = [...Array(16).keys()]

// isOn: играет сейчас, wantOn: включится с начала такта.
// steps копируются, чтобы сброс вернул исходные шаги.
const state = {}
layers.forEach((layer) => {
  const start = parts[0].layers[layer.id]
  state[layer.id] = {
    isOn: start.on,
    wantOn: start.on,
    variation: start.variation,
    wantVariation: start.variation,
    volume: layer.channel.volume,
    isMuted: false
  }
})
let patterns = copyPatterns()
let currentPart = 0
let wantPart = 0
let nodes = null
let playing = false
let pending = []
let listener = () => {}

function copyPatterns() {
  return {
    kick: kick.variations.map((v) => [...v.steps]),
    perc: perc.variations.map((v) => [...v.steps])
  }
}

export function setListener(callback) {
  listener = callback
}

// Draw пропускает опоздавшие кадры: для подсветки это допустимо.
function notify(event, time) {
  Tone.getDraw().schedule(() => listener({ ...event, time }), time)
}

// фильтр → эхо → реверб → канал
function initChain(layer, output) {
  const filter = new Tone.Filter(layer.filter)
  const feedbackDelay = new Tone.FeedbackDelay(layer.feedbackDelay)
  const reverb = new Tone.Reverb(layer.reverb)
  const channel = new Tone.Channel(layer.channel).connect(output)
  const meter = new Tone.Meter({ smoothing: 0.8 })
  filter.chain(feedbackDelay, reverb, channel)
  channel.connect(meter)
  return { filter, feedbackDelay, reverb, channel, meter }
}

// Шаги читаются на каждом шаге: правка на растре слышна сразу.
function initKick(output) {
  const chain = initChain(kick, output)
  const synth = new Tone.MembraneSynth(kick.synth).connect(chain.filter)
  const sequence = new Tone.Sequence(
    (time, step) => {
      const layerState = state.kick
      if (!layerState.isOn) return
      if (!patterns.kick[layerState.variation][step]) return
      synth.triggerAttackRelease(kick.note, '8n', time, kick.velocity)
      notify({ type: 'note', layer: 'kick', velocity: kick.velocity }, time)
    },
    STEPS,
    '16n'
  ).start(0)
  return { ...chain, synth, sequence }
}

function initPerc(output) {
  const chain = initChain(perc, output)
  const highpass = new Tone.Filter(perc.highpass).connect(chain.filter)
  const synth = new Tone.NoiseSynth(perc.synth).connect(highpass)
  const tick = new Tone.Synth(perc.tick).connect(chain.filter)
  const sequence = new Tone.Sequence(
    (time, step) => {
      const layerState = state.perc
      if (!layerState.isOn) return
      const variation = perc.variations[layerState.variation]
      if (patterns.perc[layerState.variation][step]) {
        synth.triggerAttackRelease('16n', time, perc.velocity)
        notify({ type: 'note', layer: 'perc', velocity: perc.velocity }, time)
      }
      if (variation.ticks.includes(step)) {
        tick.triggerAttackRelease(perc.tickNote, '32n', time, perc.velocity)
        notify({ type: 'note', layer: 'perc', velocity: 1, accent: true }, time)
      }
    },
    STEPS,
    '16n'
  ).start(0)
  return { ...chain, highpass, synth, tick, sequence }
}

// По одному Part на вариацию, звучит выбранная.
function initPartLayer(layer, synth, output) {
  const chain = initChain(layer, output)
  synth.connect(chain.filter)
  const variationParts = layer.variations.map((variation, index) => {
    const part = new Tone.Part((time, note) => {
      const layerState = state[layer.id]
      if (!layerState.isOn || layerState.variation !== index) return
      synth.triggerAttackRelease(
        note.noteName,
        note.duration,
        time,
        layer.velocity
      )
      // высота и длина ноты нужны визуалу: мелодия бежит по своей ветке
      notify(
        {
          type: 'note',
          layer: layer.id,
          velocity: layer.velocity,
          note: note.noteName,
          duration: Tone.Time(note.duration).toSeconds()
        },
        time
      )
    }, variation.part).start(0)
    part.loop = true
    part.loopEnd = layer.loop
    return part
  })
  return { ...chain, synth, variationParts }
}

function initBass(output) {
  return initPartLayer(bass, new Tone.Synth(bass.synth), output)
}

function initPad(output) {
  const synth = new Tone.PolySynth(Tone.Synth, pad.synth)
  synth.maxPolyphony = pad.maxPolyphony
  return initPartLayer(pad, synth, output)
}

function initMelody(output) {
  const synth = new Tone.PolySynth(Tone.Synth, melody.synth)
  synth.maxPolyphony = melody.maxPolyphony
  return initPartLayer(melody, synth, output)
}

// Шум играет всегда, слой открывается громкостью gate.
function initTexture(output) {
  const chain = initChain(texture, output)
  const gate = new Tone.Gain(0).connect(chain.filter)
  const variation = texture.variations[state.texture.variation]
  const bandpass = new Tone.Filter({ type: 'bandpass', ...variation.bandpass })
  bandpass.connect(gate)
  const noise = new Tone.Noise(texture.noise).connect(bandpass).start()
  const [quiet, loud] = texture.crackleVelocity
  const crackle = new Tone.NoiseSynth(texture.crackle).connect(bandpass)
  const sequence = new Tone.Sequence(
    (time) => {
      const layerState = state.texture
      const chance = texture.variations[layerState.variation].crackle
      if (layerState.isOn && Math.random() < chance) {
        const velocity = quiet + Math.random() * (loud - quiet)
        crackle.triggerAttackRelease('64n', time, velocity)
        notify({ type: 'note', layer: 'texture', velocity }, time)
      }
    },
    STEPS,
    '16n'
  ).start(0)
  return { ...chain, gate, bandpass, noise, crackle, sequence }
}

// шина → DJ-фильтр → эхо → громкость части → канал → лимитер
function initMaster() {
  const bus = new Tone.Gain()
  const lowpass = new Tone.Filter(master.lowpass)
  const highpass = new Tone.Filter(master.highpass)
  const feedbackDelay = new Tone.FeedbackDelay(master.feedbackDelay)
  const partVolume = new Tone.Volume(parts[currentPart].level)
  const channel = new Tone.Channel(master.channel)
  const limiter = new Tone.Limiter(master.limiter.threshold).toDestination()
  const meter = new Tone.Meter({ smoothing: 0.8 })
  bus.chain(lowpass, highpass, feedbackDelay, partVolume, channel, limiter)
  limiter.connect(meter)
  return {
    bus,
    lowpass,
    highpass,
    feedbackDelay,
    partVolume,
    channel,
    limiter,
    meter
  }
}

function initClock() {
  return new Tone.Sequence(
    (time, step) => notify({ type: 'step', step }, time),
    STEPS,
    '16n'
  ).start(0)
}

// Общий промис: повторный клик не создаёт второй набор голосов.
let starting = null
export function ensureStarted() {
  if (!starting) starting = startAudio()
  return starting
}

async function startAudio() {
  // буфер побольше: тяжёлая графика не рвёт звук. Задержка не мешает,
  // смены всё равно ждут начала такта
  Tone.setContext(
    new Tone.Context({ latencyHint: 'playback', lookAhead: 0.15 })
  )
  await Tone.start()
  const transport = Tone.getTransport()
  transport.bpm.value = parts[currentPart].bpm
  const masterNodes = initMaster()
  nodes = {
    master: masterNodes,
    kick: initKick(masterNodes.bus),
    perc: initPerc(masterNodes.bus),
    bass: initBass(masterNodes.bus),
    pad: initPad(masterNodes.bus),
    melody: initMelody(masterNodes.bus),
    texture: initTexture(masterNodes.bus),
    clock: initClock()
  }
  syncDelays(transport.bpm.value, 0)
}

// Состояние Transport меняется с задержкой старта, поэтому флаг свой.
export function isPlaying() {
  return playing
}

// Звук идёт на самом деле: транспорт уже стартовал и контекст не на паузе.
// По этому флагу просыпаются нейроны, а не по клику.
export function isSounding() {
  return (
    playing &&
    Tone.getTransport().state === 'started' &&
    Tone.getContext().state === 'running'
  )
}

export async function togglePlay() {
  await ensureStarted()
  const transport = Tone.getTransport()
  playing = !playing
  if (!playing) {
    // иначе отложенные смены сработают на старом номере такта
    pending.forEach(({ id, callback }) => {
      transport.clear(id)
      callback(Tone.now())
    })
    pending = []
    transport.stop()
    nodes.pad.synth.releaseAll()
    nodes.melody.synth.releaseAll()
    nodes.texture.gate.gain.rampTo(0, 0.5)
  } else {
    transport.start('+0.1')
    if (state.texture.isOn) nodes.texture.gate.gain.rampTo(1, texture.fadeTime)
  }
  return playing
}

// Смены квантуются по такту. '@1m' считает в секундах и после плавной
// смены темпа промахивается, поэтому граница такта считается в тиках.
function atNextBar(callback) {
  const transport = Tone.getTransport()
  if (!nodes || !playing) {
    callback(Tone.now())
    return
  }
  const bar = transport.PPQ * 4
  const nextBar = Math.ceil((transport.ticks + transport.PPQ / 8) / bar) * bar
  // за тик до такта, чтобы первая нота такта уже звучала по-новому
  const item = { callback }
  item.id = transport.scheduleOnce(
    (time) => {
      pending = pending.filter((other) => other !== item)
      callback(time)
    },
    `${nextBar - 1}i`
  )
  pending.push(item)
}

function applyLayer(id, time) {
  const layerState = state[id]
  const isChanged =
    layerState.isOn !== layerState.wantOn ||
    layerState.variation !== layerState.wantVariation
  if (!isChanged) return

  if (layerState.variation !== layerState.wantVariation) {
    layerState.variation = layerState.wantVariation
    if (nodes && id === 'texture') {
      const variation = texture.variations[layerState.variation]
      nodes.texture.bandpass.frequency.rampTo(
        variation.bandpass.frequency,
        2,
        time
      )
      nodes.texture.bandpass.Q.rampTo(variation.bandpass.Q, 2, time)
    }
  }

  layerState.isOn = layerState.wantOn
  if (nodes && id === 'texture' && isPlaying()) {
    nodes.texture.gate.gain.rampTo(
      layerState.isOn ? 1 : 0,
      texture.fadeTime,
      time
    )
  }
}

export function getLayerState(id) {
  const { isOn, wantOn, variation, wantVariation, isMuted } = state[id]
  return { isOn, wantOn, variation, wantVariation, isMuted }
}

export function toggleLayer(id) {
  state[id].wantOn = !state[id].wantOn
  atNextBar((time) => applyLayer(id, time))
  return getLayerState(id)
}

export function setVariation(id, variation) {
  state[id].wantVariation = variation
  atNextBar((time) => applyLayer(id, time))
  return getLayerState(id)
}

export function getCurrentPart() {
  return currentPart
}

export function selectPart(index) {
  wantPart = index
  const part = parts[index]
  layers.forEach((layer) => {
    state[layer.id].wantOn = part.layers[layer.id].on
    state[layer.id].wantVariation = part.layers[layer.id].variation
  })
  atNextBar((time) => {
    if (wantPart !== index) return
    currentPart = index
    layers.forEach((layer) => applyLayer(layer.id, time))
    if (nodes) {
      const seconds = Tone.Time(tempoRamp).toSeconds()
      setTempo(part.bpm, seconds, time)
      nodes.master.partVolume.volume.rampTo(part.level, seconds, time)
      setMasterParam('djFilter', part.djFilter, time)
    }
  })
}

export function getWantPart() {
  return wantPart
}

// Эхо на пунктирной восьмой следует за темпом
function syncDelays(bpm, seconds, time) {
  const delayTime = (60 / bpm) * 0.75
  const delays = layers.map((layer) => nodes[layer.id].feedbackDelay)
  delays.push(nodes.master.feedbackDelay)
  delays.forEach((delay) =>
    delay.delayTime.rampTo(delayTime, seconds || 0.05, time)
  )
}

export function setTempo(bpm, seconds = 0.5, time) {
  if (!nodes) return
  Tone.getTransport().bpm.rampTo(bpm, seconds, time)
  syncDelays(bpm, seconds, time)
}

// свинг: каждая вторая шестнадцатая чуть позже
export function setSwing(amount) {
  if (!nodes) return
  const transport = Tone.getTransport()
  transport.swingSubdivision = '16n'
  transport.swing = amount
}

export function getTempo() {
  return Tone.getTransport().bpm.value
}

export function getSteps(id) {
  return patterns[id][state[id].wantVariation]
}

export function toggleStep(id, step) {
  const steps = getSteps(id)
  steps[step] = steps[step] ? 0 : 1
  return steps[step]
}

export function resetSteps() {
  patterns = copyPatterns()
}

// При mute громкость только запоминается: запись volume снимает mute у Channel.
export function setLayerParam(id, param, value) {
  const layerState = state[id]
  if (param === 'volume') layerState.volume = value
  if (param === 'mute') layerState.isMuted = value
  if (!nodes) return

  const layerNodes = nodes[id]
  if (param === 'filter') layerNodes.filter.frequency.rampTo(value, 0.1)
  if (param === 'echo') layerNodes.feedbackDelay.wet.rampTo(value, 0.1)
  if (param === 'space') layerNodes.reverb.wet.rampTo(value, 0.1)
  if (param === 'pan') layerNodes.channel.pan.rampTo(value, 0.1)
  if (param === 'volume' && !layerState.isMuted) {
    layerNodes.channel.volume.rampTo(value, 0.1)
  }
  if (param === 'mute') {
    layerNodes.channel.mute = value
    if (!value) layerNodes.channel.volume.value = layerState.volume
  }
}

// -1: lowpass закрыт, 0: открыт, 1: highpass закрыт
export function setMasterParam(param, value, time) {
  if (!nodes) return
  const masterNodes = nodes.master
  if (param === 'djFilter') {
    const { lowpassMin, highpassMax } = master.djFilterRange
    const lowpass = value < 0 ? 20000 * (lowpassMin / 20000) ** -value : 20000
    const highpass = value > 0 ? 20 * (highpassMax / 20) ** value : 20
    masterNodes.lowpass.frequency.rampTo(lowpass, 0.1, time)
    masterNodes.highpass.frequency.rampTo(highpass, 0.1, time)
  }
  if (param === 'echo') masterNodes.feedbackDelay.wet.rampTo(value, 0.1)
  if (param === 'volume') masterNodes.channel.volume.rampTo(value, 0.1)
}

// Позиция транспорта в тактах, для визуала (круг «Дыхание»)
// по слышимому времени: transport.ticks идёт с запасом lookAhead
// и опережал бы звук на 0.15 с
export function getBarPosition() {
  const transport = Tone.getTransport()
  return transport.getTicksAtTime(Tone.immediate()) / (transport.PPQ * 4)
}

export function getLevels() {
  if (!nodes) return null
  const levels = { master: nodes.master.meter.getValue() }
  layers.forEach(
    (layer) => (levels[layer.id] = nodes[layer.id].meter.getValue())
  )
  return levels
}
