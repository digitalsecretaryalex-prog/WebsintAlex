// Идеи поверх инструмента. Три усиливают высказывание сета:
// дыхание, угасание связей, партитура. Гипнограмма оставляет след сета
// после игры. Включаются отдельно, выбор хранится в адресе.
import * as audio from './audio.js'
import { createIdeaSwitch, createIconButton } from './controls.js'
import { createBreath } from './breath.js'
import { createTrace } from './trace.js'
import { createScore } from './score.js'

export const IDEAS = [
  {
    id: 'breath',
    label: 'Дыхание: круг ведёт вдох и выдох, к концу сета медленнее'
  },
  {
    id: 'prune',
    label: 'Угасание связей: к части 4 между шарами остаётся пятая часть связей'
  },
  { id: 'score', label: 'Партитура: сет «Спуск» играет сам, 64 такта' },
  { id: 'trace', label: 'Гипнограмма сета' }
]
// партитура не сохраняется: это действие, а не режим
const SAVED = ['breath', 'prune', 'trace']

function download(blob, name) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// actions из main.js: selectPart, setVariation, turnOff, togglePlay
export function initIdeas({ screen, palette, actions }) {
  const query = new URLSearchParams(location.search).get('ideas')
  const active = new Set(
    (query || '').split(',').filter((id) => SAVED.includes(id))
  )

  const breath = createBreath()
  screen.appendChild(breath.element)
  const trace = createTrace(palette)
  const save = createIconButton(
    'TraceSave',
    'save',
    'Сохранить гипнограмму в PNG',
    async () => download(await trace.toBlob(), 'neurosynth-hypnogram.png')
  )
  trace.element.appendChild(save.element)
  // лента над растром бита: рядом ритм сейчас и след всего сета
  document.getElementById('raster').prepend(trace.element)

  const score = createScore(
    {
      ...actions,
      stop: () => audio.isPlaying() && actions.togglePlay(),
      getBar: audio.getBarPosition
    },
    () => switcher.setState('score', score.isRunning())
  )

  const switcher = createIdeaSwitch(IDEAS, toggle)

  // сет всегда с начала: стоп, часть 1 сразу, старт
  async function startScore() {
    await audio.ensureStarted()
    if (audio.isPlaying()) await actions.togglePlay()
    score.start()
    await actions.togglePlay()
  }

  function toggle(id, isOn) {
    if (id === 'score') {
      if (isOn) startScore()
      else score.cancel()
      return
    }
    if (isOn) active.add(id)
    else active.delete(id)
    show()
    const url = new URL(location.href)
    if (active.size) url.searchParams.set('ideas', [...active].join(','))
    else url.searchParams.delete('ideas')
    history.replaceState(null, '', url)
  }

  function show() {
    SAVED.forEach((id) => switcher.setState(id, active.has(id)))
    breath.element.hidden = !active.has('breath')
    trace.element.hidden = !active.has('trace')
    if (active.has('trace')) trace.redraw()
  }
  show()

  // каждый кадр: вдох для визуала, точка гипнограммы, кольцо партитуры.
  // Стоп руками снимает партитуру
  let wasPlaying = false
  function update(dt, { playing, part, level, on }) {
    if (wasPlaying && !playing && score.isRunning()) score.cancel()
    wasPlaying = playing
    if (playing) trace.add(dt, { part, level, on })
    switcher.setProgress('score', score.isRunning() ? score.progress() : 0)
    const bars = playing ? audio.getBarPosition() : 0
    const value = breath.update(dt, bars, part, playing)
    return {
      breath: active.has('breath') ? value : null,
      prune: active.has('prune')
    }
  }

  return { element: switcher.element, update, onStep: score.onStep }
}
