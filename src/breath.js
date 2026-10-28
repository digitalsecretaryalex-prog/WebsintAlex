// Дыхание: круг расширяется на вдохе и сжимается на выдохе.
// Длина цикла в тактах берётся из части сета, поэтому к концу круг
// дышит медленнее. Фаза копится по кадрам: на смене части нет скачка.
import { parts } from './settings.js'

const INHALE = 0.4 // доля цикла на вдох, выдох длиннее
const IDLE_CYCLE = 10 // секунд на вдох и выдох, пока звук стоит

export function createBreath() {
  const element = document.createElement('div')
  element.className = 'Breath'
  element.setAttribute('aria-hidden', 'true')
  let phase = 0
  let lastBars = null

  // bars: позиция транспорта в тактах; возвращает вдох от 0 до 1
  function update(dt, bars, part, playing) {
    if (!playing) phase += dt / IDLE_CYCLE
    else if (lastBars !== null && bars >= lastBars) {
      phase += (bars - lastBars) / parts[part].breathBars
    }
    lastBars = playing ? bars : null
    const t = phase % 1
    const value =
      t < INHALE
        ? (1 - Math.cos((t / INHALE) * Math.PI)) / 2
        : (1 + Math.cos(((t - INHALE) / (1 - INHALE)) * Math.PI)) / 2
    element.style.setProperty('--breath', value.toFixed(3))
    return value
  }

  return { element, update }
}
