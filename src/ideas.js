// Идеи поверх инструмента. Три усиливают высказывание сета:
// дыхание, угасание связей, партитура. Две дают сету жизнь после игры:
// запись в файл и гипнограмма. Включаются отдельно, выбор хранится в адресе.
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
  { id: 'record', label: 'Запись сета в файл' },
  { id: 'trace', label: 'Гипнограмма сета' }
]
// партитура и запись не сохраняются: это действия, а не режимы
const SAVED = ['breath', 'prune', 'trace']

function download(blob, name) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// actions из main.js: selectPart, setVariation, turnOff, togglePlay
export function initIdeas({ screen, instrument, palette, actions, onSave }) {
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
  instrument.appendChild(trace.element)

  const score = createScore(
    {
      ...actions,
      stop: () => audio.isPlaying() && actions.togglePlay(),
      getBar: audio.getBarPosition
    },
    () => switcher.setState('score', score.isRunning())
  )

  const ideas = IDEAS.filter(({ id }) => id !== 'record' || audio.canRecord())
  const switcher = createIdeaSwitch(ideas, toggle)

  // сет всегда с начала: стоп, часть 1 сразу, старт
  async function startScore() {
    await audio.ensureStarted()
    if (audio.isPlaying()) await actions.togglePlay()
    score.start()
    await actions.togglePlay()
  }

  async function toggleRecording(isOn) {
    switcher.setState('record', isOn)
    document.body.classList.toggle('isRecording', isOn)
    if (isOn) {
      await audio.startRecording()
      return
    }
    const blob = await audio.stopRecording()
    const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
    download(blob, `neurosynth-set.${extension}`)
  }

  function toggle(id, isOn) {
    if (id === 'score') {
      if (isOn) startScore()
      else score.cancel()
      return
    }
    if (id === 'record') {
      toggleRecording(isOn)
      return
    }
    if (isOn) active.add(id)
    else active.delete(id)
    show()
    const url = new URL(location.href)
    if (active.size) url.searchParams.set('ideas', [...active].join(','))
    else url.searchParams.delete('ideas')
    history.replaceState(null, '', url)
    onSave()
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
