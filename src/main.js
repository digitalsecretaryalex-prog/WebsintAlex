// Точка входа: связывает звук, контролы и 3D-сеть.
import {
  layers,
  parts,
  master,
  layerKnobs,
  volumeRange,
  tempoRange,
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
  createLayoutSwitch
} from './controls.js'
import { createIcon } from './icons.js'
import { initIdeas } from './ideas.js'

const RASTER_ROWS = ['kick', 'perc']
const layerControls = {}
const masterControls = {}
const spaceValues = {}
let transport = null
let sequencer = null
let brain = null
let djFilterValue = 0
let shownPart = 0
const panel = readPanel()
let selectedLayer = 'kick'
let inspector = null
let panelToggle = null
let ideas = null

function knobDefault(layer, param) {
  if (param === 'filter') return layer.filter.frequency
  if (param === 'echo') return layer.feedbackDelay.wet
  return layer.reverb.wet
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
    transport.tempo.setValue(part.bpm)
    selectPart(partIndex)
  })
}

function initTransport() {
  const element = document.getElementById('transport')
  const play = createIconButton('PlayButton', 'play', 'Старт', togglePlay)
  const tempo = createKnob(
    { label: 'Темп', unit: 'уд/мин', ...tempoRange, value: parts[0].bpm },
    (bpm) => act(() => audio.setTempo(bpm))
  )
  const partButtons = createPartButtons(parts, selectPart)
  const resetButton = createIconButton(
    'ResetButton',
    'reset',
    'Сбросить настройки части',
    reset
  )
  partButtons.setState(0, 0)
  element.append(
    play.element,
    withIcon(tempo.element, 'tempo'),
    partButtons.element,
    resetButton.element
  )
  transport = { play, tempo, parts: partButtons }
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
  layers.forEach((layer) => {
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
      if (knob.param === 'space') spaceValues[layer.id] = value
      knobs[knob.param] = createKnob(
        {
          ...knob,
          label: `${layer.name}: ${knob.label}`,
          unit: knob.param === 'filter' ? 'Гц' : '%',
          value
        },
        (next) => {
          if (knob.param === 'space') spaceValues[layer.id] = next
          act(() => audio.setLayerParam(layer.id, knob.param, next))
        }
      )
      knobRow.appendChild(withIcon(knobs[knob.param].element, knob.icon))
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

    // В вариантах панели вариации и ручки лежат в одной обёртке,
    // её можно спрятать, показать поверх или перенести в инспектор
    let details = null
    if (panel) {
      details = document.createElement('div')
      details.className = 'LayerDetails'
      details.append(variations.element, knobRow)
      strip.append(launch.element, details, channelRow)
      strip.addEventListener('pointerdown', () => selectLayer(layer.id))
      strip.addEventListener('focusin', () => selectLayer(layer.id))
    } else {
      strip.append(launch.element, variations.element, knobRow, channelRow)
    }
    if (panel === 'c' || panel === 'm') {
      const more = createIconButton(
        'MoreButton',
        'more',
        `${layer.name}: все настройки`,
        () => {
          const isOpen = strip.classList.toggle('isOpen')
          more.element.setAttribute('aria-expanded', String(isOpen))
        }
      )
      more.element.setAttribute('aria-expanded', 'false')
      channelRow.appendChild(more.element)
    }
    container.appendChild(strip)
    layerControls[layer.id] = {
      launch,
      variations,
      knobs,
      fader,
      mute,
      strip,
      details
    }
    updateLayer(layer.id)
  })
  if (panel === 'b') {
    inspector = document.createElement('section')
    inspector.className = 'Inspector'
    container.appendChild(inspector)
  }
  if (panel) {
    document.body.dataset.panel = panel
    selectLayer(selectedLayer)
  }
}

