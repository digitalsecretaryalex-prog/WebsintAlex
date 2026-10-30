// UI-контролы. Звук не создают, отдают значение через onChange.
import { createIcon, createWaveIcon, createDotsIcon } from './icons.js'

const KNOB_ANGLE = 135

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Частоты на логарифмической шкале
function toNorm(value, knob) {
  if (knob.scale === 'log') {
    return Math.log(value / knob.min) / Math.log(knob.max / knob.min)
  }
  return (value - knob.min) / (knob.max - knob.min)
}

function fromNorm(norm, knob) {
  if (knob.scale === 'log') return knob.min * (knob.max / knob.min) ** norm
  return knob.min + norm * (knob.max - knob.min)
}

// 84 удара в минуту, 72 удара, 70 ударов
export function beatsWord(count) {
  const rest10 = count % 10
  const rest100 = count % 100
  if (rest10 === 1 && rest100 !== 11) return 'удар'
  if (rest10 >= 2 && rest10 <= 4 && (rest100 < 12 || rest100 > 14))
    return 'удара'
  return 'ударов'
}

function formatValue(value, knob) {
  if (knob.unit === 'Гц') return `${Math.round(value)} Гц`
  if (knob.unit === 'уд/мин') {
    const bpm = Math.round(value)
    return `${bpm} ${beatsWord(bpm)} в минуту`
  }
  if (knob.unit === 'фильтр') {
    if (Math.abs(value) < 0.02) return 'открыт'
    return value < 0
      ? `срезаны верха, ${Math.round(-value * 100)} %`
      : `срезаны низы, ${Math.round(value * 100)} %`
  }
  if (knob.unit === 'панорама') {
    if (Math.abs(value) < 0.02) return 'по центру'
    return `${value < 0 ? 'влево' : 'вправо'} на ${Math.round(Math.abs(value) * 100)} %`
  }
  return `${Math.round(value * 100)} %`
}

// Короткая подпись под ручкой: видно значение, не наводя курсор
function shortValue(value, knob) {
  if (knob.unit === 'Гц')
    return value >= 1000
      ? `${(value / 1000).toFixed(1)} кГц`
      : `${Math.round(value)} Гц`
  if (knob.unit === 'уд/мин') return `${Math.round(value)}`
  if (knob.unit === 'фильтр') {
    if (Math.abs(value) < 0.02) return 'открыт'
    return `${value < 0 ? '−' : '+'}${Math.round(Math.abs(value) * 100)} %`
  }
  if (knob.unit === 'панорама') {
    if (Math.abs(value) < 0.02) return 'центр'
    return `${value < 0 ? 'Л' : 'П'} ${Math.round(Math.abs(value) * 100)}`
  }
  return `${Math.round(value * 100)} %`
}

function arcPath(from, to) {
  const radius = 17
  const point = (angle) => {
    const radians = ((angle - 90) * Math.PI) / 180
    return `${24 + radius * Math.cos(radians)} ${24 + radius * Math.sin(radians)}`
  }
  const large = Math.abs(to - from) > 180 ? 1 : 0
  const sweep = to > from ? 1 : 0
  return `M${point(from)} A${radius} ${radius} 0 ${large} ${sweep} ${point(to)}`
}

