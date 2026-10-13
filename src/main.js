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
  createIconButton
} from './controls.js'
import { createIcon } from './icons.js'

const RASTER_ROWS = ['kick', 'perc']
const layerControls = {}
const masterControls = {}
const spaceValues = {}
let transport = null
let sequencer = null
let brain = null
let djFilterValue = 0
let shownPart = 0

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

function setVariation(id, variation) {
  act(() => {
    audio.setVariation(id, variation)
    updateLayer(id)
  })
}

function selectPart(index) {
  act(() => {
    audio.selectPart(index)
    transport.parts.setState(audio.getCurrentPart(), index)
    layers.forEach((layer) => updateLayer(layer.id))
  })
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

    strip.append(launch.element, variations.element, knobRow, channelRow)
    container.appendChild(strip)
    layerControls[layer.id] = { launch, variations, knobs, fader, mute }
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
    layers: layers.map((layer) => read(`--color-${layer.id}`))
  }
}

// Three.js грузится отдельно: без сети звук всё равно работает
function initScreen() {
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
  import('./brain3d.js')
    .then(({ initBrain }) => {
      brain = initBrain(
        document.getElementById('screen'),
        readPalette(),
        reducedMotion
      )
    })
    .catch((error) => console.warn('3D-сеть не загрузилась', error))
}

function onAudioEvent(event) {
  if (event.type === 'step') sequencer.setStep(event.step)
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
    else if (layerIndex !== -1) toggleLayer(layers[layerIndex].id)
    else if (variationIndex !== -1) {
      const id = layers[variationIndex].id
      setVariation(id, (audio.getLayerState(id).wantVariation + 1) % 3)
    } else if (partIndex !== -1) selectPart(partIndex)
    else return
    event.preventDefault()
  })
}

function updateLoop() {
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
    brain.setState({
      on: layers.map(
        (layer) => audio.getLayerState(layer.id).isOn && audio.isPlaying()
      ),
      level: layers.map((layer) => {
        const db = levels ? levels[layer.id] : -Infinity
        return Number.isFinite(db)
          ? Math.min(1, Math.max(0, (db + 45) / 35))
          : 0
      }),
      bpm: audio.isPlaying() ? audio.getTempo() : 84,
      djFilter: djFilterValue,
      space: spaces.reduce((sum, value) => sum + value, 0) / spaces.length,
      part: audio.getCurrentPart()
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