// Выбранный канал: в A раскрывается, в B его настройки уходят в инспектор
function selectLayer(id) {
  const previous = layerControls[selectedLayer]
  selectedLayer = id
  layers.forEach((layer) =>
    layerControls[layer.id].strip.classList.toggle(
      'isSelected',
      layer.id === id
    )
  )
  if (panel !== 'b') return
  if (previous.details.parentElement === inspector) {
    previous.strip.insertBefore(
      previous.details,
      previous.strip.lastElementChild
    )
  }
  const layer = layers.find((item) => item.id === id)
  inspector.className = `Inspector is-${id}`
  inspector.setAttribute('aria-label', `${layer.name}: настройки`)
  inspector.replaceChildren(layerControls[id].details)
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
    (value) => act(() => audio.setMasterParam('volume', value))
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
  { id: 'network', label: 'Вид: сеть' },
  { id: 'flight', label: 'Вид: полёт сквозь нейроны' },
  { id: 'stream', label: 'Вид: лента нейронов' },
  { id: 'field', label: 'Вид: поле нейронов' },
  { id: 'cascade', label: 'Вид: каскад' }
]

const LAYOUTS = [
  { id: 'layoutBold', page: 'index.html', label: 'Панель: исходная' },
  {
    id: 'panelM',
    page: 'index.html',
    panel: 'm',
    label: 'Панель M: минимум, детали по наведению'
  },
  {
    id: 'panelA',
    page: 'index.html',
    panel: 'a',
    label: 'Панель A: раскрыт выбранный канал'
  },
  {
    id: 'panelB',
    page: 'index.html',
    panel: 'b',
    label: 'Панель B: общий инспектор'
  },
  {
    id: 'panelC',
    page: 'index.html',
    panel: 'c',
    label: 'Панель C: детали по наведению'
  }
]

// Вариант нижней панели: ?layout=a|b|c, без параметра исходная
function readPanel() {
  const value = new URLSearchParams(location.search).get('layout')
  return ['m', 'a', 'b', 'c'].includes(value) ? value : null
}

// Вид берётся из адреса (?view=field), чтобы ссылка открывала тот же вид
function readView() {
  const view = new URLSearchParams(location.search).get('view')
  return VIEWS.some(({ id }) => id === view) ? view : 'network'
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
      const layout = panel ? `panel${panel.toUpperCase()}` : 'layoutBold'
      const layoutSwitch = createLayoutSwitch(LAYOUTS, layout)
      const viewSwitch = createViewSwitch(VIEWS, view, (next) => {
        brain.setMode(next)
        saveParam('view', next)
        layoutSwitch.refresh()
      })
      const groundSwitch = createViewSwitch(
        BACKGROUND_LIST,
        ground,
        (next) => {
          brain.setBackground(next)
          saveParam('bg', next)
          layoutSwitch.refresh()
        },
        'Фон'
      )
      ideas = initIdeas({
        screen,
        instrument: document.querySelector('.Instrument'),
        palette,
        actions: {
          selectPart: applyPart,
          setVariation: applyVariation,
          turnOff,
          togglePlay
        },
        onSave: () => layoutSwitch.refresh()
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
        layoutSwitch.element,
        groundSwitch.element,
        ideas.element
      )
      // поверх интерфейса: раскрытые ряды не уходят под капсулы
      document.body.appendChild(switches)
    })
    .catch((error) => console.warn('3D-сеть не загрузилась', error))
}

// Панель прячется, чтобы смотреть на нейроны; звук не меняется
function togglePanel() {
  const isHidden = document.body.classList.toggle('isPanelHidden')
  panelToggle?.setIcon(
    isHidden ? 'panelShow' : 'panelHide',
    isHidden ? 'Показать панель' : 'Скрыть панель'
  )
  panelToggle?.element.setAttribute('aria-pressed', String(isHidden))
}

function onAudioEvent(event) {
  if (event.type === 'step') {
    sequencer.setStep(event.step)
    ideas?.onStep(event.step)
  }
  if (event.type === 'note' && brain) {
    brain.pulse(layers.findIndex((layer) => layer.id === event.layer))
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
  const isTempoInHand = document.activeElement === transport.tempo.element
  if (audio.isPlaying() && !isTempoInHand) {
    transport.tempo.setValue(audio.getTempo(), true)
  }
}

function initKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
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
    const spaces = Object.values(spaceValues)
    const playing = audio.isPlaying()
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
      space: spaces.reduce((sum, value) => sum + value, 0) / spaces.length,
      part,
      master,
      playing,
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
  initKeyboard()
  requestAnimationFrame(updateLoop)
})