// role=slider. bipolar: кольцо растёт от центра
export function createKnob(knob, onChange) {
  const element = document.createElement('div')
  element.className = 'Knob'
  if (knob.size) element.classList.add(knob.size)
  element.tabIndex = 0
  element.setAttribute('role', 'slider')
  element.setAttribute('aria-label', knob.label)
  element.setAttribute('aria-valuemin', knob.min)
  element.setAttribute('aria-valuemax', knob.max)
  element.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path class="KnobTrack" d="${arcPath(-KNOB_ANGLE, KNOB_ANGLE)}"/>
      <path class="KnobValue"/>
      <line class="KnobMark" x1="24" y1="24" x2="24" y2="12"/>
    </svg>`
  // подпись значения: в базовом виде скрыта, в вариантах стекла и металла видна
  const readout = document.createElement('span')
  readout.className = 'KnobReadout'
  readout.setAttribute('aria-hidden', 'true')
  element.appendChild(readout)
  const valuePath = element.querySelector('.KnobValue')
  const mark = element.querySelector('.KnobMark')

  let norm = 0

  function draw() {
    const angle = -KNOB_ANGLE + norm * KNOB_ANGLE * 2
    const start = knob.bipolar ? 0 : -KNOB_ANGLE
    const isEmpty = Math.abs(angle - start) < 1
    valuePath.setAttribute(
      'd',
      isEmpty ? '' : arcPath(Math.min(start, angle), Math.max(start, angle))
    )
    mark.setAttribute('transform', `rotate(${angle} 24 24)`)
  }

  function setNorm(nextNorm, isSilent) {
    norm = clamp(nextNorm, 0, 1)
    const value = fromNorm(norm, knob)
    element.setAttribute('aria-valuenow', Math.round(value * 100) / 100)
    element.setAttribute('aria-valuetext', formatValue(value, knob))
    readout.textContent = shortValue(value, knob)
    draw()
    if (!isSilent) onChange(value)
  }

  function setValue(value, isSilent) {
    setNorm(toNorm(value, knob), isSilent)
  }

  let dragStart = null
  element.addEventListener('pointerdown', (event) => {
    element.setPointerCapture(event.pointerId)
    dragStart = { y: event.clientY, norm }
  })
  element.addEventListener('pointermove', (event) => {
    if (!dragStart) return
    setNorm(dragStart.norm + (dragStart.y - event.clientY) / 180)
  })
  element.addEventListener('pointerup', () => (dragStart = null))
  element.addEventListener('pointercancel', () => (dragStart = null))
  element.addEventListener('dblclick', () => setValue(knob.value))

  element.addEventListener('keydown', (event) => {
    const steps = {
      ArrowUp: 0.02,
      ArrowRight: 0.02,
      ArrowDown: -0.02,
      ArrowLeft: -0.02,
      PageUp: 0.1,
      PageDown: -0.1
    }
    if (event.code in steps) setNorm(norm + steps[event.code])
    else if (event.code === 'Home') setNorm(0)
    else if (event.code === 'End') setNorm(1)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  setNorm(toNorm(knob.value, knob), true)
  return { element, setValue }
}

// Нативный input range: клавиатура и скринридеры без своего кода
export function createFader(fader, onChange) {
  const element = document.createElement('div')
  element.className = 'Fader'

  const input = document.createElement('input')
  input.type = 'range'
  input.min = fader.min
  input.max = fader.max
  input.step = fader.step
  input.value = fader.value
  input.setAttribute('aria-label', fader.label)

  const meter = document.createElement('span')
  meter.className = 'FaderMeter'
  meter.setAttribute('aria-hidden', 'true')

  element.append(input, meter)

  function update() {
    input.setAttribute('aria-valuetext', `${input.value} дБ`)
    onChange(Number(input.value))
  }
  input.addEventListener('input', update)
  input.addEventListener('keydown', (event) => event.stopPropagation())

  function setValue(value) {
    input.value = value
    update()
  }

  function setLevel(db) {
    const level = Number.isFinite(db) ? clamp((db + 50) / 50, 0, 1) : 0
    meter.style.setProperty('--level', level)
  }

  input.setAttribute('aria-valuetext', `${input.value} дБ`)
  return { element, setValue, setLevel }
}

function createToggle(className, icon, label, onClick) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.setAttribute('aria-label', label)
  element.setAttribute('aria-pressed', 'false')
  element.appendChild(createIcon(icon))
  element.addEventListener('click', onClick)
  return element
}

export function createMuteButton(label, onChange) {
  let isMuted = false
  const element = createToggle('MuteButton', 'mute', label, () =>
    setValue(!isMuted)
  )
  function setValue(value) {
    isMuted = value
    element.setAttribute('aria-pressed', String(isMuted))
    onChange(isMuted)
  }
  return { element, setValue }
}

export function createLaunchButton(icon, label, onClick) {
  const element = createToggle('LaunchButton', icon, label, onClick)
  function setState({ isOn, wantOn }) {
    element.setAttribute('aria-pressed', String(wantOn))
    element.classList.toggle('isOn', isOn)
    element.classList.toggle('isPending', isOn !== wantOn)
  }
  return { element, setState }
}

export function createVariationButtons(label, onSelect) {
  const element = document.createElement('div')
  element.className = 'Variations'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', label)

  const buttons = [0, 1, 2].map((index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'VariationButton'
    button.setAttribute('aria-label', `${label}, вариация ${index + 1}`)
    button.appendChild(createDotsIcon(index + 1))
    button.addEventListener('click', () => onSelect(index))
    element.appendChild(button)
    return button
  })

  function setState({ variation, wantVariation }) {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === wantVariation))
      button.classList.toggle('isOn', index === variation)
      button.classList.toggle(
        'isPending',
        index === wantVariation && index !== variation
      )
    })
  }
  return { element, setState }
}

// Roving tabindex: в растр ведёт один Tab, дальше стрелки
export function createSequencer(rows, onToggle) {
  const element = document.createElement('div')
  element.className = 'Sequencer'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', 'Растр бита')

  const cells = rows.map((row, rowIndex) => {
    const rowElement = document.createElement('div')
    rowElement.className = `SequencerRow is-${row.id}`
    rowElement.setAttribute('role', 'group')
    rowElement.setAttribute('aria-label', row.label)
    const rowCells = []
    for (let step = 0; step < 16; step++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'Step'
      cell.tabIndex = rowIndex === 0 && step === 0 ? 0 : -1
      cell.setAttribute('aria-label', `${row.label}, шаг ${step + 1}`)
      cell.setAttribute('aria-pressed', 'false')
      cell.addEventListener('click', () => {
        const isOn = onToggle(row.id, step)
        cell.setAttribute('aria-pressed', String(Boolean(isOn)))
      })
      cell.addEventListener('keydown', (event) =>
        moveFocus(event, rowIndex, step)
      )
      rowElement.appendChild(cell)
      rowCells.push(cell)
    }
    element.appendChild(rowElement)
    return rowCells
  })

  function moveFocus(event, rowIndex, step) {
    const moves = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0]
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      event.stopPropagation()
      return
    }
    if (!(event.code in moves)) return
    event.preventDefault()
    event.stopPropagation()
    const [rowMove, stepMove] = moves[event.code]
    const nextRow = clamp(rowIndex + rowMove, 0, cells.length - 1)
    const nextStep = (step + stepMove + 16) % 16
    cells[rowIndex][step].tabIndex = -1
    cells[nextRow][nextStep].tabIndex = 0
    cells[nextRow][nextStep].focus()
  }

  function setSteps(rowIndex, steps) {
    cells[rowIndex].forEach((cell, step) => {
      cell.setAttribute('aria-pressed', String(Boolean(steps[step])))
    })
  }

  let current = -1
  function setStep(step) {
    cells.forEach((row) => {
      if (current >= 0) row[current].classList.remove('isNow')
      if (step >= 0) row[step].classList.add('isNow')
    })
    current = step
  }

  return { element, setSteps, setStep }
}

export function createPartButtons(parts, onSelect) {
  const element = document.createElement('div')
  element.className = 'Parts'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', 'Части сета')
  const waves = [
    [5, 7],
    [3.5, 6],
    [2, 6],
    [1, 5]
  ]

  // Линия через центры кругов: тусклая целиком, яркая до активной части
  const svgNS = 'http://www.w3.org/2000/svg'
  const line = document.createElementNS(svgNS, 'svg')
  line.setAttribute('class', 'PartsLine')
  line.setAttribute('aria-hidden', 'true')
  const track = document.createElementNS(svgNS, 'polyline')
  track.setAttribute('class', 'PartsTrack')
  const trail = document.createElementNS(svgNS, 'polyline')
  trail.setAttribute('class', 'PartsTrail')
  line.append(track, trail)

  // Шайба: заливка активной части, едет по линии к выбранному кругу
  const puck = document.createElement('span')
  puck.className = 'PartsPuck'
  puck.setAttribute('aria-hidden', 'true')
  element.append(line, puck)

  const buttons = parts.map((part, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'PartButton'
    button.setAttribute(
      'aria-label',
      `Часть ${index + 1}, ${part.name}, ${part.bpm} ${beatsWord(part.bpm)} в минуту`
    )
    button.appendChild(createWaveIcon(...waves[index]))
    button.addEventListener('click', () => onSelect(index))
    element.appendChild(button)
    return button
  })

  let centers = []
  let shown = 0
  let length = 0

  // offsetLeft и offsetTop не зависят от transform: scale не сбивает центры
  function measure() {
    centers = buttons.map((button) => [
      button.offsetLeft + button.offsetWidth / 2,
      button.offsetTop + button.offsetHeight / 2
    ])
    const points = centers.map(([x, y]) => `${x},${y}`).join(' ')
    track.setAttribute('points', points)
    trail.setAttribute('points', points)
    length = centers.reduce((sum, [x, y], index) => {
      if (index === 0) return 0
      const [px, py] = centers[index - 1]
      return sum + Math.hypot(x - px, y - py)
    }, 0)
    trail.style.strokeDasharray = `${length} ${length}`
    move(shown)
    // переезд анимируется только после первой расстановки
    requestAnimationFrame(() => element.classList.add('isReady'))
  }

  function move(index) {
    if (!centers.length) return
    const [x, y] = centers[index]
    puck.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    let travelled = 0
    for (let i = 1; i <= index; i++) {
      const [px, py] = centers[i - 1]
      travelled += Math.hypot(centers[i][0] - px, centers[i][1] - py)
    }
    trail.style.strokeDashoffset = `${length - travelled}`
  }

  new ResizeObserver(measure).observe(element)

  function setState(current, want) {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === want))
      button.classList.toggle('isOn', index === current)
      button.classList.toggle('isPending', index === want && index !== current)
    })
    if (current !== shown) {
      shown = current
      move(current)
    }
  }
  return { element, setState }
}

export function createIconButton(className, icon, label, onClick) {
  const element = createToggle(className, icon, label, onClick)
  element.removeAttribute('aria-pressed')
  // меняется только значок: слои металла (?ui=metal) остаются
  function setIcon(name, nextLabel) {
    element.querySelector('.Icon').replaceWith(createIcon(name))
    element.setAttribute('aria-label', nextLabel)
  }
  return { element, setIcon }
}

// Переключатель режимов: круглые кнопки со значками, выбрана одна.
// Им же выбирается фон
export function createViewSwitch(
  views,
  current,
  onSelect,
  name = 'Вид нейронов'
) {
  const element = document.createElement('div')
  element.className = 'ViewSwitch'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', name)
  const buttons = views.map(({ id, icon, label }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ViewButton'
    button.setAttribute('aria-label', label)
    button.title = label
    button.appendChild(createIcon(icon || id))
    button.addEventListener('click', () => {
      setState(id)
      onSelect(id)
    })
    element.appendChild(button)
    return { id, button }
  })
  function setState(active) {
    buttons.forEach(({ id, button }) => {
      button.setAttribute('aria-pressed', String(id === active))
      button.classList.toggle('isOn', id === active)
    })
  }
  setState(current)
  return { element, setState }
}

// Шаговый регулятор для скрытой панели: крупное значение и кнопки ±.
// Шаг виден и одинаков: клик, удержание (повтор) или стрелки.
// PageUp и PageDown: пять шагов, Home и End: край диапазона.
export function createStepper(stepper, onChange) {
  const { label, unit, spoken, icon, min, max, step } = stepper
  let value = stepper.value
  const element = document.createElement('div')
  element.className = 'Stepper'

  const display = document.createElement('div')
  display.className = 'StepperValue'
  display.tabIndex = 0
  display.setAttribute('role', 'slider')
  display.setAttribute('aria-label', label)
  display.setAttribute('aria-valuemin', min)
  display.setAttribute('aria-valuemax', max)
  const number = document.createElement('span')
  number.className = 'StepperNumber'
  const units = document.createElement('span')
  units.className = 'StepperUnit'
  units.textContent = unit
  const track = document.createElement('span')
  track.className = 'StepperTrack'
  track.setAttribute('aria-hidden', 'true')
  display.append(createIcon(icon), number, units, track)

  const minus = '\u2212'
  // spoken: три формы для 1, 2–4 и 5–20: «удар», «удара», «ударов»
  function words(next) {
    const n = Math.abs(Math.round(next)) % 100
    const last = n % 10
    if (n > 10 && n < 20) return spoken[2]
    if (last === 1) return spoken[0]
    if (last > 1 && last < 5) return spoken[1]
    return spoken[2]
  }

  function format(next) {
    const rounded = Math.round(next)
    return rounded < 0 ? `${minus}${-rounded}` : String(rounded)
  }

  function render() {
    number.textContent = format(value)
    display.setAttribute('aria-valuenow', Math.round(value))
    display.setAttribute('aria-valuetext', `${format(value)} ${words(value)}`)
    track.style.setProperty('--fill', (value - min) / (max - min))
  }

  function setValue(next, isSilent) {
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped === value && !isSilent) return
    value = clamped
    render()
    if (!isSilent) onChange(value)
  }

  // кнопка: шаг сразу, при удержании повтор, пока палец на кнопке
  function stepButton(direction) {
    const sign = direction > 0 ? 'плюс' : 'минус'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'StepperButton'
    button.setAttribute('aria-label', `${label}: ${sign} ${step} ${unit}`)
    button.appendChild(createIcon(direction > 0 ? 'plus' : 'minus'))
    let timer = 0
    const stop = () => clearTimeout(timer)
    const repeat = (delay) => {
      setValue(Math.round(value) + direction * step)
      timer = setTimeout(() => repeat(110), delay)
    }
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      button.setPointerCapture(event.pointerId)
      repeat(420)
    })
    button.addEventListener('pointerup', stop)
    button.addEventListener('pointercancel', stop)
    button.addEventListener('lostpointercapture', stop)
    // с клавиатуры: Enter и пробел дают один шаг
    button.addEventListener('click', (event) => {
      if (event.detail === 0) setValue(Math.round(value) + direction * step)
    })
    return button
  }

  display.addEventListener('keydown', (event) => {
    const steps = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5
    }
    if (event.code in steps)
      setValue(Math.round(value) + steps[event.code] * step)
    else if (event.code === 'Home') setValue(min)
    else if (event.code === 'End') setValue(max)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  element.append(stepButton(1), display, stepButton(-1))
  render()
  return { element, setValue, getValue: () => value }
}
