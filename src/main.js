// Точка входа: связывает звук, контролы и 3D-нейроны.
import {
  layers,
  parts,
  master,
  layerKnobs,
  volumeRange,
  tempoRange,
  swingRange,
  keys
} from './settings.js'
import * as audio from './audio.js'
import {
  createKnob,
  createFader,
  createMuteButton,
  createLaunchButton,
  createVariationButtons,
  createSequencer,
  createPartButtons,
  createIconButton,
  createViewSwitch,
  createStepper
} from './controls.js'
import { createIcon } from './icons.js'
import { initIdeas } from './ideas.js'

const RASTER_ROWS = ['kick', 'perc']
const layerControls = {}
const masterControls = {}
// Параметры слоёв для визуала: что крутят ручки, то и видно у нейронов
const sound = {
  filter: layers.map((layer) => layer.filter.frequency),
  echo: layers.map((layer) => layer.feedbackDelay.wet),
  space: layers.map((layer) => layer.reverb.wet),
  pan: layers.map((layer) => layer.channel.pan),
  feedback: layers.map((layer) => layer.feedbackDelay.feedback)
}
let transport = null
let sequencer = null
let brain = null
let djFilterValue = 0
let shownPart = 0
let panelToggle = null
let ideas = null
let mini = null
let tempoValue = parts[0].bpm
const params = new URLSearchParams(location.search)
// ?ui=metal: главные кнопки в жидком металле (src/metal.js)
// ?ui=glass: светлые стеклянные плитки, ?ui=liquid: всё в жидком металле
const ui = params.get('ui')
const isMetal = ui === 'metal'
const isDressed = ui === 'glass' || ui === 'liquid'
let swingKnob = null

function knobDefault(layer, param) {
  if (param === 'filter') return layer.filter.frequency
  if (param === 'echo') return layer.feedbackDelay.wet
  if (param === 'pan') return layer.channel.pan
  return layer.reverb.wet
}

const KNOB_UNITS = { filter: 'Гц', pan: 'панорама' }

// Варианты стекла и металла: класс на body и металл на нужных элементах.
// Металл рисует один общий холст (src/liquid.js)
const DRESS = {
  glass: [
    ['.PlayButton', 'round'],
    ['.ResetButton', 'round'],
    ['.PartButton', 'round'],
    ['.Master .Knob.isLarge', 'round'],
    ['.PanelBack', 'pill'],
    ['.MuteButton', 'round']
  ],
  liquid: [
    ['.PlayButton', 'round'],
    ['.ResetButton', 'round'],
    ['.PartButton', 'round'],
    ['.Knob', 'round'],
    ['.LaunchButton', 'round'],
    ['.MuteButton', 'round'],
    ['.VariationButton', 'pill'],
    ['.PanelBack', 'pill'],
    ['.StepperButton', 'round']
  ]
}

let liquid = null
function dress(...rules) {
  if (!isDressed) return
  const list = rules.length ? rules : DRESS[ui]
  import('./liquid.js').then((module) => {
    liquid = module
    list.forEach(([selector, shape]) =>
      document
        .querySelectorAll(selector)
        .forEach((element) => module.addLiquidSkin(element, shape))
    )
  })
}

function initDress() {
  if (!isDressed) return
  document.body.classList.add(ui === 'glass' ? 'isGlass' : 'isLiquid')
  dress()
}

function metalize(...buttons) {
  if (!isMetal) return
  import('./metal.js').then(({ addMetalSkin }) =>
    buttons.forEach((button) => addMetalSkin(button))
  )
}

function withIcon(control, icon) {
  const wrapper = document.createElement('div')
  wrapper.className = 'WithIcon'
  wrapper.append(control, createIcon(icon))
  return wrapper
}

// Браузер разрешает звук только после жеста пользователя
async function act(callback) {
  await audio.ensureStarted()
  callback()
}

function updateLayer(id) {
  const layerState = audio.getLayerState(id)
  layerControls[id].launch.setState(layerState)
  layerControls[id].variations.setState(layerState)
  const row = RASTER_ROWS.indexOf(id)
  if (row !== -1) sequencer.setSteps(row, audio.getSteps(id))
}

function toggleLayer(id) {
  act(() => {
    audio.toggleLayer(id)
    updateLayer(id)
  })
}

