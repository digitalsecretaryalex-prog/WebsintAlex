// Автопилот: играет партитуру сета из settings.js по тактам.
// Номер такта берётся из позиции транспорта на шаге 0 растра, поэтому
// пропущенные кадры (свёрнутая вкладка) не сбивают сет: недоигранные
// действия догоняются. Руками можно вмешаться в любой момент.
import { score } from './settings.js'

const ITEMS = [...score].sort((a, b) => a.bar - b.bar)
const LAST_BAR = ITEMS[ITEMS.length - 1].bar

// actions: selectPart, setVariation, turnOff, stop, getBar из main.js
export function createScore(actions, onChange) {
  let isRunning = false
  let next = 0
  let bar = -1

  function run(item) {
    if ('part' in item) actions.selectPart(item.part)
    if (item.variation) actions.setVariation(...item.variation)
    if (item.off) actions.turnOff(item.off)
  }

  function finish() {
    isRunning = false
    actions.stop()
    onChange()
  }

  // такт 0 ставится сразу, до старта звука
  function start() {
    isRunning = true
    bar = -1
    next = 0
    while (next < ITEMS.length && ITEMS[next].bar === 0) run(ITEMS[next++])
    onChange()
  }

  function cancel() {
    isRunning = false
    onChange()
  }

  // шаг 0: ставим действия следующего такта, звук применит их с его начала.
  // Стоп в конце последнего такта, чтобы не оборвать удар
  function onStep(step) {
    if (!isRunning) return
    if (step === 0) {
      bar = Math.round(actions.getBar())
      while (
        next < ITEMS.length &&
        !ITEMS[next].stop &&
        ITEMS[next].bar <= bar + 1
      ) {
        run(ITEMS[next++])
      }
      if (bar >= LAST_BAR) finish()
      onChange()
    }
    if (step === 15 && bar + 1 >= LAST_BAR) finish()
  }

  return {
    start,
    cancel,
    onStep,
    isRunning: () => isRunning,
    progress: () => Math.max(0, Math.min(1, (bar + 1) / LAST_BAR))
  }
}