// apply*: звук уже запущен, вызываются сразу (их же зовёт партитура)
function applyVariation(id, variation) {
  audio.setVariation(id, variation)
  updateLayer(id)
}

function applyPart(index) {
  audio.selectPart(index)
  transport.parts.setState(audio.getCurrentPart(), index)
  layers.forEach((layer) => updateLayer(layer.id))
}

function turnOff(id) {
  if (!audio.getLayerState(id).wantOn) return
  audio.toggleLayer(id)
  updateLayer(id)
}

function setVariation(id, variation) {
  act(() => applyVariation(id, variation))
}

function selectPart(index) {
  act(() => applyPart(index))
}

async function togglePlay() {
  const isPlaying = await audio.togglePlay()
  transport.play.setIcon(
    isPlaying ? 'stop' : 'play',
    isPlaying ? 'Стоп' : 'Старт'
  )
  if (!isPlaying) sequencer.setStep(-1)
}

function reset() {
  act(() => {
    const partIndex = audio.getWantPart()
    const part = parts[partIndex]
    audio.resetSteps()
    layers.forEach((layer) => {
      const controls = layerControls[layer.id]
      layerKnobs.forEach((knob) =>
        controls.knobs[knob.param].setValue(knobDefault(layer, knob.param))
      )
      controls.fader.setValue(layer.channel.volume)
      controls.mute.setValue(false)
    })
    masterControls.djFilter.setValue(part.djFilter)
    masterControls.echo.setValue(master.feedbackDelay.wet)
    masterControls.volume.setValue(master.channel.volume)
    swingKnob.setValue(0)
    transport.tempo.setValue(part.bpm)
    selectPart(partIndex)
  })
}

function initTransport() {
  const element = document.getElementById('transport')
  const play = createIconButton('PlayButton', 'play', 'Старт', togglePlay)
  const tempo = createKnob(
    { label: 'Темп', unit: 'уд/мин', ...tempoRange, value: parts[0].bpm },
    (bpm) => {
      tempoValue = bpm
      mini?.tempo.setValue(bpm, true)
      act(() => audio.setTempo(bpm))
    }
  )
  const partButtons = createPartButtons(parts, selectPart)
  const resetButton = createIconButton(
    'ResetButton',
    'reset',
    'Сбросить настройки части',
    reset
  )
  swingKnob = createKnob(
    { label: 'Свинг', unit: '%', ...swingRange, value: 0 },
    (amount) => act(() => audio.setSwing(amount))
  )
  const swing = withIcon(swingKnob.element, 'swing')
  swing.classList.add('isExtra')
  partButtons.setState(0, 0)
  element.append(
    play.element,
    withIcon(tempo.element, 'tempo'),
    swing,
    partButtons.element,
    resetButton.element
  )
  transport = { play, tempo, parts: partButtons }
  metalize(play.element, resetButton.element)
}

function initRaster() {
  const rows = RASTER_ROWS.map((id) => ({
    id,
    label: layers.find((layer) => layer.id === id).name
  }))
  sequencer = createSequencer(rows, (id, step) => audio.toggleStep(id, step))
  document.getElementById('raster').appendChild(sequencer.element)
  RASTER_ROWS.forEach((id, row) => sequencer.setSteps(row, audio.getSteps(id)))
}

function initLayers() {
  const container = document.getElementById('layers')
  layers.forEach((layer, index) => {
    const strip = document.createElement('section')
    strip.className = `Layer is-${layer.id}`
    strip.setAttribute('aria-label', layer.name)

    const launch = createLaunchButton(
      layer.id,
      `${layer.name}: включить или выключить`,
      () => toggleLayer(layer.id)
    )
    const variations = createVariationButtons(layer.name, (index) =>
      setVariation(layer.id, index)
    )

    const knobRow = document.createElement('div')
    knobRow.className = 'LayerKnobs'
    const knobs = {}
    layerKnobs.forEach((knob) => {
      const value = knobDefault(layer, knob.param)
      knobs[knob.param] = createKnob(
        {
          ...knob,
          label: `${layer.name}: ${knob.label}`,
          unit: KNOB_UNITS[knob.param] || '%',
          value
        },
        (next) => {
          sound[knob.param][index] = next
          act(() => audio.setLayerParam(layer.id, knob.param, next))
        }
      )
      const wrapper = withIcon(knobs[knob.param].element, knob.icon)
      // панорама есть только в вариантах стекла и металла
      if (knob.extra) wrapper.classList.add('isExtra')
      knobRow.appendChild(wrapper)
    })

    const channelRow = document.createElement('div')
    channelRow.className = 'LayerChannel'
    const fader = createFader(
      {
        ...volumeRange,
        label: `${layer.name}: громкость`,
        value: layer.channel.volume
      },
      (value) => act(() => audio.setLayerParam(layer.id, 'volume', value))
    )
    const mute = createMuteButton(`${layer.name}: выключить звук`, (value) =>
      act(() => audio.setLayerParam(layer.id, 'mute', value))
    )
    channelRow.append(fader.element, mute.element)

    strip.append(launch.element, variations.element, knobRow, channelRow)
    container.appendChild(strip)
    layerControls[layer.id] = {
      launch,
      variations,
      knobs,
      fader,
      mute
    }
    updateLayer(layer.id)
  })
}

function initMaster() {
  const element = document.getElementById('master')
  masterControls.djFilter = createKnob(
    {
      label: 'Диджейский фильтр',
      unit: 'фильтр',
      min: -1,
      max: 1,
      value: 0,
      bipolar: true,
      size: 'isLarge'
    },
    (value) => {
      djFilterValue = value
      act(() => audio.setMasterParam('djFilter', value))
    }
  )
  masterControls.echo = createKnob(
    { label: 'Общее эхо', min: 0, max: 0.6, value: master.feedbackDelay.wet },
    (value) => act(() => audio.setMasterParam('echo', value))
  )
  masterControls.volume = createFader(
    { ...volumeRange, label: 'Общая громкость', value: master.channel.volume },
    (value) => {
      mini?.volume.setValue(value, true)
      act(() => audio.setMasterParam('volume', value))
    }
  )
  masterControls.volume.element.classList.add('isMaster')
  element.append(
    withIcon(masterControls.djFilter.element, 'djFilter'),
    withIcon(masterControls.echo.element, 'echo'),
    withIcon(masterControls.volume.element, 'volume')
  )
}

// Цвета сети из CSS-переменных
function readPalette() {
  const style = getComputedStyle(document.documentElement)
  const read = (name) => style.getPropertyValue(name).trim()
  return {
    screen: read('--color-screen'),
    signal: read('--color-signal'),
    quiet: read('--color-quiet'),
    ice: read('--color-ice'),
    hair: read('--color-hair'),
    text: read('--color-text'),
    textDim: read('--color-text-dim'),
    layers: layers.map((layer) => read(`--color-${layer.id}`))
  }
}

const VIEWS = [
  { id: 'flight', label: 'Вид: полёт сквозь нейроны' },
  { id: 'stream', label: 'Вид: лента нейронов' },
  { id: 'field', label: 'Вид: поле нейронов' },
  { id: 'cascade', label: 'Вид: каскад' },
  { id: 'tunnel', label: 'Вид: тоннель, полёт за импульсом по цепи нейронов' },
  { id: 'wave', label: 'Вид: волна, кольца нот по полю' }
]

// Вид берётся из адреса (?view=field), чтобы ссылка открывала тот же вид
// у вариантов свой вид по умолчанию: стекло синее, как тоннель
function readView() {
  const view = new URLSearchParams(location.search).get('view')
  const fallback = { glass: 'tunnel', liquid: 'wave' }[ui] || 'field'
  return VIEWS.some(({ id }) => id === view) ? view : fallback
}

const BACKGROUND_LIST = [
  { id: 'dust', label: 'Фон: пыль' },
  {
    id: 'calcium',
    label: 'Фон: кальциевая съёмка, клетки вспыхивают и гаснут'
  },
  { id: 'tracts', label: 'Фон: волокна белого вещества, по ним бегут волны' }
]

function readBackground() {
  const ground = new URLSearchParams(location.search).get('bg')
  return BACKGROUND_LIST.some(({ id }) => id === ground) ? ground : 'dust'
}

function saveParam(name, value) {
  const url = new URL(location.href)
  url.searchParams.set(name, value)
  history.replaceState(null, '', url)
}

// Three.js грузится отдельно: без сети звук всё равно работает
function initScreen() {
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
  const screen = document.getElementById('screen')
  const view = readView()
  import('./visuals.js')
    .then(({ initVisuals }) => {
      const palette = readPalette()
      const ground = readBackground()
      brain = initVisuals(screen, palette, reducedMotion, view, ground)
      const viewSwitch = createViewSwitch(VIEWS, view, (next) => {
        brain.setMode(next)
        saveParam('view', next)
      })
      const groundSwitch = createViewSwitch(
        BACKGROUND_LIST,
        ground,
        (next) => {
          brain.setBackground(next)
          saveParam('bg', next)
        },
        'Фон'
      )
      ideas = initIdeas({
        screen,
        palette,
        actions: {
          selectPart: applyPart,
          setVariation: applyVariation,
          turnOff,
          togglePlay
        }
      })
      // варианты спрятаны за одной кнопкой: на экране остаётся минимум
      const switches = document.createElement('div')
      switches.className = 'Switches'
      const toggle = createIconButton(
        'SwitchesToggle',
        'variants',
        'Варианты',
        () => {
          const isOpen = switches.classList.toggle('isOpen')
          toggle.element.setAttribute('aria-expanded', String(isOpen))
        }
      )
      toggle.element.setAttribute('aria-expanded', 'false')
      panelToggle = createIconButton(
        'SwitchesToggle',
        'panelHide',
        'Скрыть панель',
        togglePanel
      )
      panelToggle.element.setAttribute('aria-pressed', 'false')
      switches.append(
        toggle.element,
        panelToggle.element,
        viewSwitch.element,
        groundSwitch.element,
        ideas.element
      )
      // поверх интерфейса: раскрытые ряды не уходят под капсулы
      document.body.appendChild(switches)
      metalize(toggle.element, panelToggle.element)
      dress(['.SwitchesToggle', 'round'])
    })
    .catch((error) => console.warn('3D-нейроны не загрузились', error))
}

// Панели прячутся все, чтобы смотреть на нейроны; звук не меняется.
// Слева остаются темп и громкость с понятным шагом и кнопка возврата
function togglePanel() {
  const isHidden = document.body.classList.toggle('isPanelHidden')
  panelToggle?.setIcon(
    isHidden ? 'panelShow' : 'panelHide',
    isHidden ? 'Показать панель' : 'Скрыть панель'
  )
  panelToggle?.element.setAttribute('aria-pressed', String(isHidden))
  // фокус не теряется вместе со спрятанной кнопкой
  const focused = document.activeElement
  if (isHidden && focused && focused !== document.body)
    mini.back.element.focus()
  if (!isHidden && mini.element.contains(focused)) panelToggle?.element.focus()
}

function initMini() {
  const element = document.createElement('aside')
  element.className = 'MiniConsole'
  element.setAttribute('aria-label', 'Темп и громкость')
  const back = createIconButton(
    'PanelBack',
    'panelShow',
    'Показать панели',
    togglePanel
  )
  const text = document.createElement('span')
  text.className = 'PanelBackText'
  text.textContent = 'Панели'
  back.element.append(text)
  // темп по 1 уд/мин: части сета отличаются на 4–5, шаг 1 их не огрубляет
  const tempo = createStepper(
    {
      label: 'Темп',
      unit: 'уд/мин',
      spoken: ['удар в минуту', 'удара в минуту', 'ударов в минуту'],
      icon: 'tempo',
      ...tempoRange,
      step: 1,
      value: tempoValue
    },
    (bpm) => {
      tempoValue = bpm
      transport.tempo.setValue(bpm, true)
      act(() => audio.setTempo(bpm))
    }
  )
  // громкость по 2 дБ: заметно на слух, от тишины до максимума 20 шагов
  const volume = createStepper(
    {
      label: 'Общая громкость',
      unit: 'дБ',
      spoken: ['децибел', 'децибела', 'децибел'],
      icon: 'volume',
      ...volumeRange,
      step: 2,
      value: master.channel.volume
    },
    (db) => masterControls.volume.setValue(db)
  )
  element.append(back.element, tempo.element, volume.element)
  document.body.appendChild(element)
  mini = { element, back, tempo, volume }
  metalize(back.element)
}

function onAudioEvent(event) {
  if (event.type === 'step') {
    sequencer.setStep(event.step)
    ideas?.onStep(event.step)
  }
  // нота приходит через Tone.getDraw в момент звука: свет совпадает с ударом
  if (event.type === 'note' && brain) {
    brain.pulse(
      layers.findIndex((layer) => layer.id === event.layer),
      event
    )
  }
}

// Смены приходят с такта, поэтому кнопки сверяются со звуком каждый кадр
function updateStates() {
  layers.forEach((layer) => {
    const layerState = audio.getLayerState(layer.id)
    layerControls[layer.id].launch.setState(layerState)
    layerControls[layer.id].variations.setState(layerState)
  })
  const rows = document.querySelectorAll('.SequencerRow')
  RASTER_ROWS.forEach((id, row) => {
    rows[row].classList.toggle('isOff', !audio.getLayerState(id).wantOn)
  })
  const part = audio.getCurrentPart()
  transport.parts.setState(part, audio.getWantPart())
  if (part !== shownPart) {
    shownPart = part
    djFilterValue = parts[part].djFilter
    masterControls.djFilter.setValue(djFilterValue, true)
  }
  // пока крутилка в фокусе, её значение не перезаписывается
  const isTempoInHand =
    document.activeElement === transport.tempo.element ||
    mini.element.contains(document.activeElement)
  if (audio.isPlaying() && !isTempoInHand) {
    transport.tempo.setValue(audio.getTempo(), true)
    mini.tempo.setValue(audio.getTempo(), true)
  }
}

function initKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (document.body.classList.contains('isIntro')) return
    const isControl = event.target.closest('button, input, [role="slider"]')
    if (isControl && (event.code === 'Space' || event.code === 'Enter')) return

    const layerIndex = keys.layers.indexOf(event.code)
    const variationIndex = keys.variations.indexOf(event.code)
    const partIndex = keys.parts.indexOf(event.code)

    if (event.code === keys.start) togglePlay()
    else if (event.code === keys.reset) reset()
    else if (event.code === keys.panel) togglePanel()
    else if (layerIndex !== -1) toggleLayer(layers[layerIndex].id)
    else if (variationIndex !== -1) {
      const id = layers[variationIndex].id
      setVariation(id, (audio.getLayerState(id).wantVariation + 1) % 3)
    } else if (partIndex !== -1) selectPart(partIndex)
    else return
    event.preventDefault()
  })
}

// частота ручки тона → 0..1 по логарифму, как крутится ручка
function toLogUnit(hz, { min, max }) {
  return Math.log(hz / min) / Math.log(max / min)
}

// уровень в дБ → 0..1 для визуала
function toUnit(db) {
  return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 45) / 35)) : 0
}

let lastFrame = performance.now()
function updateLoop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0
  lastFrame = now
  updateStates()
  const levels = audio.getLevels()
  if (levels) {
    layers.forEach((layer) =>
      layerControls[layer.id].fader.setLevel(levels[layer.id])
    )
    masterControls.volume.setLevel(levels.master)
  }
  if (brain) {
    const playing = audio.isPlaying()
    const sounding = audio.isSounding()
    // металл течёт быстрее, пока играет звук
    liquid?.setLiquidSpeed(
      matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : sounding
          ? 1
          : 0.6
    )
    const on = layers.map(
      (layer) => audio.getLayerState(layer.id).isOn && playing
    )
    const master = toUnit(levels?.master)
    const part = audio.getCurrentPart()
    const extra = ideas?.update(dt, { playing, part, level: master, on })
    brain.setState({
      on,
      level: layers.map((layer) => toUnit(levels?.[layer.id])),
      bpm: playing ? audio.getTempo() : 84,
      djFilter: djFilterValue,
      space:
        sound.space.reduce((sum, value) => sum + value, 0) / sound.space.length,
      sound: {
        ...sound,
        filter: sound.filter.map((hz) => toLogUnit(hz, layerKnobs[0])),
        muted: layers.map((layer) => audio.getLayerState(layer.id).isMuted)
      },
      part,
      master,
      playing,
      sounding,
      beat: sounding ? audio.getBarPosition() : null,
      panelHidden: document.body.classList.contains('isPanelHidden'),
      ...extra
    })
  }
  requestAnimationFrame(updateLoop)
}

document.addEventListener('DOMContentLoaded', () => {
  audio.setListener(onAudioEvent)
  initTransport()
  initScreen()
  initRaster()
  initLayers()
  initMaster()
  initMini()
  initDress()
  initKeyboard()
  requestAnimationFrame(updateLoop)
  // заставка: ?intro=0 пропускает её
  if (params.get('intro') !== '0') {
    import('./intro.js').then(({ showIntro }) => showIntro())
  }
})
